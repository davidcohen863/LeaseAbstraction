"""Lease lifecycle endpoints: upload → extract → review → approve."""

from __future__ import annotations

import hashlib
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import AuthenticatedUser, current_user
from ..config import get_settings
from ..db import get_db
from ..models import Document, FieldEdit, Lease, LeaseStatus
from ..worker import run_extraction

router = APIRouter(prefix="/leases", tags=["leases"])


# ---- response shapes -----------------------------------------------------


class LeaseSummary(BaseModel):
    id: str
    label: str
    status: str
    created_at: datetime
    updated_at: datetime
    extraction_model: str | None
    extraction_seconds: float | None
    document_count: int
    property_id: str | None = None
    property_address: str | None = None


class LeaseDetail(LeaseSummary):
    record_json: dict | None
    extraction_error: str | None


class FieldPatch(BaseModel):
    value: object  # whatever JSON-shaped value the field takes


# ---- routes --------------------------------------------------------------


@router.post("", response_model=LeaseSummary, status_code=201)
async def upload_lease(
    background: BackgroundTasks,
    file: UploadFile = File(...),
    label: str | None = Form(default=None),
    user: AuthenticatedUser = Depends(current_user),
    db: Session = Depends(get_db),
) -> LeaseSummary:
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF uploads are accepted")

    settings = get_settings()
    settings.storage_dir.mkdir(parents=True, exist_ok=True)

    raw = await file.read()
    sha = hashlib.sha256(raw).hexdigest()

    lease = Lease(
        label=label or file.filename,
        status=LeaseStatus.UPLOADED.value,
        assigned_user_id=user.id,
    )
    db.add(lease)
    db.flush()

    storage_path = settings.storage_dir / f"{lease.id}__{file.filename}"
    storage_path.write_bytes(raw)

    document = Document(
        lease_id=lease.id,
        filename=file.filename,
        storage_path=str(storage_path),
        sha256=sha,
        size_bytes=len(raw),
    )
    db.add(document)
    db.commit()
    db.refresh(lease)

    background.add_task(run_extraction, lease.id, str(storage_path))

    return _to_summary(lease, document_count=1)


@router.get("", response_model=list[LeaseSummary])
def list_leases(
    user: AuthenticatedUser = Depends(current_user),
    db: Session = Depends(get_db),
) -> list[LeaseSummary]:
    rows = db.execute(select(Lease).order_by(Lease.created_at.desc())).scalars().all()
    return [_to_summary(l, document_count=len(l.documents)) for l in rows]


@router.get("/{lease_id}", response_model=LeaseDetail)
def get_lease(
    lease_id: str,
    user: AuthenticatedUser = Depends(current_user),
    db: Session = Depends(get_db),
) -> LeaseDetail:
    lease = db.get(Lease, lease_id)
    if lease is None:
        raise HTTPException(404, "Lease not found")
    return LeaseDetail(
        id=lease.id,
        label=lease.label,
        status=lease.status,
        created_at=lease.created_at,
        updated_at=lease.updated_at,
        extraction_model=lease.extraction_model,
        extraction_seconds=lease.extraction_seconds,
        document_count=len(lease.documents),
        property_id=lease.property_id,
        property_address=lease.property.address if lease.property else None,
        record_json=lease.record_json,
        extraction_error=lease.extraction_error,
    )


@router.get("/{lease_id}/document")
def get_document(
    lease_id: str,
    user: AuthenticatedUser = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Stream the original PDF back so the frontend can render it."""
    from fastapi.responses import FileResponse

    lease = db.get(Lease, lease_id)
    if lease is None or not lease.documents:
        raise HTTPException(404, "Lease or document not found")
    doc = lease.documents[0]
    if not Path(doc.storage_path).exists():
        raise HTTPException(404, "Document file missing on disk")
    return FileResponse(doc.storage_path, media_type="application/pdf", filename=doc.filename)


@router.patch("/{lease_id}/fields/{field_path:path}")
def patch_field(
    lease_id: str,
    field_path: str,
    body: FieldPatch,
    user: AuthenticatedUser = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Edit a single dotted-path field in the extracted record. Audit-logged."""
    lease = db.get(Lease, lease_id)
    if lease is None:
        raise HTTPException(404, "Lease not found")
    if not lease.record_json:
        raise HTTPException(400, "Lease has no extracted record yet")

    record = dict(lease.record_json)
    parts = field_path.split(".")
    cursor: dict = record
    for p in parts[:-1]:
        if not isinstance(cursor.get(p), dict):
            raise HTTPException(400, f"Cannot navigate into {p!r}")
        cursor = cursor[p]
    leaf = parts[-1]

    before = cursor.get(leaf)
    cursor[leaf] = body.value

    lease.record_json = record
    db.add(
        FieldEdit(
            lease_id=lease.id,
            field_path=field_path,
            before_value={"v": before},
            after_value={"v": body.value},
            actor_user_id=user.id,
        )
    )
    db.commit()
    return {"ok": True, "field_path": field_path, "before": before, "after": body.value}


@router.post("/{lease_id}/approve", response_model=LeaseDetail)
def approve_lease(
    lease_id: str,
    user: AuthenticatedUser = Depends(current_user),
    db: Session = Depends(get_db),
) -> LeaseDetail:
    lease = db.get(Lease, lease_id)
    if lease is None:
        raise HTTPException(404, "Lease not found")
    if lease.status not in (LeaseStatus.READY_FOR_REVIEW.value, LeaseStatus.APPROVED.value):
        raise HTTPException(400, f"Lease is in status {lease.status!r}; cannot approve")
    lease.status = LeaseStatus.APPROVED.value
    lease.approved_at = datetime.utcnow()
    lease.approved_by = user.id
    db.commit()
    db.refresh(lease)
    return get_lease(lease_id=lease_id, user=user, db=db)  # type: ignore[arg-type]


# ---- helpers -------------------------------------------------------------


def _to_summary(lease: Lease, *, document_count: int) -> LeaseSummary:
    return LeaseSummary(
        id=lease.id,
        label=lease.label,
        status=lease.status,
        created_at=lease.created_at,
        updated_at=lease.updated_at,
        extraction_model=lease.extraction_model,
        extraction_seconds=lease.extraction_seconds,
        document_count=document_count,
        property_id=lease.property_id,
        property_address=lease.property.address if lease.property else None,
    )
