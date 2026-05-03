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
from sqlalchemy.orm import Session, selectinload

from ..auth import AuthenticatedUser, current_user
from ..db import get_db
from ..models import Lease, LeaseEvent, LeaseStatus, Property
from ...utils import utc_now

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
    # Use the eager-loaded relationship if present, otherwise query.
    # The list endpoint uses selectinload(Property.leases) so this is the fast path.
    leases = sorted(prop.leases, key=lambda l: l.created_at, reverse=True)
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
                .where(LeaseEvent.event_date >= utc_now())
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
    # Eager-load leases so _summarise() doesn't issue N more queries below.
    # The "next event" lookup in _summarise still issues 1 query per property,
    # which is acceptable — at 400 properties that's a rounding error and the
    # query is well-indexed on (lease_id, event_date).
    rows = (
        db.execute(
            select(Property).options(selectinload(Property.leases)).order_by(Property.address)
        )
        .scalars()
        .all()
    )
    return [_summarise(db, p) for p in rows]


@router.get("/{property_id}", response_model=PropertyDetail)
def get_property(
    property_id: str,
    user: AuthenticatedUser = Depends(current_user),
    db: Session = Depends(get_db),
) -> PropertyDetail:
    prop = db.execute(
        select(Property).options(selectinload(Property.leases)).where(Property.id == property_id)
    ).scalar_one_or_none()
    if prop is None:
        raise HTTPException(404, "Property not found")
    summary = _summarise(db, prop).model_dump()

    leases = sorted(prop.leases, key=lambda l: l.created_at, reverse=True)
    lease_ids = [l.id for l in leases]
    upcoming = (
        db.execute(
            select(LeaseEvent)
            .where(LeaseEvent.lease_id.in_(lease_ids) if lease_ids else False)
            .where(LeaseEvent.event_date >= utc_now() - timedelta(days=14))
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


@router.delete("/{property_id}", status_code=204)
def delete_property(
    property_id: str,
    force: bool = False,
    user: AuthenticatedUser = Depends(current_user),
    db: Session = Depends(get_db),
) -> None:
    """Delete a Property record.

    Refuses if any leases are still attached unless `?force=true`. With
    `force`, the property is deleted but its leases lose their `property_id`
    pointer (they survive — Property is a grouping, not the source of truth).
    The leases will get re-linked or re-created the next time someone uploads
    a lease at the same address (the auto-link logic dedupes by normalised
    address).

    Use case: you ran into the address-normalisation dedupe being wrong
    (e.g. "Suite 4, 14 Main St" and "14 Main St" linked together) and want
    to break the link. Delete and the next lease upload at that address
    creates a fresh Property row.
    """
    prop = db.get(Property, property_id)
    if prop is None:
        raise HTTPException(404, "Property not found")

    leases = db.execute(
        select(Lease).where(Lease.property_id == prop.id)
    ).scalars().all()

    if leases and not force:
        raise HTTPException(
            400,
            f"Property has {len(leases)} lease(s) still attached — pass ?force=true "
            f"to delete anyway (leases survive but become unlinked).",
        )

    # Detach leases first so the FK doesn't block deletion
    from sqlalchemy import update

    db.execute(
        update(Lease).where(Lease.property_id == prop.id).values(property_id=None)
    )
    db.delete(prop)
    db.commit()


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
