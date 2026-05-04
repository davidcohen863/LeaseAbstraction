"""Background extraction job. For v0 this runs on FastAPI's BackgroundTasks
in-process. When concurrency or reliability matters, swap for RQ or Celery
without changing the function signature.
"""

from __future__ import annotations

from .logging import get_logger
import traceback
from datetime import datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..extract import extract_two_pass, summarise_ancillary_doc
from ..pdf import load_pdf
from ..utils import utc_now
from .db import SessionLocal
from .events import derive_events
from .models import Document, Lease, LeaseEvent, LeaseStatus, Property, normalise_address
from .storage import coerce_to_key, get_storage

log = get_logger(__name__)


def run_extraction(lease_id: str, pdf_storage_key: str) -> None:
    """Extract a lease, persist the record, derive events. Called as a
    background task. `pdf_storage_key` is a logical storage key (e.g.
    "documents/<lease_id>__file.pdf"), resolved via `get_storage().get_path()`
    so the worker stays oblivious to whether the file lives on local disk
    or in a remote bucket.
    """
    db: Session = SessionLocal()
    try:
        lease = db.get(Lease, lease_id)
        if lease is None:
            log.warning("Extraction requested for unknown lease %s", lease_id)
            return

        lease.status = LeaseStatus.EXTRACTING.value
        db.commit()

        try:
            with get_storage().get_path(coerce_to_key(pdf_storage_key)) as pdf_path:
                pdf = load_pdf(pdf_path)
                # Two-pass: pays ~1.3-1.5x of single-pass cost; calibrates confidence.
                result = extract_two_pass(pdf)
        except Exception as exc:  # noqa: BLE001
            log.exception("Extraction failed for lease %s", lease_id)
            lease.status = LeaseStatus.FAILED.value
            lease.extraction_error = f"{exc}\n\n{traceback.format_exc()[-2000:]}"
            db.commit()
            return

        lease.record_json = result.record.model_dump(mode="json")
        lease.extraction_model = result.model
        lease.extraction_seconds = result.elapsed_seconds
        lease.status = LeaseStatus.READY_FOR_REVIEW.value
        if result.record.premises_address.value:
            lease.label = result.record.premises_address.value

        # Auto-link to a Property — match on normalised address, create if new.
        if lease.label and not lease.property_id:
            lease.property_id = _ensure_property(db, lease.label)

        # Replace any previously-derived events
        db.query(LeaseEvent).filter(LeaseEvent.lease_id == lease_id).delete()
        for ev in derive_events(result.record):
            db.add(
                LeaseEvent(
                    lease_id=lease_id,
                    event_type=ev.event_type.value,
                    event_date=ev.event_date,
                    title=ev.title,
                    description=ev.description,
                )
            )
        db.commit()
    finally:
        db.close()


def run_ancillary_summary(document_id: str) -> None:
    """Background task: summarise an ancillary document (side-letter,
    deed of variation, licence to alter etc.) attached to a lease.

    Cheap (~£0.02–0.05 per doc, 10–30s typically) since side-letters are
    short. Failure is non-fatal — the file remains attached, the surveyor
    can still view it; only the summary is missing.
    """
    db: Session = SessionLocal()
    try:
        doc = db.get(Document, document_id)
        if doc is None:
            log.warning("Ancillary summary requested for unknown document %s", document_id)
            return
        doc.summary_status = "summarising"
        db.commit()

        try:
            with get_storage().get_path(coerce_to_key(doc.storage_path)) as pdf_path:
                pdf = load_pdf(pdf_path)
            # Build a brief context summary from the parent lease record
            lease = db.get(Lease, doc.lease_id)
            parent_summary: str | None = None
            if lease is not None and lease.record_json:
                rec = lease.record_json
                addr = (rec.get("premises_address") or {}).get("value")
                landlord = (rec.get("landlord") or {}).get("name")
                tenant = (rec.get("tenant") or {}).get("name")
                term_start = (rec.get("term_start") or {}).get("value")
                term_expiry = (rec.get("term_expiry") or {}).get("value")
                rent = (rec.get("initial_rent_gbp") or {}).get("value")
                parent_summary = (
                    f"Lease of {addr} between {landlord} (landlord) and {tenant} (tenant), "
                    f"{term_start} → {term_expiry}, initial rent £{rent}."
                )

            result = summarise_ancillary_doc(pdf, parent_lease_summary=parent_summary)
        except Exception as exc:  # noqa: BLE001
            log.exception("Ancillary summary failed for document %s", doc.id)
            doc.summary_status = "failed"
            doc.summary_error = f"{exc}\n\n{traceback.format_exc()[-1500:]}"
            db.commit()
            return

        doc.summary_markdown = result.markdown
        doc.summary_seconds = round(result.elapsed_seconds, 2)
        doc.summary_status = "done"
        doc.summary_error = None
        db.commit()
        log.info("Ancillary summary complete for %s in %.1fs", doc.id, result.elapsed_seconds)
    finally:
        db.close()


def _ensure_property(db: Session, address: str) -> str:
    """Find a Property by normalised address, or create one. Returns the id."""
    norm = normalise_address(address)
    if not norm:
        return None  # type: ignore[return-value]
    existing = db.execute(
        select(Property).where(Property.address_normalised == norm)
    ).scalar_one_or_none()
    if existing is not None:
        return existing.id
    # Explicitly set timestamps — the SQLite column was added via ALTER
    # without a DEFAULT, so the SQLAlchemy server_default doesn't take.
    now = utc_now()
    prop = Property(
        address=address,
        address_normalised=norm,
        created_at=now,
        updated_at=now,
    )
    db.add(prop)
    db.flush()  # populate prop.id without committing
    return prop.id
