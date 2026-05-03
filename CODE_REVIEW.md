# LeaseOS — Code Review (round 1)

- Date: 2026-05-03
- Reviewer: Explore agent (LeaseOS codebase audit) + author follow-up
- Scope: backend (`src/leaseos/`), frontend (`web/`), integrations, deploy config
- Test suite: **66 tests passing** (`tests/`) — see §3

---

## TL;DR

The product is functionally solid — extraction, two-pass merge, calendar derivation, pack generation, and the new sidebar/Today shell all work end-to-end. **Three HIGH-severity issues were found**, two of which are fixed in this commit:

| Severity | Finding | Status |
|---|---|---|
| HIGH | Filename traversal on lease upload (`../etc/passwd`) | ✅ **fixed** — `_safe_filename()` |
| HIGH | Path traversal on document download (`FileResponse(doc.storage_path)`) | ✅ **fixed** — `_serve_inside_sandbox()` |
| HIGH | OAuth state in-process dict — lost on uvicorn reload / multi-instance | 📋 **deferred** — needs Redis or DB |

10 MEDIUM and 10 LOW findings are catalogued in §2, mostly to be addressed before pilot launch with a real customer. Test suite added covers the highest-leverage pure logic; everything passes.

---

## 1. Methodology

1. **Read every backend file** that touches data (routes, worker, models, extract, pack_generator, integrations) and the major frontend pages (Layout, FieldsPanel, RightRail, MonthGrid, Comparables, Today).
2. **Categorised** findings by severity (HIGH / MED / LOW / NIT) with file:line references.
3. **Wrote pytest suite** for the highest-value pure functions:
   - Month math (`_shift_months`, `_add_months`, `_subtract_months`)
   - Recurring rent-review expansion (`_expand_review_dates`)
   - Full event derivation (`derive_events`)
   - Two-pass merge (`_merge_records`, `_strip_meta`)
   - Address normalisation + property dedup (`normalise_address`, `_ensure_property`)
   - Route shape via TestClient (404s, 422s, list endpoints, comparables CRUD)
   - Filename sanitisation regression (the new `_safe_filename`)
4. **Patched the two HIGH-severity security findings** that are local code fixes (the third needs an out-of-process state store).

---

## 2. Findings

### HIGH

**H1 — Filename traversal on lease upload.** `src/leaseos/api/routes/leases.py:88` (pre-fix). `Path(file.filename)` was concatenated into `storage_dir` without sanitisation; an upload named `../../etc/passwd` would escape the sandbox.
**Status:** ✅ Fixed in this commit. New `_safe_filename()` strips path components, rejects null bytes, allowlists `[A-Za-z0-9._-]`, caps length at 200. Used by both lease upload and the side-letter attach endpoint. Regression test in `tests/test_security.py`.

**H2 — Path traversal on document download.** `src/leaseos/api/routes/leases.py:170,191` and `packs.py:250–254` (pre-fix). `FileResponse(doc.storage_path)` returned whatever path was on the row. A malicious or corrupted DB row could point outside the storage sandbox.
**Status:** ✅ Fixed for the lease document endpoints. New `_serve_inside_sandbox()` resolves the path, `relative_to(storage_dir.resolve())` checks containment, and returns 403 if it escapes. Pack-document download (`packs.py`) still needs the same wrapper — added to the follow-up list.

**H3 — OAuth state in-process dict.** `src/leaseos/api/routes/integrations.py:134`. `_STATES: dict[str, dict]` lives in process memory. Any in-flight Google/Microsoft OAuth dance dies on uvicorn reload, multi-instance deploy, or process crash. User lands on the callback with an "Invalid or expired OAuth state" 400.
**Status:** 📋 Deferred. Needs an out-of-process store (Redis or a small `oauth_states` table). For pilot use with a single dyno it's tolerable — flagged for first prod commit.

### MEDIUM

**M1 — Race on concurrent property creation.** `worker.py:128–141`. Two simultaneous extractions of the same address both miss the `SELECT`, both `INSERT`. No `UNIQUE` constraint on `address_normalised`. Today this is theoretical (one user, sequential uploads), but multi-tenant + auto-trigger cron makes it real.
**Fix:** Add `UNIQUE` index on `address_normalised`, or upsert.

**M2 — N+1 on lease.property in list endpoint.** `routes/leases.py:101`. `list_leases()` iterates and accesses `l.property.address` for each row → one extra query per lease. With 400 leases that's 400+ extra round-trips.
**Fix:** `select(Lease).options(joinedload(Lease.property))`.

**M3 — N+1 on lease.documents in detail endpoint.** Same shape, `routes/leases.py:133`. `len(lease.documents)` and the `[DocumentOut(...) for d in lease.documents]` both trigger lazy loads.
**Fix:** `selectinload(Lease.documents)`.

**M4 — CORS defaults dangerous when auth is off.** `api/main.py:36`. If `LEASEOS_CORS_ORIGINS` is unset *and* `LEASEOS_AUTH_REQUIRED=false` (dev default), any origin can hit the API. Locally fine, accidentally-shipped catastrophic.
**Fix:** Add a startup assertion: if `auth_required` is false, allowed origins must be localhost-only.

**M5 — Anthropic 5xx → lease stuck in EXTRACTING.** `worker.py:36–45`. The catch-all sets status FAILED, but if the DB commit itself fails (DB down, network blip), the lease stays in EXTRACTING and the task is lost. No retry.
**Fix:** Wrap in a retry helper with exponential backoff for transient errors; surface a "stuck >10 min" stale-job sweeper.

**M6 — Two-pass merge silent on null-vs-value disagreement.** `extract.py:219–273`. If pass 1 has a value and pass 2 has `null`, the disagreement note just says "the second-pass reading differed" — doesn't distinguish "different value" from "couldn't find".
**Fix:** Include the alt value (or "not found") in the note.

**M7 — Slack webhook URL stored plaintext.** `models.py:219`. Webhook URLs grant write access to a Slack channel; if the DB is dumped, every customer's channels can be spammed.
**Fix:** Encrypt at rest. Use `cryptography.fernet` keyed off an env-var-supplied master key.

**M8 — Pack document download missing ownership check.** `routes/packs.py:243–254`. `db.get(PackDocument, doc_id)` then `FileResponse` — no verification that the pack belongs to the current user / firm.
**Fix:** Add the same `lease.assigned_user_id` / firm check used elsewhere; eventually multi-tenant scope.

**M9 — Secrets risk in worker exception logs.** `worker.py:43,114` and `pack_worker.py:94`. `traceback.format_exc()[-2000:]` includes locals. If shipped to a third-party log sink, may leak API keys / model outputs.
**Fix:** Truncate to exception message + file:line only; redact known secret-shaped strings.

**M10 — `humaniseCompositeValue` flattens nested objects badly.** `web/lib/humanise.ts:144–149`. Joining with `", "` on nested objects yields `"a = [object Object]"`. Display-only, no data loss, but ugly.
**Fix:** `JSON.stringify` for the unexpected branch.

### LOW

**L1 — `datetime.utcnow()` deprecated** in two route files. Replace with `datetime.now(timezone.utc)`. Surfaced as warnings during the test run.

**L2 — Cache-Control headers missing.** Authenticated GET endpoints are browser-cacheable; should be `no-store`.

**L3 — `_safe_filename` regex strips dots from "valid" input.** A filename like `..` strips to empty and rejects (correct), but `My Lease — 2024.pdf` becomes `My_Lease___2024.pdf` (acceptable but loses user signal). NIT.

**L4 — Inline `from fastapi.responses import FileResponse`** inside route handlers. Move to module top. (Done as part of H2 fix.)

**L5 — Pack-status enum allowed in ad-hoc string comparisons.** Use `PackStatus.DRAFT.value` consistently; one place uses raw strings.

**L6 — Comparables `use_class` filter logic has a no-op branch.** `web/app/comparables/page.tsx:73` has dead code (`// Allow rows with no use_class through if any class is enabled`) followed by the contradicting `if`. Either remove the comment or implement the intent.

**L7 — Unused imports.** `web/app/integrations/page.tsx` imports `Hash` aliased as `SlackIcon` — fine, but the original `Slack` import attempt left a comment in history. NIT.

**L8 — Missing tests for pack generator** (`pack_generator.py`). Hard to test without mocking Anthropic; the docx renderer specifically (`render_docx`, `_render_table`) is testable in isolation. Follow-up.

**L9 — `_expand_review_dates` allows up to 100 cycles.** `events.py:81`. Defensive cap, fine, but undocumented; add a comment.

**L10 — Frontend uses `confirm()` for destructive actions** in `comparables/page.tsx` and `RightRail.tsx`. Browser confirm dialogs are ugly; replace with the modal pattern we already have on `/packs/[id]`.

### NIT

**N1** — Date comparison without timezone awareness in `events.py:upcoming_only()`. Fine for single-region UK use; flag if we go multi-region.
**N2** — Engineering telemetry (`extraction_model`) is hidden in the UI but still logged to API responses. Consider scoping to `?include_meta=true`.
**N3** — Some inline `<style>` props on `Markdown` (in pack page) — could move to Tailwind classes for consistency, but the inline styles guarantee Word-like render.

---

## 3. Test suite

**66 tests passing**, ~1.4s wall time. Run locally:

```bash
.venv/bin/pip install -e ".[test]"
.venv/bin/pytest -v
```

| File | Tests | Coverage |
|---|---|---|
| `test_events.py` | 22 | `_shift_months` / `_add_months` / `_subtract_months` (incl. leap year + month boundaries), `_expand_review_dates` (cycle expansion, dedup, expiry cap), `derive_events` (full record → events of every type, no-break case, no-deposit case, annual insurance recurrence) |
| `test_extract_merge.py` | 11 | `_strip_meta` (top-level, nested, lists, scalars), `_merge_records` (identical agreement, value disagreement → confidence drop, note appending, metadata-only diff = no disagreement, composite disagreement, null-vs-value, party company-number disagreement) |
| `test_properties.py` | 10 | `normalise_address` (lowercasing, whitespace, punctuation, idempotence, empty), `_ensure_property` (create new, return existing, dedup via normalisation, no-overwrite of metadata) |
| `test_routes.py` | 16 | `/health`, every list endpoint returns `[]`, 404s on unknown IDs, comparables CRUD (create / list / bulk / delete), validation 422s, auto-trigger dry-run + 365-day cap |
| `test_security.py` | 7 | `_safe_filename` (passes through valid, strips traversal, rejects null byte, rejects empty, caps length, rejects only-special-chars input) |

**Deliberate gaps for follow-up:**
- The Anthropic-calling functions (`extract`, `extract_two_pass`, `summarise_ancillary_doc`, `generate_pack`) are integration-tested manually via the running app; not unit-tested because mocking the Anthropic SDK is real work and the value/effort ratio is low until we have a real eval corpus.
- `pack_generator.render_docx` is testable in isolation (just markdown → .docx) but skipped this round.
- Frontend has zero tests. A Playwright smoke test for the upload → review → approve → pack flow is the next logical addition.

---

## 4. What's fixed in this commit

- **H1 — `_safe_filename()` + applied to upload + side-letter attach** (`routes/leases.py`)
- **H2 — `_serve_inside_sandbox()` + applied to both document GETs** (`routes/leases.py`)
- pytest scaffolding (`tests/conftest.py` with `StaticPool` for in-memory SQLite sharing)
- 66 tests across 5 files

## 5. Follow-up (not in this commit)

Ranked by priority for a pilot deployment:

1. **H3** — OAuth state in Redis or DB
2. **M4** — startup assertion that prod must have explicit CORS origins
3. **M2 + M3** — eager-load `Lease.property` and `Lease.documents` in list endpoints
4. **M7** — encrypt Slack webhook URLs
5. **M8** — pack-document ownership check + same `_serve_inside_sandbox` treatment
6. **L1** — replace `datetime.utcnow()` (warnings will become errors in Python 3.14)
7. **L8** — tests for `render_docx` + `_render_table` (no API needed)
8. Frontend Playwright smoke test
