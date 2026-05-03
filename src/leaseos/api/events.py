"""Derive LeaseEvent rows from a LeaseRecord.

Pure function: given the extracted record, return a list of (event_type, date,
title, description) tuples. The route layer is responsible for persisting them
and for not creating duplicates on re-extraction.
"""

from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Iterable

from ..schema import LeaseRecord
from .models import EventType


def _subtract_months(d: datetime, months: int) -> datetime:
    """Subtract whole months without 30.5-day approximation. Clamps to last day."""
    total = d.year * 12 + (d.month - 1) - months
    year, month = divmod(total, 12)
    month += 1
    last_day = calendar.monthrange(year, month)[1]
    return d.replace(year=year, month=month, day=min(d.day, last_day))


@dataclass
class DerivedEvent:
    event_type: EventType
    event_date: datetime
    title: str
    description: str


def _to_dt(d: date | None) -> datetime | None:
    if d is None:
        return None
    return datetime.combine(d, datetime.min.time())


def derive_events(record: LeaseRecord) -> list[DerivedEvent]:
    out: list[DerivedEvent] = []
    label = record.premises_address.value or "Unknown property"

    # Lease expiry
    if record.term_expiry and record.term_expiry.value:
        out.append(
            DerivedEvent(
                event_type=EventType.LEASE_EXPIRY,
                event_date=_to_dt(record.term_expiry.value),
                title=f"Lease expiry — {label}",
                description="Lease contractual expiry date.",
            )
        )

    # Rent reviews — both the trigger (T-6mo) and the effective date
    rr = record.rent_review
    for rd in rr.review_dates or []:
        rd_dt = _to_dt(rd)
        out.append(
            DerivedEvent(
                event_type=EventType.RENT_REVIEW_EFFECTIVE,
                event_date=rd_dt,
                title=f"Rent review effective — {label}",
                description=f"Review basis: {rr.basis.value if rr.basis else 'unknown'}.",
            )
        )
        # Trigger pack 6 months ahead (proper month math)
        out.append(
            DerivedEvent(
                event_type=EventType.RENT_REVIEW_TRIGGER,
                event_date=_subtract_months(rd_dt, 6),
                title=f"Prepare rent review pack — {label}",
                description="Pack auto-generation fires from this date.",
            )
        )

    # Tenant break + notice deadline
    for brk_field in (record.tenant_break, record.landlord_break):
        if brk_field is None or brk_field.break_date is None:
            continue
        bd_dt = _to_dt(brk_field.break_date)
        party = (brk_field.party or "tenant").capitalize()
        out.append(
            DerivedEvent(
                event_type=EventType.BREAK_DATE,
                event_date=bd_dt,
                title=f"{party} break date — {label}",
                description=brk_field.conditions or "Break option date.",
            )
        )
        if brk_field.notice_months:
            deadline = _subtract_months(bd_dt, int(brk_field.notice_months))
            out.append(
                DerivedEvent(
                    event_type=EventType.BREAK_NOTICE_DEADLINE,
                    event_date=deadline,
                    title=f"{party} break notice deadline — {label}",
                    description=(
                        f"Last day to serve notice to break on {brk_field.break_date.isoformat()} "
                        f"({brk_field.notice_months} months notice required)."
                    ),
                )
            )

    # Deposit return — at expiry
    if record.rent_deposit_gbp and record.rent_deposit_gbp.value and record.term_expiry.value:
        out.append(
            DerivedEvent(
                event_type=EventType.DEPOSIT_RETURN,
                event_date=_to_dt(record.term_expiry.value),
                title=f"Rent deposit review — {label}",
                description=f"£{record.rent_deposit_gbp.value:,.2f} held; review for return at expiry.",
            )
        )

    return [e for e in out if e.event_date is not None]


def upcoming_only(events: Iterable[DerivedEvent], from_date: date | None = None) -> list[DerivedEvent]:
    cutoff = _to_dt(from_date or date.today())
    return [e for e in events if e.event_date >= cutoff]
