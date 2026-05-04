"""Rate limiting via slowapi.

Why this exists: every cost-bearing endpoint (`POST /leases` and
`POST /events/{event_id}/pack`) calls Anthropic and burns real money.
Without limits, anyone with the API URL — accidental script, leaked
demo URL, malicious actor, runaway frontend bug — can drain the account
in minutes.

Two limits per cost-bearing endpoint:
  - per-IP: catches accidental loops and unauthenticated abuse before
    we even check who the user is
  - per-user: catches a signed-in user's runaway script (a single Sarah
    with a stuck refresh button shouldn't outpace the rest of the firm)

Both limits are tracked in-memory (slowapi's `MemoryStorage`). For a
single-pod Render deploy this is fine. When we scale to multiple workers
(or replace BackgroundTasks with RQ), swap the storage to Redis via
`storage_uri="redis://..."`. The API is identical.

Read endpoints intentionally have no per-IP limit — Sarah refreshing
the leases list doesn't cost us anything beyond a DB SELECT.
"""

from __future__ import annotations

from contextvars import ContextVar
from typing import Callable

from fastapi import HTTPException, Request, Response
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

# Tracks the authenticated user id for the duration of a request (set by
# `current_user`) so the per-user keyer can find it without re-running the
# auth dependency.
from .logging import user_id_ctx


def _user_or_ip_key(request: Request) -> str:
    """Per-user when we have a user id, per-IP otherwise. Adding the prefix
    means an authenticated and unauthenticated request from the same machine
    don't share the same bucket."""
    uid = user_id_ctx.get()
    if uid:
        return f"user:{uid}"
    return f"ip:{get_remote_address(request)}"


# Global limiter — attached to the FastAPI app in main.create_app().
# Limits are declared per-route via the `@limiter.limit(...)` decorator on
# each endpoint, NOT here, so each route can pick its own quota.
limiter = Limiter(key_func=_user_or_ip_key, headers_enabled=True)


def install_rate_limit(app) -> None:
    """Wire the limiter into a FastAPI app + register the 429 handler.

    Call once from `create_app()`. Idempotent.
    """
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


def _rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> Response:
    """Convert slowapi's exception into our usual error shape with a useful
    `Retry-After` header."""
    from fastapi.responses import JSONResponse

    response = JSONResponse(
        status_code=429,
        content={
            "detail": f"Rate limit exceeded: {exc.detail}",
            "retry_after_seconds": _retry_after(exc),
        },
    )
    response.headers["Retry-After"] = str(_retry_after(exc))
    return response


def _retry_after(exc: RateLimitExceeded) -> int:
    """slowapi exposes the limit but not a tidy retry-after seconds value;
    parse it from the limit string. Format: "5/minute" → 60s, "100/hour" → 3600s."""
    try:
        # exc.detail looks like "5 per 1 minute"
        s = str(exc.detail).lower()
        if "second" in s:
            return 1
        if "minute" in s:
            return 60
        if "hour" in s:
            return 3600
        if "day" in s:
            return 86400
    except Exception:  # noqa: BLE001
        pass
    return 60
