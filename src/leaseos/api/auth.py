"""Clerk JWT verification.

If `LEASEOS_AUTH_REQUIRED=false` (default for dev), every request is treated as
the synthetic 'dev_user'. In production set CLERK_JWKS_URL, CLERK_ISSUER and
LEASEOS_AUTH_REQUIRED=true.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache

import httpx
import jwt
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db
from .logging import user_id_ctx
from .models import User


@dataclass
class AuthenticatedUser:
    id: str
    email: str
    display_name: str | None = None
    role: str = "user"


DEV_USER = AuthenticatedUser(id="dev_user", email="dev@leaseos.local", display_name="Dev User", role="admin")


@lru_cache(maxsize=1)
def _jwks() -> dict:
    settings = get_settings()
    if not settings.clerk_jwks_url:
        return {}
    return httpx.get(settings.clerk_jwks_url, timeout=10).json()


def _verify_clerk_jwt(token: str) -> dict:
    settings = get_settings()
    if not settings.clerk_jwks_url:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "CLERK_JWKS_URL not configured")
    jwks = _jwks()
    unverified = jwt.get_unverified_header(token)
    kid = unverified.get("kid")
    key = next((k for k in jwks.get("keys", []) if k.get("kid") == kid), None)
    if not key:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Unknown signing key")
    public_key = jwt.algorithms.RSAAlgorithm.from_jwk(key)
    try:
        return jwt.decode(
            token,
            public_key,
            algorithms=[unverified.get("alg", "RS256")],
            issuer=settings.clerk_issuer,
            options={"verify_aud": False},
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Invalid token: {exc}") from exc


def _ensure_user(db: Session, claims: dict) -> User:
    user_id = claims["sub"]
    user = db.get(User, user_id)
    if user is None:
        user = User(
            id=user_id,
            email=claims.get("email", f"{user_id}@unknown"),
            display_name=claims.get("name"),
            role="user",
        )
        db.add(user)
        db.commit()
    return user


def cron_or_user(
    authorization: str | None = Header(default=None),
    x_cron_secret: str | None = Header(default=None, alias="X-Cron-Secret"),
    db: Session = Depends(get_db),
) -> AuthenticatedUser:
    """Authorisation gate for endpoints that BOTH the UI (signed-in user) AND
    a cron job need to hit — primarily `/integrations/slack/digest/run`.

    Accepts either:
      * a valid Clerk JWT (delegates to `current_user`), OR
      * an `X-Cron-Secret` header matching `LEASEOS_CRON_SECRET`

    Anything else 401s. In dev (`LEASEOS_AUTH_REQUIRED=false`) the synthetic
    DEV_USER is returned regardless, same as `current_user`.

    Returns the authenticated user (or a synthetic "cron" user) so route
    bodies that read `user.id` for audit logging keep working unchanged.
    """
    settings = get_settings()
    # Dev bypass — same logic as current_user
    if not settings.auth_required:
        return current_user(authorization=authorization, db=db)

    # Cron path — env-var-presence + constant-time comparison
    if settings.cron_secret and x_cron_secret:
        import hmac
        if hmac.compare_digest(x_cron_secret, settings.cron_secret):
            return AuthenticatedUser(
                id="cron",
                email="cron@leaseos.internal",
                display_name="Cron",
                role="admin",
            )

    # Fall through to JWT path
    return current_user(authorization=authorization, db=db)


def current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> AuthenticatedUser:
    settings = get_settings()
    if not settings.auth_required:
        # Make sure the dev user exists in the DB so FK constraints don't fire
        if not db.get(User, DEV_USER.id):
            db.add(User(id=DEV_USER.id, email=DEV_USER.email, display_name=DEV_USER.display_name, role="admin"))
            db.commit()
        # Stamp the user_id onto the request context so subsequent log lines
        # know who hit the endpoint.
        user_id_ctx.set(DEV_USER.id)
        return DEV_USER

    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")
    token = authorization.split(" ", 1)[1]
    claims = _verify_clerk_jwt(token)
    user = _ensure_user(db, claims)
    user_id_ctx.set(user.id)
    return AuthenticatedUser(
        id=user.id, email=user.email, display_name=user.display_name, role=user.role
    )
