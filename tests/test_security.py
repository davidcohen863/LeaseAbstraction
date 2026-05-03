"""Security regression tests for the upload + download path."""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from leaseos.api.routes.leases import _safe_filename


class TestSafeFilename:
    def test_passes_through_normal_pdf(self):
        assert _safe_filename("Olive_and_Vine_lease_2022.pdf") == "Olive_and_Vine_lease_2022.pdf"

    def test_strips_directory_components(self):
        assert _safe_filename("../../etc/passwd") == "passwd"
        assert _safe_filename("/var/log/secret.pdf") == "secret.pdf"
        assert _safe_filename("foo/bar/baz.pdf") == "baz.pdf"

    def test_strips_dangerous_chars(self):
        # Spaces and most punctuation get replaced with _
        out = _safe_filename("contains: spaces & symbols.pdf")
        assert "/" not in out
        assert ":" not in out
        assert "&" not in out
        # The pdf extension is preserved
        assert out.endswith(".pdf")

    def test_rejects_null_byte(self):
        with pytest.raises(HTTPException) as exc:
            _safe_filename("evil\x00.pdf")
        assert exc.value.status_code == 400

    def test_rejects_empty(self):
        with pytest.raises(HTTPException):
            _safe_filename("")
        with pytest.raises(HTTPException):
            _safe_filename(None)

    def test_rejects_only_special_chars(self):
        # After stripping, there should be at least one valid char left
        with pytest.raises(HTTPException):
            _safe_filename("..")

    def test_caps_length(self):
        very_long = "a" * 500 + ".pdf"
        out = _safe_filename(very_long)
        assert len(out) <= 200
