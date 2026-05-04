"""Rent-review pack endpoints — generate, list, detail, download, settle."""

from __future__ import annotations

from datetime import datetime, timedelta
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import AuthenticatedUser, current_user
from ..db import get_db
from ..models import (
    Comparable,
    ComparableSource,
    DealType,
    EventType,
    Lease,
    LeaseEvent,
    PackDocument,
    PackStatus,
    RentReviewPack,
)
from ..pack_worker import run_pack_generation
from ..storage import coerce_to_key, get_storage
from ...utils import utc_now

router = APIRouter(tags=["packs"])


# ---- response shapes -----------------------------------------------------


class PackDocumentOut(BaseModel):
    id: str
    pack_id: str
    kind: str
    filename: str
    markdown_content: str | None


class PackSummary(BaseModel):
    id: str
    lease_id: str
    lease_label: str | None
    lease_event_id: str | None
    status: str
    current_rent_gbp: float | None
    recommended_opening_gbp: float | None
    recommended_settlement_low_gbp: float | None
    recommended_settlement_high_gbp: float | None
    settled_rent_gbp: float | None
    settled_at: datetime | None
    generator_model: str | None
    generated_seconds: float | None
    error: str | None
    comparables_used_count: int
    created_at: datetime
    sent_at: datetime | None


class PackDetail(PackSummary):
    documents: list[PackDocumentOut]


class SettleIn(BaseModel):
    settled_rent_gbp: float


class PackPatch(BaseModel):
    """Inline-edit fields on a pack — surveyor can adjust the model's
    recommended numbers before sending."""
    recommended_opening_gbp: float | None = None
    recommended_settlement_low_gbp: float | None = None
    recommended_settlement_high_gbp: float | None = None


# ---- helpers -------------------------------------------------------------


def _summary(pack: RentReviewPack, lease_label: str | None) -> PackSummary:
    return PackSummary(
        id=pack.id,
        lease_id=pack.lease_id,
        lease_label=lease_label,
        lease_event_id=pack.lease_event_id,
        status=pack.status,
        current_rent_gbp=pack.current_rent_gbp,
        recommended_opening_gbp=pack.recommended_opening_gbp,
        recommended_settlement_low_gbp=pack.recommended_settlement_low_gbp,
        recommended_settlement_high_gbp=pack.recommended_settlement_high_gbp,
        settled_rent_gbp=pack.settled_rent_gbp,
        settled_at=pack.settled_at,
        generator_model=pack.generator_model,
        generated_seconds=pack.generated_seconds,
        error=pack.error,
        comparables_used_count=pack.comparables_used_count,
        created_at=pack.created_at,
        sent_at=pack.sent_at,
    )


def _detail(pack: RentReviewPack, lease_label: str | None) -> PackDetail:
    summary = _summary(pack, lease_label).model_dump()
    summary["documents"] = [
        PackDocumentOut(
            id=d.id, pack_id=d.pack_id, kind=d.kind, filename=d.filename,
            markdown_content=d.markdown_content,
        )
        for d in pack.documents
    ]
    return PackDetail(**summary)


# ---- endpoints -----------------------------------------------------------


class AutoTriggerResult(BaseModel):
    triggered: int
    pack_ids: list[str]
    horizon_days: int
    candidates_seen: int


@router.post("/packs/auto-trigger", response_model=AutoTriggerResult, status_code=202, tags=["packs"])
def auto_trigger_packs(
    background: BackgroundTasks,
    days_ahead: int = Query(default=180, ge=1, le=365),
    dry_run: bool = Query(default=False),
    user: AuthenticatedUser = Depends(current_user),
    db: Session = Depends(get_db),
) -> AutoTriggerResult:
    """Find every `rent_review_trigger` event whose date is in the next
    `days_ahead` days AND has no pack yet, then queue pack generation for each.

    Idempotent: events that already have a pack are skipped. Safe to call from
    a daily cron, the UI button, or a manual smoke test.

    Set `dry_run=true` to count candidates without actually generating.
    """
    now = utc_now()
    horizon = now + timedelta(days=days_ahead)

    candidate_events = db.execute(
        select(LeaseEvent)
        .where(LeaseEvent.event_type == EventType.RENT_REVIEW_TRIGGER.value)
        .where(LeaseEvent.event_date >= now - timedelta(days=14))
        .where(LeaseEvent.event_date <= horizon)
    ).scalars().all()

    # Set of event_ids that already have a pack
    existing_event_ids = {
        eid for (eid,) in db.execute(
            select(RentReviewPack.lease_event_id).where(RentReviewPack.lease_event_id.is_not(None))
        ).all()
        if eid is not None
    }

    pack_ids: list[str] = []
    for event in candidate_events:
        if event.id in existing_event_ids:
            continue
        if dry_run:
            pack_ids.append("(dry-run)")
            continue
        pack = RentReviewPack(
            lease_id=event.lease_id,
            lease_event_id=event.id,
            status=PackStatus.GENERATING.value,
        )
        db.add(pack)
        db.flush()
        pack_ids.append(pack.id)
        background.add_task(run_pack_generation, pack.id)

    if not dry_run and pack_ids:
        db.commit()

    return AutoTriggerResult(
        triggered=len(pack_ids),
        pack_ids=pack_ids,
        horizon_days=days_ahead,
        candidates_seen=len(candidate_events),
    )


@router.post("/events/{event_id}/pack", response_model=PackSummary, status_code=201)
def generate_for_event(
    event_id: str,
    background: BackgroundTasks,
    user: AuthenticatedUser = Depends(current_user),
    db: Session = Depends(get_db),
) -> PackSummary:
    event = db.get(LeaseEvent, event_id)
    if event is None:
        raise HTTPException(404, "Event not found")

    pack = RentReviewPack(
        lease_id=event.lease_id,
        lease_event_id=event.id,
        status=PackStatus.GENERATING.value,
    )
    db.add(pack)
    db.commit()
    db.refresh(pack)

    background.add_task(run_pack_generation, pack.id)

    lease = db.get(Lease, pack.lease_id)
    return _summary(pack, lease.label if lease else None)


@router.get("/packs", response_model=list[PackSummary])
def list_packs(
    lease_id: str | None = None,
    user: AuthenticatedUser = Depends(current_user),
    db: Session = Depends(get_db),
) -> list[PackSummary]:
    stmt = (
        select(RentReviewPack, Lease.label)
        .join(Lease, Lease.id == RentReviewPack.lease_id)
        .order_by(RentReviewPack.created_at.desc())
    )
    if lease_id:
        stmt = stmt.where(RentReviewPack.lease_id == lease_id)
    rows = db.execute(stmt).all()
    return [_summary(p, label) for p, label in rows]


@router.get("/packs/{pack_id}", response_model=PackDetail)
def get_pack(
    pack_id: str,
    user: AuthenticatedUser = Depends(current_user),
    db: Session = Depends(get_db),
) -> PackDetail:
    pack = db.get(RentReviewPack, pack_id)
    if pack is None:
        raise HTTPException(404, "Pack not found")
    lease = db.get(Lease, pack.lease_id)
    return _detail(pack, lease.label if lease else None)


@router.get("/packs/{pack_id}/documents/{doc_id}")
def download_document(
    pack_id: str,
    doc_id: str,
    user: AuthenticatedUser = Depends(current_user),
    db: Session = Depends(get_db),
):
    # Confirm the parent pack exists before we trust any path off the doc row.
    # `pack_id` from the URL must match the doc's `pack_id` (an attacker can't
    # mix-and-match a doc from one pack onto another pack's URL).
    pack = db.get(RentReviewPack, pack_id)
    if pack is None:
        raise HTTPException(404, "Pack not found")
    doc = db.get(PackDocument, doc_id)
    if doc is None or doc.pack_id != pack_id:
        raise HTTPException(404, "Document not found")
    return get_storage().serve(
        coerce_to_key(doc.storage_path),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        download_filename=doc.filename,
    )


@router.patch("/packs/{pack_id}", response_model=PackSummary)
def patch_pack(
    pack_id: str,
    body: PackPatch,
    user: AuthenticatedUser = Depends(current_user),
    db: Session = Depends(get_db),
) -> PackSummary:
    pack = db.get(RentReviewPack, pack_id)
    if pack is None:
        raise HTTPException(404, "Pack not found")
    if pack.status not in (PackStatus.DRAFT.value, PackStatus.SENT.value):
        raise HTTPException(400, f"Cannot edit pack in status {pack.status!r}")
    if body.recommended_opening_gbp is not None:
        pack.recommended_opening_gbp = body.recommended_opening_gbp
    if body.recommended_settlement_low_gbp is not None:
        pack.recommended_settlement_low_gbp = body.recommended_settlement_low_gbp
    if body.recommended_settlement_high_gbp is not None:
        pack.recommended_settlement_high_gbp = body.recommended_settlement_high_gbp
    db.commit()
    lease = db.get(Lease, pack.lease_id)
    return _summary(pack, lease.label if lease else None)


@router.delete("/packs/{pack_id}", status_code=204)
def delete_pack(
    pack_id: str,
    user: AuthenticatedUser = Depends(current_user),
    db: Session = Depends(get_db),
) -> None:
    """Delete a rent-review pack and its generated documents.

    Cascades the PackDocument rows. Cleans up the on-disk
    `data/packs/<pack_id>/*.docx` files. Refuses to delete a pack in
    `settled` status — once you've recorded a settled rent, that decision
    has fed back into the comparables database and the audit trail; deleting
    the pack would lose that provenance. Surveyors who genuinely want a
    settled pack gone should ask an admin or hand-edit the DB.
    """
    pack = db.get(RentReviewPack, pack_id)
    if pack is None:
        raise HTTPException(404, "Pack not found")
    if pack.status == PackStatus.SETTLED.value:
        raise HTTPException(
            400,
            "Cannot delete a settled pack — the settled rent has fed into "
            "comparables and the audit trail. Re-open / re-generate instead.",
        )

    # Snapshot the storage prefix before SQLAlchemy deletes the rows
    pack_prefix = f"packs/{pack.id}"

    db.delete(pack)
    db.commit()

    # Tree-delete the pack's directory of generated .docx files
    get_storage().delete(pack_prefix)


@router.post("/packs/{pack_id}/sent", response_model=PackSummary)
def mark_sent(
    pack_id: str,
    user: AuthenticatedUser = Depends(current_user),
    db: Session = Depends(get_db),
) -> PackSummary:
    pack = db.get(RentReviewPack, pack_id)
    if pack is None:
        raise HTTPException(404, "Pack not found")
    pack.status = PackStatus.SENT.value
    pack.sent_at = utc_now()
    db.commit()
    lease = db.get(Lease, pack.lease_id)
    return _summary(pack, lease.label if lease else None)


@router.post("/packs/{pack_id}/settle", response_model=PackSummary)
def settle_pack(
    pack_id: str,
    body: SettleIn,
    user: AuthenticatedUser = Depends(current_user),
    db: Session = Depends(get_db),
) -> PackSummary:
    pack = db.get(RentReviewPack, pack_id)
    if pack is None:
        raise HTTPException(404, "Pack not found")
    pack.status = PackStatus.SETTLED.value
    pack.settled_rent_gbp = body.settled_rent_gbp
    pack.settled_at = utc_now()

    # Feed back into comparables: add an internal Comparable from this lease's settled rent
    lease = db.get(Lease, pack.lease_id)
    record = (lease.record_json or {}) if lease else {}
    address = ((record.get("premises_address") or {}).get("value")) or (lease.label if lease else "Unknown")
    extent = (record.get("premises_extent") or {}).get("value") or ""
    permitted_use_text = ((record.get("permitted_use") or {}).get("value")) or ""
    # The permitted-use clause is usually a paragraph of legal prose; the
    # comparables UI expects a short Use Classes Order code (E, E(b), F1, F2,
    # sui generis…). Pluck the first matching code out, or None if we can't
    # find one — better to leave use_class blank than to write a 100-char essay
    # that breaks the comparables filter UI.
    import re
    # Each alternative ends at a non-word char; a trailing `\b` would FAIL
    # after `E(b)` because `)` and the next char are both non-word — the
    # engine would then fall through and match bare `E` only. Lookahead
    # `(?!\w)` says "no further word char" and works for both `E(b)` and `E`.
    use_class: str | None = None
    m = re.search(
        r"\b(sui generis|E\([a-g]\)|E(?!\w)|F1(?!\w)|F2(?!\w)|B[12](?!\w)|C[1-4](?!\w))",
        permitted_use_text,
        flags=re.I,
    )
    if m:
        use_class = m.group(1)

    # Try to parse a sq ft figure out of the extent string ("approximately 1,250 sq ft")
    area_sqft: float | None = None
    m2 = re.search(r"([\d,]+)\s*(?:sq\s*ft|square\s*feet)", extent, flags=re.I)
    if m2:
        try:
            area_sqft = float(m2.group(1).replace(",", ""))
        except ValueError:
            area_sqft = None

    db.add(
        Comparable(
            address=address,
            rent_pa_gbp=body.settled_rent_gbp,
            area_sqft=area_sqft,
            use_class=use_class,
            deal_date=utc_now(),
            deal_type=DealType.RENT_REVIEW.value,
            source=ComparableSource.INTERNAL.value,
            notes=f"Settled rent review on {address} (LeaseOS pack {pack.id})",
            derived_from_lease_id=pack.lease_id,
        )
    )
    db.commit()
    return _summary(pack, lease.label if lease else None)
