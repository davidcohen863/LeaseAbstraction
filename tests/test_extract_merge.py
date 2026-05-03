"""Tests for src/leaseos/extract.py — _merge_records / _strip_meta.

These exercise the two-pass extraction merge logic without calling the
Anthropic API.
"""

from __future__ import annotations

from datetime import date

from leaseos.extract import _merge_records, _strip_meta, TWO_PASS_NOTE_PREFIX
from leaseos.schema import (
    Citation,
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
    Confidence,
    Alienation,
)


def _baseline() -> LeaseRecord:
    """A fully-populated lease record we can perturb to drive disagreement tests."""
    return LeaseRecord(
        premises_address=StringField(
            value="14 Crouch End Broadway",
            citation=Citation(page=1, clause_reference="cover", quote="14 Crouch End Broadway"),
            confidence=Confidence.HIGH,
        ),
        premises_extent=StringField(value="ground floor", confidence=Confidence.HIGH),
        landlord=Party(name="Patel Holdings"),
        tenant=Party(name="Olive & Vine Ltd"),
        term_start=DateField(value=date(2022, 5, 1), confidence=Confidence.HIGH),
        term_length_years=IntField(value=10, confidence=Confidence.HIGH),
        term_expiry=DateField(value=date(2032, 4, 30), confidence=Confidence.HIGH),
        initial_rent_gbp=MoneyField(value=42500.0, confidence=Confidence.HIGH),
        rent_frequency=StringField(value="quarterly", confidence=Confidence.HIGH),
        rent_review=RentReview(basis=ReviewBasis.OPEN_MARKET, cycle_years=5),
        repair=Repair(basis=RepairBasis.FRI),
        permitted_use=StringField(value="E(b)", confidence=Confidence.HIGH),
        alienation=Alienation(),
        service_charge=ServiceCharge(),
    )


# ---- _strip_meta --------------------------------------------------------


class TestStripMeta:
    def test_strips_top_level_meta_keys(self):
        d = {"value": "hello", "citation": {"page": 1, "quote": "x"}, "confidence": "high", "notes": "n"}
        assert _strip_meta(d) == {"value": "hello"}

    def test_recurses_into_nested_dicts(self):
        d = {
            "rent_review": {
                "basis": "open_market",
                "citation": {"page": 3, "quote": "..."},
                "confidence": "high",
            }
        }
        out = _strip_meta(d)
        assert "citation" not in out["rent_review"]
        assert "confidence" not in out["rent_review"]
        assert out["rent_review"]["basis"] == "open_market"

    def test_handles_lists(self):
        d = [{"value": "a", "citation": "x"}, {"value": "b", "citation": "y"}]
        assert _strip_meta(d) == [{"value": "a"}, {"value": "b"}]

    def test_passes_through_scalars(self):
        assert _strip_meta(42) == 42
        assert _strip_meta(None) is None
        assert _strip_meta("hello") == "hello"


# ---- _merge_records -----------------------------------------------------


class TestMergeRecords:
    def test_identical_passes_no_disagreements(self):
        p1 = _baseline()
        p2 = _baseline()
        merged, disagreements = _merge_records(p1, p2)
        assert disagreements == 0
        assert merged.initial_rent_gbp.confidence == Confidence.HIGH
        assert merged.term_expiry.confidence == Confidence.HIGH

    def test_value_disagreement_downgrades_confidence(self):
        p1 = _baseline()
        p2 = _baseline()
        # Pass 2 sees a different rent
        p2.initial_rent_gbp = MoneyField(value=45000.0, confidence=Confidence.HIGH)
        merged, disagreements = _merge_records(p1, p2)
        assert disagreements == 1
        # Pass 1's value wins, but confidence is forced to low
        assert merged.initial_rent_gbp.value == 42500.0
        assert merged.initial_rent_gbp.confidence == Confidence.LOW

    def test_disagreement_appends_two_pass_note(self):
        p1 = _baseline()
        p2 = _baseline()
        p2.initial_rent_gbp = MoneyField(value=45000.0)
        merged, _ = _merge_records(p1, p2)
        assert merged.initial_rent_gbp.notes is not None
        assert TWO_PASS_NOTE_PREFIX in merged.initial_rent_gbp.notes

    def test_disagreement_preserves_existing_notes(self):
        p1 = _baseline()
        p1.initial_rent_gbp.notes = "Stated exclusive of VAT."
        p2 = _baseline()
        p2.initial_rent_gbp = MoneyField(value=45000.0)
        merged, _ = _merge_records(p1, p2)
        assert "exclusive of VAT" in (merged.initial_rent_gbp.notes or "")
        assert TWO_PASS_NOTE_PREFIX in (merged.initial_rent_gbp.notes or "")

    def test_metadata_only_diff_is_not_disagreement(self):
        # If only the citation/notes differ but values match, no disagreement
        p1 = _baseline()
        p2 = _baseline()
        p1.initial_rent_gbp.citation = Citation(page=2, clause_reference="cl. 4.1", quote="X")
        p2.initial_rent_gbp.citation = Citation(page=2, clause_reference="cl. 4", quote="Y")
        p2.initial_rent_gbp.notes = "different note text"
        merged, disagreements = _merge_records(p1, p2)
        assert disagreements == 0
        # Pass-1 metadata is preserved
        assert merged.initial_rent_gbp.citation.clause_reference == "cl. 4.1"

    def test_composite_field_disagreement_downgrades_composite(self):
        p1 = _baseline()
        p2 = _baseline()
        # Pass 2 reads the rent review as RPI-linked instead of open market
        p2.rent_review = RentReview(basis=ReviewBasis.RPI, cycle_years=5)
        merged, disagreements = _merge_records(p1, p2)
        assert disagreements == 1
        # Pass 1 wins on the value
        assert merged.rent_review.basis == ReviewBasis.OPEN_MARKET
        # but confidence drops
        assert merged.rent_review.confidence == Confidence.LOW

    def test_null_vs_value_counts_as_disagreement(self):
        p1 = _baseline()
        p2 = _baseline()
        p2.initial_rent_gbp = MoneyField(value=None)
        merged, disagreements = _merge_records(p1, p2)
        assert disagreements == 1
        assert merged.initial_rent_gbp.confidence == Confidence.LOW

    def test_returns_pass1_engine_metadata_unchanged(self):
        p1 = _baseline()
        p1.extraction_model = "claude-sonnet-4-6"
        p1.extraction_seconds = 60.0
        p2 = _baseline()
        merged, _ = _merge_records(p1, p2)
        assert merged.extraction_model == "claude-sonnet-4-6"
        assert merged.extraction_seconds == 60.0

    def test_party_company_number_disagreement_flagged(self):
        p1 = _baseline()
        p1.tenant = Party(name="Olive & Vine Ltd", company_number="13442019")
        p2 = _baseline()
        p2.tenant = Party(name="Olive & Vine Ltd", company_number="13442020")
        merged, disagreements = _merge_records(p1, p2)
        assert disagreements == 1
        assert merged.tenant.company_number == "13442019"
        assert merged.tenant.confidence == Confidence.LOW
