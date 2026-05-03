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


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
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
    return app


app = create_app()


def run() -> None:
    uvicorn.run("leaseos.api.main:app", host="0.0.0.0", port=8000, reload=True)


if __name__ == "__main__":
    run()
