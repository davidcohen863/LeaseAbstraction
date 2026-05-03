"""Rent-review pack endpoints — generate, list, detail, download, settle."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import AuthenticatedUser, current_user
from ..db import get_db
from ..models import (
    Comparable,
    ComparableSource,
    DealType,
    Lease,
    LeaseEvent,
    PackDocument,
    PackStatus,
    RentReviewPack,
)
from ..pack_worker import run_pack_generation

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
    doc = db.get(PackDocument, doc_id)
    if doc is None or doc.pack_id != pack_id:
        raise HTTPException(404, "Document not found")
    path = Path(doc.storage_path)
    if not path.exists():
        raise HTTPException(404, "Document file missing on disk")
    return FileResponse(
        path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=doc.filename,
    )


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
    pack.sent_at = datetime.utcnow()
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
    pack.settled_at = datetime.utcnow()

    # Feed back into comparables: add an internal Comparable from this lease's settled rent
    lease = db.get(Lease, pack.lease_id)
    record = (lease.record_json or {}) if lease else {}
    address = ((record.get("premises_address") or {}).get("value")) or (lease.label if lease else "Unknown")
    extent = (record.get("premises_extent") or {}).get("value") or ""
    use_class = ((record.get("permitted_use") or {}).get("value")) or None
    # Try to parse a sq ft figure out of the extent string ("approximately 1,250 sq ft")
    area_sqft: float | None = None
    import re
    m = re.search(r"([\d,]+)\s*(?:sq\s*ft|square\s*feet)", extent, flags=re.I)
    if m:
        try:
            area_sqft = float(m.group(1).replace(",", ""))
        except ValueError:
            area_sqft = None

    db.add(
        Comparable(
            address=address,
            rent_pa_gbp=body.settled_rent_gbp,
            area_sqft=area_sqft,
            use_class=use_class,
            deal_date=datetime.utcnow(),
            deal_type=DealType.RENT_REVIEW.value,
            source=ComparableSource.INTERNAL.value,
            notes=f"Settled rent review on {address} (LeaseOS pack {pack.id})",
            derived_from_lease_id=pack.lease_id,
        )
    )
    db.commit()
    return _summary(pack, lease.label if lease else None)
