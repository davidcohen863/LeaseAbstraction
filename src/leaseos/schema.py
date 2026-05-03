"""Lease record schema — the 15 priority clauses with per-field citations.

Every extracted field carries a citation: page number, clause reference and a
verbatim quote. Citations are non-negotiable — the reviewer UI uses them to
jump straight to the source so a surveyor can verify in one click.
"""

from __future__ import annotations

from datetime import date
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class Confidence(str, Enum):
    HIGH = "high"
    LOW = "low"


class Citation(BaseModel):
    page: int = Field(description="1-indexed PDF page number where the clause appears")
    clause_reference: Optional[str] = Field(
        default=None,
        description="Clause reference as written in the lease, e.g. 'cl. 5.1', 'Sched 4 para 2', 'side-letter 1'",
    )
    quote: str = Field(
        description="Verbatim quote from the lease supporting the extracted value (max ~400 chars)",
        max_length=600,
    )


class Field_(BaseModel):
    """Generic wrapper: every leaf clause is value + citation + confidence."""

    citation: Optional[Citation] = None
    confidence: Confidence = Confidence.HIGH
    notes: Optional[str] = None


class StringField(Field_):
    value: Optional[str] = None


class DateField(Field_):
    value: Optional[date] = None


class MoneyField(Field_):
    value: Optional[float] = Field(default=None, description="Amount in GBP")


class BoolField(Field_):
    value: Optional[bool] = None


class IntField(Field_):
    value: Optional[int] = None


# ---- domain enums --------------------------------------------------------


class ReviewBasis(str, Enum):
    OPEN_MARKET = "open_market"
    RPI = "rpi"
    CPI = "cpi"
    FIXED = "fixed"
    HYBRID = "hybrid"
    UNKNOWN = "unknown"


class RepairBasis(str, Enum):
    FRI = "fri"  # full repairing & insuring
    IRI = "iri"  # internal repairing & insuring
    SCHEDULE_OF_CONDITION = "schedule_of_condition"
    OTHER = "other"
    UNKNOWN = "unknown"


class RentFrequency(str, Enum):
    QUARTERLY = "quarterly"
    MONTHLY = "monthly"
    ANNUALLY = "annually"
    OTHER = "other"
    UNKNOWN = "unknown"


# ---- composite clauses ---------------------------------------------------


class Party(Field_):
    name: Optional[str] = None
    company_number: Optional[str] = Field(
        default=None, description="UK Companies House number if a corporate party"
    )
    address: Optional[str] = None


class RentReview(Field_):
    basis: ReviewBasis = ReviewBasis.UNKNOWN
    upward_only: Optional[bool] = None
    cycle_years: Optional[int] = Field(default=None, description="e.g. 5 for 5-yearly")
    review_dates: list[date] = Field(default_factory=list)
    cap_pct: Optional[float] = Field(default=None, description="RPI/CPI cap if applicable")
    collar_pct: Optional[float] = None


class BreakClause(Field_):
    party: Optional[str] = Field(default=None, description="'tenant' | 'landlord' | 'mutual'")
    break_date: Optional[date] = None
    notice_months: Optional[int] = None
    conditions: Optional[str] = Field(
        default=None,
        description="Conditions precedent, e.g. 'vacant possession, all rents paid'",
    )


class Repair(Field_):
    basis: RepairBasis = RepairBasis.UNKNOWN
    schedule_of_condition_attached: Optional[bool] = None


class Alienation(Field_):
    assignment_permitted: Optional[bool] = None
    assignment_with_consent: Optional[bool] = None
    aga_required: Optional[bool] = Field(
        default=None, description="Authorised Guarantee Agreement required on assignment"
    )
    subletting_permitted: Optional[bool] = None
    underletting_whole_only: Optional[bool] = None


class ServiceCharge(Field_):
    payable: Optional[bool] = None
    cap_pct: Optional[float] = None
    collar_pct: Optional[float] = None
    rpi_linked: Optional[bool] = None
    fixed_amount_gbp: Optional[float] = None


# ---- top-level lease record ---------------------------------------------


class LeaseRecord(BaseModel):
    """The structured output — one of these per abstracted lease."""

    # 1. Demised premises
    premises_address: StringField
    premises_extent: StringField = Field(
        description="Floor area / extent of demise as described in the lease (e.g. 'ground floor and basement, approx 1,250 sq ft')"
    )

    # 2 & 3. Parties
    landlord: Party
    tenant: Party
    guarantor: Optional[Party] = None

    # 4 & 5. Term
    term_start: DateField
    term_length_years: IntField
    term_expiry: DateField

    # 6 & 7. Rent
    initial_rent_gbp: MoneyField
    rent_frequency: StringField = Field(
        description="Use one of: quarterly, monthly, annually, other"
    )

    # 8 & 9. Rent review
    rent_review: RentReview

    # 10 & 11. Breaks
    tenant_break: Optional[BreakClause] = None
    landlord_break: Optional[BreakClause] = None

    # 12. Repair
    repair: Repair

    # 13. Use
    permitted_use: StringField = Field(
        description="Permitted use as written in the lease, including Use Class reference (E, F1, F2, sui generis etc.)"
    )

    # 14. Alienation
    alienation: Alienation

    # 15. Service charge
    service_charge: ServiceCharge

    # cross-cutting
    rent_deposit_gbp: Optional[MoneyField] = None

    # Compliance / operational dates (added v0.3 for the calendar)
    insurance_renewal_date: Optional[DateField] = Field(
        default=None,
        description="Annual buildings insurance renewal date if explicitly stated in the lease or annex (e.g. 'insurance year ends 25 March'). Leave null if not stated.",
    )
    epc_expiry_date: Optional[DateField] = Field(
        default=None,
        description="EPC (Energy Performance Certificate) expiry date if stated. EPCs last 10 years. Leave null if not stated.",
    )

    # extraction metadata (filled by the engine, not the model)
    source_document_filename: Optional[str] = None
    extraction_model: Optional[str] = None
    extraction_seconds: Optional[float] = None


def lease_record_json_schema() -> dict:
    """Return the JSON schema used to define the extraction tool."""
    return LeaseRecord.model_json_schema()
