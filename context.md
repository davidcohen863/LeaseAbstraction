# LeaseOS — Project Context

**One document containing everything needed to onboard a new collaborator (or remind yourself in 6 months) about why this project exists, what it does, what's been built, and what's next.**

- Last updated: 2026-05-03 (after Cloudflare Tunnel runbook + scripts/tunnel.sh — pilot-ready public URL in one command)
- Repo: https://github.com/davidcohen863/LeaseAbstraction
- Working name: **LeaseOS**
- Pilot customer: **Claridges Commercial** (claridges-commercial.co.uk)
- Status: **v0.8 working locally — UX P1 milestone complete.** Extraction + reviewer (3-col + collapsible sections + PDF controls) + calendar (month grid + list) + reviews kanban + pack generator (Word-style preview + inline edit) + sidebar/Today shell + Properties first-class + leases list with filters/sort/group/bulk + comparables with stats/CSV import. Pre-deploy.

> **Companion docs (single index):** **[`PRD.md`](./PRD.md)** for status of every milestone; **[`UX_PLAN.md`](./UX_PLAN.md)** for the UI/UX redesign roadmap; **[`CODE_REVIEW.md`](./CODE_REVIEW.md)** for the security + correctness audit; **[`README.md`](./README.md)** to run locally; **[`DEPLOY.md`](./DEPLOY.md)** to ship to Render + Vercel; **[`DEMO.md`](./DEMO.md)** for the Cloudflare Tunnel + Claridges demo runbook.

---

## 1. Origin & brief

I was brought on as a forward-deployed engineer to find inefficiencies and AI/automation opportunities at **Claridges Commercial** — a London/Essex-based commercial property agency (est. 1983, RICS-member) handling sales, lettings, lease advisory, valuations, professional services (dilapidations, surveys, EPCs) and property management across retail, office, industrial and F1/F2 sectors.

The brief: identify high-value workflows where AI can both (a) materially reduce internal cost or unlock revenue, AND (b) be re-packaged and sold to peer firms as a vertical-SaaS product.

The market matters: there are 500+ similar UK commercial agencies and thousands more in EU/US, all running the same manual workflows. Anything that works for Claridges has a real outside market.

---

## 2. The five opportunity areas

After a half-day audit of Claridges' public footprint, the five opportunities ranked by combination of internal value, sellability, and AI fit:

| # | Opportunity | Internal value | External SaaS opportunity |
|---|---|---|---|
| **1** | **Lease Abstraction & Rent-Review Intelligence** | £200k+/yr saved + risk eliminated | "LeaseOS" — £400/seat/month × 500 firms |
| 2 | Dilapidations & Inspection Field App (photo → schedule) | High-margin service unblocked | "DilapsAI" for building surveyors |
| 3 | Enquiry-to-Viewing AI Agent (24/7 inbound conversion) | Conversion uplift, OOH coverage | Vertical "AI receptionist for commercial agents" |
| 4 | Compliance & Maintenance OS (per-asset cert tracking) | Eliminates regulatory leakage | "PropManageOS" for SMB property managers |
| 5 | Acquisitions & Off-Market Sourcing Engine (signal scraping) | Stronger investor-rep service | Sold to buying agents and family offices |

**Decision: Build #1 first.** It's the highest-frequency, highest-risk, highest-billable workflow, and the data layer it produces is the foundation every other opportunity (#2, #3, #4, #5) plugs into.

---

## 3. Opportunity 1 — Lease Abstraction & Rent-Review Intelligence

### 3.1 The pain

For the agency:
- Every new managed lease requires a paralegal to read a 40–120 page PDF and hand-key 25–60 data points (parties, term, rent, review pattern, breaks, repair, alienation, service charge etc.) into a spreadsheet or CRM. **2–6 hours per lease.**
- Lease events (rent reviews, breaks, expiries) are tracked in Excel diaries. A missed rent-review trigger = direct lost fees + PI exposure.
- When a rent review fires, the surveyor spends another **4–10 hours** assembling EGi/Rightmove/CoStar comparables and drafting the trigger letter.
- Junior staff churn means institutional knowledge of "what's in the leases" walks out the door annually.

For the landlord client:
- Reviews triggered late or not at all → uplift left on the table. On a £75k rent, a missed 10% review = **£7.5k/year forgone for the rest of the term**.
- No real-time portfolio visibility; quarterly PDF reports only.

**One line:** the most fee-generating, highest-risk, highest-frequency document workflow in the firm is still done by hand, in Word and Excel, by the most expensive people in the building.

### 3.2 Value proposition

> Turn every lease in your filing cabinet into structured, monitored, revenue-generating data within minutes — so no review, break, or renewal is ever missed and every event is prepared in 10% of the time.

For a mid-sized agency (~400 managed leases):

| Lever | Today | With the platform | Annual impact |
|---|---|---|---|
| Lease abstraction | 4 hrs × £85/hr × 400 = **£136k** of internal time | 15 min review of AI draft → £8.5k | **~£127k cost saved** |
| Rent-review prep | 6 hrs × £150/hr × ~80 reviews/yr = £72k | 1 hr review of AI draft → £12k | **~£60k cost saved or rebillable** |
| Missed/late events | ~3 reviews/yr missed @ avg £4k uplift × 5 yrs | Effectively zero | **~£60k client value defended** |
| PI / reputational risk | Real, occasional 6-figure events | Materially reduced | Insurance premium relief |

**Total addressable internal value per firm: £200k+/yr.** Productised at £400/seat/month × 5 seats = £24k ARR/firm. 10× ROI to the customer leaves enormous pricing headroom.

### 3.3 Today's workflow vs LeaseOS

**Today (a real Tuesday at Claridges):**
```
New management instruction → email with scanned lease PDF
   ↓
Paralegal opens PDF + Excel template
   ↓ (2–6 hrs)
Reads cover-to-cover, hand-types term/rent/dates/clauses
   ↓
Surveyor QCs the spreadsheet (~30 min)
   ↓
Key dates copy-pasted into Outlook + master diary
   ↓
6–18 months later: Outlook reminder fires (or doesn't)
   ↓ (4–10 hrs)
Surveyor pulls comparables manually, drafts trigger letter
```

**With LeaseOS:**
```
PDF dropped in (or auto-pulled from email)
   ↓ (2–5 minutes)
AI extracts every material clause → structured record + citations
Paralegal reviews flagged low-confidence fields (~12–15 min)
   ↓
Lease auto-populates the firm-wide event calendar
Proactive alerts T-12 / T-6 / T-3 months before every event
   ↓
At T-6: rent review pack auto-prepared (comparables + memo + letter)
Surveyor edits and sends in ~45 min instead of 2 weeks
```

### 3.4 Worked example — 14 Crouch End Broadway

A complete walkthrough is in the repo as the demo lease (`leases/Olive_and_Vine_lease_2022.pdf`). Summary:

- **Tuesday 09:12** — Mr Patel forwards a 67-page lease bundle to `instructions@claridges.app`. Platform creates a Property record, queues the documents.
- **09:14** — Sarah (surveyor) gets a Slack ping: *"Lease abstracted — 47 fields extracted, 4 flagged for review."* She opens the record.
- **09:27** — 12 minutes of review later, Sarah approves. Seven calendar events are auto-created including the **31 Oct 2026 break-notice deadline** — a date that historically gets missed.
- **8 months later** — Sarah's morning digest reads: *"Tenant break deadline is 31 Oct 2026 (60 days). Olive & Vine has not served notice. Recommended action: send confirmation letter to Mr Patel."* She clicks, reviews the AI draft, sends. **3 minutes.**
- **6 months before review** — platform serves Sarah a **Rent Review Pack**: landlord cover memo, comparables ranked by similarity, ITZA analysis, draft trigger letter in Claridges' house style. Sarah edits, sends. **~1 hour** instead of 6–10.
- **Settlement: April 2027** — £42,500 → £53,500. **£11k/yr uplift × 5 years = £55k+ delivered to Mr Patel.** Settled rent feeds back into the comparables model.

Multiply by 400 managed leases → the internal business case. Multiply by 500 peer UK firms → the software business.

### 3.5 Beyond lease abstraction — the data flywheel

Once every lease is structured, *everything else the firm does* gets cheaper, faster, or becomes a sellable product:

**Sell to existing landlord clients (wallet-share):**
- Portfolio analytics dashboard (WAULT, income concentration, expiry waterfall)
- Continuous portfolio valuation (£2–5k surveyor work compressed to 2hr)
- Service-charge auditor (catches systematic overcharges)
- Dilapidations liability forecasting per asset
- MEES/EPC compliance roadmap (E-now, B-by-2030)

**Win Claridges new mandates (lead-gen):**
- Internal expiry/break radar — every tenant under management is a warm letting/review mandate
- Buyer-brief matching against own stock
- Tenant covenant monitoring (Companies House cross-reference)

**Net-new product lines:**
- CPSE auto-fill for sales (200-question solicitor form, 70% answerable from data)
- Lender covenant-reporting pack
- Tenant-rep flip (same product, sold to multi-site retail/restaurant chains)
- The comparables flywheel: anonymised cross-firm settled-rent data = the most accurate UK commercial-property dataset ever assembled

The pattern: **lease data is the substrate the whole firm runs on**. Once it's structured, every workflow that touches a lease either gets cheaper or becomes a sellable product.

---

## 4. Engagement strategy with Claridges

Three plausible commercial structures, in increasing order of upside:

1. **Vendor model** — Claridges pays a discounted/free pilot fee, you own 100% of IP and sell elsewhere. They get first-mover advantage and a referenceable case study.
2. **Design partner + revenue share** — Claridges pays nothing for the build, gets free use in perpetuity, takes a small (5–15%) royalty on external SaaS revenue for a capped period. Aligns incentives, costs them nothing.
3. **Co-founder model** — Claridges puts in capital and/or domain expertise, gets equity in a NewCo.

**Lock the structure before week 1 of build.** Once you've spent two months building, leverage shifts and the conversation gets harder.

Discovery before design: spend a full day on-site with their best paralegal and one surveyor. Learn the lease-corpus reality (clean PDFs vs scanned-and-faxed-three-times), the 20 clauses that actually matter, how side-letters are handled, what their current system of record is.

Pilot success criterion (the contract):
> Abstract 50 of Claridges' real leases at ≥95% accuracy on the 15 most-used clauses, AND auto-prepare 3 live rent-review packs that Claridges actually sends to clients, with surveyor time reduced by ≥80%.

---

## 5. Product Requirements Document — LeaseOS v1 (Pilot)

### 5.1 Executive summary

LeaseOS turns a commercial property agency's lease document archive into a structured, monitored, action-driving data layer. The v1 pilot delivers three integrated capabilities — **automated lease abstraction**, a **proactive lease-event calendar**, and an **auto-prepared rent-review pack generator** — to a single design-partner customer over a 6-week build, with the explicit goal of validating the thesis well enough to begin selling to peer UK commercial agencies the following quarter.

### 5.2 Goals (v1 Pilot)

1. ≥95% extraction accuracy on the **15 most-used clauses** across a 50-lease eval set
2. Reduce paralegal abstraction time from 2–6 hours to **<20 minutes of human review**
3. Surface every lease event ≥3 months in advance, with **zero misses** on the ingested portfolio
4. Generate at least **3 real rent-review packs** sent by Claridges to live landlord clients, with **≥80% surveyor time reduction**
5. Be in daily use by Claridges staff by end of week 6

### 5.3 Non-Goals (out of scope for v1)

Multi-tenancy, landlord-facing client portal, mobile app, CRM integrations beyond CSV, tenant-side workflows, automated comparables scraping, billing/subscriptions, public marketing site, SSO/SAML, internationalisation.

### 5.4 Personas

| Persona | Role | Primary jobs |
|---|---|---|
| **Priya — Paralegal** | Lease admin | Reviews and approves abstracted leases |
| **Sarah — Surveyor** | Lease advisory | Receives event alerts; sends rent-review packs |
| **David — Partner** | Oversight | Monitors firm-wide pipeline; reports to clients |
| **Mr Patel — Landlord client** | (v2) | Reads portfolio dashboard; receives event notifications |

### 5.5 Top-15 clauses (extraction priority)

1. Demised premises (address + extent)
2. Tenant (entity + Companies House number)
3. Guarantor (if any)
4. Term commencement date
5. Term length / expiry date
6. Initial rent (£/year)
7. Rent payment frequency
8. Rent review pattern (open market / RPI / fixed; upward-only?)
9. Rent review dates
10. Tenant break clause (date, notice period, conditions)
11. Landlord break clause (if any)
12. Repair obligation (FRI / IRI / schedule of condition)
13. Permitted use (Use Class)
14. Alienation (assignment, subletting, AGA)
15. Service charge (cap / collar / RPI link)

Plus rent deposit, insurance renewal date, EPC expiry — all already in the schema.

### 5.6 Functional requirements (compressed)

- **Ingestion**: PDF upload via UI + dedicated email inbox; native + scanned PDFs; multi-doc bundles auto-grouped; immutable storage.
- **Extraction**: 25+ fields with per-field citation (page, clause ref, verbatim quote); two-pass disagreement-based confidence; side-letter overlay logic; <5 min/lease.
- **Reviewer UI**: split-screen PDF + structured fields; click-field-jump-to-source; inline edit with audit log; bulk approve.
- **Lease database**: Postgres-backed, JSONB record + relational metadata, full-text search across all leases.
- **Calendar & alerts**: auto-derived events (rent review trigger/effective, break notice deadline + date, lease expiry, deposit return, RPI uplift, insurance renewal, EPC expiry); daily cron emits T-12/T-6/T-3 month digest emails.
- **Rent-review pack generator**: at T-6 months, auto-builds landlord memo + comparables schedule + ITZA analysis + draft trigger letter, all as editable Word docs in firm's house style.
- **Reporting**: CSV exports of leases, events, settled reviews; read-only dashboard.
- **Auth**: Clerk (email + Google), single-tenant, two roles (`user` / `admin`).

### 5.7 Non-functional

| Area | Requirement |
|---|---|
| Performance | Extraction <5 min/lease; UI <500ms p95 |
| Reliability | 99% uptime UK business hours; daily encrypted backups |
| Security | TLS in transit, AES-256 at rest, signed-URL document access, full audit log |
| Privacy / GDPR | UK/EU data residency only; processor agreement; deletion-on-request |
| Cost ceiling | Per-lease extraction <£2.00 at steady state |

### 5.8 Success metrics (pilot exit gate)

| Metric | Target |
|---|---|
| Extraction accuracy on top-15 clauses | ≥95% |
| Paralegal review time per lease | ≤20 min |
| Lease events surfaced ≥3 months ahead | 100% |
| Live rent-review packs sent | ≥3 |
| Surveyor time reduction on review prep | ≥80% |
| Daily active use by Claridges staff | ≥3 users, 5 days/week |
| Pilot NPS | ≥40 |

Pass all → proceed to peer-firm pilots. Miss any → diagnose, decide, pivot or stop.

### 5.9 Risks

| Risk | Mitigation |
|---|---|
| Extraction accuracy plateaus <95% on messy scans | Two-pass + Opus 4.7 escalation; eval-driven prompt iteration |
| Side-letter handling proves harder than expected | First-class entity from day 1; manual override always available |
| Paralegal adoption resistance | Co-design schema with the actual paralegal; instrument friction |
| API cost overruns | Prompt caching from day 1; route by complexity; weekly monitoring |
| Commercial deal unresolved before build | **Lock the deal before week 1** |
| Pilot delivers but peer firms don't buy | Validate WTP with 5 peer firms in parallel during weeks 3–6 |

---

## 6. What's been built (current state)

Repo: `~/Desktop/leaseos/` (mirror at https://github.com/davidcohen863/LeaseAbstraction)

### 6.1 Tech stack

- **Backend**: Python 3.11+, FastAPI, SQLAlchemy 2.0, Pydantic v2, Anthropic Python SDK
- **Models**: Claude Sonnet 4.6 (default), Opus 4.7 1M context (long leases >120 pages)
- **PDF I/O**: PyMuPDF (read — native text + 150-DPI page rasterisation), python-docx + reportlab (write — pack documents, demo lease)
- **DB**: SQLite locally, Postgres in production (same SQLAlchemy code)
- **Frontend**: Next.js 16 (App Router, Turbopack), React 19, Tailwind v4, react-pdf
- **UI lib additions (P0 shell)**: lucide-react (icons), cmdk (command palette)
- **Auth**: Clerk (optional in dev — auto-disabled if env vars missing)
- **Hosting target**: Render (API + Postgres) + Vercel (frontend) — currently paused; Fly/HF Spaces/Cloudflare Tunnel as free alternatives

### 6.2 Code structure

```
leaseos/
  src/leaseos/
    schema.py                # Pydantic LeaseRecord — 23 fields + per-field Citation
    pdf.py                   # PyMuPDF loader (text + rasterised page images)
    utils.py                 # utc_now() — naive-UTC helper (replaces datetime.utcnow())
    prompts.py               # Extraction + pack-generator system prompts
    extract.py               # Anthropic call: forced tool-use + prompt caching
    pack_generator.py        # Rent-review pack: Claude tool-use + python-docx render
    cli.py                   # `leaseos abstract <pdf>` and `leaseos eval`
    eval_harness.py          # Run extraction across YAML ground-truth corpus
    api/
      main.py                # FastAPI app + lifespan + CORS
      config.py              # Env vars (with override=True dotenv)
      db.py                  # SQLAlchemy session
      models.py              # Lease, Document, LeaseEvent, FieldEdit, OAuthToken,
                             #   OAuthState, Comparable, RentReviewPack, PackDocument, ...
      auth.py                # Clerk JWT verification (no-auth dev fallback)
      crypto.py              # Fernet encrypt/decrypt for secrets at rest
                             #   (Slack webhooks today, more later)
      security.py            # safe_filename + serve_inside_sandbox (shared
                             #   filesystem-security helpers)
      events.py              # Derive LeaseEvent rows from a LeaseRecord
      worker.py              # Background extraction task
      pack_worker.py         # Background pack-generation task
      routes/
        leases.py            # Upload, list, detail, document, patch field, approve
        properties.py        # List + detail + patch (P1 — first-class entity)
        events.py            # List + acknowledge calendar events
        comparables.py       # CRUD for market evidence
        packs.py             # Generate / list / detail / download / settle packs
        integrations.py      # Slack config + Google/Microsoft OAuth + event push
        audit.py             # Read-only feed of FieldEdit + lease approvals (P2)
    integrations/
      slack.py               # Webhook digest sender
      google.py              # Google Calendar OAuth + event push
      microsoft.py           # Microsoft Graph OAuth + event push
  web/
    app/
      layout.tsx             # P0 shell: Sidebar + Topbar + ClerkProvider
      page.tsx               # 302 → /today
      today/page.tsx         # Dashboard — KPIs, action this week, recent activity
      properties/page.tsx    # P1 — list grouped by client, search
      properties/[id]/page.tsx  # P1 — lease history, upcoming events, edit metadata
      reviews/page.tsx       # P1 — kanban board (Pending / Draft / Sent / Settled)
      leases/page.tsx        # P1 — list with filter rail (status, critical-only),
                             #   sortable columns, group-by (status/property/client),
                             #   bulk-select + CSV export, search across label/property/client
      leases/[id]/           # Reviewer 3-col layout — PDF viewer + FieldsPanel + RightRail
        page.tsx             #   page shell + breadcrumbs
        PdfViewer.tsx        #   P1 — toolbar (zoom, fit, page jump) + scroll-driven page tracking
        FieldsPanel.tsx      #   P1 — collapsible field sections, persisted via localStorage
        RightRail.tsx        #   P1 — Approve, Critical Dates, Quick Links, Packs-for-this-lease, Document meta
      calendar/page.tsx      # All events grouped by year, with soon/overdue states
      comparables/page.tsx   # P1 — stats strip (count / median £/sq ft / P25-P75 / median area / total),
                             #   filters (source, use class), sortable columns, source badges,
                             #   CSV import (drag/drop + preview + bulk insert) + template download,
                             #   use-class proper UK Use Classes select
      packs/page.tsx         # Rent-review packs list
      packs/[id]/page.tsx    # P1 — Word-style typography preview (Georgia serif, paper card),
                             #   inline-editable opening/settlement numbers, comparables drawer,
                             #   uplift summary block when settled
      integrations/page.tsx  # Backward-compat redirect → /settings/integrations
      settings/              # P2 — Settings hub
        layout.tsx           #   Sub-tab nav (Profile/Firm/Integrations/Templates/Members/Audit)
        profile/page.tsx     #   Clerk UserProfile (lazy-imported, optional Clerk gate)
        firm/page.tsx        #   Firm name/address/default surveyor (localStorage v1)
        integrations/page.tsx #  Slack/Google/Outlook (moved from top nav)
        templates/page.tsx   #   Word .docx upload — coming soon
        members/page.tsx     #   Multi-user — coming soon
        audit/page.tsx       #   Searchable read-only audit feed
    components/
      nav/sidebar.tsx        # Collapsible sidebar nav (persists state)
      nav/topbar.tsx         # Sticky topbar with search trigger + user menu
      nav/notification-bell.tsx
      ui/status-pill.tsx     # Centralised colour-coded status component
      ui/command-palette.tsx # ⌘K global search (cmdk)
      ui/empty-state.tsx     # P2 — shared empty-state card (icon, title, description, actions, hint)
      calendar/month-grid.tsx   # P1 — 7-col month grid (date-fns, no library)
      calendar/event-drawer.tsx # P1 — slide-in drawer for event detail + actions
    lib/
      api.ts                 # Typed fetch client for the FastAPI backend
      clerk.ts               # Optional-Clerk gate
      humanise.ts            # Enum → English label mappings
      csv.ts                 # P1 — minimal CSV parser (handles quotes, CRLF)
    proxy.ts                 # Next.js 16 proxy (was middleware) wiring Clerk
    public/pdf.worker.min.mjs   # Self-hosted pdf.js worker (CSP-friendly).
                                # Version-locked to whatever pdfjs-dist react-pdf's
                                # nested install resolves — kept in sync by the
                                # `postinstall` → `sync-pdf-worker` script in package.json.
                                # Don't edit by hand; if pdfjs-dist bumps, npm install
                                # will refresh this file (commit the diff).
  scripts/
    generate_demo_lease.py     # Generates the Olive & Vine fictional lease PDF
    rederive_events.py         # Re-derive LeaseEvent rows without re-extraction
    seed_n8_comparables.py     # Seed 5 fictional N8 retail comparables
    backfill_properties.py     # P1 — assign existing leases to Property rows + run column migrations
    trigger_pending_packs.py   # Cron-friendly POST to /packs/auto-trigger
    migrate_documents.py       # Add side-letter summary columns to documents table
    tunnel.sh                  # Cloudflare quick-tunnel orchestrator: spins up
                               #   public URLs for both API + frontend, patches
                               #   .env / web/.env.local + bounces dev servers,
                               #   prints the public URL. `tunnel.sh stop` tears
                               #   it all down. See DEMO.md for the runbook.
  data/                      # Local SQLite DB + uploaded documents + generated packs (gitignored)
  alembic/                   # Migrations — env.py reads DATABASE_URL from settings;
                             #   versions/ has baseline + dev-drift-cleanup + oauth_states
  alembic.ini                # Alembic config (sqlalchemy.url overridden in env.py)
  scripts/db.sh              # Wrapper: scripts/db.sh upgrade / current / new "msg"
  Dockerfile                 # Production image — CMD runs `alembic upgrade head` first
  render.yaml                # Render Blueprint (API + Postgres + nightly cron)
  web/vercel.json            # Vercel config
  README.md   PRD.md   context.md   UX_PLAN.md   DEPLOY.md   DEMO.md   CLAUDE.md
```

### 6.3 What works end-to-end (verified locally)

**Extraction & reviewer**
- **Upload** a real PDF → background extraction with Claude Sonnet 4.6
- **Two-pass extraction** with disagreement-based confidence — runs the lease through a neutral prompt and a "skeptical senior surveyor" prompt; any field where the two passes disagree on substantive content is forced to `confidence: low` with a `[two-pass disagreement]` note. Costs ~1.3-1.5× a single pass thanks to prompt-caching the lease content; latency ~2×
- **Per-field citations** (page, clause reference, verbatim quote) for every extracted value
- **Reviewer UI**: split-screen with click-to-jump-to-source; inline edit; approve workflow; humanised enum values; breadcrumbs; engineer telemetry hidden
- **Critical Dates banner** at the top of the reviewer (break notice, rent review trigger, expiry) with inline "Generate pack" CTA on review-trigger items

**Calendar & derived events**
- **Calendar — month grid view** (P1): proper 7-col grid with prev/next/Today nav, click event chip → side drawer with full details + "Generate review pack" action; coloured chips per event type
- **Calendar — list view** (toggle): events grouped by year with soon/overdue colouring
- **Type filter chips** at top of calendar — toggle individual event types on/off
- **Auto-derived events**: rent review (trigger + effective), break (notice + date), lease expiry, deposit return, **annual insurance renewal**, **EPC expiry** — with proper month-arithmetic (no 30.5-day approximation)
- **Recurring rent reviews**: cycle expansion using `rent_review.cycle_years`

**`/integrations` page redesign** (just shipped)
- Slack card now has a **proper in-UI form** — paste webhook URL + channel label + digest toggle, with a "How to get a webhook URL" inline guide that links to the Slack create-app page
- **Send test message** + **Run digest now** quick actions appear once Slack is connected
- Webhook URL is validated client-side (must start with `https://hooks.slack.com/`)
- Status badges (Connected / Not connected) on every integration card
- Google + Outlook cards show the connected account email when present

**Side-letter / variation overlay** (just shipped)
- **Attach ancillary documents** to a lease — side-letter, deed of variation, licence to alter / assign, rent deposit deed, schedule of condition, other
- **Document model extended** with `summary_markdown`, `summary_status`, `summary_seconds`, `summary_error`
- **`POST /leases/{id}/documents`** endpoint accepts a PDF + role; `DELETE` for ancillary docs (the principal lease PDF is protected)
- **`run_ancillary_summary()` worker** — background AI summary using a new `SIDE_LETTER_SUMMARY_PROMPT` that produces a structured markdown summary (Type / Date / Parties / In force / Personal / What it changes / What stays / Risk flags) with clause citations
- **Right rail "Side-letters & variations" panel** — list of attached docs with role label, summary status, expandable inline AI summary, download + delete; a role select + "Attach" upload button at the bottom; polls every 3s while any doc is summarising
- **Cost**: ~£0.02–0.05 per ancillary doc (they're typically 1-3 pages)

**Pack auto-trigger + Slack notification** (shipped)
- `POST /packs/auto-trigger?days_ahead=N` — finds every `rent_review_trigger` event in the horizon with no pack yet and queues generation; idempotent
- `scripts/trigger_pending_packs.py` — cron-friendly script that hits the endpoint
- `render.yaml` cron entry — runs daily at 06:00 UTC (180-day horizon)
- "Auto-trigger (N)" button on `/reviews` — confirm dialog with estimated API spend, then runs the same endpoint
- Pack worker now calls `notify_pack_ready()` on success — Slack message with current rent, recommended opening, settlement range, and an "Open pack" button linking to the deep URL

**Rent-review pack generator** (the killer feature)
- **One-click pack generation** from any rent-review event
- Four output documents: **landlord memo, comparables schedule, ITZA analysis, trigger letter** — all rendered as editable Word .docx
- Markdown preview inline + Word download per document
- Headline numbers (current rent, recommended opening, settlement range) as KPI strip
- "Mark as sent" + **modal-based "Record settlement"** (with live uplift calc)
- Settled rent feeds back to comparables as an internal data point
- ~£0.20 per pack on Sonnet 4.6 with prompt caching

**Reviews kanban board** (P1)
- `/reviews` — 4-column board: **Pack pending** (rent_review_trigger events with no pack) → **Draft** → **Sent** → **Settled**
- Pending cards show trigger date + days until/since + Generate-pack button
- Pack cards show current rent, recommended opening, and on-card "Mark sent" action
- Settled cards show settled rent + uplift % in green
- Polls every 4s while any pack is in `generating` state

**Pack detail polish** (P1, just shipped)
- **Word-style typography** — markdown preview rendered with Georgia/serif font in a paper-like card with shadow, A4-ish margins, justified body — looks like the .docx the surveyor is about to download
- **Inline-edit headline numbers** — click on Recommended opening / Settlement low / Settlement high → input → Enter to save (PATCH /packs/{id}); shows pencil icon on hover; only enabled when status ∈ {draft, sent}
- **Comparables drawer** — slide-in side panel listing every comparable in the workspace with £/sq ft for each + link to /comparables to manage
- **Uplift block** when settled — green callout showing "Settled at £X — uplift of £Y (Z%)"
- **Status pill** + breadcrumbs at the top
- Improved doc nav with icons; canonical order (Memo → Comparables → ITZA → Letter)

**Comparables redesign** (P1)
- **Stats strip** at top: count, median £/sq ft, P25–P75 range, median area, total rent in set
- **Filters**: source multi-select dropdown (Rightmove / EGi / Internal / Manual), use-class multi-select (proper UK Use Classes), search across address/notes
- **Sortable columns** — Address / Rent / Sq ft / £/sq ft / Date
- **Coloured source badges** in the table
- **Use-class select** in the add form (was free text — used proper UK Use Classes E, E(b), F1, F2, B2, B8, etc.)
- **CSV import** — drag/drop or click-to-pick a CSV file; live preview with per-row validation (✓ ready / ✗ error reason); bulk-insert via `/comparables/bulk`; downloadable template

**Lease detail / Reviewer redesign** (P1)
- **3-column layout** — PDF (1fr) | Fields (1fr) | RightRail (280px)
- **PDF viewer toolbar** — zoom −/+, fit-to-width toggle, page-number input + prev/next, scroll-driven current-page tracking via IntersectionObserver
- **Fields panel** — 8 collapsible sections (Premises, Parties, Term & rent, Rent review, Break clauses, Use & occupation, Service charge, Compliance dates), each shows a low-confidence flag count; collapse state persists per-section in localStorage; citations are now bordered blue pills `p.X · cl. Y`
- **Right rail** — sticky panel with: lease status pill + Approve button (always visible), Critical Dates block (with Generate-pack on review-trigger items), Related quick links (Property, Calendar, Original PDF download), Review packs for this lease, Document meta

**Leases list redesign** (P1)
- **Filter rail (left)**: multi-checkbox status filter + "Critical event ≤ 90d" toggle + group-by selector
- **Sortable columns**: click any header to sort by Label / Property / Client / Status / Uploaded
- **Group-by** dropdown — None / Status / Property / Client (sticky section headings)
- **Bulk select** — checkbox column + select-all-in-group + selection counter + **CSV export** for the selected rows
- **Critical badge** column — at-a-glance days-until-next-critical-event, red if ≤30d, amber if ≤90d
- **Property + Client columns** — pulls property's landlord_client via /properties join
- Search now matches across label / property address / client name

**Comparables**
- Manual CRUD (paste-from-EGi style) at `/comparables`
- Seeded 5 fictional N8 retail comparables for the demo

**P0 UX shell**
- **Collapsible sidebar nav** with lucide icons; state persisted to localStorage
- **Sticky topbar** with global search trigger
- **⌘K command palette** — fuzzy search across **properties** / leases / comparables / packs + quick-jump
- **Notification bell** (stub for now)
- **`/today` dashboard** — 5 KPI cards + "Action this week" + "Recent activity" feed; replaces the previous two-card landing
- **Centralised `<StatusPill>`** component (deduplicates 3 colour maps)
- **`<lib/humanise>`** layer — `fri` → `Full Repairing & Insuring`, `open_market` → `Open market`, etc.

**P1 — Properties as a first-class entity** (just shipped)
- **Property model** — first-class with normalised-address dedupe key, sector, landlord_client, notes
- **Auto-link on extraction** — worker creates or matches a Property by lease's premises address
- **Backfill script** — assigns existing leases to Properties + runs SQLite column migrations (no Alembic yet)
- **`/properties` list** — table with search + group-by-client toggle, shows lease count + next event per property
- **`/properties/[id]` detail** — lease history (one row per lease), upcoming events sidebar, inline edit for sector/client/notes
- **Lease detail breadcrumbs** — now show `Home › Properties › [property] › Lease`
- **Leases list** — new `Property` column linking to the property
- **Properties section** in cmd-K palette

**Integrations**
- **Slack** via webhook (paste-and-go)
- **Google Calendar** OAuth + event push (code complete, needs OAuth client setup)
- **Outlook / Microsoft Graph** OAuth + event push (code complete, needs Entra registration)

**Auth**
- **Clerk** wiring (works with or without Clerk env vars set)

### 6.4 Demo lease

`leases/Olive_and_Vine_lease_2022.pdf` — generated by `scripts/generate_demo_lease.py`. Realistic 7-page UK retail lease for the fictional Olive & Vine restaurant scenario:

- Patel Holdings Ltd → Olive & Vine Ltd → Anna Marini (guarantor)
- 14 Crouch End Broadway, London N8 8DT, ground floor + basement
- 10-year term from 1 May 2022, £42,500 p.a. quarterly
- 5-yearly open-market upward-only rent review
- Tenant break at year 5 with 6 months notice
- FRI lease, schedule-of-condition limited
- Use Class E(b) restaurant
- Assignment with consent + AGA, whole only
- 5% cap / 0% collar RPI-linked service charge
- 3-month rent deposit
- Annual insurance renewal 25 March
- EPC C, expires 11 April 2032

### 6.5 Settings used

- Clerk dev instance: `free-ocelot-64.clerk.accounts.dev`
- Frontend dev port: **3002** (3000 + 3001 occupied locally)
- API dev port: **8000**
- CORS origins: localhost:3000-3003 (both 127.0.0.1 and localhost)

---

## 7. Local development

### 7.1 First-time setup (already done)

```bash
cd ~/Desktop/leaseos
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
cd web && npm install
```

### 7.2 Daily start

Two terminals:
```bash
# Terminal 1 — API
cd ~/Desktop/leaseos
source .venv/bin/activate
leaseos-api               # uvicorn on 127.0.0.1:8000 with --reload

# Terminal 2 — Frontend
cd ~/Desktop/leaseos/web
npm run dev               # Next.js on http://localhost:3002 (or whatever port is free)
```

### 7.3 Environment files

- `~/Desktop/leaseos/.env` — `ANTHROPIC_API_KEY`, `LEASEOS_CORS_ORIGINS`
- `~/Desktop/leaseos/web/.env.local` — `NEXT_PUBLIC_API_URL`, Clerk publishable + secret keys

Both files are gitignored.

### 7.4 Useful CLI commands

```bash
# Extract a single lease without the UI
leaseos abstract leases/Olive_and_Vine_lease_2022.pdf

# Dry-run (no API spend) — inspects the PDF and reports what would be sent
leaseos abstract <pdf> --dry-run

# Run extraction against the eval corpus
leaseos eval

# Re-derive events on existing leases (free — no API call)
.venv/bin/python scripts/rederive_events.py

# Regenerate the demo lease PDF (after editing the script)
.venv/bin/python scripts/generate_demo_lease.py

# Seed N8 comparables for the rent-review pack demo
.venv/bin/python scripts/seed_n8_comparables.py

# Backfill Properties for existing leases + add new Property columns
.venv/bin/python scripts/backfill_properties.py

# Database migrations (Alembic)
scripts/db.sh upgrade                        # apply pending migrations
scripts/db.sh current                        # which revision are we on?
scripts/db.sh new "added foo column"         # autogenerate a new migration after a model change
scripts/db.sh check                          # detect drift between model and DB
```

### 7.5 Frontend keyboard shortcuts

- **⌘K** (or Ctrl+K) — opens the global command palette from anywhere
- **Esc** — closes the palette / modals

---

## 8. Deployment

Two paths:

- **For a Claridges demo (today):** [`DEMO.md`](./DEMO.md) — `scripts/tunnel.sh` spins up two Cloudflare quick tunnels (no Cloudflare account needed), patches `.env` + `web/.env.local`, restarts both dev servers, prints a public `https://*.trycloudflare.com` URL. ~30s end-to-end. URL is ephemeral (changes on restart) and only works while the laptop is awake — fine for a demo, not a production service.
- **For a permanent home (when Claridges says yes):** [`DEPLOY.md`](./DEPLOY.md) — Render (API + Postgres + cron) + Vercel (Next.js) + Clerk + Google + Microsoft. ~60–90 min first time, ~$15/month, then `git push` to redeploy.

Other options if Render isn't a fit:
- **Fly.io** — auto-stop hobby machines = $0 if low traffic; requires card on file
- **Hugging Face Spaces** — free, no card, supports Docker; quirks for non-ML apps
- **Cloudflare named tunnel** — free, stable subdomain; needs a Cloudflare account + DNS setup. Suitable for multi-day pilot if cost-sensitive.

---

## 9. Known gaps & next steps

> **Live status table:** see [`PRD.md`](./PRD.md) — this section is the narrative summary.

### 9.1 Extraction quality (originally Week-2 PRD work)

- ✅ **Two-pass extraction** with disagreement-based confidence — neutral + skeptical-senior-surveyor passes, merged with confidence override
- ✅ **Side-letter / variation attachment + AI summary** — attach as ancillary docs, get a structured markdown summary (type/date/parties/effects/risk flags) inline in the right rail; full overlay-onto-parent-record merge is still 📋 follow-up work
- **Bounding-box highlighting** on the PDF viewer (citations have page + quote but no bbox yet)
- **Prefer stated over computed dates** — when the lease text explicitly states a deadline (e.g. "31 October 2026"), prefer that over the mathematically-derived date

### 9.2 Pack generator follow-ups

- **Auto-trigger cron** — find `rent_review_trigger` events whose date ≤ today + N days with no pack yet, generate, Slack-notify
- **Per-firm Word .docx template upload** so packs render in firm house style
- **Inline regenerate-with-new-comparables** button on the pack detail page
- **Proper retail Zone-A/B masking** for ITZA (currently the model gives qualitative analysis only)

### 9.3 UI/UX milestones (active redesign track)

The full plan is in **[`UX_PLAN.md`](./UX_PLAN.md)**. Current state:

- ✅ Six UX quick wins shipped (bold pills, hidden telemetry, humanised enums, settle modal, search, breadcrumbs)
- ✅ **P0 — Shell upgrade** shipped (sidebar, topbar, ⌘K, /today, StatusPill)
- 📋 **P1 — Workflow surfaces** (next): Properties as first-class entity, leases list filter rail, calendar month grid, `/reviews` kanban, lease-detail collapsible sections, comparables map, Word-style pack preview
- 📋 **P2 — Polish + power-user**: Settings hub, activity feed, bbox highlight on citation click, j/k keyboard nav in reviewer, in-UI Slack form, accessibility audit, workspace switcher

### 9.4 Operational

- ✅ **OAuth CSRF state** — moved out of the in-process `_STATES` dict into a Postgres-backed `oauth_states` table (Alembic revision `9f3b21ec0a40`). Survives restarts; works across multiple workers; rows GC after 15 min.
- Background extraction + pack generation run in-process via FastAPI `BackgroundTasks` — fine for a single Render dyno; switch to RQ or Celery if many uploads land at once.
- ✅ **Backend pytest suite** — 78 tests, ~1.4s, covers events math + recurring expansion + derive_events + two-pass merge + property dedup + route shape (TestClient) + filename sanitisation + Fernet round-trip + prod CORS assertion + sandbox file serving. Run `.venv/bin/pytest -v`. **No frontend tests yet** — Playwright smoke is the next gap.
- ✅ **Alembic migrations** — `alembic/` initialised, baseline + dev-drift-cleanup + oauth_states revisions in place; `Dockerfile` runs `alembic upgrade head` before serving; `scripts/db.sh` (upgrade / current / history / new / check) is the local shortcut. `init_db()` still does `Base.metadata.create_all` for the no-arg dev case but Alembic is the source of truth in prod.

### 9.4.5 Cloudflare Tunnel runbook (landed 2026-05-03)

**Why:** the user wanted a way to put LeaseOS in front of Claridges *this week*, without committing to Render's paid hosting before the firm has clicked around.

**What:** `scripts/tunnel.sh` (one command) and `DEMO.md` (the playbook).

The script:

1. Starts two `cloudflared tunnel --url ...` quick tunnels (one per service); no Cloudflare account needed.
2. Parses the `https://*.trycloudflare.com` URLs out of cloudflared's stderr.
3. Appends the frontend tunnel URL to `LEASEOS_CORS_ORIGINS` in `.env` and overwrites `NEXT_PUBLIC_API_URL` in `web/.env.local` with the API tunnel URL.
4. Bounces both dev servers so the env changes take effect.
5. Smoke-tests `/health` + `/today` through the tunnels and prints the public URL.

`scripts/tunnel.sh stop` tears down both tunnels and both dev servers. The script keeps `.tunnel-backup` copies of the env files in case of regret.

`DEMO.md` is the demo-day playbook: pre-flight (seed demo lease + 5 N8 comparables + pre-generate one rent-review pack so the click-to-pack scene is instant), the seven-scene walk-through (Today → Reviewer → Calendar → Reviews → Pack → Settings → Q&A), the FAQ answers, and what's *not* in the demo (so we don't accidentally promise bbox highlighting or per-firm templates).

Tunnels are ephemeral — restart and the URL changes. For a multi-day pilot, set up a named tunnel via Cloudflare Dashboard.

### 9.4.4 PDF worker version-lock (landed 2026-05-03, hotfix)

**Symptom:** lease detail page threw `UnknownErrorException: The API version "5.4.296" does not match the Worker version "5.7.284"` and refused to render the PDF.

**Cause:** the self-hosted worker at `web/public/pdf.worker.min.mjs` had been copied from the project's top-level `pdfjs-dist@^5.7.284` dep, but `react-pdf@10.4.1` resolves its own nested `pdfjs-dist@5.4.296` for the `<Document>` component. pdf.js refuses to run when worker and API versions don't match exactly.

**Fix:** new `sync-pdf-worker` npm script in `web/package.json` resolves `pdfjs-dist/build/pdf.worker.min.mjs` from `react-pdf`'s own dependency tree and copies it to `public/`. Wired as `postinstall` so `npm install` keeps the worker in lockstep automatically — no more silent drift after dependency bumps.

**Workflow:** if a future `npm install` updates pdfjs-dist (visible as a diff to the worker file), commit the new worker alongside the package-lock diff.

### 9.4.3 P2 UX milestone (landed 2026-05-03)

The full plan is in `UX_PLAN.md` §6.9 + §7-P2. What landed in this batch:

- ✅ **Settings hub** at `/settings` with sub-tab layout (`layout.tsx`) + six sub-pages: Profile (Clerk `UserProfile`, lazy-imported), Firm (name/address/default surveyor in localStorage), Integrations (moved from top nav), Templates (placeholder + per-doc cards), Members (placeholder explaining multi-user is post-pilot), Audit log.
- ✅ **`GET /audit`** + **`GET /leases/{id}/audit`** endpoints in new `routes/audit.py` — pagination-capped feed of FieldEdit + lease approvals (synthesised from `Lease.approved_at`), interleaved + sorted newest-first. 8 new tests.
- ✅ **Settings → Audit log** page with filter (search by lease/field/user, kind segmented filter), inline before→after diff with strikethrough, deep-links to lease detail.
- ✅ **Activity panel** in lease-detail RightRail showing the last 8 events for that lease (compact diff, "View all" link to firm-wide audit).
- ✅ **j/k keyboard nav** in the FieldsPanel: jumps focus between flagged (low-confidence) fields with auto-scroll + auto-expand of collapsed sections + amber focus ring. `?` toggles a cheat sheet. Bails on input/textarea so it never steals typing.
- ✅ **Sidebar** swaps top-level "Integrations" for "Settings" (matches `/settings/*`); the bare `/integrations` URL now redirects to `/settings/integrations` (preserves the OAuth callback's `?connected=1` query string).
- ✅ **Polished empty states** — new shared `<EmptyState>` (icon + title + description + 1–2 actions + optional hint) used on `/packs`; reviews kanban columns now show purpose-specific hints instead of generic "Empty".
- 78 → 98 backend tests passing.

### 9.4.2 L-tier cleanup (landed 2026-05-03)

- ✅ **L1** `datetime.utcnow()` → `utc_now()` helper from new `src/leaseos/utils.py`. The deprecated function would have started raising in Python 3.14; warnings cleared. Helper returns naive-UTC so SQLAlchemy DateTime columns don't need a schema change.
- ✅ **L2** `Cache-Control: no-store` on every API response via new `NoStoreCacheMiddleware`. Stops a logged-out user (or a different signed-in user on a shared device) pulling another tenant's lease data out of the disk cache.
- ✅ **L5** Enum consistency — `LeaseEvent.event_type == "rent_review_trigger"` and `LeaseEvent.status == "upcoming"` raw-string comparisons swapped for `EventType.RENT_REVIEW_TRIGGER.value` / `EventStatus.UPCOMING.value`.
- ✅ **L6** Dead-code branch in `web/app/comparables/page.tsx` use-class filter removed; behaviour now matches the (also-clarified) comment.
- ✅ **L8** Tests for the markdown→docx renderer in `pack_generator.py` — 12 tests covering headings, bullets, bold inline, ragged tables, empty input, parent-dir creation. The actual Anthropic call still isn't unit-tested (would need mocking) but the deterministic post-processing now is.
- ✅ **L9** `_expand_review_dates`'s 100-cycle safety cap is now documented — exists to prevent a runaway loop on a hand-crafted `cycle_months=0` `LeaseRecord`, not because real leases ever approach the limit.

### 9.4.1 Security hardening (M-tier — landed 2026-05-03)

- ✅ **Prod CORS startup assertion** in `main._assert_safe_prod_config()` — when `LEASEOS_ENV=prod` (or `RENDER` is set), refuses to boot if CORS origins are empty / contain `*` / contain localhost / are plain http. Dev unaffected.
- ✅ **N+1 eager-loads** — `selectinload(Lease.property, Lease.documents)` on `GET /leases` and `GET /leases/{id}`; `selectinload(Property.leases)` on `/properties`. Was about to bite at 50+ leases.
- ✅ **Pack-document sandbox + ownership** — `download_document` now confirms the parent pack exists, the doc's `pack_id` matches the URL, and the on-disk path resolves under `data/packs/` (via shared `security.serve_inside_sandbox`). Same helper now serves both `data/documents/` and `data/packs/`.
- ✅ **Slack webhook URLs encrypted at rest** with Fernet, prefix `enc:v1:`. Key from `LEASEOS_SECRET_KEY` env var; required in prod, derived dev fallback otherwise. Legacy plaintext rows still readable until naturally re-saved (`crypto.decrypt_secret` passes them through).
- New module: `src/leaseos/api/crypto.py` (Fernet encrypt/decrypt with prefix marker)
- New module: `src/leaseos/api/security.py` (shared `safe_filename` + `serve_inside_sandbox`; replaces the dup helpers in routes/leases.py)
- New env var: `LEASEOS_SECRET_KEY` (required in prod) — see `DEPLOY.md` step 3.
- New env var: `LEASEOS_ENV` (`dev` | `prod`) — auto-set to `prod` if Render's `RENDER` env var is present.

### 9.5 The bigger product roadmap

Once the lease-abstraction pilot succeeds at Claridges:
1. Pilot with 3 peer UK firms → £100–150k ARR design-partner revenue
2. Productise multi-tenancy, billing, SSO → scale to 50 firms
3. Add **opportunity #2** (DilapsAI) and **#4** (PropManageOS) as plug-in modules on the same lease-data backbone
4. Year 3: ~200 firms + tier-up to mid-market = £5M+ ARR trajectory

---

## 10. Glossary (UK commercial lease terms)

| Term | Meaning |
|---|---|
| **FRI** | Full Repairing and Insuring — tenant responsible for all repairs + insurance contribution |
| **IRI** | Internal Repairing and Insuring — tenant only responsible for internal repairs |
| **AGA** | Authorised Guarantee Agreement — outgoing tenant guarantees the next tenant on assignment |
| **ITZA** | "In Terms of Zone A" — retail rent benchmark using zone-A frontage rate |
| **EPC** | Energy Performance Certificate — required to let; minimum E rating since 2023, B proposed by 2030 (MEES regs) |
| **EGi** | Estates Gazette Interactive — paid UK commercial property comparables database |
| **CPSE** | Commercial Property Standard Enquiries — 200+ question form solicitors send when a property is sold |
| **Section 25 / 26 notice** | L&T Act 1954 notices for terminating or renewing a business tenancy |
| **Schedule of Condition** | Photographic record annexed to a lease that caps the tenant's repair obligation |
| **Use Class E(b)** | Town & Country Planning Order — restaurants and cafés (formerly A3) |
| **WAULT** | Weighted Average Unexpired Lease Term — portfolio-level metric for institutional landlords |
| **Side-letter** | Bilateral agreement varying lease terms (often personal to current tenant) |
| **Rent review (open market / RPI / fixed)** | Mechanism for resetting rent during the term — open-market = market test, RPI = inflation-indexed, fixed = pre-agreed steps |
| **Upward-only review** | Reviewed rent can only go up or stay the same — UK market standard, unlike most of EU/US |
| **Cap & collar** | Maximum and minimum percentage change on an indexed review or service charge |

---

## 11. Quick-reference contacts

- **Anthropic API key**: in `.env` (rotate at console.anthropic.com if shared)
- **Clerk dashboard**: https://dashboard.clerk.com (instance `free-ocelot-64`)
- **GitHub repo**: https://github.com/davidcohen863/LeaseAbstraction
