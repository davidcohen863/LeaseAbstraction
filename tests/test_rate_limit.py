"""Tests for the rate limiter on cost-bearing endpoints.

The autouse `_disable_rate_limiting` fixture in conftest.py turns the limiter
off for every other test so cumulative calls across the suite don't trip 429.
This file flips it back on inside its own scope to verify the limit actually
fires.
"""

from __future__ import annotations

import io

import pytest


@pytest.fixture
def enabled_limiter():
    """Re-enable + reset the limiter for tests that need to hit the 429 path."""
    from leaseos.api.rate_limit import limiter

    limiter.enabled = True
    limiter.reset()  # clears in-memory storage so we start at 0/limit
    yield limiter
    limiter.enabled = False
    limiter.reset()


class TestUploadLimit:
    def test_upload_lease_limit_fires_at_11th_request(self, test_client, enabled_limiter):
        """`@limiter.limit("10/minute")` on POST /leases — 11th call should 429.

        We use a non-PDF filename so the route returns 400 immediately
        (before scheduling a background extraction). The limiter STILL counts
        each call because slowapi increments BEFORE the route body runs.
        This tests the limit cleanly without needing a working extraction
        background task.
        """
        # First 10 calls go through the limiter, then 400 in the route body
        for i in range(10):
            r = test_client.post(
                "/leases",
                files={"file": (f"file{i}.txt", b"not a pdf")},
                data={"label": f"limit test {i}"},
            )
            assert r.status_code == 400, f"call {i+1} unexpected status: {r.status_code} {r.text}"

        # 11th call hits the limiter — 429 BEFORE the route body runs
        r = test_client.post(
            "/leases",
            files={"file": ("over_limit.txt", b"not a pdf")},
            data={"label": "should be rate limited"},
        )
        assert r.status_code == 429
        body = r.json()
        assert "rate limit exceeded" in body["detail"].lower()
        assert body["retry_after_seconds"] == 60
        assert r.headers.get("retry-after") == "60"


class TestDisabledLimiterIsHonest:
    """Sanity check that the autouse fixture in conftest.py actually disables
    the limiter — otherwise all the OTHER tests in the suite would mysteriously
    fail once they exceeded the per-route quotas."""

    def test_can_post_many_times_when_disabled(self, test_client):
        # The autouse fixture has limiter.enabled = False here.
        for i in range(15):  # comfortably above the 10/min cap
            r = test_client.post(
                "/leases",
                files={"file": (f"x{i}.txt", b"not a pdf")},
            )
            # 400 from the file-type check is fine — the point is no 429
            assert r.status_code != 429, f"call {i+1} should not be rate-limited"
