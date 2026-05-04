"""Integration routes: Slack webhook config, Google + Microsoft OAuth flows,
and event-push triggers.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel, HttpUrl
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...integrations import google as google_integ
from ...integrations import microsoft as ms_integ
from ...integrations import slack as slack_integ
from ..auth import AuthenticatedUser, cron_or_user, current_user
from ..config import get_settings
from ..crypto import decrypt_secret, encrypt_secret
from ..db import get_db
from ..models import LeaseEvent, OAuthState, OAuthToken, SlackIntegration
from ...utils import utc_now

router = APIRouter(prefix="/integrations", tags=["integrations"])


# ---- status overview -----------------------------------------------------


class IntegrationsStatus(BaseModel):
    slack: dict
    google: dict
    outlook: dict


@router.get("/status", response_model=IntegrationsStatus)
def status(
    user: AuthenticatedUser = Depends(current_user),
    db: Session = Depends(get_db),
) -> IntegrationsStatus:
    slack_row = db.execute(
        select(SlackIntegration).where(SlackIntegration.user_id == user.id)
    ).scalar_one_or_none()
    google_row = db.execute(
        select(OAuthToken).where(OAuthToken.user_id == user.id, OAuthToken.provider == "google")
    ).scalar_one_or_none()
    ms_row = db.execute(
        select(OAuthToken).where(OAuthToken.user_id == user.id, OAuthToken.provider == "microsoft")
    ).scalar_one_or_none()
    return IntegrationsStatus(
        slack={"configured": slack_row is not None, "channel_label": slack_row.channel_label if slack_row else None},
        google={"connected": google_row is not None, "account_email": google_row.account_email if google_row else None},
        outlook={"connected": ms_row is not None, "account_email": ms_row.account_email if ms_row else None},
    )


# ---- Slack ---------------------------------------------------------------


class SlackConfig(BaseModel):
    webhook_url: HttpUrl
    channel_label: str | None = None
    digest_enabled: bool = True


@router.post("/slack/configure")
def slack_configure(
    body: SlackConfig,
    user: AuthenticatedUser = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    existing = db.execute(
        select(SlackIntegration).where(SlackIntegration.user_id == user.id)
    ).scalar_one_or_none()
    encrypted_url = encrypt_secret(str(body.webhook_url))
    if existing:
        existing.webhook_url = encrypted_url
        existing.channel_label = body.channel_label
        existing.digest_enabled = body.digest_enabled
    else:
        db.add(
            SlackIntegration(
                user_id=user.id,
                webhook_url=encrypted_url,
                channel_label=body.channel_label,
                digest_enabled=body.digest_enabled,
            )
        )
    db.commit()
    return {"ok": True}


@router.post("/slack/test")
def slack_test(
    user: AuthenticatedUser = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    row = db.execute(
        select(SlackIntegration).where(SlackIntegration.user_id == user.id)
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(404, "Slack not configured")
    url = decrypt_secret(row.webhook_url)
    if not url:
        raise HTTPException(500, "Slack webhook URL is empty")
    ok = slack_integ.post_to_webhook(url, text="✅ LeaseOS test message")
    return {"ok": ok}


@router.post("/slack/digest/run")
def slack_digest_run(
    user: AuthenticatedUser = Depends(cron_or_user),
    db: Session = Depends(get_db),
    days_ahead: int = Query(default=90, ge=1, le=365),
) -> dict:
    """Trigger the daily digest send.

    Auth: either a signed-in user (UI button on /settings/integrations) OR
    `X-Cron-Secret: <LEASEOS_CRON_SECRET>` for the Render daily cron. Hitting
    this endpoint without either credential gets 401 in prod.
    """
    sent = slack_integ.send_daily_digest(db, days_ahead=days_ahead)
    return {"ok": True, "sent": sent}


@router.get("/slack", response_class=HTMLResponse)
def slack_setup_page() -> HTMLResponse:
    """A bare HTML page explaining how to set up the webhook. Real UI lives
    in the Next.js app; this is a fallback if a user hits the API URL.
    """
    return HTMLResponse(
        """
        <h1>Slack setup</h1>
        <p>1. Create an incoming webhook for the channel you want LeaseOS to post to:
           <a href='https://api.slack.com/messaging/webhooks' target='_blank'>Slack docs</a>.</p>
        <p>2. POST the URL to <code>/integrations/slack/configure</code>.</p>
        """
    )


# ---- OAuth state helpers -------------------------------------------------
#
# These tokens are issued at /<provider>/start and consumed at /<provider>/callback
# to defend the OAuth round-trip against CSRF. Persisted in Postgres so the
# state survives an API restart and works across multiple uvicorn workers.


_STATE_TTL = timedelta(minutes=15)


def _new_state(db: Session, user_id: str, provider: str) -> str:
    state = secrets.token_urlsafe(24)
    db.add(OAuthState(state=state, user_id=user_id, provider=provider))
    # Best-effort GC of expired rows. Tiny table, runs maybe a dozen times a day.
    db.query(OAuthState).filter(
        OAuthState.created_at < utc_now() - _STATE_TTL
    ).delete(synchronize_session=False)
    db.commit()
    return state


def _consume_state(db: Session, state: str, provider: str) -> str:
    row = db.get(OAuthState, state)
    if row is None or row.provider != provider:
        raise HTTPException(400, "Invalid or expired OAuth state")
    if utc_now() - row.created_at > _STATE_TTL:
        db.delete(row)
        db.commit()
        raise HTTPException(400, "Invalid or expired OAuth state")
    user_id = row.user_id
    db.delete(row)  # single-use
    db.commit()
    return user_id


# ---- Google --------------------------------------------------------------


@router.get("/google/start")
def google_start(
    user: AuthenticatedUser = Depends(current_user),
    db: Session = Depends(get_db),
) -> RedirectResponse:
    state = _new_state(db, user.id, "google")
    return RedirectResponse(google_integ.authorize_url(state))


@router.get("/google/callback")
def google_callback(
    code: str = Query(...),
    state: str = Query(...),
    db: Session = Depends(get_db),
) -> RedirectResponse:
    user_id = _consume_state(db, state, "google")
    payload = google_integ.exchange_code(code)
    info = google_integ.fetch_userinfo(payload["access_token"])
    expires_at = utc_now() + timedelta(seconds=int(payload.get("expires_in", 3600)))
    existing = db.execute(
        select(OAuthToken).where(OAuthToken.user_id == user_id, OAuthToken.provider == "google")
    ).scalar_one_or_none()
    if existing:
        existing.access_token = payload["access_token"]
        existing.refresh_token = payload.get("refresh_token") or existing.refresh_token
        existing.expires_at = expires_at
        existing.scope = payload.get("scope")
        existing.account_email = info.get("email")
    else:
        db.add(
            OAuthToken(
                user_id=user_id,
                provider="google",
                access_token=payload["access_token"],
                refresh_token=payload.get("refresh_token"),
                expires_at=expires_at,
                scope=payload.get("scope"),
                account_email=info.get("email"),
            )
        )
    db.commit()
    return _post_oauth_redirect()


# ---- Microsoft / Outlook -------------------------------------------------


@router.get("/microsoft/start")
def microsoft_start(
    user: AuthenticatedUser = Depends(current_user),
    db: Session = Depends(get_db),
) -> RedirectResponse:
    state = _new_state(db, user.id, "microsoft")
    return RedirectResponse(ms_integ.authorize_url(state))


@router.get("/microsoft/callback")
def microsoft_callback(
    code: str = Query(...),
    state: str = Query(...),
    db: Session = Depends(get_db),
) -> RedirectResponse:
    user_id = _consume_state(db, state, "microsoft")
    payload = ms_integ.exchange_code(code)
    info = ms_integ.fetch_userinfo(payload["access_token"])
    expires_at = utc_now() + timedelta(seconds=int(payload.get("expires_in", 3600)))
    existing = db.execute(
        select(OAuthToken).where(OAuthToken.user_id == user_id, OAuthToken.provider == "microsoft")
    ).scalar_one_or_none()
    if existing:
        existing.access_token = payload["access_token"]
        existing.refresh_token = payload.get("refresh_token") or existing.refresh_token
        existing.expires_at = expires_at
        existing.scope = payload.get("scope")
        existing.account_email = info.get("mail") or info.get("userPrincipalName")
    else:
        db.add(
            OAuthToken(
                user_id=user_id,
                provider="microsoft",
                access_token=payload["access_token"],
                refresh_token=payload.get("refresh_token"),
                expires_at=expires_at,
                scope=payload.get("scope"),
                account_email=info.get("mail") or info.get("userPrincipalName"),
            )
        )
    db.commit()
    return _post_oauth_redirect()


def _post_oauth_redirect() -> RedirectResponse:
    """After OAuth, send the user back to the frontend integrations page
    (now under /settings/integrations as of the Settings hub work)."""
    settings = get_settings()
    target = settings.cors_origins[0] if settings.cors_origins else "http://localhost:3000"
    return RedirectResponse(f"{target}/settings/integrations?connected=1")


# ---- Event push ----------------------------------------------------------


@router.post("/events/{event_id}/push")
def push_event(
    event_id: str,
    targets: list[str] = Query(default=["google", "microsoft"]),
    user: AuthenticatedUser = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Push a single event to one or both of the user's connected calendars."""
    event = db.get(LeaseEvent, event_id)
    if event is None:
        raise HTTPException(404, "Event not found")

    pushed: dict[str, str | None] = {}
    if "google" in targets:
        token = db.execute(
            select(OAuthToken).where(OAuthToken.user_id == user.id, OAuthToken.provider == "google")
        ).scalar_one_or_none()
        if token:
            gid = google_integ.push_event(db, token, event)
            if gid:
                event.pushed_to_google = True
                event.google_event_id = gid
                pushed["google"] = gid
    if "microsoft" in targets:
        token = db.execute(
            select(OAuthToken).where(OAuthToken.user_id == user.id, OAuthToken.provider == "microsoft")
        ).scalar_one_or_none()
        if token:
            mid = ms_integ.push_event(db, token, event)
            if mid:
                event.pushed_to_outlook = True
                event.outlook_event_id = mid
                pushed["microsoft"] = mid
    db.commit()
    return {"ok": True, "pushed": pushed}
