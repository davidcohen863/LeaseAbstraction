"""Stripe-style Idempotency-Key support.

Why this exists: every cost-bearing endpoint runs an Anthropic extraction
(£0.20+ per call). If a network blip causes the user's browser to retry
a POST that *did* succeed but didn't surface its 201, we'd run extraction
twice, charge twice, and Sarah ends up with two duplicate Leases.

The fix is the standard "client sends a UUID once, server caches the
response under it for 24h" pattern. Any retry within 24h with the same
key returns the cached response instead of re-executing.

How a route uses it:

    from .idempotency import idempotent

    @router.post("/leases")
    async def upload_lease(
        request: Request,
        ...
    ):
        async def _do_work() -> LeaseSummary:
            # the actual handler body
            ...
            return _to_summary(lease, document_count=1)

        return await idempotent(request, _do_work, request_hash=hashlib.sha256(raw).hexdigest())

If the same `Idempotency-Key` header arrives again with a DIFFERENT request
body, we return 409 Conflict (the same key MUST mean the same request).
If no header is sent, we just call `_do_work()` directly — the header is
opt-in.

Storage: cached response bodies live as small JSON files under
`idempotency/{key}.json` via the existing storage abstraction. Local
filesystem in dev, S3/R2 in prod. Cheaper than a DB table, no migration,
and naturally TTLs by housekeeping job (out of scope for now — the entries
are tiny and unbounded growth would take years to matter).
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from typing import Awaitable, Callable, TypeVar

from fastapi import HTTPException, Request, Response
from fastapi.responses import JSONResponse

from .logging import get_logger
from .storage import get_storage
from ..utils import utc_now

log = get_logger(__name__)

T = TypeVar("T")

# How long we remember an idempotency key. 24h matches Stripe; long enough
# to cover network retries, short enough that key reuse is unlikely.
IDEMPOTENCY_TTL = timedelta(hours=24)


def _key_to_storage_key(idempotency_key: str) -> str:
    # Defensive: keys are caller-supplied; sanitise so they can't escape
    # the idempotency/ prefix via path traversal. Restrict to a simple
    # alphabet (UUIDs and ULIDs both fit).
    safe = "".join(c for c in idempotency_key if c.isalnum() or c in "-_")[:128]
    if not safe:
        raise HTTPException(400, "Idempotency-Key must be ASCII alnum / dash / underscore")
    return f"idempotency/{safe}.json"


async def idempotent(
    request: Request,
    do_work: Callable[[], Awaitable[T] | T],
    *,
    request_hash: str,
) -> T | Response:
    """Wrap a handler's work in an idempotency check.

    Behaviour:
      1. No `Idempotency-Key` header → call do_work() directly. (Header is opt-in.)
      2. Header present + key not seen → call do_work(), persist response, return.
      3. Header present + key seen + same `request_hash` → return cached response.
         The cached response carries `Idempotent-Replayed: true` header so the
         client can tell it was a replay vs a fresh execution.
      4. Header present + key seen + DIFFERENT `request_hash` → 409 Conflict.
         (Same key reused for a different request — Stripe-style "this is wrong".)

    `do_work` is a 0-arg callable. Awaitable or sync are both fine.
    `request_hash` should uniquely identify the semantic content of the
    request (e.g. sha256 of the uploaded file bytes). Used only for conflict
    detection.
    """
    key = request.headers.get("idempotency-key")
    if not key:
        # Opt-in: no header → no idempotency, pass-through.
        result = do_work()
        if hasattr(result, "__await__"):
            result = await result  # type: ignore[assignment]
        return result  # type: ignore[return-value]

    storage = get_storage()
    storage_key = _key_to_storage_key(key)

    # Check cache
    if storage.exists(storage_key):
        cached_raw = storage.get(storage_key)
        try:
            cached = json.loads(cached_raw)
        except json.JSONDecodeError:
            # Corrupted cache entry — treat as miss; will be overwritten.
            cached = None

        if cached is not None:
            # Expired? — fall through to fresh execution
            ts = datetime.fromisoformat(cached["created_at"])
            if utc_now() - ts > IDEMPOTENCY_TTL:
                log.info("idempotency.expired", key=key)
            elif cached.get("request_hash") != request_hash:
                # Conflict — same key, different body
                log.warning("idempotency.conflict", key=key)
                raise HTTPException(
                    409,
                    "Idempotency-Key has been used for a different request body. "
                    "Use a fresh key for a new request.",
                )
            else:
                log.info("idempotency.replay", key=key, status=cached["status"])
                return JSONResponse(
                    status_code=cached["status"],
                    content=cached["body"],
                    headers={
                        "Idempotent-Replayed": "true",
                        "X-Idempotency-Key": key,
                    },
                )

    # Cache miss (or expired) — execute and persist
    result = do_work()
    if hasattr(result, "__await__"):
        result = await result  # type: ignore[assignment]

    # Persist for replay. We serialise the result to JSON via FastAPI's
    # standard mechanism (Pydantic model → dict). Most route handlers
    # return Pydantic models; jsonable_encoder handles dataclasses, etc.
    from fastapi.encoders import jsonable_encoder

    try:
        body = jsonable_encoder(result)
        cache_entry = {
            "created_at": utc_now().isoformat(),
            "request_hash": request_hash,
            "status": 201,  # all idempotent endpoints today return 201
            "body": body,
        }
        storage.put(storage_key, json.dumps(cache_entry).encode())
    except Exception as exc:  # noqa: BLE001
        # Don't fail the request because cache write failed — just log.
        # Worst case, a retry re-executes (which is what would have happened
        # without idempotency support anyway).
        log.warning("idempotency.cache_write_failed", key=key, error=str(exc))

    return result  # type: ignore[return-value]
