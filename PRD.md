# LeaseOS — Master PRD

**Single index of every product requirements doc on this project.** Each milestone below has a status, a one-line spec, and links to the deeper docs (`context.md`, `UX_PLAN.md`, `DEPLOY.md`) where the full detail lives.

- Last updated: 2026-05-03
- Repo: https://github.com/davidcohen863/LeaseAbstraction
- Pilot customer: **Claridges Commercial**
- Vision: vertical SaaS for UK commercial property agencies — start with lease abstraction, expand to dilapidations / inspections / acquisitions sourcing
- Current state: **Local pilot fully working. Pre-deploy. UX P0 shell + UX P1 milestone complete (7 of 7 items shipped).**

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
| Two-pass extraction with disagreement-based confidence | ✅ | Neutral pass + "skeptical senior surveyor" pass; substantive-content diff with metadata stripped; mismatched fields get `confidence: low` + `[two-pass disagreement]` note; ~1.3-1.5× single-pass cost via prompt cache |
| Side-letter / variation attachment + AI summary | ✅ | Attach side-letters / deeds of variation / licences as ancillary documents on the lease; AI summary (type / date / parties / effects / risk flags) generated in the background, shown inline in the right rail. Full structured overlay-onto-parent-record merge is still 📋. |
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
- ✅ Auto-trigger cron + Slack notification (just shipped — `POST /packs/auto-trigger`, daily Render cron, "Auto-trigger (N)" UI button)
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

**Status: ✅ complete (7 of 7 items shipped).**

| Item | Status | Notes |
|---|---|---|
| **Properties** as a first-class entity | ✅ | Worker auto-links lease → property by normalised address; backfill script for existing leases |
| `/properties` list + `/properties/[id]` detail | ✅ | List has search + group-by-client; detail has lease history, upcoming events, inline edit |
| Lease detail breadcrumbs include Property | ✅ | `Home › Properties › [property] › Lease` |
| Leases list — Property column | ✅ | `web/app/leases/page.tsx` |
| Properties in cmd-K palette | ✅ | `web/components/ui/command-palette.tsx` |
| Leases list redesign — filter rail (status, client, sector), sort, group-by, bulk actions | ✅ | Filter rail (status + critical-only) + sortable cols + group-by + bulk-select + CSV export + Property/Client/Critical columns |
| Lease detail redesign — sticky right-rail action panel, collapsible field sections | ✅ | 3-column layout (PDF / Fields / RightRail), 8 collapsible sections with localStorage-persisted state, RightRail with status + Approve + Critical Dates + Quick Links + Packs |
| PDF viewer controls (zoom, fit-to-width, page-jump) | ✅ | Toolbar with zoom −/+ / fit-to-width / page jump + scroll-driven page tracking |
| PDF viewer search-in-PDF + bbox highlight on citation click | 📋 | Defer — citations don't have bbox data yet |
| Calendar **month grid** view (vs current vertical list) | ✅ | Built atop date-fns; Month/List view toggle; UK-week (Mon start); Today button |
| Calendar filters + side-drawer-on-click | ✅ | Type-filter chips + side drawer with Generate-pack action |
| `/reviews` **kanban board** (Pack pending → Draft → Sent → Settled) | ✅ | Action-button advance for v1 (drag-to-advance deferred); per-card uplift % on settled |
| Pack detail polish — Word-style typography preview, inline edit numbers, comparables drawer | ✅ | Georgia/serif paper-card preview, inline-editable opening/settlement (PATCH /packs/{id}), comparables drawer, uplift block when settled |
| Comparables redesign — stats strip, filters, source badges, CSV import, use-class select | ✅ | Stats (count/median £/sq ft/P25-P75/median area/total) + source/use-class filters + sortable cols + CSV import with per-row validation + UK Use Classes |
| Comparables map view (Leaflet/Mapbox) + similarity scoring | 📋 | Defer — needs geocoding, can be a v2 add |
| Use-class select (not free text) | ✅ | Proper UK Use Classes (E, E(b), F1, F2, B2, B8, etc.) |

Detailed brief: [`UX_PLAN.md` §6 + §7](./UX_PLAN.md).

---

### 4.4 P2 — Polish + power-user (~1 week scope)

**Status: 🚧 partially shipped — see below.**

| Item | Status |
|---|---|
| Settings hub at `/settings` (Profile, Firm, Integrations, Templates, Members, Audit log) | ✅ |
| Per-firm Word .docx template upload (used by pack generator) | 📋 |
| Activity feed on lease detail (render existing `FieldEdit` audit table) | ✅ |
| Bounding-box highlight on citation click (PDF) | 📋 (needs bbox in extraction first) |
| Keyboard navigation in reviewer (j/k between flagged fields) | ✅ |
| Empty states with sample-data CTAs everywhere | 🚧 (shared `<EmptyState>`; rolled out on /packs + reviews; rest still bespoke) |
| Accessibility audit (axe + keyboard-only run) | 📋 |
| In-UI Slack form + connection-test feedback + disconnect on `/settings/integrations` | ✅ (shipped in P1, now lives under /settings) |
| Workspace switcher in topbar (multi-tenant prep) | 📋 (post-pilot) |
| Notification backend + bell unread count | 📋 |

Detailed brief: [`UX_PLAN.md` §6.9 + §7](./UX_PLAN.md).

---

## 5. Integrations PRD

Three connected, all built end-to-end.

| Integration | Status | Notes |
|---|---|---|
| **Slack** (incoming webhook + daily digest) | ✅ | Proper in-UI form on `/integrations` — paste URL, label channel, send test, run digest now |
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
| pytest suite for backend | ✅ | 98 tests (was 90) — added audit feed coverage (FieldEdit + lease-approval synthesis, lease-scoped filter, limit cap, mixed sort). ~1.6s. |
| Playwright smoke test for frontend | 📋 | Critical-path: upload → review → approve → pack |
| Eval harness with 50-lease ground-truth corpus | 📋 | Stub exists at `eval/` — needs real leases (NDA-blocked until Claridges shares) |
| **OAuth state in DB (H3)** | ✅ | New `oauth_states` table + Alembic revision `9f3b21ec0a40`; `_new_state` / `_consume_state` now Postgres-backed; survives restart + works across multiple workers; rows GC after 15 min |
| Move background extraction from FastAPI BackgroundTasks → RQ/Celery | 📋 | Concurrency prep |
| Self-hosted pdf.js worker behind strict CSP | ✅ | `web/public/pdf.worker.min.mjs`. Version-locked to react-pdf's nested pdfjs-dist via the `postinstall` → `sync-pdf-worker` script in `web/package.json` so version drift can't silently break the lease viewer again. |
| Alembic migrations | ✅ | `alembic/` initialised, env.py reads DATABASE_URL from settings; baseline + dev-drift-cleanup + oauth_states revisions; Dockerfile runs `alembic upgrade head` before serving; `scripts/db.sh` wrapper for local use |
| **Prod CORS startup assertion (M4)** | ✅ | `_assert_safe_prod_config()` blocks boot when `LEASEOS_ENV=prod` if CORS origins are empty / `*` / localhost / plain-http |
| **N+1 eager-loads (M2/M3)** | ✅ | `selectinload(Lease.property, Lease.documents)` on lease list/detail; `selectinload(Property.leases)` on properties list/detail |
| **Pack-document sandbox (M8)** | ✅ | Shared `security.serve_inside_sandbox` now serves both `data/documents/` and `data/packs/`; pack download confirms parent pack exists + URL `pack_id` matches doc's `pack_id` |
| **Encrypt Slack webhooks at rest (M7)** | ✅ | New `crypto.py` (Fernet, `enc:v1:` prefix); webhook URLs encrypted at write, decrypted at every send site; legacy plaintext rows pass through; `LEASEOS_SECRET_KEY` required in prod |

---

## 8. What we're working on **right now**

Active milestone: **UX P1 — Workflow surfaces** is in progress. Properties shipped; the rest still queued.

Current todo state at top of stack:

1. ✅ **Properties** as a first-class entity
2. ✅ **Calendar month grid** + drawer + filters
3. ✅ **`/reviews` kanban board**
4. ✅ **Leases list redesign** — filter rail + sort + group-by + bulk + CSV
5. ✅ **Lease detail polish** — 3-col layout + RightRail + collapsible sections + PDF controls
6. ✅ **Comparables redesign** — stats strip + filters + CSV import + use-class select + source badges
7. ✅ **Pack detail polish** — Word-style preview + inline-editable headline numbers + comparables drawer

**P1 milestone complete.** Next-up candidates from elsewhere on the roadmap:
- ✅ Two-pass extraction with disagreement-based confidence (original PRD §1)
- ✅ Auto-trigger cron + Slack notification for pack generation
- 📋 Begin **P2 — Polish + power-user** (Settings hub, Audit log, bbox highlight, j/k keyboard nav, in-UI Slack form)
- 📋 Deploy (paused)

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
| (this commit) | **PDF worker version-lock** — hotfix for the lease-detail viewer crash `UnknownErrorException: The API version "5.4.296" does not match the Worker version "5.7.284"`. The self-hosted worker at `web/public/pdf.worker.min.mjs` had been copied from the project's top-level `pdfjs-dist@^5.7.284` dep, but `react-pdf@10.4.1`'s `<Document>` resolves its own nested `pdfjs-dist@5.4.296` and pdf.js refuses to run when worker and API don't match. New `sync-pdf-worker` script in `web/package.json` resolves the worker via `require.resolve('pdfjs-dist/build/pdf.worker.min.mjs', {paths:[require.resolve('react-pdf')]})` and copies it into `public/`; wired as `postinstall` so `npm install` keeps it in lockstep on every machine and on Vercel. Re-copied the correct 5.4.296 worker as part of this commit. |
| `a5909ee` | **P2 UX milestone** — Settings hub at `/settings` with sub-tab layout + six pages (Profile via Clerk's `UserProfile` lazy-imported, Firm metadata in localStorage, Integrations moved here from top nav, Templates + Members placeholders that explain the deferral, Audit log searchable + kind-filtered). New `routes/audit.py` exposes `GET /audit` (firm-wide) + `GET /leases/{id}/audit` (per-lease) — synthesises a unified feed from `FieldEdit` rows + `Lease.approved_at`, sorted newest-first. Lease-detail RightRail gains an Activity panel showing the last 8 events for that lease. FieldsPanel grows j/k keyboard nav between flagged fields with auto-scroll + auto-expand + amber focus ring + ? cheat sheet (bails on input/textarea so it never steals typing). Sidebar swaps top-level "Integrations" for "Settings"; bare `/integrations` redirects to `/settings/integrations`. Shared `<EmptyState>` (icon + title + description + primary/secondary actions + hint) replaces bespoke empty cards on `/packs` and the reviews kanban (each column now has a purpose-specific hint). 8 new audit tests; 98/98 passing (was 90); frontend `tsc --noEmit` clean. |
| `fdb6528` | **L-tier cleanup** — six items from the CODE_REVIEW.md follow-up list landed together: (L1) `datetime.utcnow()` replaced everywhere with new `utc_now()` helper from `src/leaseos/utils.py` (deprecation warnings cleared, naive-UTC for SQLAlchemy compatibility); (L2) `Cache-Control: no-store` middleware on every API response so a different signed-in user can't pull a previous user's data from the disk cache; (L5) raw-string enum comparisons (`"rent_review_trigger"`, `"upcoming"`) swapped for `EventType`/`EventStatus` enum values; (L6) dead `use_class` filter branch in `web/app/comparables/page.tsx` removed and the surviving branch's intent documented; (L8) 12 new tests for `pack_generator.render_docx` / `_render_table` / `_add_inline_runs` (headings, bullets, bold, ragged tables, empty input); (L9) the 100-cycle safety cap in `_expand_review_dates` now has a docstring explaining it exists for a `cycle_months=0` runaway, not because real leases approach it. 90/90 tests passing (was 78). |
| `4e3e983` | **M-tier security hardening** — five fixes from `CODE_REVIEW.md` follow-up list landed together: (M4) prod CORS startup assertion in `main._assert_safe_prod_config()` blocks misconfigured boot when `LEASEOS_ENV=prod`; (M2/M3) `selectinload` on Lease + Property relationships kills N+1 on list endpoints; (M8) pack-document download routed through shared `security.serve_inside_sandbox` + ownership check on `pack_id` URL parameter; (M7) Slack webhook URLs encrypted at rest with Fernet (new `crypto.py`, `enc:v1:` wire prefix, `LEASEOS_SECRET_KEY` env var required in prod); (H3) OAuth CSRF state moved out of in-process `_STATES` dict into new `oauth_states` table (Alembic `9f3b21ec0a40`). New shared modules: `api/crypto.py`, `api/security.py`. 12 new tests (78/78 total). DEPLOY.md updated with `LEASEOS_SECRET_KEY` instructions. |
| `77f1970` | **Alembic migrations** — `alembic/` initialised with env.py that reads DATABASE_URL from settings + imports models for autogenerate; baseline migration captures all 11 tables; dev-drift-cleanup migration tightens the NOT NULL + server_default constraints that the early hand-applied ALTER TABLEs missed; Dockerfile CMD now runs `alembic upgrade head` before serving (idempotent); `scripts/db.sh` wrapper (upgrade / current / history / new / check); DEPLOY.md updated; tests still 66/66. |
| `2707922` | Fix /properties 500 error: defensive `updated_at` fallback in route + worker explicitly sets created_at/updated_at on new Property rows + backfill NULLs |
| `d5e464f` | **Code review + first pytest suite + 2 HIGH security fixes** — `CODE_REVIEW.md` catalogues 3 HIGH / 10 MEDIUM / 10 LOW findings; HIGH H1 (filename traversal on upload) and H2 (path traversal on document download) fixed via new `_safe_filename()` and `_serve_inside_sandbox()` helpers in `routes/leases.py`; HIGH H3 (in-process OAuth state) deferred; **66 pytest tests** (`tests/`) covering events math, recurring expansion, derive_events, two-pass merge, property dedup, route shape, filename sanitisation regression — all passing in ~1.4s. |
| `1e5303e` | **Side-letter / variation attachment + AI summary** — Document model gets `summary_markdown` / `summary_status` / `summary_seconds` / `summary_error` columns; `POST /leases/{id}/documents` accepts a PDF + role (side_letter / variation / licence_to_alter / licence_to_assign / rent_deposit_deed / schedule_of_condition / other); `run_ancillary_summary()` worker calls Claude with a new `SIDE_LETTER_SUMMARY_PROMPT` that produces a structured markdown summary (type / date / parties / in-force / personal / what-it-changes / risk-flags) with clause citations; right-rail "Side-letters & variations" panel with role select + Attach upload, expandable inline summary, download/delete; ~£0.02–0.05 per doc; `migrate_documents.py` for the schema change. |
| `d5d5f2d` | **Two-pass extraction quality lift** — `extract_two_pass()` runs the lease through a neutral pass and a skeptical-senior-surveyor pass; `_merge_records()` strips metadata and JSON-diffs substantive content; any field where the two passes disagree gets `confidence: low` + a `[two-pass disagreement]` note. Worker switched. ~1.3-1.5× single-pass cost via prompt-cached lease content; 2× latency. The `confidence` flag is now a real signal of agreement-between-two-reads, not the model's self-report. |
| `52adb42` | **`/integrations` in-UI Slack form** — replaces the API-fallback HTML page with a proper form (paste webhook URL, label channel, digest toggle), inline "How to get a webhook URL" guide, Send test + Run digest now quick actions, status badges, account-email display for Google/Outlook |
| `ff19710` | **Pack auto-trigger + Slack notify** — `POST /packs/auto-trigger?days_ahead=N` (idempotent, finds events with no pack), daily Render cron (06:00 UTC, 180-day horizon), "Auto-trigger (N)" button on /reviews with confirm dialog showing estimated cost, `notify_pack_ready()` Slack message when each pack finishes (current rent, opening, settlement range, "Open pack" button), `scripts/trigger_pending_packs.py` for local cron / GitHub Actions |
| `4e2b306` | **P1 milestone complete** — Pack detail polish: Word-style typography (Georgia serif paper card), inline-editable headline numbers (Recommended opening / Settlement low / high) backed by new PATCH /packs/{id}, comparables-used drawer, uplift summary block when settled, status pill + breadcrumbs, doc-nav icons + canonical order |
| `576326d` | P1 Comparables redesign — stats strip (count / median £/sq ft / P25–P75 range / median area / total rent), source + use-class filter dropdowns, sortable columns, coloured source badges, CSV import (drag/drop + per-row validation + bulk insert) + downloadable template, proper UK Use Classes select, `web/lib/csv.ts` mini-parser |
| `f4aeb42` | P1 Lease-detail polish — 3-column layout (PDF / Fields / RightRail 280px), 8 collapsible field sections persisted to localStorage, citation pills (blue-bordered), PDF viewer toolbar with zoom + fit + page jump + scroll-driven current-page tracking, RightRail with Status + Approve + Critical Dates + Related quick links + Packs-for-this-lease + Document meta |
| `f686136` | **Fix .gitignore bug** — `leases/` was matching `web/app/leases/`, so the lease UI files (page, [id], FieldsPanel, PdfViewer) had never been pushed. Anchored `/leases/`, `/data/`, `/output/`. Lease UI files now properly committed |
| `e6f71ce` | P1 Leases-list redesign — left filter rail (status multi + critical-only), sortable columns, group-by (status / property / client), bulk-select + CSV export, Property + Client + Critical columns, search across label / property / client |
| `11382f3` | P1 Reviews kanban — `/reviews` 4-column board (Pack pending → Draft → Sent → Settled), per-card actions (Generate / Mark sent), settled uplift %, polling for in-flight packs |
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
