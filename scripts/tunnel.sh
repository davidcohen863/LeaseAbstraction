#!/usr/bin/env bash
# Spin up two Cloudflare quick tunnels (no Cloudflare account needed) so the
# locally-running LeaseOS dev stack is reachable from anywhere — for a
# 30-minute demo to Claridges, or to send a peer firm a link.
#
# What this does:
#   1. Starts a quick tunnel for the API on :8000 → https://*.trycloudflare.com
#   2. Starts a quick tunnel for the Next dev server on :3002 → https://*.trycloudflare.com
#   3. Patches LEASEOS_CORS_ORIGINS (./.env) and NEXT_PUBLIC_API_URL (./web/.env.local)
#      to use those tunnel URLs.
#   4. Restarts uvicorn + next dev so the env changes take effect.
#   5. Prints the public URL to share.
#
# Prereqs:
#   - cloudflared installed (`brew install cloudflared`)
#   - The dev stack running already, OR none of it running (we'll start it)
#   - .env + web/.env.local exist with the usual keys
#
# Usage:
#   scripts/tunnel.sh           # spin up
#   scripts/tunnel.sh stop      # tear down everything (tunnels + dev servers)
#
# Caveats (read before sharing the URL):
#   - Quick tunnels are ephemeral — restart this script and the URL changes.
#     For a multi-day demo, set up a named tunnel via the Cloudflare dashboard.
#   - Clerk: the sign-in page works from any origin with a pk_test_ key, but
#     for production keys you'd add the tunnel hostname to Clerk Dashboard →
#     Domains.
#   - Google / Outlook OAuth: the redirect URIs in Google Cloud Console and
#     Microsoft Entra still point at localhost. Either update them to the
#     tunnel URL for the duration of the demo, or skip those integrations.
#     Slack webhooks work fine because they're outbound only.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

API_LOG=/tmp/leaseos-api-tunnel.log
WEB_LOG=/tmp/leaseos-web-tunnel.log
UVICORN_LOG=/tmp/leaseos-api.log
NEXT_LOG=/tmp/leaseos-next.log
PIDS_FILE=/tmp/leaseos-tunnel.pids

cmd="${1:-up}"

if [[ "$cmd" == "stop" ]]; then
  if [[ -f "$PIDS_FILE" ]]; then
    while read -r pid; do
      [[ -n "$pid" ]] && kill "$pid" 2>/dev/null || true
    done < "$PIDS_FILE"
    rm -f "$PIDS_FILE"
  fi
  pkill -f "cloudflared tunnel --url http://localhost:8000" 2>/dev/null || true
  pkill -f "cloudflared tunnel --url http://localhost:3002" 2>/dev/null || true
  pkill -f "uvicorn leaseos.api.main:app" 2>/dev/null || true
  pkill -f "next dev" 2>/dev/null || true
  echo "Stopped tunnels and dev servers."
  exit 0
fi

command -v cloudflared >/dev/null || {
  echo "cloudflared not found. Install with: brew install cloudflared" >&2
  exit 1
}

# Kill anything stale so we get a clean run
pkill -f "cloudflared tunnel --url http://localhost:8000" 2>/dev/null || true
pkill -f "cloudflared tunnel --url http://localhost:3002" 2>/dev/null || true
sleep 1

echo "→ starting API tunnel (localhost:8000)..."
cloudflared tunnel --url http://localhost:8000 --no-autoupdate > "$API_LOG" 2>&1 &
API_TUNNEL_PID=$!

echo "→ starting frontend tunnel (localhost:3002)..."
cloudflared tunnel --url http://localhost:3002 --no-autoupdate > "$WEB_LOG" 2>&1 &
WEB_TUNNEL_PID=$!

# Cloudflared prints the URL within ~10s. Wait + parse.
extract_url() {
  local log="$1"
  local i=0
  while (( i < 30 )); do
    local url
    url=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$log" 2>/dev/null | head -1 || true)
    if [[ -n "$url" ]]; then
      echo "$url"
      return 0
    fi
    sleep 1
    i=$((i + 1))
  done
  echo ""
  return 1
}

API_URL="$(extract_url "$API_LOG")"
WEB_URL="$(extract_url "$WEB_LOG")"

if [[ -z "$API_URL" || -z "$WEB_URL" ]]; then
  echo "Failed to extract tunnel URL within 30s. Logs:"
  echo "  $API_LOG"
  echo "  $WEB_LOG"
  exit 1
fi

echo "  API:      $API_URL"
echo "  Frontend: $WEB_URL"

# Patch .env + web/.env.local in-place. Keep a backup so we can revert.
patch_env() {
  local file="$1" key="$2" value="$3"
  cp "$file" "$file.tunnel-backup"
  if grep -qE "^${key}=" "$file"; then
    # macOS sed needs the empty -i ''
    sed -i.bak -E "s|^${key}=.*|${key}=${value}|" "$file"
    rm -f "$file.bak"
  else
    printf '\n%s=%s\n' "$key" "$value" >> "$file"
  fi
}

# Append the frontend tunnel URL to CORS without losing the localhost entries
echo "→ patching .env LEASEOS_CORS_ORIGINS..."
current_origins="$(grep -E '^LEASEOS_CORS_ORIGINS=' .env 2>/dev/null | cut -d= -f2- || echo '')"
if [[ -n "$current_origins" ]] && ! [[ "$current_origins" == *"$WEB_URL"* ]]; then
  patch_env .env LEASEOS_CORS_ORIGINS "${current_origins},${WEB_URL}"
elif [[ -z "$current_origins" ]]; then
  patch_env .env LEASEOS_CORS_ORIGINS "http://localhost:3002,${WEB_URL}"
fi

echo "→ patching web/.env.local NEXT_PUBLIC_API_URL..."
patch_env web/.env.local NEXT_PUBLIC_API_URL "$API_URL"

# Restart dev servers so the env changes are picked up
echo "→ restarting uvicorn + next dev..."
pkill -f "uvicorn leaseos.api.main:app" 2>/dev/null || true
pkill -f "next dev" 2>/dev/null || true
sleep 2

.venv/bin/uvicorn leaseos.api.main:app --host 127.0.0.1 --port 8000 --reload --log-level warning > "$UVICORN_LOG" 2>&1 &
API_PID=$!
( cd web && npm run dev > "$NEXT_LOG" 2>&1 ) &
NEXT_PID=$!

echo "$API_TUNNEL_PID"  > "$PIDS_FILE"
echo "$WEB_TUNNEL_PID" >> "$PIDS_FILE"
echo "$API_PID"        >> "$PIDS_FILE"
echo "$NEXT_PID"       >> "$PIDS_FILE"

# Give Next + uvicorn a moment to bind, then verify
sleep 8

echo
echo "=================================================================="
echo "  LeaseOS is reachable at:"
echo
echo "    $WEB_URL"
echo
echo "  (API: $API_URL)"
echo "=================================================================="
echo
echo "Smoke test (expect 307 → Clerk sign-in):"
curl -sS -m 10 -o /dev/null -w "  $WEB_URL/today  → %{http_code}\n" "$WEB_URL/today" || true
curl -sS -m 10 -o /dev/null -w "  $API_URL/health → %{http_code}\n" "$API_URL/health" || true
echo
echo "Logs:"
echo "  API tunnel: tail -f $API_LOG"
echo "  Web tunnel: tail -f $WEB_LOG"
echo "  uvicorn:    tail -f $UVICORN_LOG"
echo "  next dev:   tail -f $NEXT_LOG"
echo
echo "Tear down: scripts/tunnel.sh stop"
echo "(.env + web/.env.local backed up to *.tunnel-backup; restore manually if needed)"
