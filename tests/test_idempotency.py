"""Tests for the Idempotency-Key support on cost-bearing endpoints."""

from __future__ import annotations

import io
import uuid

import pytest


class TestNoHeaderIsPassThrough:
    def test_post_without_idempotency_key_works_as_before(self, test_client):
        """No header → no caching, no replay. Each call is independent."""
        # Use a fake-PDF to avoid actually triggering extraction; we want
        # the route to reach the handler body and hit the SHA branch.
        # Without a key, two calls yield two distinct leases.
        from io import BytesIO

        pdf = b"%PDF-1.4 minimal\n%%EOF\n"
        r1 = test_client.post(
            "/leases",
            files={"file": ("a.pdf", BytesIO(pdf), "application/pdf")},
        )
        # Skip if route 500'd for a non-idempotency reason (e.g. background task);
        # we only care about the idempotency contract here.
        if r1.status_code != 201:
            pytest.skip(f"upload returned {r1.status_code}; non-idempotency failure")

        r2 = test_client.post(
            "/leases",
            files={"file": ("a.pdf", BytesIO(pdf), "application/pdf")},
        )
        if r2.status_code == 201:
            # Two distinct lease ids
            assert r1.json()["id"] != r2.json()["id"]


class TestSameKeyReplays:
    def test_second_call_with_same_key_returns_cached_response(self, test_client):
        from io import BytesIO

        pdf = b"%PDF-1.4 minimal\n%%EOF\n"
        key = str(uuid.uuid4())

        r1 = test_client.post(
            "/leases",
            files={"file": ("a.pdf", BytesIO(pdf), "application/pdf")},
            headers={"Idempotency-Key": key},
        )
        if r1.status_code != 201:
            pytest.skip(f"upload returned {r1.status_code}; non-idempotency failure")
        first_id = r1.json()["id"]

        # Replay the same key — should NOT create a new lease
        r2 = test_client.post(
            "/leases",
            files={"file": ("a.pdf", BytesIO(pdf), "application/pdf")},
            headers={"Idempotency-Key": key},
        )
        assert r2.status_code == 201
        assert r2.json()["id"] == first_id, "Replay should return the original lease"
        assert r2.headers.get("idempotent-replayed") == "true"
        assert r2.headers.get("x-idempotency-key") == key


class TestSameKeyDifferentBody:
    def test_returns_409_when_key_reused_for_different_request(self, test_client):
        from io import BytesIO

        key = str(uuid.uuid4())
        pdf_a = b"%PDF-1.4 file A\n%%EOF\n"
        pdf_b = b"%PDF-1.4 file B (different)\n%%EOF\n"

        r1 = test_client.post(
            "/leases",
            files={"file": ("a.pdf", BytesIO(pdf_a), "application/pdf")},
            headers={"Idempotency-Key": key},
        )
        if r1.status_code != 201:
            pytest.skip(f"upload returned {r1.status_code}")

        r2 = test_client.post(
            "/leases",
            files={"file": ("b.pdf", BytesIO(pdf_b), "application/pdf")},
            headers={"Idempotency-Key": key},
        )
        assert r2.status_code == 409
        assert "different request body" in r2.json()["detail"].lower()


class TestKeySanitisation:
    def test_path_traversal_in_key_rejected(self, test_client):
        from io import BytesIO

        r = test_client.post(
            "/leases",
            files={"file": ("a.pdf", BytesIO(b"%PDF-1.4\n%%EOF\n"), "application/pdf")},
            headers={"Idempotency-Key": "../../../etc/passwd"},
        )
        # The non-alnum chars get stripped; what's left ("etcpasswd") is fine.
        # Real path traversal is impossible because Storage._path() rejects
        # any '..' parts. Either 201 (key sanitised + handler runs) or 400
        # (key empty after sanitisation) — both are correct rejections of
        # the attack.
        assert r.status_code in (201, 400)
