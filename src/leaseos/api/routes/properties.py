"""Property routes — first-class entity that groups leases by physical address.

A Property may have many Leases over its lifetime (e.g. unit re-let to a new
tenant in 2032). Today the relationship is created automatically on lease
extraction by matching on a normalised address.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import AuthenticatedUser, current_user
from ..db import get_db
from ..models import Lease, LeaseEvent, LeaseStatus, Property

router = APIRouter(prefix="/properties", tags=["properties"])


# ---- response shapes -----------------------------------------------------


class PropertySummary(BaseModel):
    id: str
    address: str
    sector: str | None
    landlord_client: str | None
    notes: str | None
    created_at: datetime
    updated_at: datetime
    lease_count: int
    active_lease_id: str | None
    active_lease_label: str | None
    next_event_date: datetime | None
    next_event_title: str | None


class LeaseRef(BaseModel):
    id: str
    label: str
    status: str
    created_at: datetime


class EventRef(BaseModel):
    id: str
    event_type: str
    event_date: datetime
    title: str


class PropertyDetail(PropertySummary):
    leases: list[LeaseRef]
    upcoming_events: list[EventRef]


# ---- helpers -------------------------------------------------------------


def _summarise(db: Session, prop: Property) -> PropertySummary:
    leases = (
        db.execute(
            select(Lease).where(Lease.property_id == prop.id).order_by(Lease.created_at.desc())
        )
        .scalars()
        .all()
    )
    # "Active" = the most recent non-failed lease; prefer approved.
    active = next((l for l in leases if l.status == LeaseStatus.APPROVED.value), None)
    if active is None:
        active = next((l for l in leases if l.status != LeaseStatus.FAILED.value), None)
    if active is None and leases:
        active = leases[0]

    next_event = None
    if leases:
        lease_ids = [l.id for l in leases]
        next_event = (
            db.execute(
                select(LeaseEvent)
                .where(LeaseEvent.lease_id.in_(lease_ids))
                .where(LeaseEvent.event_date >= datetime.utcnow())
                .order_by(LeaseEvent.event_date.asc())
                .limit(1)
            )
            .scalar_one_or_none()
        )

    return PropertySummary(
        id=prop.id,
        address=prop.address,
        sector=prop.sector,
        landlord_client=prop.landlord_client,
        notes=prop.notes,
        created_at=prop.created_at,
        # Defensive: legacy rows from before the updated_at column was added
        # via ALTER TABLE may have NULL here. Fall back to created_at so the
        # response remains valid Pydantic.
        updated_at=prop.updated_at or prop.created_at,
        lease_count=len(leases),
        active_lease_id=active.id if active else None,
        active_lease_label=active.label if active else None,
        next_event_date=next_event.event_date if next_event else None,
        next_event_title=next_event.title if next_event else None,
    )


# ---- endpoints -----------------------------------------------------------


@router.get("", response_model=list[PropertySummary])
def list_properties(
    user: AuthenticatedUser = Depends(current_user),
    db: Session = Depends(get_db),
) -> list[PropertySummary]:
    rows = db.execute(select(Property).order_by(Property.address)).scalars().all()
    return [_summarise(db, p) for p in rows]


@router.get("/{property_id}", response_model=PropertyDetail)
def get_property(
    property_id: str,
    user: AuthenticatedUser = Depends(current_user),
    db: Session = Depends(get_db),
) -> PropertyDetail:
    prop = db.get(Property, property_id)
    if prop is None:
        raise HTTPException(404, "Property not found")
    summary = _summarise(db, prop).model_dump()

    leases = (
        db.execute(
            select(Lease).where(Lease.property_id == prop.id).order_by(Lease.created_at.desc())
        )
        .scalars()
        .all()
    )
    lease_ids = [l.id for l in leases]
    upcoming = (
        db.execute(
            select(LeaseEvent)
            .where(LeaseEvent.lease_id.in_(lease_ids) if lease_ids else False)
            .where(LeaseEvent.event_date >= datetime.utcnow() - timedelta(days=14))
            .order_by(LeaseEvent.event_date.asc())
            .limit(20)
        )
        .scalars()
        .all()
    ) if lease_ids else []

    summary["leases"] = [
        LeaseRef(id=l.id, label=l.label, status=l.status, created_at=l.created_at)
        for l in leases
    ]
    summary["upcoming_events"] = [
        EventRef(id=e.id, event_type=e.event_type, event_date=e.event_date, title=e.title)
        for e in upcoming
    ]
    return PropertyDetail(**summary)


class PropertyPatch(BaseModel):
    sector: str | None = None
    landlord_client: str | None = None
    notes: str | None = None


@router.patch("/{property_id}", response_model=PropertySummary)
def update_property(
    property_id: str,
    body: PropertyPatch,
    user: AuthenticatedUser = Depends(current_user),
    db: Session = Depends(get_db),
) -> PropertySummary:
    prop = db.get(Property, property_id)
    if prop is None:
        raise HTTPException(404, "Property not found")
    if body.sector is not None:
        prop.sector = body.sector
    if body.landlord_client is not None:
        prop.landlord_client = body.landlord_client
    if body.notes is not None:
        prop.notes = body.notes
    db.commit()
    return _summarise(db, prop)
