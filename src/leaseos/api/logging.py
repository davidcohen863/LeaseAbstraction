"""Structured logging with request-scoped context (request ID, user, route).

The previous setup was stdlib `logging.basicConfig` + `--log-level info` which
gave us human-readable lines but nothing structured. In prod, every log line
needs to be:

  1. JSON (so Render / CloudWatch / Loki can parse it)
  2. Correlated to the request that produced it (request_id)
  3. Carry user_id when known (so an error report can be tied to "who hit it")
  4. Capture the route (so dashboards can group by endpoint)

structlog gives us all of that with a clean API. In dev it pretty-prints
with colours so the terminal stays readable; in prod it switches to one-JSON-
object-per-line.

Usage anywhere in the codebase:

    from leaseos.api.logging import get_logger
    log = get_logger(__name__)

    log.info("lease.uploaded", lease_id=lease.id, size_bytes=len(raw))
    log.warning("extraction.failed", lease_id=lease.id, error=str(exc))

The request_id and user_id are picked up automatically via contextvars set by
the middleware in `request_context.py`. Don't pass them explicitly.
"""

from __future__ import annotations

import logging
import sys
from contextvars import ContextVar
from typing import Any
from uuid import uuid4

import structlog

# Per-request context, populated by RequestContextMiddleware. We use raw
# contextvars here (not structlog's bind_contextvars helper) so background
# tasks can copy the parent request's context cleanly.
request_id_ctx: ContextVar[str | None] = ContextVar("request_id", default=None)
user_id_ctx: ContextVar[str | None] = ContextVar("user_id", default=None)
route_ctx: ContextVar[str | None] = ContextVar("route", default=None)


def _add_request_context(
    _logger: Any, _method: str, event_dict: dict
) -> dict:
    """structlog processor — pulls the per-request contextvars onto every
    log line so we never have to remember to bind them at the call site."""
    rid = request_id_ctx.get()
    uid = user_id_ctx.get()
    route = route_ctx.get()
    if rid is not None:
        event_dict.setdefault("request_id", rid)
    if uid is not None:
        event_dict.setdefault("user_id", uid)
    if route is not None:
        event_dict.setdefault("route", route)
    return event_dict


def setup_logging(*, env: str = "dev") -> None:
    """Wire structlog + the stdlib logger so EVERY log line — ours,
    uvicorn's, sqlalchemy's, anthropic's — comes out the same way.

    Call once at app startup. Idempotent.
    """
    is_prod = env == "prod"

    # Common processors used in both dev and prod
    pre_chain = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        _add_request_context,
    ]

    # Final renderer differs: dev is pretty-printed coloured console, prod is JSON
    if is_prod:
        renderer: Any = structlog.processors.JSONRenderer()
    else:
        renderer = structlog.dev.ConsoleRenderer(colors=sys.stderr.isatty())

    structlog.configure(
        processors=[
            *pre_chain,
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            renderer,
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(file=sys.stderr),
        cache_logger_on_first_use=True,
    )

    # Funnel stdlib loggers (uvicorn, sqlalchemy, httpx, anthropic, …) through
    # structlog so the access log and our app logs have the same shape and
    # carry the same request_id contextvar.
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(
        structlog.stdlib.ProcessorFormatter(
            foreign_pre_chain=pre_chain,
            processors=[
                structlog.stdlib.ProcessorFormatter.remove_processors_meta,
                renderer,
            ],
        )
    )

    root = logging.getLogger()
    # Replace handlers (idempotency: setup_logging may be called twice in tests)
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(logging.INFO if not is_prod else logging.INFO)

    # Quiet down a few noisy libraries
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("watchfiles").setLevel(logging.WARNING)


def get_logger(name: str | None = None) -> structlog.stdlib.BoundLogger:
    """Standard module-level logger. Use this instead of stdlib logging."""
    return structlog.get_logger(name)


def new_request_id() -> str:
    """8-byte hex (16 chars) — short enough to grep, long enough to be unique
    inside a single deploy. We don't need globally-unique."""
    return uuid4().hex[:16]
