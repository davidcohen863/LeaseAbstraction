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


# ---- date helpers --------------------------------------------------------


def _shift_months(d: datetime, months: int) -> datetime:
    """Add (months > 0) or subtract (months < 0) whole months. Clamps to last day."""
    total = d.year * 12 + (d.month - 1) + months
    year, month = divmod(total, 12)
    month += 1
    last_day = calendar.monthrange(year, month)[1]
    return d.replace(year=year, month=month, day=min(d.day, last_day))


def _subtract_months(d: datetime, months: int) -> datetime:
    return _shift_months(d, -months)


def _add_months(d: datetime, months: int) -> datetime:
    return _shift_months(d, months)


def _to_dt(d: date | None) -> datetime | None:
    if d is None:
        return None
    return datetime.combine(d, datetime.min.time())


# ---- recurring-review expansion -----------------------------------------


def _expand_review_dates(record: LeaseRecord) -> list[datetime]:
    """If the lease has a cycle (e.g. 5-yearly) plus at least one explicit
    review date plus a term expiry, generate every review date up to (but
    not on) the expiry. If the model already enumerated them all, this is a
    no-op deduplicated.
    """
    rr = record.rent_review
    explicit = [_to_dt(d) for d in (rr.review_dates or []) if d is not None]
    explicit_dts: list[datetime] = [d for d in explicit if d is not None]
    if not explicit_dts:
        return []
    if not rr.cycle_years or rr.cycle_years <= 0:
        return sorted(set(explicit_dts))
    expiry = _to_dt(record.term_expiry.value) if record.term_expiry else None

    out: set[datetime] = set(explicit_dts)
    seed = min(explicit_dts)
    cycle_months = int(rr.cycle_years) * 12
    if expiry is None:
        # No expiry to cap at — emit just the explicit ones
        return sorted(out)

    cur = _add_months(seed, cycle_months)
    # Belt-and-braces cap. Real commercial leases top out around 25 years × 12
    # = 300 months; with a 12-month cycle that's 25 cycles, well inside 100.
    # The cap exists only to prevent a runaway loop if someone hand-crafts a
    # nonsense LeaseRecord with `cycle_months=0` (which `_add_months` would
    # then return unchanged, causing `cur < expiry` to stay true forever).
    safety = 0
    while cur < expiry and safety < 100:
        out.add(cur)
        cur = _add_months(cur, cycle_months)
        safety += 1
    return sorted(out)


# ---- main API ------------------------------------------------------------


@dataclass
class DerivedEvent:
    event_type: EventType
    event_date: datetime
    title: str
    description: str


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

    # Rent reviews — both the trigger (T-6mo) and the effective date.
    # Expanded across the term using the cycle if the model only gave us one.
    rr = record.rent_review
    review_dts = _expand_review_dates(record)
    for rd_dt in review_dts:
        out.append(
            DerivedEvent(
                event_type=EventType.RENT_REVIEW_EFFECTIVE,
                event_date=rd_dt,
                title=f"Rent review effective — {label}",
                description=f"Review basis: {rr.basis.value if rr.basis else 'unknown'}.",
            )
        )
        out.append(
            DerivedEvent(
                event_type=EventType.RENT_REVIEW_TRIGGER,
                event_date=_subtract_months(rd_dt, 6),
                title=f"Prepare rent review pack — {label}",
                description="Pack auto-generation fires from this date.",
            )
        )

    # Tenant + landlord break + notice deadline
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

    # Insurance renewal — annual recurrence from the stated date until expiry
    if record.insurance_renewal_date and record.insurance_renewal_date.value:
        first = _to_dt(record.insurance_renewal_date.value)
        expiry = _to_dt(record.term_expiry.value) if record.term_expiry else None
        cur = first
        safety = 0
        while cur is not None and (expiry is None or cur <= expiry) and safety < 30:
            out.append(
                DerivedEvent(
                    event_type=EventType.INSURANCE_RENEWAL,
                    event_date=cur,
                    title=f"Insurance renewal — {label}",
                    description="Annual buildings insurance renewal — collect tenant contribution.",
                )
            )
            cur = _add_months(cur, 12)
            safety += 1

    # EPC expiry — single critical date
    if record.epc_expiry_date and record.epc_expiry_date.value:
        out.append(
            DerivedEvent(
                event_type=EventType.EPC_EXPIRY,
                event_date=_to_dt(record.epc_expiry_date.value),
                title=f"EPC expiry — {label}",
                description="Energy Performance Certificate expires; new survey required for any new letting.",
            )
        )

    # Deposit return — at expiry
    if (
        record.rent_deposit_gbp
        and record.rent_deposit_gbp.value
        and record.term_expiry
        and record.term_expiry.value
    ):
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
