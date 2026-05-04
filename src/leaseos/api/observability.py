"""Optional Sentry integration.

Wires `sentry-sdk[fastapi]` if `SENTRY_DSN` is set in env. No-op otherwise
(local dev doesn't need it).

What you get when enabled:
  - Unhandled exceptions captured with full stack trace + request context
  - Request_id from `request_id_ctx` attached as a Sentry tag, so a Sentry
    issue links 1-to-1 with the structured log line that produced it
  - User_id attached via `set_user` once auth resolves
  - Performance tracing (10% sample rate by default — bump via
    `SENTRY_TRACES_SAMPLE_RATE` if you want more)
  - Release tagged from `LEASEOS_RELEASE` env var (Render auto-sets this
    from the git SHA via Render's `RENDER_GIT_COMMIT`)
"""

from __future__ import annotations

import os

from .logging import get_logger

log = get_logger(__name__)


def setup_sentry(env: str = "dev") -> None:
    """Initialise Sentry if SENTRY_DSN is set. Safe to call from create_app()
    regardless — no DSN means no-op."""
    dsn = os.getenv("SENTRY_DSN")
    if not dsn:
        return

    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.starlette import StarletteIntegration

    sample_rate = float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.1"))
    release = os.getenv("LEASEOS_RELEASE") or os.getenv("RENDER_GIT_COMMIT")

    sentry_sdk.init(
        dsn=dsn,
        environment=env,
        release=release,
        traces_sample_rate=sample_rate,
        # Don't double-capture — structlog formats exceptions; we want Sentry
        # to capture only ACTUAL exception objects, not log strings.
        integrations=[
            FastApiIntegration(transaction_style="endpoint"),
            StarletteIntegration(transaction_style="endpoint"),
        ],
        # PII off by default — request bodies / headers may contain lease data
        # which is a customer record. Flip on with caution.
        send_default_pii=False,
        # Filter out the orchestrator probes — they'd dominate the transaction list
        before_send_transaction=_drop_health_probes,
    )

    log.info("sentry.enabled", environment=env, traces_sample_rate=sample_rate)


def _drop_health_probes(event, hint):
    """Don't send /healthz / /readyz transactions to Sentry — orchestrators
    hit them every few seconds and they'd dominate the transaction list
    without telling us anything useful."""
    transaction = event.get("transaction", "")
    if transaction in {"/healthz", "/health", "/readyz"}:
        return None
    return event


def attach_request_context_to_sentry(request_id: str, user_id: str | None = None) -> None:
    """Tag the current Sentry scope with our request_id + user_id.
    Called from the request-context middleware. No-op if Sentry isn't loaded."""
    try:
        import sentry_sdk
    except ImportError:
        return
    sentry_sdk.set_tag("request_id", request_id)
    if user_id:
        sentry_sdk.set_user({"id": user_id})
