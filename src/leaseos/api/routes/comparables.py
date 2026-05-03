"""Comparables CRUD."""

from __future__ import annotations

from datetime import datetime, date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import AuthenticatedUser, current_user
from ..db import get_db
from ..models import Comparable, ComparableSource, DealType

router = APIRouter(prefix="/comparables", tags=["comparables"])


class ComparableIn(BaseModel):
    address: str
    rent_pa_gbp: float
    area_sqft: float | None = None
    frontage_m: float | None = None
    use_class: str | None = None
    deal_date: date | None = None
    deal_type: str = DealType.LETTING.value
    source: str = ComparableSource.MANUAL.value
    notes: str | None = None


class ComparableOut(ComparableIn):
    id: str
    created_at: datetime
    derived_from_lease_id: str | None = None


class BulkIn(BaseModel):
    items: list[ComparableIn]


def _to_out(c: Comparable) -> ComparableOut:
    return ComparableOut(
        id=c.id,
        address=c.address,
        rent_pa_gbp=c.rent_pa_gbp,
        area_sqft=c.area_sqft,
        frontage_m=c.frontage_m,
        use_class=c.use_class,
        deal_date=c.deal_date.date() if c.deal_date else None,
        deal_type=c.deal_type,
        source=c.source,
        notes=c.notes,
        created_at=c.created_at,
        derived_from_lease_id=c.derived_from_lease_id,
    )


@router.get("", response_model=list[ComparableOut])
def list_comparables(
    user: AuthenticatedUser = Depends(current_user),
    db: Session = Depends(get_db),
) -> list[ComparableOut]:
    rows = db.execute(select(Comparable).order_by(Comparable.deal_date.desc().nullslast(), Comparable.created_at.desc())).scalars().all()
    return [_to_out(c) for c in rows]


@router.post("", response_model=ComparableOut, status_code=201)
def create_comparable(
    body: ComparableIn,
    user: AuthenticatedUser = Depends(current_user),
    db: Session = Depends(get_db),
) -> ComparableOut:
    c = Comparable(
        address=body.address,
        rent_pa_gbp=body.rent_pa_gbp,
        area_sqft=body.area_sqft,
        frontage_m=body.frontage_m,
        use_class=body.use_class,
        deal_date=datetime.combine(body.deal_date, datetime.min.time()) if body.deal_date else None,
        deal_type=body.deal_type,
        source=body.source,
        notes=body.notes,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return _to_out(c)


@router.post("/bulk", response_model=list[ComparableOut], status_code=201)
def create_comparables_bulk(
    body: BulkIn,
    user: AuthenticatedUser = Depends(current_user),
    db: Session = Depends(get_db),
) -> list[ComparableOut]:
    out: list[Comparable] = []
    for item in body.items:
        c = Comparable(
            address=item.address,
            rent_pa_gbp=item.rent_pa_gbp,
            area_sqft=item.area_sqft,
            frontage_m=item.frontage_m,
            use_class=item.use_class,
            deal_date=datetime.combine(item.deal_date, datetime.min.time()) if item.deal_date else None,
            deal_type=item.deal_type,
            source=item.source,
            notes=item.notes,
        )
        db.add(c)
        out.append(c)
    db.commit()
    for c in out:
        db.refresh(c)
    return [_to_out(c) for c in out]


@router.delete("/{comparable_id}", status_code=204)
def delete_comparable(
    comparable_id: str,
    user: AuthenticatedUser = Depends(current_user),
    db: Session = Depends(get_db),
) -> None:
    c = db.get(Comparable, comparable_id)
    if c is None:
        raise HTTPException(404, "Comparable not found")
    db.delete(c)
    db.commit()
