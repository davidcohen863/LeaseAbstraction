# LeaseOS — Project Context

**One document containing everything needed to onboard a new collaborator (or remind yourself in 6 months) about why this project exists, what it does, what's been built, and what's next.**

- Last updated: 2026-05-03 (after the P1 Comparables redesign)
- Repo: https://github.com/davidcohen863/LeaseAbstraction
- Working name: **LeaseOS**
- Pilot customer: **Claridges Commercial** (claridges-commercial.co.uk)
- Status: **v0.7 working locally — extraction + reviewer + calendar (month + list) + reviews kanban + pack generator + sidebar/Today shell + Properties first-class + leases list with filters/sort/group/bulk.** Pre-deploy.

> **Companion docs (single index):** **[`PRD.md`](./PRD.md)** for status of every milestone; **[`UX_PLAN.md`](./UX_PLAN.md)** for the UI/UX redesign roadmap; **[`README.md`](./README.md)** to run locally; **[`DEPLOY.md`](./DEPLOY.md)** to ship.

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
                             #   Comparable, RentReviewPack, PackDocument, ...
      auth.py                # Clerk JWT verification (no-auth dev fallback)
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
      packs/[id]/page.tsx    # Pack detail — 4 docs + headline numbers + settle modal
      integrations/page.tsx  # Slack/Google/Outlook status cards
    components/
      nav/sidebar.tsx        # Collapsible sidebar nav (persists state)
      nav/topbar.tsx         # Sticky topbar with search trigger + user menu
      nav/notification-bell.tsx
      ui/status-pill.tsx     # Centralised colour-coded status component
      ui/command-palette.tsx # ⌘K global search (cmdk)
      calendar/month-grid.tsx   # P1 — 7-col month grid (date-fns, no library)
      calendar/event-drawer.tsx # P1 — slide-in drawer for event detail + actions
    lib/
      api.ts                 # Typed fetch client for the FastAPI backend
      clerk.ts               # Optional-Clerk gate
      humanise.ts            # Enum → English label mappings
      csv.ts                 # P1 — minimal CSV parser (handles quotes, CRLF)
    proxy.ts                 # Next.js 16 proxy (was middleware) wiring Clerk
    public/pdf.worker.min.mjs   # Self-hosted pdf.js worker (CSP-friendly)
  scripts/
    generate_demo_lease.py     # Generates the Olive & Vine fictional lease PDF
    rederive_events.py         # Re-derive LeaseEvent rows without re-extraction
    seed_n8_comparables.py     # Seed 5 fictional N8 retail comparables
    backfill_properties.py     # P1 — assign existing leases to Property rows + run column migrations
  data/                      # Local SQLite DB + uploaded documents + generated packs (gitignored)
  Dockerfile                 # Production image for the API
  render.yaml                # Render Blueprint (API + Postgres + nightly cron)
  web/vercel.json            # Vercel config
  README.md   PRD.md   context.md   UX_PLAN.md   DEPLOY.md   CLAUDE.md
```

### 6.3 What works end-to-end (verified locally)

**Extraction & reviewer**
- **Upload** a real PDF → background extraction with Claude Sonnet 4.6
- **Per-field citations** (page, clause reference, verbatim quote) for every extracted value
- **Two confidence states** (high / low — currently single-pass placeholder, two-pass is week-2)
- **Reviewer UI**: split-screen with click-to-jump-to-source; inline edit; approve workflow; humanised enum values; breadcrumbs; engineer telemetry hidden
- **Critical Dates banner** at the top of the reviewer (break notice, rent review trigger, expiry) with inline "Generate pack" CTA on review-trigger items

**Calendar & derived events**
- **Calendar — month grid view** (P1): proper 7-col grid with prev/next/Today nav, click event chip → side drawer with full details + "Generate review pack" action; coloured chips per event type
- **Calendar — list view** (toggle): events grouped by year with soon/overdue colouring
- **Type filter chips** at top of calendar — toggle individual event types on/off
- **Auto-derived events**: rent review (trigger + effective), break (notice + date), lease expiry, deposit return, **annual insurance renewal**, **EPC expiry** — with proper month-arithmetic (no 30.5-day approximation)
- **Recurring rent reviews**: cycle expansion using `rent_review.cycle_years`

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

**Comparables redesign** (P1, just shipped)
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
```

### 7.5 Frontend keyboard shortcuts

- **⌘K** (or Ctrl+K) — opens the global command palette from anywhere
- **Esc** — closes the palette / modals

---

## 8. Deployment

Full step-by-step in [DEPLOY.md](./DEPLOY.md). Currently **paused**: Render's free web-service tier was retired in 2024 and the user prefers to keep iterating locally before committing to paid hosting.

When ready, options are:
- **Fly.io** — auto-stop hobby machines = $0 if low traffic; requires card on file
- **Hugging Face Spaces** — free, no card, supports Docker; quirks for non-ML apps
- **Render** — easiest dev experience, ~$15/month for API + Postgres
- **Local + Cloudflare Tunnel** — free demo URL, but only when laptop is awake

---

## 9. Known gaps & next steps

> **Live status table:** see [`PRD.md`](./PRD.md) — this section is the narrative summary.

### 9.1 Extraction quality (originally Week-2 PRD work)

- **Two-pass extraction** with disagreement-based confidence (currently single-pass; the PRD requires two-pass to hit the 95% confidence calibration bar)
- **Side-letter / variation overlay** logic — schema supports it, the worker doesn't merge yet
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

- OAuth state currently in-memory (a `dict` in `routes/integrations.py`) — fine for one server, won't survive restart or multi-instance. Move to Redis/DB before scaling.
- Background extraction + pack generation run in-process via FastAPI `BackgroundTasks` — fine for a single Render dyno; switch to RQ or Celery if many uploads land at once.
- **No tests yet.** Add pytest + a Playwright smoke test before shipping to a real customer.
- **Alembic migrations** — currently `init_db()` autocreates; needed before first prod schema change.

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
