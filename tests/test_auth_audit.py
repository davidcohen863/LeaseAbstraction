"""Auth-enforcement audit + cron_or_user behaviour.

Lives outside the route-by-route test files so a future endpoint can't
quietly land without the auth dependency. The audit walks every registered
route at runtime and asserts that mutating endpoints either go through
`current_user` / `cron_or_user` or are explicitly listed as public.
"""

from __future__ import annotations

import inspect
import pytest

# Routes that are intentionally public — they MUST be listed here, otherwise
# the audit fails. Anything new added that isn't on this list and doesn't
# have an auth dep gets caught immediately.
INTENTIONALLY_PUBLIC = {
    # Health / readiness — orchestrators don't carry JWTs
    ("GET", "/healthz"),
    ("GET", "/health"),
    ("GET", "/readyz"),
    # OAuth callbacks — the code/state pair IS the auth (user is mid-sign-in)
    ("GET", "/integrations/google/callback"),
    ("GET", "/integrations/microsoft/callback"),
    # Static HTML helper page — no data, no actions
    ("GET", "/integrations/slack"),
    # Auto-generated FastAPI documentation
    ("GET", "/docs"),
    ("GET", "/openapi.json"),
    ("GET", "/redoc"),
    ("GET", "/docs/oauth2-redirect"),
}


def _route_method_paths(app) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    for route in app.routes:
        path = getattr(route, "path", None)
        methods = getattr(route, "methods", None) or set()
        if path is None or not methods:
            continue
        for m in methods:
            if m == "HEAD":
                continue  # auto-paired with GET
            out.append((m, path))
    return out


def _signature_uses_auth(endpoint) -> bool:
    """True if the endpoint's signature has any param defaulted to a Depends
    on `current_user` or `cron_or_user`. Walks default values and unwraps
    Depends() instances."""
    from fastapi import Depends as DependsClass  # local import to avoid surprise
    from fastapi.params import Depends as DependsParam

    try:
        sig = inspect.signature(endpoint)
    except (TypeError, ValueError):
        return False

    for p in sig.parameters.values():
        default = p.default
        if isinstance(default, DependsParam):
            dep_callable = default.dependency
            if dep_callable is None:
                continue
            name = getattr(dep_callable, "__name__", "")
            if name in {"current_user", "cron_or_user"}:
                return True
    return False


class TestAuthCoverage:
    def test_every_route_either_has_auth_or_is_listed_public(self, test_client):
        app = test_client.app
        offenders: list[tuple[str, str, str]] = []
        for method, path in _route_method_paths(app):
            if (method, path) in INTENTIONALLY_PUBLIC:
                continue
            # Find the endpoint callable for this method+path
            for route in app.routes:
                if getattr(route, "path", None) == path and method in (getattr(route, "methods", None) or set()):
                    if not _signature_uses_auth(route.endpoint):
                        offenders.append((method, path, route.endpoint.__name__))
                    break
        assert not offenders, (
            f"These routes lack a current_user / cron_or_user dependency and "
            f"are not in INTENTIONALLY_PUBLIC:\n  "
            + "\n  ".join(f"{m} {p}  →  {n}" for m, p, n in offenders)
            + "\n\nEither add `Depends(current_user)` to the handler or add the "
              "(method, path) to INTENTIONALLY_PUBLIC with a comment explaining why."
        )


class TestCronOrUser:
    """The /slack/digest/run endpoint should accept either a signed-in user
    or a valid cron secret. The dev bypass (LEASEOS_AUTH_REQUIRED=false in
    tests) means we always pass through; flip auth_required for these tests
    to exercise the real prod path."""

    def test_dev_bypass_lets_anything_through(self, test_client):
        # Conftest sets LEASEOS_AUTH_REQUIRED=false, so no auth needed.
        r = test_client.post("/integrations/slack/digest/run")
        # 200 (sent N digests) or any non-401 means auth passed — the digest
        # itself may send 0 because there's no integration in the test DB.
        assert r.status_code != 401

    def test_cron_secret_path_in_prod_mode(self, test_client, monkeypatch):
        from leaseos.api.config import get_settings

        settings = get_settings()
        monkeypatch.setattr(settings, "auth_required", True)
        monkeypatch.setattr(settings, "cron_secret", "test-cron-secret-9f2a")

        # No auth at all → 401
        r = test_client.post("/integrations/slack/digest/run")
        assert r.status_code == 401

        # Wrong secret → 401
        r = test_client.post(
            "/integrations/slack/digest/run",
            headers={"X-Cron-Secret": "wrong-secret"},
        )
        assert r.status_code == 401

        # Right secret → 200 (or non-401)
        r = test_client.post(
            "/integrations/slack/digest/run",
            headers={"X-Cron-Secret": "test-cron-secret-9f2a"},
        )
        assert r.status_code != 401, (
            f"Cron secret should authorise; got {r.status_code} {r.text}"
        )
