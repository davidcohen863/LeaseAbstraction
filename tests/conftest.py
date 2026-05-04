"""Shared pytest fixtures for LeaseOS tests.

Highlights:
- Uses an in-memory SQLite DB per-test, NOT the dev DB at data/leaseos.db.
- Disables Clerk auth (the default in dev anyway).
- No real Anthropic calls — anything that needs the LLM is either skipped
  or has its calls mocked in the test itself.
"""

from __future__ import annotations

import os
from collections.abc import Iterator
from pathlib import Path

import pytest

# CRITICAL: set env BEFORE importing leaseos modules so config picks them up.
os.environ.setdefault("LEASEOS_AUTH_REQUIRED", "false")
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("ANTHROPIC_API_KEY", "test-key-not-used-in-pure-tests")
os.environ.setdefault("LEASEOS_STORAGE_DIR", str(Path(__file__).parent / "_storage"))


def _shared_memory_engine():
    """Build an in-memory SQLite engine that shares the same connection
    across every Session bound to it. Without this, each Session.connect()
    sees its own empty database — a classic in-memory SQLite gotcha."""
    from sqlalchemy import create_engine
    from sqlalchemy.pool import StaticPool

    return create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )


@pytest.fixture(autouse=True)
def _reset_storage_cache_per_test():
    """Storage backend is process-cached; tests that monkeypatch storage_dir
    or LEASEOS_STORAGE_BACKEND need a fresh resolve. Cheap to do everywhere."""
    from leaseos.api.storage import reset_storage_cache

    reset_storage_cache()
    yield
    reset_storage_cache()


@pytest.fixture(autouse=True)
def _disable_rate_limiting():
    """Rate limiter uses in-process MemoryStorage that persists across tests.
    Cumulative test calls on cost-bearing endpoints would otherwise trip 429
    halfway through the suite. Disable for the whole test session — there's
    a dedicated test_rate_limit.py that flips it back on for its own asserts."""
    from leaseos.api.rate_limit import limiter

    limiter.enabled = False
    yield
    limiter.enabled = False


@pytest.fixture
def db_session() -> Iterator:
    """Fresh in-memory SQLite DB with all tables created. One per test."""
    from sqlalchemy.orm import sessionmaker

    from leaseos.api.db import Base
    # Import models so all tables register on Base.metadata
    from leaseos.api import models  # noqa: F401

    engine = _shared_memory_engine()
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, future=True)
    session = Session()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture
def test_client():
    """FastAPI TestClient against an in-memory DB shared across the request
    lifecycle. Use sparingly — most tests should hit the pure logic
    directly, not the route layer."""
    from fastapi.testclient import TestClient
    from sqlalchemy.orm import sessionmaker

    from leaseos.api import db as db_module
    from leaseos.api.db import Base
    from leaseos.api import models  # noqa: F401
    from leaseos.api.main import create_app

    engine = _shared_memory_engine()
    Base.metadata.create_all(engine)
    TestSession = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, future=True)

    app = create_app()

    def override_get_db():
        s = TestSession()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[db_module.get_db] = override_get_db
    with TestClient(app) as client:
        yield client
    engine.dispose()
