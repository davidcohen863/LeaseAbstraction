"""Microsoft / Outlook integration via Microsoft Graph.

Same shape as Google: OAuth code flow → token → POST event.

Tenant defaults to "common" so personal MS accounts and any work tenant can sign in.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from urllib.parse import urlencode

import httpx
from sqlalchemy.orm import Session

from ..api.config import get_settings
from ..api.models import LeaseEvent, OAuthToken
from ..utils import utc_now

log = logging.getLogger(__name__)

SCOPES = ["openid", "email", "offline_access", "Calendars.ReadWrite", "User.Read"]
GRAPH_ME = "https://graph.microsoft.com/v1.0/me"
GRAPH_EVENTS = "https://graph.microsoft.com/v1.0/me/events"


def _auth_base() -> str:
    return f"https://login.microsoftonline.com/{get_settings().ms_tenant_id}/oauth2/v2.0"


def authorize_url(state: str) -> str:
    settings = get_settings()
    if not settings.ms_client_id or not settings.ms_redirect_uri:
        raise RuntimeError("MS_CLIENT_ID and MS_REDIRECT_URI must be set")
    params = {
        "client_id": settings.ms_client_id,
        "redirect_uri": settings.ms_redirect_uri,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "response_mode": "query",
        "state": state,
        "prompt": "consent",
    }
    return f"{_auth_base()}/authorize?{urlencode(params)}"


def exchange_code(code: str) -> dict:
    settings = get_settings()
    r = httpx.post(
        f"{_auth_base()}/token",
        data={
            "client_id": settings.ms_client_id,
            "client_secret": settings.ms_client_secret,
            "code": code,
            "redirect_uri": settings.ms_redirect_uri,
            "grant_type": "authorization_code",
            "scope": " ".join(SCOPES),
        },
        timeout=15,
    )
    r.raise_for_status()
    return r.json()


def fetch_userinfo(access_token: str) -> dict:
    r = httpx.get(GRAPH_ME, headers={"Authorization": f"Bearer {access_token}"}, timeout=10)
    r.raise_for_status()
    return r.json()


def refresh_access_token(token: OAuthToken) -> str:
    settings = get_settings()
    r = httpx.post(
        f"{_auth_base()}/token",
        data={
            "client_id": settings.ms_client_id,
            "client_secret": settings.ms_client_secret,
            "refresh_token": token.refresh_token,
            "grant_type": "refresh_token",
            "scope": " ".join(SCOPES),
        },
        timeout=15,
    )
    r.raise_for_status()
    payload = r.json()
    token.access_token = payload["access_token"]
    if "refresh_token" in payload:
        token.refresh_token = payload["refresh_token"]
    expires_in = payload.get("expires_in", 3600)
    token.expires_at = utc_now() + timedelta(seconds=expires_in)
    return token.access_token


def _ensure_fresh(db: Session, token: OAuthToken) -> str:
    if token.expires_at and token.expires_at > utc_now() + timedelta(seconds=60):
        return token.access_token
    if not token.refresh_token:
        raise RuntimeError("No refresh token; user must re-authorize")
    new = refresh_access_token(token)
    db.add(token)
    db.commit()
    return new


def push_event(db: Session, token: OAuthToken, event: LeaseEvent) -> str | None:
    access = _ensure_fresh(db, token)
    end = event.event_date + timedelta(hours=1)
    body = {
        "subject": event.title,
        "body": {"contentType": "Text", "content": (event.description or "") + "\n\n— LeaseOS"},
        "start": {"dateTime": event.event_date.isoformat(), "timeZone": "UTC"},
        "end": {"dateTime": end.isoformat(), "timeZone": "UTC"},
        "reminderMinutesBeforeStart": 60 * 24 * 7,
        "isReminderOn": True,
    }
    r = httpx.post(
        GRAPH_EVENTS,
        headers={"Authorization": f"Bearer {access}", "Content-Type": "application/json"},
        json=body,
        timeout=15,
    )
    if r.status_code >= 300:
        log.warning("Outlook event create failed: %s %s", r.status_code, r.text[:200])
        return None
    return r.json().get("id")
