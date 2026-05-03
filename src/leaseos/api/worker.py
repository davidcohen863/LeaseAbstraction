"""Background extraction job. For v0 this runs on FastAPI's BackgroundTasks
in-process. When concurrency or reliability matters, swap for RQ or Celery
without changing the function signature.
"""

from __future__ import annotations

import logging
import traceback
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..extract import extract_two_pass
from ..pdf import load_pdf
from .db import SessionLocal
from .events import derive_events
from .models import Lease, LeaseEvent, LeaseStatus, Property, normalise_address

log = logging.getLogger(__name__)


def run_extraction(lease_id: str, pdf_path: str) -> None:
    """Extract a lease, persist the record, derive events. Called as a background task."""
    db: Session = SessionLocal()
    try:
        lease = db.get(Lease, lease_id)
        if lease is None:
            log.warning("Extraction requested for unknown lease %s", lease_id)
            return

        lease.status = LeaseStatus.EXTRACTING.value
        db.commit()

        try:
            pdf = load_pdf(Path(pdf_path))
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
    prop = Property(address=address, address_normalised=norm)
    db.add(prop)
    db.flush()  # populate prop.id without committing
    return prop.id
