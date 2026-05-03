# LeaseOS — Demo runbook

Open this 10 minutes before a Claridges demo. Two parts:

1. **Pre-flight** — make sure the laptop, the tunnels, and the data are in a good state
2. **The walk-through** — what to click, in what order, with the patter

---

## 1. Pre-flight (T-10 min)

### 1a. Get the public URL

```bash
cd ~/Desktop/leaseos
scripts/tunnel.sh
```

This:

- spins up two Cloudflare quick tunnels (no Cloudflare account required)
- patches `.env` (CORS) and `web/.env.local` (NEXT_PUBLIC_API_URL) with the new URLs
- restarts uvicorn + `next dev`
- prints the public URL — looks like `https://lamb-promised-mesa-impaired.trycloudflare.com`

Send that URL to the attendees. Keep this terminal open for the duration of the demo.

When the demo's over: `scripts/tunnel.sh stop`.

### 1b. Confirm the seeded demo data is present

```bash
ls -la data/leaseos.db                # should exist, > 100 KB
.venv/bin/python -c "
from leaseos.api.db import SessionLocal
from leaseos.api.models import Lease, Comparable, Property
db = SessionLocal()
print(f'Properties: {db.query(Property).count()}')
print(f'Leases:     {db.query(Lease).count()}')
print(f'Comparables:{db.query(Comparable).count()}')
"
```

You want at minimum:

- 1 Property (Olive & Vine)
- 1 Lease, status `approved` (so the reviewer + the calendar + critical-dates banner have something to show)
- 5 Comparables (the seeded N8 retail rents)

If any of those are zero or low, reseed:

```bash
.venv/bin/python scripts/generate_demo_lease.py    # creates the Olive & Vine PDF + uploads it
.venv/bin/python scripts/seed_n8_comparables.py    # 5 N8 retail comps
```

The generate-demo step takes ~90 seconds (real Claude extraction). Do this *before* the demo, not during.

### 1c. Pre-generate one rent-review pack

So you can demo "click → see a finished pack" without waiting 60 seconds in front of the audience:

```bash
.venv/bin/python scripts/trigger_pending_packs.py    # idempotent — only generates packs that don't exist
```

Browse to `/reviews` after this completes — you should see a card in the **Draft** column.

### 1d. Sign in once on the demo URL

Open the public URL in your browser, sign in via Clerk so the session cookie is fresh. (Clerk redirects unauthenticated traffic to the sign-in page, which is fine in a demo but adds friction if you do it live.)

---

## 2. The walk-through (~12 minutes)

### Scene 1 — Today (60 sec)

Land on `/today`. Point at:

- KPI cards along the top — leases, upcoming events, packs due
- "Action this week" — Sarah's morning glance, all the chasing she'd otherwise do
- Activity feed underneath — every change in the workspace, nothing slips

> "This is what Sarah opens at 9 AM on Monday. The whole point is she shouldn't have to cross-reference a spreadsheet to know what's on fire."

### Scene 2 — Lease abstraction (4 min)

Click **Leases** → open the Olive & Vine lease.

Show the three-column reviewer:

- Left: original PDF (drag the page jump in the toolbar to show citations work)
- Middle: extracted fields, grouped by section (Premises, Parties, Term & rent…)
- Right: status, critical dates, side-letters, activity

Click any field → PDF jumps to the source page.

> "We don't ask the model to mark its own homework. Each field is extracted twice — once by a neutral pass, once by a sceptical-senior-surveyor pass. Disagreements get flagged in amber."

Click the **flagged** chip in the header → press **j** / **k** on the keyboard to step through every flagged field. Press **?** to show the cheat sheet.

> "Sarah only reviews the things the model isn't sure about. On a clean lease that's 3 minutes; on a messy scan it's 15."

If a field is wrong, double-click to edit. Show the audit panel updating in real time.

### Scene 3 — Calendar (90 sec)

Click **Calendar** → switch between Month and List views.

Show:

- Coloured event types
- Critical dates (review triggers, break notices, expiries) in red/amber
- Click an event → drawer opens with "Generate pack" / "Push to Google Calendar"

> "Every lease in your portfolio, every key date, on one screen. Today this lives in Excel diaries — the question is whether Sarah remembered to copy the dates over."

### Scene 4 — Reviews kanban (90 sec)

Click **Reviews**.

Four columns: **Pack pending → Draft → Sent → Settled**.

The card from §1c is sitting in **Draft**. Click it.

### Scene 5 — Rent-review pack (3 min)

The pack detail page — Word-style preview, four documents:

- **Landlord memo** — current rent, recommended opening, settlement range, rationale
- **Comparables schedule** — table ranked by similarity (the 5 N8 comps, plus any settled reviews on file)
- **ITZA analysis** — £/sq ft commentary
- **Trigger letter** — addressed to the tenant, citing the exact review clause

The recommended opening / settlement numbers are **inline-editable** — change one to show it persists.

Hit **Download** on the trigger letter — opens in Word.

> "The model produces a starting point — Sarah edits the numbers, exports the .docx, sends it. What used to be 6–10 hours of comparables hunting + drafting is 45 minutes of editing."

If they ask "where do those comparables come from?": the bottom-right drawer on the pack page lists the rows used + their settlement context. Click through to a settled comp to see the round-trip.

### Scene 6 — Settings + Audit (60 sec)

Click **Settings** in the sidebar → click through Profile / Firm / Integrations / Audit.

> "Slack digest, Google + Outlook calendar push are all wired. Audit log is read-only — every reviewer edit, every approval, with deep-links."

### Scene 7 — Q&A

Likely asks + the honest answers:

- **"Can it ingest from email?"** — Yes for v1.5: forward to a `@leaseos.app` inbox; in v1 it's drag-and-drop.
- **"What about scanned leases?"** — PyMuPDF handles native + OCR scans. Quality drops on photos of paper — Sarah reviews more flagged fields, the workflow still holds.
- **"How accurate is it?"** — Two-pass extraction with disagreement flagging is calibrated, not self-reported. Real number on a 50-lease eval against Claridges' real leases is the next milestone (NDA-blocked until they share).
- **"What about side-letters and variations?"** — Attach to the parent lease, gets its own AI summary in the right rail. Full overlay-onto-record merge is a v2 follow-up.
- **"Pricing?"** — £400/seat/month per the original deck; ~£1.50/lease in API costs at steady state. Demo runs on ~$15/month of Render + Vercel.

---

## What's deliberately *not* in the demo

These are real but not yet pilot-ready, so don't promise them:

- Bbox highlighting on citation click (needs bbox in extraction, scheduled)
- Per-firm Word .docx template upload (Templates page is a placeholder)
- Multi-user / Members (single-tenant during pilot)
- Real-time notifications (the bell is a stub)
- Comparables map (no lat/lng yet)

---

## Tear-down (after the demo)

```bash
scripts/tunnel.sh stop
```

This kills both tunnels and both dev servers. The `.tunnel-backup` files left next to `.env` and `web/.env.local` are the pre-tunnel originals — restore by hand if you want the localhost URLs back, or just edit them inline.

---

## Troubleshooting

- **Tunnel URL doesn't load** — quick tunnels can take ~10s to be globally reachable. Wait, then refresh.
- **CORS errors in the browser console** — `scripts/tunnel.sh` should have patched `.env`, but double-check the frontend tunnel hostname is in `LEASEOS_CORS_ORIGINS` and that uvicorn was actually restarted (env changes require restart, not just file edit).
- **Clerk redirects in a loop** — your demo URL hostname changed since you last signed in. Open an incognito tab.
- **PDF viewer crashes with version mismatch** — `cd web && npm run sync-pdf-worker`. (`postinstall` should handle this, but if you skipped install steps it can drift.)
- **Tunnels keep dropping** — quick tunnels are best-effort. For a multi-day demo, set up a named tunnel via the Cloudflare dashboard and update this runbook.
