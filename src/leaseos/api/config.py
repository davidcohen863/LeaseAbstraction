"""Runtime configuration loaded from environment variables."""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

# override=True so the project's .env wins over stale empty/exported shell vars
# (e.g. an empty `ANTHROPIC_API_KEY=""` in the user's ~/.zshrc).
load_dotenv(override=True)


class Settings:
    # Environment — "dev" | "prod". Render is auto-detected via the RENDER env
    # var; otherwise read from LEASEOS_ENV (default "dev"). Used by the startup
    # assertion in main.create_app() to block obviously-unsafe config in prod.
    environment: str = (
        "prod" if os.getenv("RENDER") else os.getenv("LEASEOS_ENV", "dev").lower()
    )

    # Database — defaults to SQLite for local dev. Render injects DATABASE_URL.
    database_url: str = os.getenv(
        "DATABASE_URL",
        f"sqlite:///{Path(__file__).resolve().parents[3] / 'data' / 'leaseos.db'}",
    )

    # File storage — local filesystem for dev, S3-compatible for prod.
    # `storage_dir` is the historical "documents/" subdir; the storage abstraction
    # in `storage.py` rebases on `storage_dir.parent` so packs/templates/documents
    # all live as siblings under one root.
    storage_dir: Path = Path(
        os.getenv(
            "LEASEOS_STORAGE_DIR",
            str(Path(__file__).resolve().parents[3] / "data" / "documents"),
        )
    )
    # Pick the storage backend. "local" = filesystem (dev + persistent-disk
    # hosts), "s3" = S3 / R2 / equivalent (not implemented yet — interface
    # in storage.py is ready). Default is local.
    storage_backend: str = os.getenv("LEASEOS_STORAGE_BACKEND", "local")

    # Auth — Clerk
    clerk_jwks_url: str | None = os.getenv("CLERK_JWKS_URL")
    clerk_issuer: str | None = os.getenv("CLERK_ISSUER")
    auth_required: bool = os.getenv("LEASEOS_AUTH_REQUIRED", "false").lower() == "true"

    # CORS — comma-separated origins
    cors_origins: list[str] = [
        o.strip()
        for o in os.getenv(
            "LEASEOS_CORS_ORIGINS",
            "http://localhost:3000,http://127.0.0.1:3000",
        ).split(",")
        if o.strip()
    ]

    # Extraction
    anthropic_api_key: str | None = os.getenv("ANTHROPIC_API_KEY")

    # Slack
    slack_signing_secret: str | None = os.getenv("SLACK_SIGNING_SECRET")
    slack_default_webhook_url: str | None = os.getenv("SLACK_DEFAULT_WEBHOOK_URL")

    # Shared secret for the daily-digest cron job. The cron sends this in
    # `X-Cron-Secret` so it can hit `/integrations/slack/digest/run` without
    # a JWT. Anyone hitting the endpoint without either a Clerk JWT or this
    # header gets 401 in prod. Dev keeps `LEASEOS_AUTH_REQUIRED=false` so
    # the bypass user works regardless.
    cron_secret: str | None = os.getenv("LEASEOS_CRON_SECRET")

    # Google
    google_client_id: str | None = os.getenv("GOOGLE_CLIENT_ID")
    google_client_secret: str | None = os.getenv("GOOGLE_CLIENT_SECRET")
    google_redirect_uri: str | None = os.getenv("GOOGLE_REDIRECT_URI")

    # Microsoft / Outlook
    ms_client_id: str | None = os.getenv("MS_CLIENT_ID")
    ms_client_secret: str | None = os.getenv("MS_CLIENT_SECRET")
    ms_redirect_uri: str | None = os.getenv("MS_REDIRECT_URI")
    ms_tenant_id: str = os.getenv("MS_TENANT_ID", "common")


@lru_cache
def get_settings() -> Settings:
    return Settings()
