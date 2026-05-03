"""Cron-friendly script to fire the /packs/auto-trigger endpoint.

Designed to run from a scheduled job (Render cron, GitHub Actions, local
launchd, etc.). Calls the API over HTTP rather than touching the DB directly
so the same code path runs whether triggered by the cron, the UI button, or a
manual smoke test.

Env vars:
  LEASEOS_API_URL         e.g. https://leaseos-api.onrender.com
  LEASEOS_TRIGGER_DAYS    optional, default 90
  LEASEOS_API_TOKEN       optional bearer token (only needed once auth is on)

Run:  .venv/bin/python scripts/trigger_pending_packs.py
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request


def main() -> int:
    api_url = os.environ.get("LEASEOS_API_URL", "http://127.0.0.1:8000").rstrip("/")
    days = int(os.environ.get("LEASEOS_TRIGGER_DAYS", "90"))
    token = os.environ.get("LEASEOS_API_TOKEN")

    url = f"{api_url}/packs/auto-trigger?days_ahead={days}"
    req = urllib.request.Request(url, method="POST")
    if token:
        req.add_header("Authorization", f"Bearer {token}")

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code}: {e.read().decode('utf-8', errors='replace')}", file=sys.stderr)
        return 1
    except urllib.error.URLError as e:
        print(f"URL error: {e.reason}", file=sys.stderr)
        return 2

    triggered = payload.get("triggered", 0)
    seen = payload.get("candidates_seen", 0)
    print(
        f"auto-trigger ok: {triggered} pack(s) queued, "
        f"{seen} event(s) seen in next {days}d horizon"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
