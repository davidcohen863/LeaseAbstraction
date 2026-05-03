"""Audit log endpoint — read-only feed of every paralegal/surveyor edit
plus lease-lifecycle events (approve, settle).

V1 sources:
  * `FieldEdit` rows — per-field reviewer edits captured by `PATCH /leases/{id}/fields/...`
  * Lease.approved_at — the moment a lease moved from ready_for_review → approved

Two endpoints:
  * `GET /audit` — firm-wide paginated feed (Settings → Audit)
  * `GET /leases/{id}/audit` — lease-scoped feed (right-rail Activity panel)
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import AuthenticatedUser, current_user
from ..db import get_db
from ..models import FieldEdit, Lease, LeaseStatus

router = APIRouter(tags=["audit"])


class AuditEntry(BaseModel):
    """One row of the audit feed. `kind` discriminates which fields are populated."""

    id: str
    kind: Literal["field_edit", "lease_approved"]
    lease_id: str
    lease_label: str
    actor_user_id: str | None
    created_at: datetime
    # field_edit-specific
    field_path: str | None = None
    before_value: object | None = None
    after_value: object | None = None


def _summarise_value(v: object) -> object:
    """FieldEdit before/after_value is wrapped as `{"v": ...}` — unwrap for display."""
    if isinstance(v, dict) and set(v.keys()) == {"v"}:
        return v["v"]
    return v


@router.get("/audit", response_model=list[AuditEntry])
def list_audit(
    limit: int = Query(default=50, ge=1, le=500),
    user: AuthenticatedUser = Depends(current_user),
    db: Session = Depends(get_db),
) -> list[AuditEntry]:
    """Firm-wide audit feed, newest first. Capped at 500 — pagination is YAGNI
    until a firm has more than ~50 leases × ~30 edits/year sitting in there."""
    return _build_feed(db, lease_id=None, limit=limit)


@router.get("/leases/{lease_id}/audit", response_model=list[AuditEntry])
def list_lease_audit(
    lease_id: str,
    limit: int = Query(default=30, ge=1, le=200),
    user: AuthenticatedUser = Depends(current_user),
    db: Session = Depends(get_db),
) -> list[AuditEntry]:
    """Single-lease feed for the lease-detail Activity panel."""
    if db.get(Lease, lease_id) is None:
        raise HTTPException(404, "Lease not found")
    return _build_feed(db, lease_id=lease_id, limit=limit)


def _build_feed(db: Session, *, lease_id: str | None, limit: int) -> list[AuditEntry]:
    # FieldEdit rows
    edit_stmt = (
        select(FieldEdit, Lease.label)
        .join(Lease, Lease.id == FieldEdit.lease_id)
    )
    if lease_id:
        edit_stmt = edit_stmt.where(FieldEdit.lease_id == lease_id)
    edit_stmt = edit_stmt.order_by(FieldEdit.created_at.desc()).limit(limit)
    edits = db.execute(edit_stmt).all()

    # Lease-approved rows. Cheap synthetic feed entry — no separate audit table needed.
    approve_stmt = select(Lease).where(
        Lease.status == LeaseStatus.APPROVED.value, Lease.approved_at.is_not(None)
    )
    if lease_id:
        approve_stmt = approve_stmt.where(Lease.id == lease_id)
    approve_stmt = approve_stmt.order_by(Lease.approved_at.desc()).limit(limit)
    approvals = db.execute(approve_stmt).scalars().all()

    entries: list[AuditEntry] = [
        AuditEntry(
            id=fe.id,
            kind="field_edit",
            lease_id=fe.lease_id,
            lease_label=label,
            actor_user_id=fe.actor_user_id,
            created_at=fe.created_at,
            field_path=fe.field_path,
            before_value=_summarise_value(fe.before_value),
            after_value=_summarise_value(fe.after_value),
        )
        for fe, label in edits
    ] + [
        AuditEntry(
            id=f"approve-{l.id}",
            kind="lease_approved",
            lease_id=l.id,
            lease_label=l.label,
            actor_user_id=l.approved_by,
            created_at=l.approved_at,  # type: ignore[arg-type]
        )
        for l in approvals
        if l.approved_at is not None
    ]

    entries.sort(key=lambda e: e.created_at, reverse=True)
    return entries[:limit]
