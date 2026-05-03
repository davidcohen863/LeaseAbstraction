"""Tests for src/leaseos/api/events.py — month math + event derivation."""

from __future__ import annotations

from datetime import date, datetime

import pytest

from leaseos.api.events import (
    _add_months,
    _expand_review_dates,
    _shift_months,
    _subtract_months,
    derive_events,
)
from leaseos.api.models import EventType
from leaseos.schema import (
    BreakClause,
    DateField,
    IntField,
    LeaseRecord,
    MoneyField,
    Party,
    Repair,
    RepairBasis,
    RentReview,
    ReviewBasis,
    ServiceCharge,
    StringField,
    Alienation,
)


# ---- _shift_months / _subtract_months / _add_months --------------------


class TestMonthMath:
    def test_subtract_months_simple(self):
        # 30 April 2027 minus 6 months = 30 October 2026
        d = datetime(2027, 4, 30)
        assert _subtract_months(d, 6) == datetime(2026, 10, 30)

    def test_subtract_months_year_boundary(self):
        # 1 March 2027 minus 6 months = 1 September 2026
        d = datetime(2027, 3, 1)
        assert _subtract_months(d, 6) == datetime(2026, 9, 1)

    def test_subtract_months_clamps_to_short_month(self):
        # 31 March → 1 month back = 28 February (not Feb 31)
        d = datetime(2027, 3, 31)
        assert _subtract_months(d, 1) == datetime(2027, 2, 28)

    def test_subtract_months_leap_year_clamp(self):
        # 31 March 2024 minus 1 month = 29 February 2024 (leap year)
        d = datetime(2024, 3, 31)
        assert _subtract_months(d, 1) == datetime(2024, 2, 29)

    def test_add_months_year_boundary(self):
        d = datetime(2026, 11, 15)
        assert _add_months(d, 3) == datetime(2027, 2, 15)

    def test_add_months_clamps(self):
        # 31 January + 1 month = 28 February (no Feb 31)
        d = datetime(2027, 1, 31)
        assert _add_months(d, 1) == datetime(2027, 2, 28)

    def test_add_zero_is_identity(self):
        d = datetime(2026, 5, 3, 12, 30)
        assert _add_months(d, 0) == d
        assert _subtract_months(d, 0) == d

    def test_shift_months_multi_year(self):
        # Shift 24 months
        d = datetime(2025, 6, 15)
        assert _shift_months(d, 24) == datetime(2027, 6, 15)
        assert _shift_months(d, -24) == datetime(2023, 6, 15)


# ---- _expand_review_dates -----------------------------------------------


class TestExpandReviewDates:
    def _build_record(self, *, term_expiry: date, review_dates: list[date], cycle_years: int | None) -> LeaseRecord:
        """Construct a minimal LeaseRecord with just the rent_review + expiry fields populated."""
        return LeaseRecord(
            premises_address=StringField(value="14 Test Street"),
            premises_extent=StringField(value="ground floor"),
            landlord=Party(name="Test Landlord"),
            tenant=Party(name="Test Tenant"),
            term_start=DateField(value=date(2022, 5, 1)),
            term_length_years=IntField(value=10),
            term_expiry=DateField(value=term_expiry),
            initial_rent_gbp=MoneyField(value=42500.0),
            rent_frequency=StringField(value="quarterly"),
            rent_review=RentReview(
                basis=ReviewBasis.OPEN_MARKET,
                cycle_years=cycle_years,
                review_dates=review_dates,
            ),
            repair=Repair(basis=RepairBasis.FRI),
            permitted_use=StringField(value="E(b)"),
            alienation=Alienation(),
            service_charge=ServiceCharge(),
        )

    def test_expand_with_cycle_emits_extra_dates(self):
        # 15-year lease, first review at year 5, cycle 5 → expects 3 reviews
        rec = self._build_record(
            term_expiry=date(2037, 4, 30),
            review_dates=[date(2027, 5, 1)],
            cycle_years=5,
        )
        out = _expand_review_dates(rec)
        assert datetime(2027, 5, 1) in out
        assert datetime(2032, 5, 1) in out
        # 2037-05-01 is AFTER expiry (2037-04-30) so should NOT be added
        assert datetime(2037, 5, 1) not in out

    def test_expand_no_cycle_returns_explicit(self):
        rec = self._build_record(
            term_expiry=date(2032, 4, 30),
            review_dates=[date(2027, 5, 1), date(2030, 5, 1)],
            cycle_years=None,
        )
        out = _expand_review_dates(rec)
        assert sorted(out) == [datetime(2027, 5, 1), datetime(2030, 5, 1)]

    def test_expand_empty_returns_empty(self):
        rec = self._build_record(
            term_expiry=date(2032, 4, 30),
            review_dates=[],
            cycle_years=5,
        )
        assert _expand_review_dates(rec) == []

    def test_expand_caps_at_expiry(self):
        # 10-year lease with 5-year cycle → only 1 effective review (the 2nd would be at expiry)
        rec = self._build_record(
            term_expiry=date(2032, 4, 30),
            review_dates=[date(2027, 5, 1)],
            cycle_years=5,
        )
        out = _expand_review_dates(rec)
        assert out == [datetime(2027, 5, 1)]

    def test_expand_dedupes_when_explicit_overlaps_cycle(self):
        # Both 2027 and 2032 listed AND cycle would have produced them — no duplicates
        rec = self._build_record(
            term_expiry=date(2042, 4, 30),
            review_dates=[date(2027, 5, 1), date(2032, 5, 1)],
            cycle_years=5,
        )
        out = _expand_review_dates(rec)
        assert out.count(datetime(2027, 5, 1)) == 1
        assert out.count(datetime(2032, 5, 1)) == 1


# ---- derive_events end-to-end ------------------------------------------


class TestDeriveEvents:
    def _full_record(
        self,
        *,
        with_break: bool = True,
        with_insurance: bool = True,
        with_epc: bool = True,
        with_deposit: bool = True,
    ) -> LeaseRecord:
        return LeaseRecord(
            premises_address=StringField(value="14 Crouch End Broadway"),
            premises_extent=StringField(value="ground floor"),
            landlord=Party(name="Patel Holdings"),
            tenant=Party(name="Olive & Vine Ltd"),
            term_start=DateField(value=date(2022, 5, 1)),
            term_length_years=IntField(value=10),
            term_expiry=DateField(value=date(2032, 4, 30)),
            initial_rent_gbp=MoneyField(value=42500.0),
            rent_frequency=StringField(value="quarterly"),
            rent_review=RentReview(
                basis=ReviewBasis.OPEN_MARKET,
                cycle_years=5,
                review_dates=[date(2027, 5, 1)],
            ),
            tenant_break=BreakClause(
                party="tenant", break_date=date(2027, 4, 30), notice_months=6
            ) if with_break else None,
            repair=Repair(basis=RepairBasis.FRI),
            permitted_use=StringField(value="E(b)"),
            alienation=Alienation(),
            service_charge=ServiceCharge(),
            rent_deposit_gbp=MoneyField(value=10625.0) if with_deposit else None,
            insurance_renewal_date=DateField(value=date(2023, 3, 25)) if with_insurance else None,
            epc_expiry_date=DateField(value=date(2032, 4, 11)) if with_epc else None,
        )

    def test_full_lease_emits_all_event_types(self):
        rec = self._full_record()
        events = derive_events(rec)
        types = {e.event_type for e in events}
        assert EventType.LEASE_EXPIRY in types
        assert EventType.RENT_REVIEW_EFFECTIVE in types
        assert EventType.RENT_REVIEW_TRIGGER in types
        assert EventType.BREAK_DATE in types
        assert EventType.BREAK_NOTICE_DEADLINE in types
        assert EventType.INSURANCE_RENEWAL in types
        assert EventType.EPC_EXPIRY in types
        assert EventType.DEPOSIT_RETURN in types

    def test_break_notice_deadline_is_6_months_before_break_date(self):
        rec = self._full_record()
        events = derive_events(rec)
        deadline = next(e for e in events if e.event_type == EventType.BREAK_NOTICE_DEADLINE)
        # 30 April 2027 - 6 months = 30 October 2026
        assert deadline.event_date == datetime(2026, 10, 30)

    def test_rent_review_trigger_is_6_months_before_effective(self):
        rec = self._full_record()
        events = derive_events(rec)
        trigger = next(e for e in events if e.event_type == EventType.RENT_REVIEW_TRIGGER)
        # 1 May 2027 - 6 months = 1 November 2026
        assert trigger.event_date == datetime(2026, 11, 1)

    def test_no_break_no_break_events(self):
        rec = self._full_record(with_break=False)
        events = derive_events(rec)
        types = {e.event_type for e in events}
        assert EventType.BREAK_DATE not in types
        assert EventType.BREAK_NOTICE_DEADLINE not in types

    def test_insurance_renewal_is_annual_recurring(self):
        rec = self._full_record()
        insurance_events = [e for e in derive_events(rec) if e.event_type == EventType.INSURANCE_RENEWAL]
        # First date 25 March 2023, expiry 30 April 2032 → roughly 10 instances
        assert len(insurance_events) >= 9
        # Each consecutive event should be exactly 1 year apart
        sorted_dates = sorted(e.event_date for e in insurance_events)
        for prev, curr in zip(sorted_dates, sorted_dates[1:]):
            assert curr.year == prev.year + 1
            assert curr.month == prev.month
            assert curr.day == prev.day

    def test_no_deposit_no_deposit_event(self):
        rec = self._full_record(with_deposit=False)
        events = derive_events(rec)
        assert not any(e.event_type == EventType.DEPOSIT_RETURN for e in events)
