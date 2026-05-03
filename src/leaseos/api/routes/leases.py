"""Lease lifecycle endpoints: upload → extract → review → approve."""

from __future__ import annotations

import hashlib
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..auth import AuthenticatedUser, current_user
from ..config import get_settings
from ..db import get_db
from ..models import Document, FieldEdit, Lease, LeaseStatus
from ..security import safe_filename as _safe_filename
from ..security import serve_inside_sandbox as _serve_inside_sandbox
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


class DocumentOut(BaseModel):
    id: str
    filename: str
    role: str
    uploaded_at: datetime
    summary_status: str
    summary_markdown: str | None
    summary_seconds: float | None
    summary_error: str | None


class LeaseDetail(LeaseSummary):
    record_json: dict | None
    extraction_error: str | None
    documents: list[DocumentOut] = []


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
    safe_name = _safe_filename(file.filename)

    lease = Lease(
        label=label or safe_name,
        status=LeaseStatus.UPLOADED.value,
        assigned_user_id=user.id,
    )
    db.add(lease)
    db.flush()

    storage_path = settings.storage_dir / f"{lease.id}__{safe_name}"
    storage_path.write_bytes(raw)

    document = Document(
        lease_id=lease.id,
        filename=safe_name,
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
    # Eager-load property + documents — without this we'd issue (1 + 2N) queries
    # on the way out (`l.property.address` and `len(l.documents)` per row).
    rows = (
        db.execute(
            select(Lease)
            .options(selectinload(Lease.property), selectinload(Lease.documents))
            .order_by(Lease.created_at.desc())
        )
        .scalars()
        .all()
    )
    return [_to_summary(l, document_count=len(l.documents)) for l in rows]


@router.get("/{lease_id}", response_model=LeaseDetail)
def get_lease(
    lease_id: str,
    user: AuthenticatedUser = Depends(current_user),
    db: Session = Depends(get_db),
) -> LeaseDetail:
    lease = db.execute(
        select(Lease)
        .options(selectinload(Lease.property), selectinload(Lease.documents))
        .where(Lease.id == lease_id)
    ).scalar_one_or_none()
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
        documents=[
            DocumentOut(
                id=d.id,
                filename=d.filename,
                role=d.role,
                uploaded_at=d.uploaded_at,
                summary_status=d.summary_status,
                summary_markdown=d.summary_markdown,
                summary_seconds=d.summary_seconds,
                summary_error=d.summary_error,
            )
            for d in lease.documents
        ],
    )


@router.get("/{lease_id}/document")
def get_document(
    lease_id: str,
    user: AuthenticatedUser = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Stream the principal lease PDF back (the first 'lease'-role doc)."""
    lease = db.get(Lease, lease_id)
    if lease is None or not lease.documents:
        raise HTTPException(404, "Lease or document not found")
    # Prefer a role='lease' doc, fall back to the first
    doc = next((d for d in lease.documents if d.role == "lease"), lease.documents[0])
    return _serve_inside_sandbox(
        Path(doc.storage_path), media_type="application/pdf", filename=doc.filename
    )


@router.get("/{lease_id}/documents/{document_id}")
def get_lease_document_by_id(
    lease_id: str,
    document_id: str,
    user: AuthenticatedUser = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Stream a specific document attached to the lease (for side-letter download)."""
    lease = db.get(Lease, lease_id)
    if lease is None:
        raise HTTPException(404, "Lease not found")
    doc = next((d for d in lease.documents if d.id == document_id), None)
    if doc is None:
        raise HTTPException(404, "Document not found")
    return _serve_inside_sandbox(
        Path(doc.storage_path), media_type="application/pdf", filename=doc.filename
    )


@router.post("/{lease_id}/documents", response_model=DocumentOut, status_code=201)
async def attach_document(
    lease_id: str,
    background: BackgroundTasks,
    file: UploadFile = File(...),
    role: str = Form(default="side_letter"),
    user: AuthenticatedUser = Depends(current_user),
    db: Session = Depends(get_db),
) -> DocumentOut:
    """Attach an ancillary document (side-letter, deed of variation, licence
    to alter, rent deposit deed etc.) to an existing lease and queue an
    AI summary in the background.
    """
    if role == "lease":
        raise HTTPException(400, "Use POST /leases for the principal lease document")
    if role not in {"side_letter", "variation", "licence_to_alter", "licence_to_assign", "rent_deposit_deed", "schedule_of_condition", "other"}:
        raise HTTPException(400, f"Unknown document role {role!r}")
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF uploads are accepted")

    lease = db.get(Lease, lease_id)
    if lease is None:
        raise HTTPException(404, "Lease not found")

    settings = get_settings()
    settings.storage_dir.mkdir(parents=True, exist_ok=True)
    raw = await file.read()
    sha = hashlib.sha256(raw).hexdigest()
    safe_name = _safe_filename(file.filename)

    # Use a UUID prefix to avoid collisions on the disk
    import uuid as _uuid
    storage_path = settings.storage_dir / f"{_uuid.uuid4()}__{safe_name}"
    storage_path.write_bytes(raw)

    from ..worker import run_ancillary_summary

    doc = Document(
        lease_id=lease.id,
        filename=safe_name,
        storage_path=str(storage_path),
        role=role,
        sha256=sha,
        size_bytes=len(raw),
        summary_status="pending",
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    # Queue the summary
    background.add_task(run_ancillary_summary, doc.id)

    return DocumentOut(
        id=doc.id,
        filename=doc.filename,
        role=doc.role,
        uploaded_at=doc.uploaded_at,
        summary_status=doc.summary_status,
        summary_markdown=doc.summary_markdown,
        summary_seconds=doc.summary_seconds,
        summary_error=doc.summary_error,
    )


@router.delete("/{lease_id}/documents/{document_id}", status_code=204)
def delete_attached_document(
    lease_id: str,
    document_id: str,
    user: AuthenticatedUser = Depends(current_user),
    db: Session = Depends(get_db),
) -> None:
    """Remove an ancillary document. Does NOT allow deleting the principal
    lease PDF (role='lease') — to remove that, delete the whole lease."""
    lease = db.get(Lease, lease_id)
    if lease is None:
        raise HTTPException(404, "Lease not found")
    doc = next((d for d in lease.documents if d.id == document_id), None)
    if doc is None:
        raise HTTPException(404, "Document not found")
    if doc.role == "lease":
        raise HTTPException(400, "Cannot delete the principal lease PDF here")
    db.delete(doc)
    db.commit()
    # We deliberately leave the file on disk as a soft-delete; clean-up
    # is for a separate housekeeping job once we have one.


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
