"""Storage backend abstraction.

Why this exists: today every uploaded PDF, generated .docx, and firm-uploaded
Word template lives in `data/` on the laptop. That's fine for local dev but
incompatible with any cloud deploy that doesn't give us a persistent disk
(Render's web service, Fly's hobby tier, Vercel functions, etc.). When we
deploy, files have to live in S3 / Cloudflare R2 / equivalent.

This module defines the `Storage` Protocol and a `LocalStorage` implementation.
A future `S3Storage` (or `R2Storage`) drops in by implementing the same five
methods — every caller goes through `get_storage()` and never touches Path /
boto3 directly.

Storage layout (logical keys; the backend decides how they map to disk/keys):

    documents/{lease_id}__{filename}.pdf       — uploaded lease + side-letter PDFs
    packs/{pack_id}/{kind}.docx                — generated rent-review pack docs
    templates/{kind}.docx                      — firm-uploaded Word templates
    templates/{kind}.docx.original-name        — sidecar with original filename

The `get_path()` escape hatch returns a real `Path` for libraries that can't
take a stream (PyMuPDF can, but legacy callers may need this). On a remote
backend it downloads to a temp file; on local it's a no-op.
"""

from __future__ import annotations

import shutil
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator, Protocol, runtime_checkable

from fastapi import HTTPException
from fastapi.responses import FileResponse

from .config import get_settings


# ---- the Protocol -------------------------------------------------------


@runtime_checkable
class Storage(Protocol):
    """The five things every backend has to do."""

    def put(self, key: str, data: bytes) -> None:
        """Write `data` at `key`. Overwrites existing."""
        ...

    def get(self, key: str) -> bytes:
        """Read all bytes at `key`. Raises FileNotFoundError if absent."""
        ...

    def exists(self, key: str) -> bool:
        """True iff `key` has been written and not deleted."""
        ...

    def delete(self, key: str) -> None:
        """Idempotent — silently succeeds if `key` doesn't exist."""
        ...

    def iter_prefix(self, prefix: str) -> Iterator[str]:
        """Yield every key under `prefix` (lexical, no recursion guarantees).
        Used by the lease/pack delete paths to clean up on-disk artifacts."""
        ...

    def size(self, key: str) -> int | None:
        """Bytes if the key exists, None otherwise. Cheap on local
        (os.stat); on S3 this is a HEAD request."""
        ...

    def get_path(self, key: str) -> "PathHandle":
        """Return a context manager yielding a real local `Path`. On the
        local backend it's the actual file; on a remote backend it
        downloads to a temp file and cleans it up on exit. Use this only
        for libraries that genuinely need a path (most don't — read the
        bytes via `get()` and pass to `io.BytesIO`)."""
        ...

    def serve(
        self,
        key: str,
        *,
        media_type: str,
        download_filename: str,
    ) -> FileResponse:
        """Return a FastAPI response that streams the file to the client.
        Raises 404 if the key is missing."""
        ...


# A `PathHandle` is just any context manager yielding a `Path`. Backends use
# `contextlib.contextmanager` to build these.
class PathHandle(Protocol):
    def __enter__(self) -> Path: ...
    def __exit__(self, exc_type, exc, tb) -> None: ...


# ---- LocalStorage --------------------------------------------------------


class LocalStorage:
    """Filesystem-backed storage. Used in dev and on hosts with persistent
    disk (Render disk, Fly volumes). Maps logical keys to paths under
    `<storage_root>/<key>` 1:1.
    """

    def __init__(self, root: Path):
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        # Reject keys that try to escape the root via traversal. Trusted
        # callers won't hit this; defence-in-depth against future bugs.
        if "\x00" in key or ".." in Path(key).parts:
            raise HTTPException(400, f"Invalid storage key: {key!r}")
        path = (self.root / key).resolve()
        try:
            path.relative_to(self.root)
        except ValueError as exc:
            raise HTTPException(403, "Storage key escapes root") from exc
        return path

    def put(self, key: str, data: bytes) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def get(self, key: str) -> bytes:
        path = self._path(key)
        return path.read_bytes()

    def exists(self, key: str) -> bool:
        try:
            return self._path(key).exists()
        except HTTPException:
            return False

    def delete(self, key: str) -> None:
        try:
            path = self._path(key)
        except HTTPException:
            return  # bad key — definitely doesn't exist; nothing to do
        try:
            if path.is_dir():
                shutil.rmtree(path, ignore_errors=True)
            elif path.exists():
                path.unlink()
        except OSError:
            pass  # best-effort; periodic housekeeping job catches leftovers

    def iter_prefix(self, prefix: str) -> Iterator[str]:
        base = self._path(prefix) if prefix else self.root
        if not base.exists():
            return
        for sub in base.rglob("*"):
            if sub.is_file():
                yield str(sub.relative_to(self.root)).replace("\\", "/")

    def size(self, key: str) -> int | None:
        try:
            path = self._path(key)
        except HTTPException:
            return None
        try:
            return path.stat().st_size
        except OSError:
            return None

    @contextmanager
    def get_path(self, key: str) -> Iterator[Path]:
        # No download needed — return the real path directly.
        path = self._path(key)
        if not path.exists():
            raise FileNotFoundError(key)
        yield path

    def serve(
        self,
        key: str,
        *,
        media_type: str,
        download_filename: str,
    ) -> FileResponse:
        path = self._path(key)
        if not path.exists():
            raise HTTPException(404, f"Storage key not found: {key!r}")
        return FileResponse(path, media_type=media_type, filename=download_filename)


# ---- factory + DI hook ---------------------------------------------------


_storage: Storage | None = None


def get_storage() -> Storage:
    """Return the configured storage backend. Cached for the process lifetime.

    Backend selection is by env var:
      - `LEASEOS_STORAGE_BACKEND=local` (default) → `LocalStorage` rooted at
        `LEASEOS_STORAGE_DIR.parent` so all three logical buckets
        (documents/, packs/, templates/) live under one root.
      - `LEASEOS_STORAGE_BACKEND=s3` → not implemented yet; will land alongside
        the first cloud deploy. See PRD §7.
    """
    global _storage
    if _storage is not None:
        return _storage

    settings = get_settings()
    backend = (
        # Read late so tests / CLI users can override via env at startup
        # without restarting Python.
        settings.__dict__.get("storage_backend")
        or "local"
    )

    if backend == "local":
        # storage_dir is `data/documents/` historically; we want a single root
        # one level up so packs/ and templates/ are siblings of documents/.
        # Keys like `documents/lease.pdf`, `packs/<id>/memo.docx`, etc.
        root = settings.storage_dir.parent
        _storage = LocalStorage(root)
        return _storage

    if backend == "s3":
        raise NotImplementedError(
            "S3 storage backend not implemented yet. Set LEASEOS_STORAGE_BACKEND=local "
            "(default). The interface in storage.py is ready for an S3Storage class — "
            "drop it in alongside boto3 + the bucket env vars."
        )

    raise RuntimeError(f"Unknown LEASEOS_STORAGE_BACKEND={backend!r}")


def reset_storage_cache() -> None:
    """Test hook — clears the singleton so the next get_storage() re-reads env."""
    global _storage
    _storage = None


# ---- back-compat shim for legacy DB rows --------------------------------


def coerce_to_key(stored: str) -> str:
    """Bridge old DB rows (absolute filesystem paths) to the new logical-key
    storage layer.

    Documents written before the storage abstraction landed have
    `Document.storage_path` set to an absolute path like
    `/Users/.../data/documents/{lease_id}__file.pdf`. New writes use logical
    keys like `documents/{lease_id}__file.pdf`. This function maps either
    form to the canonical key so callers don't have to care.

    Strategy:
      - If `stored` doesn't start with `/`, assume it's already a key.
      - Otherwise resolve against the storage root and return the relative
        path. If it's outside the storage root (shouldn't happen in
        practice), pass it through unchanged so a 404 surfaces in serve()
        rather than a silent escape-the-sandbox.

    Once we backfill the DB, this can go away.
    """
    if not stored.startswith("/"):
        return stored
    settings = get_settings()
    root = settings.storage_dir.parent.resolve()
    p = Path(stored).resolve()
    try:
        return str(p.relative_to(root)).replace("\\", "/")
    except ValueError:
        return stored

