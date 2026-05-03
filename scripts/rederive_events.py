"""One-shot: re-derive LeaseEvent rows from existing record_json without
re-extracting (and without re-spending Anthropic credit).

Run:  .venv/bin/python scripts/rederive_events.py
"""

from __future__ import annotations

from leaseos.api.db import SessionLocal, init_db
from leaseos.api.events import derive_events
from leaseos.api.models import Lease, LeaseEvent
from leaseos.schema import LeaseRecord


def main() -> None:
    init_db()
    db = SessionLocal()
    try:
        leases = db.query(Lease).filter(Lease.record_json.is_not(None)).all()
        for lease in leases:
            try:
                record = LeaseRecord.model_validate(lease.record_json)
            except Exception as exc:
                print(f"  skip {lease.id}: {exc}")
                continue
            db.query(LeaseEvent).filter(LeaseEvent.lease_id == lease.id).delete()
            derived = derive_events(record)
            for ev in derived:
                db.add(
                    LeaseEvent(
                        lease_id=lease.id,
                        event_type=ev.event_type.value,
                        event_date=ev.event_date,
                        title=ev.title,
                        description=ev.description,
                    )
                )
            print(f"  {lease.label[:60]} → {len(derived)} events")
        db.commit()
        print("Done.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
