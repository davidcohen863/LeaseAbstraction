"""Seed 5 plausible N8/Crouch End retail comparables for the demo.

These are fictional but realistic for that part of north London circa 2025/26.
Run:  .venv/bin/python scripts/seed_n8_comparables.py
"""

from __future__ import annotations

from datetime import datetime, date

from leaseos.api.db import SessionLocal, init_db
from leaseos.api.models import Comparable, ComparableSource, DealType


COMPS = [
    {
        "address": "8 Crouch End Broadway, London N8 8DT",
        "rent_pa_gbp": 58000,
        "area_sqft": 1180,
        "frontage_m": 5.8,
        "use_class": "E",
        "deal_date": date(2025, 9, 12),
        "deal_type": DealType.LETTING.value,
        "source": ComparableSource.RIGHTMOVE.value,
        "notes": "Indian restaurant, 10-yr term, 5-yr review, FRI. New letting, no incentive disclosed.",
    },
    {
        "address": "22 Crouch End Broadway, London N8 8DT",
        "rent_pa_gbp": 52000,
        "area_sqft": 1100,
        "frontage_m": 5.2,
        "use_class": "E(b)",
        "deal_date": date(2025, 6, 4),
        "deal_type": DealType.RENT_REVIEW.value,
        "source": ComparableSource.EGI.value,
        "notes": "Café — settled review, was £45,000. Tenant in occupation since 2018.",
    },
    {
        "address": "31 Park Road, London N8 8TE",
        "rent_pa_gbp": 47500,
        "area_sqft": 980,
        "frontage_m": 4.6,
        "use_class": "E",
        "deal_date": date(2025, 11, 20),
        "deal_type": DealType.LETTING.value,
        "source": ComparableSource.RIGHTMOVE.value,
        "notes": "Bakery. New 10-yr lease, 6 months rent free.",
    },
    {
        "address": "5 Topsfield Parade, London N8 8PR",
        "rent_pa_gbp": 65000,
        "area_sqft": 1340,
        "frontage_m": 6.4,
        "use_class": "E(b)",
        "deal_date": date(2024, 3, 18),
        "deal_type": DealType.LETTING.value,
        "source": ComparableSource.EGI.value,
        "notes": "Wine bar/restaurant, prime corner unit. Strong covenant, 15-yr term.",
    },
    {
        "address": "47 Crouch End Broadway, London N8 8DT",
        "rent_pa_gbp": 41000,
        "area_sqft": 950,
        "frontage_m": 4.8,
        "use_class": "E",
        "deal_date": date(2024, 11, 1),
        "deal_type": DealType.LETTING.value,
        "source": ComparableSource.MANUAL.value,
        "notes": "Hairdresser. Off-pitch end of parade, smaller frontage.",
    },
]


def main() -> None:
    init_db()
    db = SessionLocal()
    try:
        existing = {c.address for c in db.query(Comparable).all()}
        added = 0
        for item in COMPS:
            if item["address"] in existing:
                continue
            db.add(
                Comparable(
                    address=item["address"],
                    rent_pa_gbp=item["rent_pa_gbp"],
                    area_sqft=item["area_sqft"],
                    frontage_m=item["frontage_m"],
                    use_class=item["use_class"],
                    deal_date=datetime.combine(item["deal_date"], datetime.min.time()),
                    deal_type=item["deal_type"],
                    source=item["source"],
                    notes=item["notes"],
                )
            )
            added += 1
        db.commit()
        total = db.query(Comparable).count()
        print(f"Seeded {added} new comparables; database now has {total} total.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
