"""Symmetric encryption for secrets at rest.

Used to wrap third-party webhook URLs and tokens before they hit the database
so a DB dump (or a stolen Render Postgres backup) doesn't trivially leak them.

Key management:
- Set `LEASEOS_SECRET_KEY` to a urlsafe-base64 32-byte Fernet key in any
  environment that handles real secrets. Generate one with
  `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`.
- In dev, if the env var is missing, we derive a stable per-machine key from a
  hash of the database URL. This is **not** a production-grade secret — it's
  only there so local dev doesn't crash. The startup assertion in
  `main._assert_safe_prod_config` (extended below) refuses to boot in prod
  without an explicit key.

Wire format:
- Encrypted values are written as `enc:v1:<base64-fernet-token>`. Reads check
  the prefix and pass plaintext through if it's missing — that lets us roll
  out without backfilling existing rows.
"""

from __future__ import annotations

import base64
import hashlib
from .logging import get_logger
import os
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken

from .config import get_settings

log = get_logger(__name__)

ENC_PREFIX = "enc:v1:"


@lru_cache(maxsize=1)
def _fernet() -> Fernet:
    explicit = os.getenv("LEASEOS_SECRET_KEY")
    if explicit:
        try:
            return Fernet(explicit.encode())
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError(
                "LEASEOS_SECRET_KEY is set but is not a valid Fernet key. "
                "Generate one with `python -c \"from cryptography.fernet import "
                "Fernet; print(Fernet.generate_key().decode())\"`."
            ) from exc

    settings = get_settings()
    if settings.environment == "prod":
        raise RuntimeError(
            "LEASEOS_SECRET_KEY is required in production. Generate one with "
            "`python -c \"from cryptography.fernet import Fernet; "
            "print(Fernet.generate_key().decode())\"` and set it on the API service."
        )

    # Dev fallback: deterministic per-machine key derived from the DB URL.
    # NOT secure against anyone with code + DB access; fine for local dev.
    log.warning(
        "LEASEOS_SECRET_KEY not set — using a derived dev-only key. "
        "Do NOT use this in any environment that holds real customer secrets."
    )
    digest = hashlib.sha256(f"leaseos-dev::{settings.database_url}".encode()).digest()
    derived = base64.urlsafe_b64encode(digest)
    return Fernet(derived)


def encrypt_secret(plaintext: str) -> str:
    """Encrypt a string for at-rest storage. Output is the prefixed wire format."""
    if not plaintext:
        return plaintext
    token = _fernet().encrypt(plaintext.encode())
    return f"{ENC_PREFIX}{token.decode()}"


def decrypt_secret(stored: str | None) -> str | None:
    """Decrypt a stored value. If the prefix is missing we assume the row was
    written before encryption was rolled out and pass the value through —
    this keeps legacy rows working until they're naturally re-saved.
    """
    if stored is None or stored == "":
        return stored
    if not stored.startswith(ENC_PREFIX):
        return stored  # legacy plaintext row
    try:
        return _fernet().decrypt(stored[len(ENC_PREFIX):].encode()).decode()
    except InvalidToken as exc:
        # Wrong key, corrupted blob, or someone manually pasted enc:v1:... by hand.
        # Better to refuse than to leak garbage as if it were a real URL.
        raise RuntimeError(
            "Failed to decrypt stored secret — LEASEOS_SECRET_KEY may have changed."
        ) from exc
