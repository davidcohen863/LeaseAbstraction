"""Per-firm Word .docx template management for the pack generator.

A firm can upload one .docx per pack-document kind (landlord_memo,
comparables_schedule, itza_analysis, trigger_letter). The pack generator
opens that template as the base document and appends generated content to
it — keeping the firm's letterhead, logo, footer styles, and any
boilerplate the template contained.

Storage convention (single-tenant for v1):
    data/templates/{kind}.docx

Endpoints:
    GET    /templates                 — list which templates are uploaded
    GET    /templates/{kind}/download — download the current template
    POST   /templates/{kind}          — multipart upload (file=*.docx)
    DELETE /templates/{kind}          — revert to LeaseOS default

The hardcoded list of valid `kind` values mirrors `models.PackDocumentKind`.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..auth import AuthenticatedUser, current_user
from ..db import get_db
from ..models import PackDocumentKind
from ..security import safe_filename
from ..storage import get_storage

router = APIRouter(prefix="/templates", tags=["templates"])

VALID_KINDS = {k.value for k in PackDocumentKind}


# ---- helpers -------------------------------------------------------------


def _template_key(kind: str) -> str:
    if kind not in VALID_KINDS:
        raise HTTPException(400, f"Unknown template kind {kind!r}. Valid: {sorted(VALID_KINDS)}")
    return f"templates/{kind}.docx"


def _sidecar_key(kind: str) -> str:
    return f"templates/{kind}.docx.original-name"


# Kept for tests that still reference these names — both now thin wrappers.
def _templates_dir() -> Path:
    """Deprecated: use storage_key + get_storage() instead. Returns the
    on-disk dir for the LocalStorage backend so tests that need to drop
    a file directly still work."""
    from ..config import get_settings

    p = get_settings().storage_dir.parent / "templates"
    p.mkdir(parents=True, exist_ok=True)
    return p


def _template_path(kind: str) -> Path:
    """Deprecated: use _template_key()."""
    return _templates_dir() / f"{_template_key(kind).split('/')[-1]}"


# ---- response shapes -----------------------------------------------------


class TemplateInfo(BaseModel):
    kind: str
    label: str
    uploaded: bool
    size_bytes: int | None = None
    original_filename: str | None = None


KIND_LABELS = {
    "landlord_memo": "Landlord cover memo",
    "comparables_schedule": "Comparables schedule",
    "itza_analysis": "ITZA analysis",
    "trigger_letter": "Trigger letter",
}


# ---- routes --------------------------------------------------------------


@router.get("", response_model=list[TemplateInfo])
def list_templates(
    user: AuthenticatedUser = Depends(current_user),
) -> list[TemplateInfo]:
    """Status of every pack-document template, in canonical order."""
    storage = get_storage()
    out: list[TemplateInfo] = []
    for kind in ("landlord_memo", "comparables_schedule", "itza_analysis", "trigger_letter"):
        key = _template_key(kind)
        size = storage.size(key)
        if size is not None:
            sidecar_key = _sidecar_key(kind)
            original = (
                storage.get(sidecar_key).decode().strip()
                if storage.exists(sidecar_key)
                else None
            )
            out.append(
                TemplateInfo(
                    kind=kind,
                    label=KIND_LABELS[kind],
                    uploaded=True,
                    size_bytes=size,
                    original_filename=original,
                )
            )
        else:
            out.append(TemplateInfo(kind=kind, label=KIND_LABELS[kind], uploaded=False))
    return out


@router.post("/{kind}", response_model=TemplateInfo, status_code=201)
async def upload_template(
    kind: str,
    file: UploadFile = File(...),
    user: AuthenticatedUser = Depends(current_user),
    db: Session = Depends(get_db),
) -> TemplateInfo:
    """Replace the firm's template for `kind`. Accepts .docx only."""
    key = _template_key(kind)  # validates kind
    if not file.filename or not file.filename.lower().endswith(".docx"):
        raise HTTPException(400, "Template must be a .docx file")

    raw = await file.read()
    # Refuse anything > 10 MB — Word templates with big images get unwieldy
    if len(raw) > 10 * 1024 * 1024:
        raise HTTPException(400, f"Template too large ({len(raw):,} bytes); 10 MB max.")
    # Sanity-check that python-docx can actually open it before we accept it.
    # Otherwise the next pack generation would silently fail.
    try:
        from io import BytesIO
        from docx import Document as DocxDocument
        DocxDocument(BytesIO(raw))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(400, f"Couldn't parse as a Word document: {exc}") from exc

    storage = get_storage()
    storage.put(key, raw)
    # Store the original filename in a sidecar so the UI can show "uploaded
    # firm-style-memo-v3.docx" instead of just "landlord_memo.docx".
    safe = safe_filename(file.filename)
    storage.put(_sidecar_key(kind), safe.encode())

    return TemplateInfo(
        kind=kind,
        label=KIND_LABELS[kind],
        uploaded=True,
        size_bytes=len(raw),
        original_filename=safe,
    )


@router.delete("/{kind}", status_code=204)
def delete_template(
    kind: str,
    user: AuthenticatedUser = Depends(current_user),
) -> None:
    """Revert this kind to the LeaseOS default style."""
    key = _template_key(kind)
    storage = get_storage()
    storage.delete(key)
    storage.delete(_sidecar_key(kind))


@router.get("/{kind}/download")
def download_template(
    kind: str,
    user: AuthenticatedUser = Depends(current_user),
):
    """Stream the current template back so the user can edit + re-upload."""
    key = _template_key(kind)
    storage = get_storage()
    if not storage.exists(key):
        raise HTTPException(404, f"No template uploaded for {kind!r}")
    sidecar_key = _sidecar_key(kind)
    download_name = (
        storage.get(sidecar_key).decode().strip()
        if storage.exists(sidecar_key)
        else f"{kind}.docx"
    )
    return storage.serve(
        key,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        download_filename=download_name,
    )
