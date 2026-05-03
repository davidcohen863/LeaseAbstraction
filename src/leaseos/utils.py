"""Small cross-package utility helpers."""

from __future__ import annotations

from datetime import datetime, timezone


def utc_now() -> datetime:
    """Return the current UTC time as a naive `datetime`.

    Why naive: SQLAlchemy's `DateTime()` column type is timezone-naive on
    SQLite and many Postgres setups; storing tz-aware datetimes triggers
    deprecation warnings on insert and breaks comparisons against legacy
    rows. We therefore standardise on naive-UTC at the application layer
    instead of `datetime.utcnow()` (deprecated, will go away in 3.14+).
    """
    return datetime.now(timezone.utc).replace(tzinfo=None)
