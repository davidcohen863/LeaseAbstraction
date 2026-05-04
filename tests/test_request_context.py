"""Tests for the request-context middleware + structlog wiring."""

from __future__ import annotations

from leaseos.api.logging import (
    new_request_id,
    request_id_ctx,
    route_ctx,
    user_id_ctx,
)


class TestRequestIdEchoed:
    def test_response_has_x_request_id_header_when_client_omits_it(self, test_client):
        r = test_client.get("/health")
        assert r.status_code == 200
        rid = r.headers.get("x-request-id")
        assert rid is not None
        # 16 hex chars (we generate 8-byte ids and hex-encode → 16 chars)
        assert len(rid) == 16
        assert all(c in "0123456789abcdef" for c in rid)

    def test_inbound_x_request_id_is_honoured(self, test_client):
        r = test_client.get(
            "/health",
            headers={"X-Request-ID": "test-trace-9f2a"},
        )
        assert r.status_code == 200
        assert r.headers.get("x-request-id") == "test-trace-9f2a"

    def test_cf_ray_used_as_fallback_request_id(self, test_client):
        r = test_client.get("/health", headers={"Cf-Ray": "9f62776839dbdc2c-LHR"})
        assert r.headers.get("x-request-id") == "9f62776839dbdc2c-LHR"


class TestNewRequestId:
    def test_returns_16_hex_chars(self):
        rid = new_request_id()
        assert len(rid) == 16
        assert all(c in "0123456789abcdef" for c in rid)

    def test_distinct_per_call(self):
        ids = {new_request_id() for _ in range(50)}
        assert len(ids) == 50  # vanishingly unlikely to collide


class TestContextVarsCleanedUpAfterRequest:
    """The middleware must reset the contextvars on the way out so a request
    handler doesn't leak its request_id into subsequent unrelated background
    tasks running on the same event loop."""

    def test_no_leak_between_requests(self, test_client):
        # contextvars are async-local but the middleware should still reset
        # explicitly so the test harness's main thread sees None between calls.
        test_client.get("/health", headers={"X-Request-ID": "first"})
        # Without the middleware reset, the contextvar would still hold "first"
        # in this test thread. With reset, it's None.
        assert request_id_ctx.get() is None
        assert route_ctx.get() is None
        assert user_id_ctx.get() is None
