"""Google Calendar integration via OAuth 2.0 (web flow).

Scopes: only `calendar.events` — least privilege.

Endpoints called:
- POST https://oauth2.googleapis.com/token        (token + refresh)
- POST https://www.googleapis.com/calendar/v3/calendars/primary/events
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from urllib.parse import urlencode

import httpx
from sqlalchemy.orm import Session

from ..api.config import get_settings
from ..api.models import LeaseEvent, OAuthToken

log = logging.getLogger(__name__)

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
CALENDAR_INSERT_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events"

SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.events"]


def authorize_url(state: str) -> str:
    settings = get_settings()
    if not settings.google_client_id or not settings.google_redirect_uri:
        raise RuntimeError("GOOGLE_CLIENT_ID and GOOGLE_REDIRECT_URI must be set")
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }
    return f"{AUTH_URL}?{urlencode(params)}"


def exchange_code(code: str) -> dict:
    settings = get_settings()
    r = httpx.post(
        TOKEN_URL,
        data={
            "code": code,
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "redirect_uri": settings.google_redirect_uri,
            "grant_type": "authorization_code",
        },
        timeout=15,
    )
    r.raise_for_status()
    return r.json()


def fetch_userinfo(access_token: str) -> dict:
    r = httpx.get(
        USERINFO_URL, headers={"Authorization": f"Bearer {access_token}"}, timeout=10
    )
    r.raise_for_status()
    return r.json()


def refresh_access_token(token: OAuthToken) -> str:
    settings = get_settings()
    r = httpx.post(
        TOKEN_URL,
        data={
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "refresh_token": token.refresh_token,
            "grant_type": "refresh_token",
        },
        timeout=15,
    )
    r.raise_for_status()
    payload = r.json()
    token.access_token = payload["access_token"]
    expires_in = payload.get("expires_in", 3600)
    token.expires_at = datetime.utcnow() + timedelta(seconds=expires_in)
    return token.access_token


def _ensure_fresh(db: Session, token: OAuthToken) -> str:
    if token.expires_at and token.expires_at > datetime.utcnow() + timedelta(seconds=60):
        return token.access_token
    if not token.refresh_token:
        raise RuntimeError("No refresh token; user must re-authorize")
    new = refresh_access_token(token)
    db.add(token)
    db.commit()
    return new


def push_event(db: Session, token: OAuthToken, event: LeaseEvent) -> str | None:
    """Create a Google Calendar event for the lease event. Returns the Google event ID."""
    access = _ensure_fresh(db, token)
    end = event.event_date + timedelta(hours=1)
    body = {
        "summary": event.title,
        "description": (event.description or "") + "\n\n— LeaseOS",
        "start": {"dateTime": event.event_date.isoformat() + "Z"},
        "end": {"dateTime": end.isoformat() + "Z"},
        "reminders": {
            "useDefault": False,
            "overrides": [{"method": "email", "minutes": 60 * 24 * 7}],
        },
        "source": {"title": "LeaseOS", "url": "https://leaseos.app"},
    }
    r = httpx.post(
        CALENDAR_INSERT_URL,
        headers={"Authorization": f"Bearer {access}"},
        json=body,
        timeout=15,
    )
    if r.status_code >= 300:
        log.warning("Google Calendar insert failed: %s %s", r.status_code, r.text[:200])
        return None
    return r.json().get("id")
