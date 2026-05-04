"""Background pack-generation worker. Mirrors the structure of api/worker.py."""

from __future__ import annotations

from .logging import get_logger
import traceback
from datetime import datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..integrations.slack import notify_pack_ready
from ..pack_generator import generate_pack, render_docx
from .config import get_settings
from .db import SessionLocal
from .models import (
    Comparable,
    Lease,
    LeaseEvent,
    PackDocument,
    PackDocumentKind,
    PackStatus,
    RentReviewPack,
)

log = get_logger(__name__)


# Map each PackDocumentKind to (markdown attr name on PackOutput, display title)
DOC_KIND_MAP = [
    (PackDocumentKind.LANDLORD_MEMO, "landlord_memo_markdown", "Landlord Memo"),
    (PackDocumentKind.COMPARABLES_SCHEDULE, "comparables_schedule_markdown", "Comparables Schedule"),
    (PackDocumentKind.ITZA_ANALYSIS, "itza_analysis_markdown", "ITZA / £-per-sq-ft Analysis"),
    (PackDocumentKind.TRIGGER_LETTER, "trigger_letter_markdown", "Rent Review Trigger Letter"),
]


def run_pack_generation(pack_id: str) -> None:
    """Load context, call the generator, persist documents. Background task."""
    db: Session = SessionLocal()
    try:
        pack = db.get(RentReviewPack, pack_id)
        if pack is None:
            log.warning("Pack %s no longer exists; aborting", pack_id)
            return

        lease = db.get(Lease, pack.lease_id)
        event = db.get(LeaseEvent, pack.lease_event_id) if pack.lease_event_id else None
        if lease is None or lease.record_json is None:
            pack.status = PackStatus.FAILED.value
            pack.error = "Lease has no extracted record"
            db.commit()
            return

        # Comparables: take everything for now. v2: filter by location/use class.
        comparables_rows = db.execute(select(Comparable)).scalars().all()
        comparables = [
            {
                "address": c.address,
                "rent_pa_gbp": c.rent_pa_gbp,
                "area_sqft": c.area_sqft,
                "frontage_m": c.frontage_m,
                "use_class": c.use_class,
                "deal_date": c.deal_date.date().isoformat() if c.deal_date else None,
                "deal_type": c.deal_type,
                "source": c.source,
                "notes": c.notes,
            }
            for c in comparables_rows
        ]
        pack.comparables_used_count = len(comparables)

        event_summary = (
            {
                "event_type": event.event_type,
                "event_date": event.event_date.date().isoformat(),
                "title": event.title,
                "description": event.description,
            }
            if event is not None
            else {"event_type": "rent_review_trigger", "note": "ad-hoc generation, no calendar event"}
        )

        try:
            result = generate_pack(
                lease_record=lease.record_json,
                event_summary=event_summary,
                comparables=comparables,
            )
        except Exception as exc:  # noqa: BLE001
            log.exception("Pack generation failed for %s", pack_id)
            pack.status = PackStatus.FAILED.value
            pack.error = f"{exc}\n\n{traceback.format_exc()[-1500:]}"
            db.commit()
            return

        out = result.output
        pack.recommended_opening_gbp = out.recommended_opening_gbp
        pack.recommended_settlement_low_gbp = out.recommended_settlement_low_gbp
        pack.recommended_settlement_high_gbp = out.recommended_settlement_high_gbp

        # Pull current rent for convenience
        try:
            pack.current_rent_gbp = float(
                (lease.record_json.get("initial_rent_gbp") or {}).get("value")
            )
        except (TypeError, ValueError):
            pack.current_rent_gbp = None

        pack.generator_model = result.model
        pack.generated_seconds = round(result.elapsed_seconds, 2)
        pack.status = PackStatus.DRAFT.value

        # Render each document into a tempfile then upload via storage.
        # Storage abstraction lets the cloud deploy keep generated packs
        # alongside the rest of the bucket without code changes here.
        import tempfile

        from .storage import get_storage

        storage = get_storage()

        # Replace any pre-existing documents (idempotent on re-run)
        db.query(PackDocument).filter(PackDocument.pack_id == pack.id).delete()

        for kind, attr, title in DOC_KIND_MAP:
            md_text = getattr(out, attr) or ""
            filename = f"{kind.value}.docx"
            storage_key = f"packs/{pack.id}/{filename}"
            try:
                # python-docx requires a real path; render to a temp file
                # then read bytes back and write through storage.
                with tempfile.NamedTemporaryFile(suffix=".docx", delete=False) as tmp:
                    tmp_path = Path(tmp.name)
                try:
                    render_docx(
                        kind=kind.value,
                        markdown_content=md_text,
                        output_path=tmp_path,
                        title=title,
                    )
                    storage.put(storage_key, tmp_path.read_bytes())
                finally:
                    tmp_path.unlink(missing_ok=True)
            except Exception as exc:  # noqa: BLE001
                log.warning("Failed to render %s for pack %s: %s", kind.value, pack.id, exc)
            db.add(
                PackDocument(
                    pack_id=pack.id,
                    kind=kind.value,
                    filename=filename,
                    storage_path=storage_key,
                    markdown_content=md_text,
                )
            )

        db.commit()
        log.info("Pack %s generated successfully (%.1fs, %d comps)", pack.id, result.elapsed_seconds, len(comparables))

        # Slack notification — non-fatal if it fails
        try:
            settings = get_settings()
            frontend_base = settings.cors_origins[0] if settings.cors_origins else None
            notify_pack_ready(db, pack, lease.label, frontend_base=frontend_base)
        except Exception as exc:  # noqa: BLE001
            log.warning("Slack notify failed for pack %s: %s", pack.id, exc)
    finally:
        db.close()
