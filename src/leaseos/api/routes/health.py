"""Liveness and readiness endpoints (Kubernetes / Render-style).

Two distinct things, often confused:

  - **/healthz (liveness)** — "the process is up and responding". Cheap; no
    dependencies. If this fails, the orchestrator should restart the pod.
    Render's healthcheck hits this. Must be sub-millisecond.

  - **/readyz (readiness)** — "the process is up AND every dependency it
    needs (DB, storage, Anthropic API key, optional Slack/OAuth config) is
    actually usable". If this fails, the orchestrator should stop routing
    traffic to this instance but NOT restart it (the dep itself may be
    flapping). Returns 503 when any dep is unhealthy, 200 when all green.

Both are unauthenticated — orchestrators don't carry JWTs.

Also keeps the legacy `/health` endpoint as an alias for `/healthz` so the
old runbook + Render config keep working without breakage.
"""

from __future__ import annotations

import time
from typing import Literal

from fastapi import APIRouter, Response
from pydantic import BaseModel
from sqlalchemy import text

from ..config import get_settings
from ..db import SessionLocal
from ..logging import get_logger
from ..storage import get_storage

router = APIRouter(tags=["meta"])
log = get_logger(__name__)

CheckStatus = Literal["ok", "degraded", "down", "skipped"]


class CheckResult(BaseModel):
    name: str
    status: CheckStatus
    elapsed_ms: int
    detail: str | None = None


class ReadinessResponse(BaseModel):
    ok: bool
    service: str = "leaseos-api"
    version: str = "0.2.0"
    checks: list[CheckResult]


# ---- liveness ----------------------------------------------------------


@router.get("/healthz")
def liveness() -> dict:
    """Cheap liveness check — process is up and the event loop is responsive.
    No external calls. Render uses this for routing decisions."""
    return {"ok": True, "service": "leaseos-api", "version": "0.2.0"}


# Legacy alias — old DEPLOY.md and Render config reference /health.
@router.get("/health")
def liveness_legacy() -> dict:
    return liveness()


# ---- readiness ---------------------------------------------------------


def _check_db() -> CheckResult:
    """`SELECT 1` round-trip. Catches: connection pool exhausted, network
    partition, DB restart, credentials wrong."""
    t0 = time.perf_counter()
    try:
        db = SessionLocal()
        try:
            db.execute(text("SELECT 1"))
        finally:
            db.close()
        return CheckResult(
            name="database",
            status="ok",
            elapsed_ms=int((time.perf_counter() - t0) * 1000),
        )
    except Exception as exc:  # noqa: BLE001
        return CheckResult(
            name="database",
            status="down",
            elapsed_ms=int((time.perf_counter() - t0) * 1000),
            detail=f"{type(exc).__name__}: {exc}",
        )


def _check_storage() -> CheckResult:
    """Roundtrip a tiny key. For LocalStorage this is filesystem; for a
    future S3 backend this will catch IAM misconfig + bucket-doesn't-exist
    + network partition."""
    t0 = time.perf_counter()
    probe_key = ".healthz-probe"
    try:
        storage = get_storage()
        storage.put(probe_key, b"ok")
        if storage.get(probe_key) != b"ok":
            raise RuntimeError("readback mismatch")
        storage.delete(probe_key)
        return CheckResult(
            name="storage",
            status="ok",
            elapsed_ms=int((time.perf_counter() - t0) * 1000),
        )
    except Exception as exc:  # noqa: BLE001
        return CheckResult(
            name="storage",
            status="down",
            elapsed_ms=int((time.perf_counter() - t0) * 1000),
            detail=f"{type(exc).__name__}: {exc}",
        )


def _check_anthropic_key() -> CheckResult:
    """Surface-level check only — verifies the env var is present and looks
    like a real Anthropic key. Doesn't actually hit the API (don't want a
    health probe to burn credit). A real bad-key error will surface on the
    first extraction attempt anyway."""
    t0 = time.perf_counter()
    settings = get_settings()
    key = settings.anthropic_api_key
    if not key:
        return CheckResult(
            name="anthropic_key",
            status="down",
            elapsed_ms=0,
            detail="ANTHROPIC_API_KEY env var is not set",
        )
    if not key.startswith("sk-ant-"):
        return CheckResult(
            name="anthropic_key",
            status="degraded",
            elapsed_ms=0,
            detail="ANTHROPIC_API_KEY doesn't look like a real Anthropic key (no sk-ant- prefix)",
        )
    return CheckResult(
        name="anthropic_key",
        status="ok",
        elapsed_ms=int((time.perf_counter() - t0) * 1000),
    )


def _check_secret_key() -> CheckResult:
    """Symmetric-encryption key for stored secrets (Slack webhooks today,
    more later). In dev, a derived key is used so this is always 'skipped';
    in prod, missing this is a real outage waiting to happen."""
    import os

    settings = get_settings()
    explicit = os.getenv("LEASEOS_SECRET_KEY")
    if explicit:
        return CheckResult(name="secret_key", status="ok", elapsed_ms=0)
    if settings.environment == "prod":
        return CheckResult(
            name="secret_key",
            status="down",
            elapsed_ms=0,
            detail="LEASEOS_SECRET_KEY env var required in production",
        )
    return CheckResult(
        name="secret_key",
        status="skipped",
        elapsed_ms=0,
        detail="dev environment — using derived per-machine key",
    )


@router.get("/readyz", response_model=ReadinessResponse)
def readiness(response: Response) -> ReadinessResponse:
    """Check every dependency the API needs to actually serve traffic. Returns
    503 if anything is down. Render's autoscaler / Fly's healthcheck should
    point here, NOT at /healthz, so a degraded instance gets pulled out of
    the load balancer pool quickly.

    The DB + storage checks each run a real round-trip; the Anthropic and
    secret-key checks are surface-only (env var present + sane shape).
    """
    checks = [
        _check_db(),
        _check_storage(),
        _check_anthropic_key(),
        _check_secret_key(),
    ]
    # `degraded` is treated as still-ready — the API can serve most traffic.
    # `down` means a critical dep is unreachable; flip to 503.
    overall_ok = not any(c.status == "down" for c in checks)
    response.status_code = 200 if overall_ok else 503

    if not overall_ok:
        log.warning(
            "readiness.failed",
            failing=[c.name for c in checks if c.status == "down"],
        )

    return ReadinessResponse(ok=overall_ok, checks=checks)
