"""Tests for the M-tier security hardening:

  * `crypto.encrypt_secret` / `decrypt_secret` round-trip + legacy plaintext fallback
  * `main._assert_safe_prod_config` rejects the obvious foot-guns
  * `security.serve_inside_sandbox` accepts data/documents and data/packs,
    rejects everything else
"""

from __future__ import annotations

import os
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from leaseos.api import crypto
from leaseos.api.crypto import ENC_PREFIX, decrypt_secret, encrypt_secret
from leaseos.api.main import _assert_safe_prod_config


class TestCrypto:
    def test_round_trip(self):
        crypto._fernet.cache_clear()
        plain = "https://hooks.slack.com/services/T123/B456/abcDEF"
        enc = encrypt_secret(plain)
        assert enc.startswith(ENC_PREFIX)
        assert plain not in enc  # the actual secret is not visible
        assert decrypt_secret(enc) == plain

    def test_legacy_plaintext_passes_through(self):
        # Pre-rollout rows that don't have the enc:v1: prefix are returned as-is.
        crypto._fernet.cache_clear()
        legacy = "https://hooks.slack.com/services/T123/B456/abcDEF"
        assert decrypt_secret(legacy) == legacy

    def test_empty_inputs(self):
        crypto._fernet.cache_clear()
        assert encrypt_secret("") == ""
        assert decrypt_secret(None) is None
        assert decrypt_secret("") == ""

    def test_corrupt_token_raises(self):
        crypto._fernet.cache_clear()
        with pytest.raises(RuntimeError):
            decrypt_secret(f"{ENC_PREFIX}not-a-real-fernet-token")


class TestProdCorsAssertion:
    def _settings(self, env: str, origins: list[str]):
        return SimpleNamespace(environment=env, cors_origins=origins)

    def test_dev_is_never_blocked(self):
        # In dev anything goes, including localhost and wildcards.
        _assert_safe_prod_config(self._settings("dev", ["*"]))
        _assert_safe_prod_config(self._settings("dev", []))
        _assert_safe_prod_config(self._settings("dev", ["http://localhost:3000"]))

    def test_prod_rejects_empty(self):
        with pytest.raises(RuntimeError, match="empty"):
            _assert_safe_prod_config(self._settings("prod", []))

    def test_prod_rejects_wildcard(self):
        with pytest.raises(RuntimeError, match="\\*"):
            _assert_safe_prod_config(self._settings("prod", ["*"]))

    def test_prod_rejects_localhost(self):
        with pytest.raises(RuntimeError, match="localhost"):
            _assert_safe_prod_config(
                self._settings("prod", ["https://app.example.com", "http://localhost:3000"])
            )

    def test_prod_rejects_plain_http(self):
        with pytest.raises(RuntimeError, match="http"):
            _assert_safe_prod_config(self._settings("prod", ["http://app.example.com"]))

    def test_prod_accepts_clean_https_origins(self):
        _assert_safe_prod_config(
            self._settings("prod", ["https://app.example.com", "https://www.example.com"])
        )


class TestSandbox:
    def test_rejects_path_outside_sandbox(self, tmp_path, monkeypatch):
        from leaseos.api import security
        # Point storage_dir at tmp_path so we know what's inside vs outside.
        from leaseos.api.config import get_settings

        settings = get_settings()
        monkeypatch.setattr(settings, "storage_dir", tmp_path)

        # /etc/passwd is famously not under our storage dir.
        with pytest.raises(HTTPException) as exc:
            security.serve_inside_sandbox(
                Path("/etc/passwd"), media_type="text/plain", filename="passwd"
            )
        assert exc.value.status_code == 403

    def test_accepts_documents_and_packs(self, tmp_path, monkeypatch):
        from leaseos.api import security
        from leaseos.api.config import get_settings

        settings = get_settings()
        documents = tmp_path / "documents"
        packs = tmp_path / "packs"
        documents.mkdir()
        packs.mkdir()
        monkeypatch.setattr(settings, "storage_dir", documents)

        doc_file = documents / "lease.pdf"
        doc_file.write_bytes(b"%PDF-1.4 test")
        pack_file = packs / "memo.docx"
        pack_file.write_bytes(b"PK test")

        # Both should resolve cleanly and return a FileResponse.
        r1 = security.serve_inside_sandbox(doc_file, media_type="application/pdf", filename="lease.pdf")
        r2 = security.serve_inside_sandbox(pack_file, media_type="application/octet-stream", filename="memo.docx")
        assert r1.status_code == 200
        assert r2.status_code == 200
