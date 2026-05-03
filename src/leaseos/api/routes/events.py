"""Calendar event endpoints."""

from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import AuthenticatedUser, current_user
from ..db import get_db
from ..models import Lease, LeaseEvent

router = APIRouter(prefix="/events", tags=["events"])


class EventOut(BaseModel):
    id: str
    lease_id: str
    lease_label: str
    event_type: str
    event_date: datetime
    title: str
    description: str | None
    status: str
    pushed_to_google: bool
    pushed_to_outlook: bool


@router.get("", response_model=list[EventOut])
def list_events(
    days_ahead: int = 365,
    days_behind: int = 30,
    user: AuthenticatedUser = Depends(current_user),
    db: Session = Depends(get_db),
) -> list[EventOut]:
    now = datetime.utcnow()
    start = now - timedelta(days=days_behind)
    end = now + timedelta(days=days_ahead)
    rows = (
        db.execute(
            select(LeaseEvent, Lease.label)
            .join(Lease, Lease.id == LeaseEvent.lease_id)
            .where(LeaseEvent.event_date >= start)
            .where(LeaseEvent.event_date <= end)
            .order_by(LeaseEvent.event_date.asc())
        )
        .all()
    )
    return [
        EventOut(
            id=event.id,
            lease_id=event.lease_id,
            lease_label=label,
            event_type=event.event_type,
            event_date=event.event_date,
            title=event.title,
            description=event.description,
            status=event.status,
            pushed_to_google=event.pushed_to_google,
            pushed_to_outlook=event.pushed_to_outlook,
        )
        for event, label in rows
    ]


@router.post("/{event_id}/acknowledge", response_model=EventOut)
def acknowledge_event(
    event_id: str,
    user: AuthenticatedUser = Depends(current_user),
    db: Session = Depends(get_db),
) -> EventOut:
    event = db.get(LeaseEvent, event_id)
    if event is None:
        raise HTTPException(404, "Event not found")
    event.status = "acknowledged"
    db.commit()
    lease = db.get(Lease, event.lease_id)
    return EventOut(
        id=event.id,
        lease_id=event.lease_id,
        lease_label=lease.label if lease else "",
        event_type=event.event_type,
        event_date=event.event_date,
        title=event.title,
        description=event.description,
        status=event.status,
        pushed_to_google=event.pushed_to_google,
        pushed_to_outlook=event.pushed_to_outlook,
    )
