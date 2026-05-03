"""Shared filesystem-security helpers.

These guard the two ways a malicious or buggy DB row could otherwise let a
caller read arbitrary files off the API host:

  1. `safe_filename()` — sanitises filenames on the way *in* (uploads).
  2. `serve_inside_sandbox()` — refuses to serve a path on the way *out* if its
     resolved real path isn't under one of the allowed storage roots.

Routes that send `FileResponse` for any user-supplied or DB-derived path MUST
go through `serve_inside_sandbox()`. Don't construct `FileResponse` directly.
"""

from __future__ import annotations

import re
from pathlib import Path

from fastapi import HTTPException
from fastapi.responses import FileResponse

from .config import get_settings


def safe_filename(name: str | None) -> str:
    """Strip path components and weird chars from an uploaded filename so it
    can't escape a storage sandbox via `..`, `/`, or null bytes.

    Rejects empty / null-byte input. Caller still adds a UUID prefix so the
    sanitised name doesn't have to be unique.
    """
    if not name or "\x00" in name:
        raise HTTPException(400, "Invalid filename")
    base = Path(name).name  # strips any directory components
    # Allow only safe ASCII chars in the final filename; collapse the rest to '_'
    cleaned = re.sub(r"[^A-Za-z0-9._-]", "_", base).strip("._")
    if not cleaned:
        raise HTTPException(400, "Invalid filename")
    return cleaned[:200]  # cap length


def _allowed_roots() -> list[Path]:
    """Every directory we're willing to serve files from:
      - `data/documents/` — uploaded lease PDFs + side-letters
      - `data/packs/`     — generated rent-review pack .docx files
      - `data/templates/` — firm-uploaded Word templates (per-kind)
    All three sit alongside each other under the storage parent.
    """
    settings = get_settings()
    storage = settings.storage_dir.resolve()
    parent = storage.parent
    return [storage, (parent / "packs").resolve(), (parent / "templates").resolve()]


def serve_inside_sandbox(
    path: Path,
    *,
    media_type: str,
    filename: str,
) -> FileResponse:
    """Refuse to serve a file whose resolved path is outside any allowed root.

    Belt-and-braces: even though we sanitise filenames on the way in, a
    historical or malicious DB row could still point outside. Path.resolve()
    follows symlinks, so a `data/documents/escape -> /etc/` symlink is also
    caught here.
    """
    try:
        resolved = path.resolve()
    except OSError as exc:
        raise HTTPException(403, "Document path not resolvable") from exc

    roots = _allowed_roots()
    inside = False
    for root in roots:
        try:
            resolved.relative_to(root)
            inside = True
            break
        except ValueError:
            continue
    if not inside:
        raise HTTPException(403, "Document path outside storage sandbox")

    if not resolved.exists():
        raise HTTPException(404, "Document file missing on disk")
    return FileResponse(resolved, media_type=media_type, filename=filename)
