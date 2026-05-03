# LeaseOS — Master PRD

**Single index of every product requirements doc on this project.** Each milestone below has a status, a one-line spec, and links to the deeper docs (`context.md`, `UX_PLAN.md`, `DEPLOY.md`) where the full detail lives.

- Last updated: 2026-05-03
- Repo: https://github.com/davidcohen863/LeaseAbstraction
- Pilot customer: **Claridges Commercial**
- Vision: vertical SaaS for UK commercial property agencies — start with lease abstraction, expand to dilapidations / inspections / acquisitions sourcing
- Current state: **Local pilot fully working. Pre-deploy. P0 shell + P1 Properties + P1 Calendar grid + P1 Reviews kanban shipped.**

> **Rule for AI agents in this repo:** every code commit must include updates to `context.md` and `PRD.md` reflecting what changed. See [`CLAUDE.md`](./CLAUDE.md) for the full convention.

---

## Status legend

| Symbol | Meaning |
|---|---|
| ✅ | Shipped — in the running app, smoke-tested |
| 🚧 | In progress |
| 📋 | Planned, scoped, ready to build |
| 💡 | Proposed, not yet planned |
| ⏸️ | Deferred / not in current roadmap |

---

## 0. The five opportunity areas (strategic context)

We surveyed Claridges and ranked five opportunities. **We picked #1** and are building it. The other four are designed-for as future modules on the same lease-data backbone.

| # | Opportunity | Status | Notes |
|---|---|---|---|
| **1** | **Lease Abstraction & Rent-Review Intelligence** ("LeaseOS") | 🚧 active | This whole project |
| 2 | Dilapidations & Inspection Field App ("DilapsAI") | ⏸️ post-pilot | Plugs into the lease data layer |
| 3 | Enquiry-to-Viewing AI Agent | ⏸️ post-pilot | Independent product, separate go-to-market |
| 4 | Compliance & Maintenance OS ("PropManageOS") | ⏸️ post-pilot | Layers on the events calendar we already build |
| 5 | Acquisitions & Off-Market Sourcing Engine | ⏸️ post-pilot | New persona (buying agents) |

Full deep-dive: [`context.md` §2 + §3](./context.md).

---

## 1. Product PRD v1 — Pilot release

The original 6-week pilot scope, written before any code. Most of it is shipped.

| Capability | Status | Where |
|---|---|---|
| Document ingestion (PDF upload, multi-doc, immutable storage) | ✅ | `src/leaseos/api/routes/leases.py`, `data/documents/` |
| Lease abstraction engine (25+ fields with citations) | ✅ | `src/leaseos/extract.py`, `schema.py`, `prompts.py` |
| Two-pass extraction with disagreement-based confidence | 📋 | Single-pass placeholder today; Week-2 quality lift |
| Side-letter / variation overlay logic | 📋 | Schema supports it, worker doesn't merge yet |
| Reviewer UI (split PDF + structured fields, click-to-source) | ✅ | `web/app/leases/[id]/` |
| Bounding-box highlighting on citation click | 📋 | Pages + quotes today; bbox in P2 |
| Lease database (Postgres-ready, JSONB record + audit log) | ✅ | `src/leaseos/api/models.py` |
| Calendar & alerts (auto-derived events) | ✅ | `src/leaseos/api/events.py` |
| Daily Slack digest cron | 📋 | Code complete, cron not wired locally |
| Rent-review pack generator (memo + comparables + ITZA + letter) | ✅ | `src/leaseos/pack_generator.py` — see [§3 below](#3-rent-review-pack-generator-week-5) |
| Reporting / CSV export | 📋 | Not started |
| Auth (Clerk) | ✅ | Optional in dev, configured |

Full PRD: [`context.md` §5](./context.md). Pilot exit metrics: [`context.md` §5.8](./context.md).

---

## 2. Schema & calendar enhancements (post-PRD additions)

Shipped in two follow-up rounds after pilot PRD v1.

| Item | Status | Notes |
|---|---|---|
| Recurring rent-review expansion (using `cycle_years`) | ✅ | `events.py::_expand_review_dates` |
| `insurance_renewal_date` + `epc_expiry_date` fields | ✅ | `schema.py`, prompt updated |
| Annual insurance renewal events | ✅ | Auto-generated from first date until lease expiry |
| EPC expiry events | ✅ | Single critical date |
| Proper month-arithmetic (no 30.5 day approximation) | ✅ | `events.py::_shift_months` |

---

## 3. Rent-review pack generator (Week-5 killer feature)

Standalone PRD, shipped end-to-end.

**Status: ✅ shipped, smoke-tested.**

What it does: when a rent review is approaching, the surveyor clicks "Generate pack" on a calendar event and within ~90s gets four editable Word documents — landlord memo, comparables schedule, ITZA analysis, trigger letter — recommending an opening rent and settlement range. Spotted the break/review co-incidence in our demo lease unprompted.

| Component | Status | Where |
|---|---|---|
| Schema: `Comparable`, `RentReviewPack`, `PackDocument` | ✅ | `models.py` |
| Pack generator (Claude tool-use + python-docx) | ✅ | `pack_generator.py` |
| Background pack worker | ✅ | `api/pack_worker.py` |
| `/comparables` CRUD routes | ✅ | `api/routes/comparables.py` |
| `/packs` routes (generate, list, detail, download, sent, settle) | ✅ | `api/routes/packs.py` |
| N8 demo comparables seed | ✅ | `scripts/seed_n8_comparables.py` |
| `/comparables` page + Add form | ✅ | `web/app/comparables/page.tsx` |
| `/packs` list + `/packs/[id]` detail | ✅ | `web/app/packs/` |
| "Generate pack" button on Critical Dates banner + Calendar | ✅ | `FieldsPanel.tsx`, `calendar/page.tsx` |
| Settlement modal (no more `window.prompt`) | ✅ | Quick-win commit `8fbf753` |

**Deferred (post-v1):**
- 📋 Auto-trigger cron (find `rent_review_trigger` events whose date ≤ today + N days, no pack yet → generate + Slack notify)
- 📋 Per-firm house-style template upload
- 📋 Proper Zone-A/B masking for ITZA (model's qualitative analysis is enough for v1)
- 📋 Comparables auto-scrape from EGi/Rightmove (manual paste fine for pilot)
- 📋 Inline regenerate-with-new-comps button on pack page

---

## 4. UI/UX adaptation — the three-milestone redesign

Reference: full critique + plan in **[`UX_PLAN.md`](./UX_PLAN.md)**.

The original PRD shipped a working but visually thin product. The reviewer page scored 7/10; everything else 4–5/10. We are now executing a 3-milestone redesign modelled on **Re-Leased** (UK vertical incumbent) and **monday.com** (Vibe design system).

### 4.1 Six UX quick wins (pre-P0)

**Status: ✅ shipped.** Half-day intro to confirm the visual direction before committing to full milestones.

| # | Win | Status |
|---|---|---|
| 1 | Bold colour-coded status pills (replace pastel) | ✅ |
| 2 | Hide engineer telemetry behind ⓘ tooltip | ✅ |
| 3 | Humanise enum values (`fri` → `Full Repairing & Insuring`) | ✅ `web/lib/humanise.ts` |
| 4 | Settlement-rent modal (replace `window.prompt`) | ✅ |
| 5 | Live search box on `/leases` (client-side filter) | ✅ |
| 6 | Breadcrumbs on lease detail | ✅ |

Commit: `8fbf753`.

---

### 4.2 P0 — Shell upgrade (~1 week scope)

**Status: ✅ shipped.** Sidebar, topbar with global search + cmd+K, notification bell, Today dashboard. Commit: `b4f081d`.

| Item | Status | Where |
|---|---|---|
| Collapsible sidebar nav with lucide icons + persisted state | ✅ | `web/components/nav/sidebar.tsx` |
| Sticky topbar (search trigger, notification bell, user menu) | ✅ | `web/components/nav/topbar.tsx` |
| Cmd+K command palette (cmdk) — searches leases / comparables / packs + quick-nav | ✅ | `web/components/ui/command-palette.tsx` |
| Notification bell stub | ✅ | `web/components/nav/notification-bell.tsx` |
| `/today` dashboard — KPIs, action-this-week, recent activity | ✅ | `web/app/today/page.tsx` |
| `/` permanent redirect → `/today` | ✅ | `web/app/page.tsx` |
| Centralised `<StatusPill>` component (deduplicate three colour maps) | ✅ | `web/components/ui/status-pill.tsx` |
| Removed engineer telemetry from user-facing surfaces (already in quick wins) | ✅ | — |

**Deliberately deferred from P0:**
- 💡 Workspace switcher in topbar (multi-tenant prep — needed in P2)
- 💡 30-day mini-calendar strip on `/today` (will land with the Calendar grid in P1)

---

### 4.3 P1 — Workflow surfaces (~1 week scope)

**Status: 🚧 in progress.** Properties shipped; remaining items still planned.

| Item | Status | Notes |
|---|---|---|
| **Properties** as a first-class entity | ✅ | Worker auto-links lease → property by normalised address; backfill script for existing leases |
| `/properties` list + `/properties/[id]` detail | ✅ | List has search + group-by-client; detail has lease history, upcoming events, inline edit |
| Lease detail breadcrumbs include Property | ✅ | `Home › Properties › [property] › Lease` |
| Leases list — Property column | ✅ | `web/app/leases/page.tsx` |
| Properties in cmd-K palette | ✅ | `web/components/ui/command-palette.tsx` |
| Leases list redesign — filter rail (status, client, sector), sort, group-by, bulk actions | 📋 | Search live; rest planned |
| Lease detail redesign — sticky right-rail action panel, collapsible field sections, inline edit on composites | 📋 | |
| PDF viewer controls (zoom, fit-to-width, page-jump, search-in-PDF) | 📋 | react-pdf supports it |
| Calendar **month grid** view (vs current vertical list) | ✅ | Built atop date-fns; Month/List view toggle; UK-week (Mon start); Today button |
| Calendar filters + side-drawer-on-click | ✅ | Type-filter chips + side drawer with Generate-pack action |
| `/reviews` **kanban board** (Pack pending → Draft → Sent → Settled) | ✅ | Action-button advance for v1 (drag-to-advance deferred); per-card uplift % on settled |
| Pack detail polish — Word-style typography preview, inline edit numbers, comparables drawer | 📋 | Currently `prose` — replace with serif paper-card |
| Comparables map view (Leaflet/Mapbox) + similarity scoring + CSV import | 📋 | Maps + stats row |
| Use-class select (not free text) | 📋 | Use proper UK Use Classes enum |

Detailed brief: [`UX_PLAN.md` §6 + §7](./UX_PLAN.md).

---

### 4.4 P2 — Polish + power-user (~1 week scope)

**Status: 📋 planned.**

| Item | Status |
|---|---|
| Settings hub at `/settings` (Profile, Firm, Integrations, Templates, Members, Audit log) | 📋 |
| Per-firm Word .docx template upload (used by pack generator) | 📋 |
| Activity feed on lease detail (render existing `FieldEdit` audit table) | 📋 |
| Bounding-box highlight on citation click (PDF) | 📋 |
| Keyboard navigation in reviewer (j/k between flagged fields) | 📋 |
| Empty states with sample-data CTAs everywhere | 📋 |
| Accessibility audit (axe + keyboard-only run) | 📋 |
| In-UI Slack form + connection-test feedback + disconnect on `/settings/integrations` | 📋 |
| Workspace switcher in topbar (multi-tenant prep) | 📋 |
| Notification backend + bell unread count | 📋 |

Detailed brief: [`UX_PLAN.md` §6.9 + §7](./UX_PLAN.md).

---

## 5. Integrations PRD

Three connected, all built end-to-end.

| Integration | Status | Notes |
|---|---|---|
| **Slack** (incoming webhook + daily digest) | ✅ code | Webhook UI is API-side fallback HTML — proper in-UI form is a P2 item |
| **Google Calendar** OAuth + event push | ✅ code | OAuth client setup needed before live use |
| **Outlook / Microsoft Graph** OAuth + event push | ✅ code | App registration on Entra needed before live use |

Code: `src/leaseos/integrations/`. Routes: `src/leaseos/api/routes/integrations.py`.

---

## 6. Deployment PRD

**Status: ⏸️ paused.** User chose to keep iterating locally before paid hosting.

| Surface | Plan | Status |
|---|---|---|
| GitHub repo | `davidcohen863/LeaseAbstraction` | ✅ pushed |
| Backend hosting | Render web + Postgres + nightly cron | ⏸️ Render free web tier discontinued |
| Frontend hosting | Vercel + Clerk auth | ⏸️ paused with backend |
| Free alternatives | Fly.io (auto-stop hobby) / HF Spaces / Cloudflare Tunnel | 💡 ready when needed |
| Dockerfile | ✅ committed | works locally |
| `render.yaml` Blueprint | ✅ committed | unused while paused |
| Clerk app | ✅ created (`free-ocelot-64.clerk.accounts.dev`) | dev tier |
| `DEPLOY.md` step-by-step | ✅ committed | full walkthrough |

When ready to ship: see [`DEPLOY.md`](./DEPLOY.md).

---

## 7. Quality / engineering debt PRD

**Status: 📋 planned, lower priority.**

| Item | Status | Notes |
|---|---|---|
| pytest suite for backend | 📋 | None yet; PRD requires for ship |
| Playwright smoke test for frontend | 📋 | Critical-path: upload → review → approve → pack |
| Eval harness with 50-lease ground-truth corpus | 📋 | Stub exists at `eval/` — needs real leases (NDA-blocked until Claridges shares) |
| Move OAuth state from in-process dict → Redis or DB | 📋 | Multi-instance prep |
| Move background extraction from FastAPI BackgroundTasks → RQ/Celery | 📋 | Concurrency prep |
| Self-hosted pdf.js worker behind strict CSP | ✅ | Already self-hosted under `/public` |
| Alembic migrations (currently `init_db()` autocreates) | 📋 | Needed before first prod schema change |

---

## 8. What we're working on **right now**

Active milestone: **UX P1 — Workflow surfaces** is in progress. Properties shipped; the rest still queued.

Current todo state at top of stack:

1. ✅ **Properties** as a first-class entity
2. ✅ **Calendar month grid** + drawer + filters
3. ✅ **`/reviews` kanban board**
4. 📋 Leases list redesign with filter rail + group-by (P1)
5. 📋 Lease detail collapsible sections + sticky right-rail (P1)
6. 📋 Comparables map + similarity scoring (P1)
7. 📋 Pack detail Word-style preview (P1)

**OR** the user pivots to:
- Re-attempt **deploy** (Phase 6) on Fly.io / HF Spaces / Cloudflare Tunnel
- **Two-pass extraction quality lift** (Phase 1, the original PRD's biggest deferred item)
- **Auto-trigger cron** for the rent-review pack generator (Phase 3)

---

## 9. Reading order if you're new to this project

1. **`context.md`** — origin, the five opportunities, the deep-dive on opportunity 1, the worked example, the v1 PRD in full, current build status, glossary of UK lease terms.
2. **`PRD.md`** (this file) — the master index showing what's shipped vs planned.
3. **`UX_PLAN.md`** — brutal critique + the 3-milestone redesign with concrete file lists.
4. **`README.md`** — quick start to run locally.
5. **`DEPLOY.md`** — when ready to ship to a real host.

---

## 10. Recent commits worth knowing

| SHA | What |
|---|---|
| (this commit) | P1 Reviews kanban — `/reviews` 4-column board (Pack pending → Draft → Sent → Settled), per-card actions (Generate / Mark sent), settled uplift %, polling for in-flight packs |
| `dd1cd2d` | P1 Calendar — month grid view (date-fns, no library), event drawer with Generate-pack action, Month/List toggle, type-filter chips, Today button + month nav |
| `9ba254e` | P1 Properties as first-class entity — model migration, auto-link on extraction, `/properties` list + detail, sidebar + cmd-K integration, lease detail breadcrumbs, leases list Property column |
| `34c653c` | Add `CLAUDE.md` with docs-update-before-commit rule; bring `context.md` up to date with everything since v0 |
| `847a504` | Add `PRD.md` — master status index |
| `b4f081d` | P0 UX shell upgrade — sidebar, topbar, cmd+K, /today, StatusPill |
| `8fbf753` | Six UX quick wins |
| `c6b0c23` | Add `UX_PLAN.md` |
| `e29a612` | Rent-review pack generator end-to-end |
| `a4bc8a4` | Recurring reviews + insurance + EPC schema additions |
| `2a4e27d` | Calendar — group by year, soon/overdue states |
| `9a179be` | Bug fixes — PDF viewer + Critical Dates banner + composite renderer |
| `d48e6aa` | Add `context.md` |
| (initial) | LeaseOS scaffold — extraction CLI, FastAPI backend, Next.js frontend |

---

## 11. The docs-update-before-commit rule (project convention)

This repo uses a strict convention that every code commit also updates `context.md` and `PRD.md`. The full rule and workflow are in [`CLAUDE.md`](./CLAUDE.md). Summary:

1. Before `git commit`, update `context.md` (Last-updated date, code structure, capability list, gaps).
2. Before `git commit`, update `PRD.md` (status icons, recent commits table).
3. Stage the doc updates with the same `git add`; include in the same commit.
4. Commit message should mention "(updates context.md + PRD.md)".

Exceptions: WIP commits on non-`main` branches; doc-only commits; external-tool commits.
