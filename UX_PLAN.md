# LeaseOS — UI/UX Critique & Adaptation Plan

> Asked-for: brutal. Given.
>
> Last updated: 2026-05-03. Targets the v0.3 codebase (post rent-review pack).
> Reference benchmarks: **Re-Leased** (the incumbent UK vertical SaaS we are
> displacing) and **monday.com** (the gold-standard for dense, opinionated,
> action-oriented operational software).

---

## TL;DR

LeaseOS today is **a working prototype with the visual language of a project demo.** Every screen looks like a competent engineer wrote it in an afternoon (because that is what happened). The information architecture is flat, the data density is low, the status colours are inconsistent, the navigation does not scale past 5 pages, and there is no "what needs my attention right now?" surface anywhere — which is the *one job* an operational tool exists to do.

Re-Leased's defensibility is not its data model (we beat it on extraction quality). It is the **command-centre dashboard**, the **smart calendar**, the **landlord-app pairing**, and the way every screen telegraphs "I know what you need to do today." We have to match all of that before Claridges shows it to a competitor and the competitor shrugs.

monday.com's design system (Vibe) is the right north star for the visual language: bold colour-coded status pills, dense inline-editable tables, board views, sidebar nav with grouping, and aggressive use of the "you have N items" pattern.

This plan splits the work into **three milestones**: shell + dashboard (P0, ~1 week), workflow surfaces (P1, ~1 week), polish + power-user features (P2, ~1 week). Total: a meaningful redesign in 3 weeks of focused work without rewriting a single backend route.

---

## 1. Brutal critique — page by page

### 1.1 Home page (`web/app/page.tsx`, 30 lines)
**Score: 1/10.** It is two boxes that link to other pages. There is **zero data** on it. A surveyor opens the app, sees this, and immediately resents the time taken to get to the actual work.

What's wrong:
- No "what's on my plate this week" widget
- No portfolio totals (leases under management, total rent roll, value at risk)
- No critical-dates feed
- No recent activity
- No empty-state for the case when there genuinely is nothing — it always shows the same two boxes

What it should be: a **proper dashboard** with KPI cards (managed leases, rent roll, reviews-this-quarter, breaks-this-quarter), a "what needs me today" action list, an upcoming-events strip, and a recent-activity feed. monday.com calls this a "MyWork" view; Re-Leased calls it the "command center."

### 1.2 Leases list (`web/app/leases/page.tsx`, 158 lines)
**Score: 4/10.** Functional but thin.

What's wrong:
- **No search.** Surveyors with 400 leases can't find one by typing.
- **No filters.** No filter by status, by client, by property, by surveyor, by review-due, by sector.
- **No sort.** Click a column header — nothing happens.
- **No grouping.** There is no concept of *Property* as a parent entity. In reality leases belong to properties, and properties belong to landlord clients ("Mr Patel" owns N units, each with one or more leases over time).
- **No bulk actions.** Can't multi-select to bulk-approve, bulk-export, bulk-archive.
- **The "Model" column is engineer junk** — `claude-sonnet-4-6` is meaningless to a paralegal. Replace with property type / sector / client.
- **Status pills are too quiet.** monday.com uses bold pills that read at 3 metres. Ours are pastel-on-pastel and disappear.
- **Empty state has no example data.** First-run users see nothing. Should offer a "load demo lease" or "watch 90s walkthrough" CTA.
- **Upload button** is fine but should also accept drag-and-drop on the *whole table area* (very common pattern, easy to add).
- **Polling every 3s** is correct but with no visible progress indicator on the row.

### 1.3 Lease detail / Reviewer (`web/app/leases/[id]/`)
**Score: 7/10.** This is the strongest page — and it should be, because it's the workflow surface the user lives in. Still has issues:

- **Breadcrumbs missing.** Just `← All leases` is 1998. Want `Properties / 14 Crouch End Broadway / Leases / 2022 demise` plus a "view in calendar" link.
- **Critical Dates banner is duplicated** with the global Calendar (same data, scoped differently). Acceptable but confusing.
- **Field values use raw enum strings** — `basis: fri`, `basis: open_market`, `assignment with consent: yes` should be `Full Repairing & Insuring`, `Open Market`, `Yes ✓`. The raw enums leaked from the schema into the UI. Add a humanise layer.
- **Composite fields render as plain key:value rows.** Should be visually grouped with a card or thin border so each composite reads as a unit (e.g. "Rent review" should look like a *block*, not 4 stacked rows that bleed into "Tenant break").
- **Citation buttons are tiny blue links.** Surveyors will use these constantly. Make them prominent: a fixed-width pill `p.4 cl. 5.2 →`.
- **Quote blockquotes are good** — keep but italic + smaller font.
- **PDF viewer has no controls.** No zoom, no page-jump input, no fit-to-width toggle, no search-in-PDF. react-pdf supports all of this; we just didn't wire it.
- **No bounding-box highlight.** Per the gaps doc, citations have page+quote but no bbox. When the user clicks a citation, the PDF should highlight the source clause, not just scroll to the page.
- **No "next field" / keyboard navigation.** Power user wants j/k or arrow keys to move between flagged fields.
- **Side-letter linking is mentioned in the schema, missing in the UI** — there's no way to attach a side-letter to a parent lease via the reviewer. Defer if no real lease has side-letters yet.
- **No "request changes" / "flag for partner" workflow.** The schema has `assigned_user_id` but there's no UI to reassign or escalate.
- **The header info `claude-sonnet-4-6 · 59.2s` is engineer telemetry.** Hide this in a settings/debug pane or behind a small ⓘ icon. The user does not care.

### 1.4 Calendar (`web/app/calendar/page.tsx`, 154 lines)
**Score: 4/10.** It is a vertical list, not a calendar.

What's wrong:
- **No actual calendar grid.** Every property/PM tool worth using has a month-grid view. Re-Leased has it; monday.com has it; Outlook/Google Calendar are the muscle memory.
- **No view toggle.** Cannot switch list ↔ month ↔ timeline (gantt).
- **No filtering.** Can't show only break-notice deadlines, or only Mr Patel's events, or only this surveyor's events.
- **No "Today" anchor.** When you open the calendar, you have no immediate sense of "where am I in time."
- **No drag-to-reschedule** — this would be huge for the "schedule a follow-up" use case.
- **Year-grouped headings are correct** but lonely — needs sub-headings by month within each year and a sticky month/year header on scroll.
- **The "Generate pack" button on rent-review trigger rows is good** — but only present on this view, not on the lease-detail Critical Dates banner (it IS there now but only on `rent_review_trigger` — make it consistent).
- **Push-to-Google and Push-to-Outlook flags exist on the model** but there's no UI to actually push events. Dead state.

### 1.5 Comparables (`web/app/comparables/page.tsx`)
**Score: 5/10.** Table is fine; the surrounding analysis is missing.

What's wrong:
- **No map view.** Property comparables are *spatial* by nature. A simple Mapbox/Leaflet pin-map would dominate the page.
- **No similarity-to-subject scoring** — when a user is preparing a review for 14 Crouch End, the page should re-rank comps by proximity, age, area-similarity, and use-class match.
- **No descriptive stats** — median £/sq ft, ITZA range, deal volume by quarter.
- **No filtering / faceting** — by use class, by source, by date range, by area band.
- **CSV bulk import missing** — surveyors paste from EGi, they don't hand-type.
- **`Use class` is a free-text input** — should be a select with the actual UK Use Class values (B1, B2, B8, E, E(b), F1, F2, sui generis).
- **Source is a select but minimal styling** — should be a coloured badge per source.
- **Delete is a `confirm()` browser dialog** — replace with a proper confirm modal.

### 1.6 Packs list (`web/app/packs/page.tsx`)
**Score: 5/10.** Table is fine, but the dashboard view is missing.

What's wrong:
- **No "in flight"/"settled this quarter" KPIs at the top.** A partner wants to see at-a-glance how the pipeline is doing.
- **No filter by status.** No way to "show me only drafts that need review."
- **No surveyor assignment** column, no sort by created date.
- **The "uplift" achieved on settled packs is buried.** It should be a column: "Achieved £X (NN%)".

### 1.7 Pack detail (`web/app/packs/[id]/page.tsx`)
**Score: 6/10.** The four-doc tab structure is correct. The visual treatment is wrong.

What's wrong:
- **The markdown preview is rendered with `prose` (Tailwind Typography)** — it looks like a markdown doc, not a Word doc. Surveyors are about to download this as .docx and open it in Word. The preview should mimic Word: serif body, 1.15 line height, 11pt-equivalent, a paper-like card.
- **No diff/edit-in-place.** Surveyor needs to tweak the recommended opening rent inline before sending. Currently they download, edit in Word, lose the link to the platform.
- **Settlement input is a `window.prompt`.** Embarrassing. Should be a proper modal with the recommended range pre-filled and £-sign formatting.
- **No comparison to comparables on the same screen.** A surveyor reading the memo wants to flip to the comparables that supported it. Add a "view comparables used" link / drawer.
- **No "regenerate" action.** If the user adds a new comparable they want to re-run; currently they have to delete and re-trigger from the lease.
- **Doc kind sidebar is plain buttons.** Add a small icon per doc type (📝 memo, 📊 schedule, 📈 ITZA, ✉️ letter).

### 1.8 Integrations (`web/app/integrations/page.tsx`)
**Score: 5/10.** Three cards, fine.

What's wrong:
- **The "Slack webhook" flow has no in-UI input.** The integration card links to `/integrations/slack` (an HTML fallback page on the API). Should be a real form: paste webhook URL, optionally name the channel, test, save.
- **No Google/Outlook account list.** If a user connects Google, they should see *which* Google account is connected and an option to push specific events on demand.
- **No connection-test feedback** for any of them.
- **No disconnect button.**

### 1.9 Layout / global header (`web/app/layout.tsx`)
**Score: 4/10.**

What's wrong:
- **No sidebar.** Five top-nav links scales to maybe seven. We will easily exceed that. Re-Leased and monday.com both use sidebars with collapsible sections.
- **No global search.** No cmd+k.
- **No notifications.** No bell icon, no badge for "you have 3 unread items."
- **No firm/workspace switcher.** Multi-tenant later requires this.
- **`dev mode · auth disabled` text** — fine in dev, hide in prod.
- **No breadcrumbs in pages.** Header is too thin to anchor users.

---

## 2. What we're stealing — from Re-Leased

| Re-Leased pattern | Why it works | Our adaptation |
|---|---|---|
| **"Command centre" dashboard** as the home screen | Surveyor opens app → immediately sees what needs doing | New `/today` page replacing `/` |
| **Smart calendar** on dashboard with alerts | Reduces context-switching to a separate Calendar tab | Embed a 7-day strip on /today + full calendar at /calendar |
| **Rent Review Hub** centralising upcoming/overdue reviews | One funnel for the highest-margin workflow | New `/reviews` board (kanban: pending pack → drafted → sent → settled) |
| **Property → Lease hierarchy** | Reflects real ownership structure | Introduce `Properties` as a first-class nav item |
| **Communications hub** linking Outlook/Gmail | One place for tenant + landlord email threads | Defer to v2; capture intent in the data model now |
| **Mobile apps** (manager + tenant + landlord) | Field updates + landlord portal differentiation | Defer; build mobile-friendly responsive web first |
| **Activity log per lease** | Compliance + audit trail | Surface the existing `FieldEdit` audit table on lease detail |

## 3. What we're stealing — from monday.com (Vibe)

| monday pattern | Why it works | Our adaptation |
|---|---|---|
| **Bold colour-coded status pills** | Read at 3m, telegraph state instantly | Replace pastel pills with stronger Vibe-style |
| **Dense data tables with inline edit** | Power users edit in-place; no modals | Lease list editable cells (assigned-to, status) |
| **"Group by" on tables** | Same data, multiple lenses (by client, by status, by surveyor) | Add to leases + comparables + packs lists |
| **Sidebar nav with collapsible groups** | Scales to 30+ surfaces | Replace top-nav with sidebar |
| **Boards (kanban) for workflow stages** | Visual pipeline of work | `/reviews` and `/leases/in-progress` as boards |
| **"My Week" / personal view** | Surveyor sees only their own events | "Assigned to me" filter prominent |
| **Cmd+K command palette** | Power-user search + actions | Add via [cmdk](https://cmdk.paco.me/) |
| **Notification centre with bell + count** | Single place for "what's new" | Add to top-right of header |
| **Activity feed on every entity** | Audit + collaboration | Render `FieldEdit` on lease detail |
| **Empty states with sample-data** | First-run impression | "Load demo lease" / "Watch a 90s tour" CTAs |

---

## 4. Information architecture — redesign

### 4.1 New navigation (sidebar)

```
LeaseOS
─────────────────────
🏠 Today                       ← new — replaces /
🔍 [search ⌘K]                  ← new — global search
─────────────────────
📋 Properties                   ← new — groups leases by physical property
   └ All
   └ By client
   └ Recently added
📄 Leases
   └ All
   └ Awaiting review            ← filtered view
   └ Approved
   └ My queue                   ← assigned to me
📅 Calendar
   └ Month
   └ List
   └ Timeline                   ← gantt-ish
🔁 Reviews                      ← new — kanban board
   └ Pack pending
   └ Draft
   └ Sent
   └ Settled
📊 Comparables
   └ All
   └ Map view                   ← new
📦 Packs
   └ All
   └ Mine
─────────────────────
⚙️  Settings
   └ Profile
   └ Firm
   └ Integrations               ← move under settings
   └ Templates                  ← new — house style for memos/letters
   └ Members                    ← new — multi-tenant prep
   └ Audit log                  ← new
```

### 4.2 Top bar contents

- LeaseOS logo (collapses sidebar on click)
- Workspace switcher (e.g. "Claridges Commercial" — multi-tenant prep)
- Global search — cmd+K opens a command palette covering: leases, properties, comparables, events, surveyors
- Notification bell with count
- "+" quick-create dropdown: Lease (upload), Property, Comparable, Manual event
- User menu (Clerk)

### 4.3 New first-class entity: **Property**

Today every Lease has a `property_id` FK already (in `models.py`). We never use it. Promote it: a Property has 1..N Leases over its lifetime (e.g. unit re-let in 2032). A landlord client owns N Properties. The Properties page becomes the natural pivot for portfolio-level reporting.

---

## 5. Visual system — adopt then customise

### 5.1 Stack decision

Stay on **Tailwind v4** (already in the repo) but add:
- **shadcn/ui** for accessible primitives (Dialog, DropdownMenu, Tabs, Tooltip, Toast, Command palette, Popover, Sheet) — handpick components, they live in our repo as plain tsx
- **lucide-react** for icons (already a soft dependency of shadcn)
- **cmdk** for the command palette
- **Mapbox GL** or **Leaflet** for the comparables map (Leaflet free, Mapbox paid but slicker)

Do **not** adopt Vibe directly — it is a React component library with monday-specific theming. We pull *patterns* from Vibe, not code.

### 5.2 Token additions (extend `globals.css`)

```css
:root {
  /* Status palette — solid, readable at a glance */
  --status-uploaded: #71717a;
  --status-extracting: #f59e0b;
  --status-review: #2563eb;
  --status-approved: #059669;
  --status-failed: #dc2626;

  /* Event type accents */
  --event-rent-review: #2563eb;
  --event-break: #dc2626;
  --event-expiry: #7c3aed;
  --event-insurance: #0891b2;
  --event-epc: #ea580c;
  --event-deposit: #16a34a;

  /* Surface elevations */
  --surface-page: #f8f9fb;     /* slightly cooler off-white */
  --surface-card: #ffffff;
  --surface-sunken: #f1f3f6;
  --surface-hover: #eef0f4;

  /* Reviewer-specific accent */
  --citation-blue: #1d4ed8;
}
```

### 5.3 Type scale

Stop using Geist for everything. Add **Inter Tight** for headings (more compact, more "operational SaaS"), keep Geist Mono for code/IDs, **Source Serif 4** for the Word-doc previews on the pack page so they read like an actual document.

### 5.4 Component primitives to create (`web/components/ui/`)

- `<StatusPill status="..." />` — colour-coded, bold, consistent
- `<Citation page="..." clause="..." onJump={} />` — the prominent fixed-shape pill
- `<KpiCard title value delta />` — for the dashboard
- `<EventChip type="rent_review_trigger" date /> ` — calendar event chip
- `<EmptyState icon title body cta />` — shared across all empty states
- `<PageHeader breadcrumbs title actions />` — replaces ad-hoc h1+button pattern
- `<DataTable columns rows groupBy filters search />` — replace the three hand-rolled tables
- `<CommandPalette />` — cmd+K
- `<Drawer />` from shadcn for "view comparables used" etc.

### 5.5 Humanise the field display

New file `web/lib/humanise.ts` mapping enum values to UI labels:

```ts
export const ENUM_LABELS = {
  basis: { fri: "Full Repairing & Insuring", iri: "Internal Repairing & Insuring", schedule_of_condition: "Schedule of Condition (limited)", ... },
  rent_review_basis: { open_market: "Open market", rpi: "RPI-linked", cpi: "CPI-linked", fixed: "Fixed uplift", hybrid: "Hybrid" },
  yes_no: { true: "Yes ✓", false: "No ✗" },
  use_class: { "E(b)": "E(b) — restaurant/café", "E": "E — commercial/business", "F1": "F1 — non-residential institutions", ... },
};
```

Use everywhere a value is displayed. Stop leaking schema.

---

## 6. Page-by-page redesign brief

### 6.1 New: `/today` (P0)

Replaces `/`. Single screen. Above the fold.

```
┌─────────────────────────────────────────────────────────────┐
│  Good morning, Sarah                              Mon 4 May │
├─────────────────────────────────────────────────────────────┤
│  [12]    [£487k]   [3]      [1]       [82%]                │
│  Leases  Rent      Reviews  Breaks    Coverage              │
│  managed roll p.a. due Q3   due Q3    rate                  │
├─────────────────────────────────────────────────────────────┤
│  Action this week                                           │
│  ⚠ Confirm break notice — 14 Crouch End Broadway   3d left │
│  📦 Generate pack — Hadley Highway                  6d left │
│  📅 Insurance renewal — 22 Park Road               12d left │
├─────────────────────────────────────────────────────────────┤
│  Next 30 days strip ─ mini calendar with event dots         │
├─────────────────────────────────────────────────────────────┤
│  Recent activity                                            │
│  Priya approved 14 Crouch End Broadway              09:14   │
│  Pack generated for Hadley Highway                  Yest    │
└─────────────────────────────────────────────────────────────┘
```

Everything is a link to the relevant detail.

### 6.2 New: `/properties` (P0)

Top: a portfolio table with one row per property (address, sector, current tenant, current rent, lease expiry, next event). Clicking a row drills to a property detail page that shows: documents, history of leases on this property, calendar, photos.

This is also where a landlord-client portal naturally hangs in v2.

### 6.3 Revised: `/leases` (P0)

- Add **left filter rail**: status, client, surveyor, sector, term-remaining bucket, has-overdue-event
- Add **search** in header
- Add **group by** dropdown: client, status, surveyor, none
- Add **bulk select** column with bulk actions (export, archive, reassign)
- Replace `Model` column with `Property` and `Client`
- Make status pills bold per new system
- Add row hover quick-actions: open, generate pack (if review due), download docs

### 6.4 Revised: `/leases/[id]` (P1)

- Replace `← All leases` with breadcrumbs
- Move `Approve lease` button to a sticky right-rail action panel (always visible)
- Group fields into **collapsible sections** (Parties, Term & rent, Review, Breaks, Repair & alienation, Operational dates) — current 17-row flat list is overwhelming
- Each composite field becomes a card with title, inline-edit values, citation pill, and small "edit" pencil
- Right rail: critical dates (sticky), quick links (calendar, comparables for this property, packs for this lease, documents, audit log)
- PDF viewer: add zoom, fit-to-width, page jump input, search-in-pdf, citation-bbox highlighting
- Engineering telemetry hidden behind ⓘ tooltip

### 6.5 Revised: `/calendar` (P1)

- Add a **month grid** as the primary view (use [react-big-calendar](https://github.com/jquense/react-big-calendar) or build atop date-fns)
- View toggle: Month / Week / List / Timeline
- **Today button**, prev/next month chevrons
- Filters: event type, lease, client, surveyor
- Click event → opens a side drawer with details + actions (generate pack, push to Google, push to Outlook, mark done)
- Drag a Critical-class event to a new date → triggers a "are you sure? this is a hard date" dialog (cosmetic only — derived dates should not actually move)

### 6.6 New: `/reviews` (P1)

Kanban board. Columns: `Pack pending` (rent_review_trigger event due in next 6 months, no pack yet) → `Draft` (pack created) → `Sent` → `Settled`.

Each card: lease label, current rent, recommended opening, settlement range. Drag-to-advance updates pack status. This is the partner's favourite view.

### 6.7 Revised: `/comparables` (P1)

- Top-of-page **map** with pins clustered by area (Mapbox/Leaflet)
- Below the map, a filter row (use class, source, date range, area band)
- Table with **descriptive stats row**: median £/sq ft, range, count, p25/p75
- Add similarity-to-subject column when navigated from a lease (`/comparables?for_lease={id}`)
- CSV import: drag a `.csv` exported from EGi onto the page → preview → confirm import
- Use class becomes a select; source becomes a coloured badge

### 6.8 Revised: `/packs/[id]` (P1)

- Markdown preview restyled to look like Word: serif body, paper card with shadow, page-margin padding
- Inline edit on the recommended opening / settlement range numbers — saves to the pack record
- Modal for "Record settlement" (replace `prompt()`)
- Right rail: lease summary, comparables used, "regenerate with new comps" button
- Tab order: Memo → Comparables → ITZA → Letter (currently fine)
- Add a top status pill row (matching pack table)

### 6.9 New: `/settings` hub (P2)

Sub-pages:
- **Profile** — Clerk-managed
- **Firm** — name, logo, address, default surveyor signatures
- **Integrations** — moved from top nav; same content
- **Templates** — house style for landlord memos, comparables tables, trigger letters (Word .docx upload)
- **Members** — invite users, roles
- **Audit log** — read-only feed of every change in the workspace

---

## 7. Phased rollout

### Milestone P0 — "Shell upgrade" (~1 week)

Ship the **navigation and dashboard** changes first. They make the rest feel real even before the deep page redesigns land.

1. Sidebar nav (collapsible, persistent)
2. New `/today` dashboard with KPI cards + action list + 7-day strip
3. Global search + cmd+K palette (lease/property/comparable lookup)
4. Notification bell stub (no unread state yet — just the icon and a panel that says "no notifications")
5. Status-pill component + roll out across `/leases` and `/packs` lists
6. Humanise layer for enum values
7. Remove engineer telemetry from user-facing surfaces

**Exit criterion:** Sarah opens the app on Monday morning and the first screen tells her exactly what she needs to do this week.

### Milestone P1 — "Workflow surfaces" (~1 week)

The pages where work actually happens.

1. Properties as a first-class entity + `/properties` page
2. Leases list redesign (filters, search, group-by, bulk actions)
3. Lease detail redesign (breadcrumbs, sticky right rail, collapsible sections, humanised fields)
4. Calendar month-grid view + filters + drawer-on-click
5. `/reviews` kanban board
6. Pack detail polish (Word-style preview, inline edit, comparables drawer)

**Exit criterion:** Sarah does an entire end-to-end workflow (upload → review → approve → calendar → pack → settle) without breaking out of the new IA.

### Milestone P2 — "Polish + power-user" (~1 week)

1. Comparables map + similarity scoring + CSV import
2. PDF viewer controls (zoom, page jump, bbox highlight on citation click)
3. Keyboard navigation in reviewer (j/k between flagged fields)
4. Settings hub (firm, templates, members, audit log)
5. Integrations: real in-UI Slack form + connection-test feedback + disconnect
6. Activity feed on lease detail
7. Empty-state polish + "load demo data" everywhere
8. Accessibility audit (axe, keyboard-only run)

**Exit criterion:** Pilot-ready visual polish. Take the screenshots that go in the Claridges sales deck and the peer-firm pitches.

---

## 8. Files to add / modify (concrete)

### Add
```
web/components/ui/
  status-pill.tsx
  citation.tsx
  kpi-card.tsx
  event-chip.tsx
  empty-state.tsx
  page-header.tsx
  data-table.tsx
  command-palette.tsx
  drawer.tsx
  modal.tsx (shadcn)
  toast.tsx (shadcn)
web/components/nav/
  sidebar.tsx
  topbar.tsx
  notification-bell.tsx
  workspace-switcher.tsx
web/lib/
  humanise.ts          # enum → label map
  use-keyboard.ts      # j/k navigation hooks
  use-search.ts        # debounced fuzzy search
web/app/
  today/page.tsx       # new home — KPIs + actions + 7-day strip
  properties/page.tsx
  properties/[id]/page.tsx
  reviews/page.tsx     # kanban
  settings/layout.tsx
  settings/profile/page.tsx
  settings/firm/page.tsx
  settings/integrations/page.tsx   # moved
  settings/templates/page.tsx
  settings/members/page.tsx
  settings/audit/page.tsx
```

### Modify
```
web/app/layout.tsx         # replace top-nav with sidebar + topbar
web/app/page.tsx           # delete or 302→/today
web/app/leases/page.tsx    # filters, search, bulk, group-by, status pills, replace Model col
web/app/leases/[id]/page.tsx        # breadcrumbs, sticky right rail
web/app/leases/[id]/FieldsPanel.tsx # collapsible sections, humanise, citation pill
web/app/leases/[id]/PdfViewer.tsx   # controls + bbox highlight
web/app/calendar/page.tsx  # add month grid, view toggle, filters, drawer
web/app/comparables/page.tsx        # map, stats row, similarity, CSV import
web/app/packs/[id]/page.tsx         # Word-style preview, inline edit, modals
web/app/integrations/page.tsx       # delete (moved to /settings/integrations)
```

### Backend additions (small)

```
src/leaseos/api/routes/properties.py    # GET / POST
src/leaseos/api/routes/notifications.py # list + mark-read
src/leaseos/api/routes/audit.py         # read FieldEdit + new generic AuditLog
src/leaseos/api/models.py               # add Notification, AuditLog tables
```

No existing route is broken; this is purely additive.

---

## 9. Quick wins to do TODAY (≤ 2 hours each)

If you want to feel the change before committing to the full plan, do these first:

1. **Bold the status pills** — change `bg-blue-100 text-blue-800` to `bg-blue-600 text-white`-style across `STATUS_STYLE` in `web/app/leases/page.tsx` and `EVENT_STYLE` in `web/app/calendar/page.tsx`.
2. **Hide engineer telemetry** — wrap `claude-sonnet-4-6 · 59.2s` on lease detail in a `<details>` or behind a tooltip.
3. **Humanise enums** — ship the `humanise.ts` file even if it just covers the 5 worst offenders (`fri`, `open_market`, `yes`/`no`, use class).
4. **Fix the `window.prompt` for settlement** — replace with a small in-page form on `/packs/[id]`.
5. **Add a real "search box" stub** to the top of `/leases` — even non-functional it signals "this is a tool, not a demo."
6. **Replace `← All leases` with breadcrumbs** on the lease detail page.

These six changes take half a day and shift the UX read from "engineer demo" to "early product."

---

## 10. What we are deliberately NOT doing yet

- **Mobile native apps** — Re-Leased ships these, we don't need to. Responsive web first.
- **Custom dashboard widgets** — monday's "drag your own widget grid" is a tar pit. Ship one good dashboard, iterate.
- **Theming / dark mode** — defer until a customer asks.
- **In-app chat / comments** — the "communications" Re-Leased pattern is huge; defer to v2.
- **Tenant-facing portal** — defer to v2.
- **Drag-to-reschedule on the calendar with real DB writes** — calendar drag is a UX classic but writing back through derived events is non-trivial; mock it for v1.

---

## 11. Verification

For each milestone:
1. Take 1080p screenshots of every page before/after — keep in `docs/screens/<date>/`.
2. Run an unscripted 5-minute walkthrough with a real surveyor (Claridges' Sarah equivalent) using Loom.
3. Score on three axes: **information density**, **action obviousness**, **professionalism**. Targets: 8/10 minimum on all three by end of P1.
4. Compare side-by-side against a Re-Leased trial account screenshot of the same workflow.

---

## Appendix — Gaps the Chrome connector would have closed

I tried the Claude-in-Chrome connector and it wasn't reachable — likely the extension needs to be open + signed in. With it I would have:
1. Walked every page at 1440×900 and 1024×768 and screenshotted, for the before/after baseline.
2. Pulled real network/console errors that the codebase doesn't surface.
3. Reproduced the "Failed to load PDF" symptom you saw earlier from a fresh browser to confirm it's truly gone.
4. Run a quick axe audit for accessibility regressions.

Worth re-trying once the extension is live — the rest of this plan stands on the code + your screenshots regardless.
