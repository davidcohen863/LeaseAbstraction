"""FastAPI app entry point.

Local dev:
    leaseos-api          # starts uvicorn on 0.0.0.0:8000
or:
    uvicorn leaseos.api.main:app --reload
"""

from __future__ import annotations

from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .db import init_db
from .routes import comparables as comparables_routes
from .routes import events as events_routes
from .routes import integrations as integrations_routes
from .routes import leases as leases_routes
from .routes import packs as packs_routes
from .routes import properties as properties_routes


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


def _assert_safe_prod_config(settings) -> None:
    """Fail fast on a misconfigured prod boot.

    Catches the two foot-guns that have actually shipped before:
      1. CORS wide open (`allow_origins=["*"]`) with `allow_credentials=True`
         — browsers reject this combo, so requests silently fail.
      2. CORS pointed at localhost in prod — works in dev, useless in prod.

    Run only when `LEASEOS_ENV=prod` (or Render's `RENDER` env var is set) so
    local development is never blocked.
    """
    if settings.environment != "prod":
        return
    origins = settings.cors_origins or []
    if not origins:
        raise RuntimeError(
            "Prod boot refused: LEASEOS_CORS_ORIGINS is empty. Set it to the "
            "frontend's full https URL."
        )
    if "*" in origins:
        raise RuntimeError(
            "Prod boot refused: LEASEOS_CORS_ORIGINS contains '*'. "
            "Wildcard CORS is incompatible with allow_credentials=True; "
            "set explicit https origins."
        )
    bad = [o for o in origins if "localhost" in o or "127.0.0.1" in o]
    if bad:
        raise RuntimeError(
            f"Prod boot refused: LEASEOS_CORS_ORIGINS contains localhost/loopback "
            f"entries {bad!r}. These have no effect in prod and signal a misconfig."
        )
    insecure = [o for o in origins if o.startswith("http://")]
    if insecure:
        raise RuntimeError(
            f"Prod boot refused: LEASEOS_CORS_ORIGINS contains plain-http entries "
            f"{insecure!r}. Production must be https-only."
        )


def create_app() -> FastAPI:
    settings = get_settings()
    _assert_safe_prod_config(settings)
    app = FastAPI(title="LeaseOS API", version="0.2.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health", tags=["meta"])
    def health() -> dict:
        return {"ok": True, "service": "leaseos-api", "version": "0.2.0"}

    app.include_router(leases_routes.router)
    app.include_router(events_routes.router)
    app.include_router(integrations_routes.router)
    app.include_router(comparables_routes.router)
    app.include_router(packs_routes.router)
    app.include_router(properties_routes.router)
    return app


app = create_app()


def run() -> None:
    uvicorn.run("leaseos.api.main:app", host="0.0.0.0", port=8000, reload=True)


if __name__ == "__main__":
    run()
