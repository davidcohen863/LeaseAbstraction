"""One-shot: assign every existing Lease without a property_id to a Property,
matching/creating by normalised address.

Run:  .venv/bin/python scripts/backfill_properties.py
"""

from __future__ import annotations

from sqlalchemy import inspect, select, text

from leaseos.api.db import SessionLocal, engine, init_db
from leaseos.api.models import Lease, Property, normalise_address


def _migrate_property_columns() -> None:
    """Idempotent ALTER TABLEs for SQLite (no Alembic yet) — adds the v0.4
    columns on the properties table if they're missing."""
    insp = inspect(engine)
    cols = {c["name"] for c in insp.get_columns("properties")}
    with engine.begin() as conn:
        if "address_normalised" not in cols:
            conn.execute(text(
                'ALTER TABLE properties ADD COLUMN address_normalised VARCHAR(512) DEFAULT ""'
            ))
            conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_properties_address_normalised ON properties(address_normalised)"
            ))
            print("  migration: added address_normalised + index")
        if "notes" not in cols:
            conn.execute(text("ALTER TABLE properties ADD COLUMN notes TEXT"))
            print("  migration: added notes")
        if "updated_at" not in cols:
            conn.execute(text("ALTER TABLE properties ADD COLUMN updated_at DATETIME"))
            conn.execute(text(
                "UPDATE properties SET updated_at = created_at WHERE updated_at IS NULL"
            ))
            print("  migration: added updated_at + backfilled from created_at")


def main() -> None:
    init_db()
    _migrate_property_columns()
    db = SessionLocal()
    try:
        unassigned = (
            db.execute(select(Lease).where(Lease.property_id.is_(None)))
            .scalars()
            .all()
        )
        if not unassigned:
            print("No leases need backfilling.")
            return

        # Build a quick map of existing properties by normalised address
        props = db.execute(select(Property)).scalars().all()
        index = {p.address_normalised: p for p in props}

        # Some legacy properties may not have address_normalised populated yet
        for p in props:
            if not p.address_normalised:
                p.address_normalised = normalise_address(p.address)
                index[p.address_normalised] = p

        created = 0
        linked = 0
        for lease in unassigned:
            if not lease.label:
                print(f"  skip {lease.id}: no label/address")
                continue
            norm = normalise_address(lease.label)
            prop = index.get(norm)
            if prop is None:
                prop = Property(address=lease.label, address_normalised=norm)
                db.add(prop)
                db.flush()
                index[norm] = prop
                created += 1
            lease.property_id = prop.id
            linked += 1
            print(f"  {lease.label[:60]:60s} -> {prop.id[:8]}")
        db.commit()
        print(f"Done. Linked {linked} leases. Created {created} new properties.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
