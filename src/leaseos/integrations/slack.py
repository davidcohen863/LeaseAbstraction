"""Slack — incoming-webhook approach.

Why webhook and not full OAuth app? For the pilot, every firm just creates an
incoming webhook on a channel they pick (Slack → Apps → Incoming Webhooks →
Add to channel) and pastes the URL. Zero approval friction, no Slack app
review required. We add a real OAuth-installable app post-pilot.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from typing import Iterable

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..api.config import get_settings
from ..api.models import Lease, LeaseEvent, SlackIntegration

log = logging.getLogger(__name__)


def post_to_webhook(webhook_url: str, *, text: str, blocks: list[dict] | None = None) -> bool:
    """Send a message to a Slack incoming webhook. Returns True on 2xx."""
    payload: dict = {"text": text}
    if blocks:
        payload["blocks"] = blocks
    try:
        r = httpx.post(webhook_url, json=payload, timeout=10)
        if r.status_code >= 300:
            log.warning("Slack webhook failed: %s %s", r.status_code, r.text[:200])
            return False
        return True
    except httpx.HTTPError as exc:
        log.warning("Slack webhook error: %s", exc)
        return False


def _format_event_row(event: LeaseEvent, lease_label: str) -> str:
    days = (event.event_date.date() - date.today()).days
    when = (
        f"in {days}d" if days > 0 else "today" if days == 0 else f"{abs(days)}d ago"
    )
    return f"• *{event.title}* — {event.event_date:%d %b %Y} ({when})"


def build_digest_blocks(events: Iterable[tuple[LeaseEvent, str]]) -> list[dict]:
    rows = [_format_event_row(e, label) for e, label in events]
    if not rows:
        text = "_No upcoming lease events in the next 90 days. ✅_"
    else:
        text = "*Upcoming lease events*\n" + "\n".join(rows)
    return [
        {"type": "section", "text": {"type": "mrkdwn", "text": text}},
        {
            "type": "context",
            "elements": [{"type": "mrkdwn", "text": "Sent by LeaseOS"}],
        },
    ]


def send_daily_digest(db: Session, *, days_ahead: int = 90) -> int:
    """Send the digest to every configured Slack integration. Returns send count."""
    integrations = db.execute(
        select(SlackIntegration).where(SlackIntegration.digest_enabled.is_(True))
    ).scalars().all()
    if not integrations:
        # Fall back to the global default webhook if configured
        url = get_settings().slack_default_webhook_url
        if not url:
            return 0
        integrations = [SlackIntegration(webhook_url=url, channel_label="default")]

    now = datetime.utcnow()
    cutoff = now + timedelta(days=days_ahead)
    rows = (
        db.execute(
            select(LeaseEvent, Lease.label)
            .join(Lease, Lease.id == LeaseEvent.lease_id)
            .where(LeaseEvent.event_date >= now)
            .where(LeaseEvent.event_date <= cutoff)
            .where(LeaseEvent.status == "upcoming")
            .order_by(LeaseEvent.event_date.asc())
        )
        .all()
    )

    blocks = build_digest_blocks(rows)
    plain_text = f"LeaseOS digest — {len(rows)} events in next {days_ahead}d"
    sent = 0
    for integ in integrations:
        if post_to_webhook(integ.webhook_url, text=plain_text, blocks=blocks):
            sent += 1
    return sent


def notify_lease_ready(db: Session, lease: Lease) -> None:
    """Fire-and-forget notification when a lease finishes extracting."""
    integrations = db.execute(select(SlackIntegration)).scalars().all()
    if not integrations:
        url = get_settings().slack_default_webhook_url
        if not url:
            return
        integrations = [SlackIntegration(webhook_url=url, channel_label="default")]

    text = f"🆕 Lease ready for review — *{lease.label}*"
    for integ in integrations:
        post_to_webhook(integ.webhook_url, text=text)
