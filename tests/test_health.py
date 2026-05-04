"""Tests for /healthz, /health (legacy alias), and /readyz."""

from __future__ import annotations

import os


class TestLiveness:
    def test_healthz_returns_200_with_ok_payload(self, test_client):
        r = test_client.get("/healthz")
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        assert body["service"] == "leaseos-api"
        assert "version" in body

    def test_legacy_health_alias_still_works(self, test_client):
        # Old DEPLOY.md and Render config reference /health; keep it working.
        r = test_client.get("/health")
        assert r.status_code == 200
        assert r.json()["ok"] is True

    def test_no_auth_required(self, test_client):
        # Orchestrators don't carry JWTs; healthz must be open.
        r = test_client.get("/healthz", headers={"Authorization": ""})
        assert r.status_code == 200


class TestReadiness:
    def test_returns_200_with_check_breakdown_when_all_ok(self, test_client):
        r = test_client.get("/readyz")
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        assert body["service"] == "leaseos-api"
        # Four named checks, in canonical order
        names = [c["name"] for c in body["checks"]]
        assert names == ["database", "storage", "anthropic_key", "secret_key"]
        # Each result has required fields
        for check in body["checks"]:
            assert check["status"] in {"ok", "degraded", "down", "skipped"}
            assert isinstance(check["elapsed_ms"], int)

    def test_dev_secret_key_is_skipped_not_failed(self, test_client):
        # Dev environment uses a derived per-machine key, so missing
        # LEASEOS_SECRET_KEY shouldn't fail readiness.
        r = test_client.get("/readyz")
        secret_check = next(c for c in r.json()["checks"] if c["name"] == "secret_key")
        # In conftest we set ANTHROPIC_API_KEY=test-key-not-used-in-pure-tests
        # so the explicit-key path is taken in tests; that's still "ok".
        assert secret_check["status"] in {"ok", "skipped"}

    def test_anthropic_key_check_inspects_shape(self, test_client, monkeypatch):
        # The key check is surface-only — won't actually call Anthropic — but
        # does flag obviously-wrong values.
        from leaseos.api.config import get_settings

        settings = get_settings()
        monkeypatch.setattr(settings, "anthropic_api_key", "")
        r = test_client.get("/readyz")
        body = r.json()
        # No key → readiness fails (503)
        assert r.status_code == 503
        assert body["ok"] is False
        anthropic_check = next(c for c in body["checks"] if c["name"] == "anthropic_key")
        assert anthropic_check["status"] == "down"

    def test_garbage_anthropic_key_is_degraded_not_down(self, test_client, monkeypatch):
        from leaseos.api.config import get_settings

        settings = get_settings()
        monkeypatch.setattr(settings, "anthropic_api_key", "not-a-real-key")
        r = test_client.get("/readyz")
        # degraded — readiness still returns 200 because the API can serve
        # most endpoints (only extraction breaks). This avoids cycling pods
        # for a misconfig that only affects one endpoint.
        assert r.status_code == 200
        anthropic_check = next(c for c in r.json()["checks"] if c["name"] == "anthropic_key")
        assert anthropic_check["status"] == "degraded"


class TestStorageProbe:
    def test_storage_probe_does_not_leak_into_listings(self, test_client, db_session):
        # The .healthz-probe key is written + read + deleted; verify no leftover.
        from leaseos.api.storage import get_storage

        # Trigger several readiness checks
        for _ in range(3):
            test_client.get("/readyz")

        storage = get_storage()
        keys = list(storage.iter_prefix(""))
        assert ".healthz-probe" not in keys
