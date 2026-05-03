# Deploying LeaseOS

Two deployments — the Python API on **Render** (web service + Postgres + nightly cron), and the Next.js UI on **Vercel**. Plus three external accounts for auth + integrations: **Clerk**, **Google Cloud**, **Microsoft Entra**.

End-to-end this is ~60–90 minutes the first time. Subsequent deploys are git push.

---

## 0. Prerequisites

- A GitHub repo containing this project (push `~/Desktop/leaseos` to a private repo)
- Accounts: [Render](https://render.com), [Vercel](https://vercel.com), [Clerk](https://dashboard.clerk.com), [Google Cloud Console](https://console.cloud.google.com), [Microsoft Entra](https://entra.microsoft.com), [Slack](https://api.slack.com) (optional)
- Your Anthropic API key

---

## 1. Push to GitHub

```bash
cd ~/Desktop/leaseos
git init && git add . && git commit -m "Initial commit"
gh repo create leaseos --private --source=. --push   # or do it via the GitHub UI
```

---

## 2. Clerk — Auth

1. Go to https://dashboard.clerk.com → **Create application** → name "LeaseOS"
2. Sign-in methods: enable Email + Google (or whatever the firm uses)
3. Copy the two keys from **API Keys** — you'll paste them into Vercel and Render below:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (`pk_test_…` or `pk_live_…`)
   - `CLERK_SECRET_KEY` (`sk_test_…`)
4. Note the JWKS URL and issuer from **API Keys → Show JWT Public Key URL**:
   - `CLERK_JWKS_URL` (e.g. `https://wholesome-cat-42.clerk.accounts.dev/.well-known/jwks.json`)
   - `CLERK_ISSUER` (the same domain without the path, e.g. `https://wholesome-cat-42.clerk.accounts.dev`)

---

## 3. API on Render

1. Render dashboard → **New** → **Blueprint** → connect your GitHub repo
2. Render reads `render.yaml` and provisions:
   - `leaseos-db` (Postgres 16)
   - `leaseos-api` (Docker web service)
   - `leaseos-slack-digest` (daily cron)
3. After provisioning, set these environment variables in the **leaseos-api** service:

   | Variable | Value |
   |---|---|
   | `ANTHROPIC_API_KEY` | from console.anthropic.com |
   | `CLERK_JWKS_URL` | from Clerk (step 2) |
   | `CLERK_ISSUER` | from Clerk (step 2) |
   | `LEASEOS_CORS_ORIGINS` | `https://YOUR-VERCEL-URL.vercel.app` (fill in after step 4) |
   | `GOOGLE_CLIENT_ID` | from Google Cloud (step 5) |
   | `GOOGLE_CLIENT_SECRET` | from Google Cloud (step 5) |
   | `GOOGLE_REDIRECT_URI` | `https://leaseos-api.onrender.com/integrations/google/callback` |
   | `MS_CLIENT_ID` | from Microsoft Entra (step 6) |
   | `MS_CLIENT_SECRET` | from Microsoft Entra (step 6) |
   | `MS_REDIRECT_URI` | `https://leaseos-api.onrender.com/integrations/microsoft/callback` |
   | `SLACK_DEFAULT_WEBHOOK_URL` | (optional) firm-wide fallback webhook |

4. The container's CMD runs `alembic upgrade head` before starting uvicorn — schema is applied (or upgraded) on every boot. The very first deploy applies the baseline + drift-cleanup migrations automatically.
5. Once live, hit `https://leaseos-api.onrender.com/health` — should return `{"ok": true}`.
6. Set the cron's `LEASEOS_API_URL` to your Render API URL.

> **Schema changes after deploy**: edit a model, run `scripts/db.sh new "what changed"` locally to autogenerate a migration, review it, commit, push. Render will `alembic upgrade head` on the next deploy.

---

## 4. UI on Vercel

1. Vercel dashboard → **Add New** → **Project** → import the same GitHub repo
2. Set the **Root Directory** to `web`
3. Environment variables:

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | `https://leaseos-api.onrender.com` |
   | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | from Clerk |
   | `CLERK_SECRET_KEY` | from Clerk |

4. Deploy. Take the resulting URL (e.g. `https://leaseos-claridges.vercel.app`) and:
   - Paste it into `LEASEOS_CORS_ORIGINS` on Render (step 3) — redeploy the API.
   - Add it to **Allowed origins** in Clerk → **Domains**.

---

## 5. Google Calendar OAuth

1. Google Cloud Console → **Create project** "LeaseOS"
2. **APIs & Services → Library** → enable **Google Calendar API**
3. **OAuth consent screen** → External, scopes: `openid`, `email`, `https://www.googleapis.com/auth/calendar.events`
4. **Credentials** → **Create Credentials → OAuth client ID** → Web application
   - Authorized redirect URI: `https://leaseos-api.onrender.com/integrations/google/callback`
5. Copy the client ID and secret into Render env vars (step 3).

---

## 6. Microsoft / Outlook OAuth

1. https://entra.microsoft.com → **Applications → App registrations → New registration**
   - Name: LeaseOS
   - Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**
   - Redirect URI: `https://leaseos-api.onrender.com/integrations/microsoft/callback` (Web)
2. **Certificates & secrets → New client secret** → copy the value (it's only shown once)
3. **API permissions → Add permission** → Microsoft Graph → Delegated:
   - `Calendars.ReadWrite`
   - `User.Read`
   - `offline_access`
4. Copy Application (client) ID and the secret into Render env vars (step 3).

---

## 7. Slack (optional, can do after launch)

For each firm/user that wants Slack digests:
1. Slack workspace → **Apps → Incoming Webhooks → Add to a channel**
2. Copy the webhook URL
3. In LeaseOS UI → **Integrations → Slack** → paste webhook
4. Or set `SLACK_DEFAULT_WEBHOOK_URL` on Render for a firm-wide default

---

## 8. Smoke test

1. Open the Vercel URL → sign in via Clerk
2. **Leases → Upload lease PDF** → drop a real commercial lease
3. Wait ~1–3 min for the extraction to finish (status changes from "extracting" → "ready_for_review")
4. Open the lease → split-screen reviewer with PDF + extracted fields appears → click any field → PDF jumps to source page
5. **Approve lease** → check **Calendar** for the derived events
6. **Integrations → Connect Google** → after redirect-back, push an event from the calendar to your Google Calendar

---

## Updating

Push to `main` → Render and Vercel both auto-deploy. The Postgres data persists across deploys (it's a separate Render service).

## Costs (approximate)

- Render starter web + Postgres + cron: ~$7 + $7 + free = ~$14/month
- Vercel Hobby: free
- Clerk: free up to 10k MAU
- Anthropic: variable, ~£1.50/lease at steady state

Total to run the pilot: **~$15/month** + per-lease API spend.
