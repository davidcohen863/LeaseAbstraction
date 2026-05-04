"""Per-request context middleware — populates request_id / route / user_id
contextvars so every log line + Sentry breadcrumb is correlated to the
request that produced it.

Mounted in `main.create_app()`. Sits ABOVE the CORS middleware so the
request_id is set before anything else runs.

  - `request_id`: pulled from the incoming `X-Request-ID` header if present
    (so a load balancer / Cloudflare can stamp it once and we propagate it
    through the stack), otherwise generated. Always echoed back as a
    response header so the user can quote it when they file a bug.
  - `route`: the matched FastAPI route path (e.g. `/leases/{lease_id}`)
    rather than the literal URL — so dashboards can group cleanly.
  - `user_id`: set later by the auth dependency (`current_user`) once the
    JWT has been verified.
"""

from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from .logging import get_logger, new_request_id, request_id_ctx, route_ctx

log = get_logger(__name__)


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Stamps every request with a request_id + route + access log line."""

    async def dispatch(self, request: Request, call_next) -> Response:
        # Honour an inbound X-Request-ID if one is set (Cloudflare adds
        # `Cf-Ray`; we read both as fallbacks).
        rid = (
            request.headers.get("x-request-id")
            or request.headers.get("cf-ray")
            or new_request_id()
        )
        token = request_id_ctx.set(rid)
        # The matched-route template isn't known yet (FastAPI sets it during
        # routing). For now stash the path; we'll overwrite with the template
        # post-call below if available.
        route_token = route_ctx.set(request.url.path)

        try:
            response = await call_next(request)
        except Exception as exc:  # noqa: BLE001
            # Log the failure with full context, then rethrow so FastAPI's
            # exception handlers (or our 500) take over.
            log.exception(
                "request.failed",
                method=request.method,
                error=type(exc).__name__,
            )
            request_id_ctx.reset(token)
            route_ctx.reset(route_token)
            raise

        # Use the matched route template (e.g. "/leases/{lease_id}") for the
        # log line, falling back to the raw path. FastAPI sets request.scope["route"]
        # to the APIRoute object if matching succeeded.
        route_template = request.url.path
        matched = request.scope.get("route")
        if matched is not None and hasattr(matched, "path"):
            route_template = matched.path
            route_ctx.set(route_template)

        # Echo the request_id back so the client can quote it in bug reports
        response.headers.setdefault("X-Request-ID", rid)

        log.info(
            "request",
            method=request.method,
            path=request.url.path,
            route=route_template,
            status=response.status_code,
        )

        request_id_ctx.reset(token)
        route_ctx.reset(route_token)
        return response
