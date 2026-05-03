# Project rules for Claude — LeaseOS

This file is automatically read by Claude Code at the start of every session in this repo. It contains project-wide rules that override default behaviour.

---

## 1. Docs-update-before-commit rule (MANDATORY)

**Whenever you commit code in this repo, you MUST first update both [`context.md`](./context.md) and [`PRD.md`](./PRD.md) to reflect what changed in the commit.**

Practical workflow on any commit:

1. Stage your code changes.
2. **Before** running `git commit`, edit `context.md` to update:
   - The "Last updated" date at the top
   - §6.2 (code structure) if files were added/renamed/removed
   - §6.3 (what works end-to-end) if a user-visible capability changed
   - §9 (known gaps) — strike out anything done, add anything newly discovered
3. **Before** running `git commit`, edit `PRD.md` to update:
   - The status icon (✅ / 🚧 / 📋 / ⏸️) for any item that changed phase
   - §10 (recent commits worth knowing) — add the new SHA + a one-line summary after the commit lands
4. Stage the doc updates with the same `git add` and include them in the same commit.
5. Commit message convention: short summary first, then "(updates context.md + PRD.md)".

### Exceptions

- Pure WIP commits in a non-`main` branch — fine to skip until the branch is merged.
- Commits that are *only* doc fixes — obviously don't need to update themselves further.
- Commits made by external tooling (e.g. dependabot) — exempt.

### When in doubt

If you cannot tell whether a commit warrants a doc update, **err on the side of updating**. The cost of one extra paragraph in `context.md` is much lower than the cost of someone reading a stale doc and getting the wrong picture of the project.

---

## 2. Where things live (so you don't recreate them)

| Doc | Purpose |
|---|---|
| `README.md` | Run-it-locally quick start |
| `PRD.md` | **Master index of every PRD/milestone with status** |
| `context.md` | Deep onboarding — origin, business case, deep dives, code map, glossary |
| `UX_PLAN.md` | UI/UX critique + 3-milestone redesign |
| `DEPLOY.md` | How to ship to Render + Vercel |
| `CLAUDE.md` | This file — project rules for AI agents |

If you find yourself writing a new doc at the project root, first ask whether it should be a section in one of the existing docs.

---

## 3. Code conventions worth knowing

- **Backend** is Python 3.11+, FastAPI, SQLAlchemy 2.0, Pydantic v2.
- **Frontend** is Next.js 16 (App Router, Turbopack), React 19, Tailwind v4. **Note: Next.js 16 renamed `middleware.ts` → `proxy.ts` and uses bold colour-coded status pills via `<StatusPill>` in `web/components/ui/`.**
- **Models**: Sonnet 4.6 default, Opus 4.7 1M for long leases. Always enable prompt caching.
- **Status pills**: do NOT inline `bg-blue-600 text-white` etc. Use `<StatusPill group="..." value="..."/>` from `web/components/ui/status-pill.tsx`.
- **Enum display**: do NOT show raw enum values to the user. Use `humanise(group, value)` from `web/lib/humanise.ts`.
- **Background work**: extraction + pack generation use FastAPI `BackgroundTasks`. If concurrency matters later, switch to RQ/Celery — don't add a third pattern.
- **Demo data**: regenerate with `scripts/generate_demo_lease.py` (Olive & Vine lease) and `scripts/seed_n8_comparables.py` (5 N8 retail comps).

---

## 4. Things that are deliberately deferred — don't surprise-build them

- Mobile native apps
- Dark mode
- Multi-tenancy (single-tenant only for v1 pilot)
- Tenant-facing portal
- Drag-to-reschedule on the calendar with real DB writes
- In-app comments / chat

If the user asks for any of these, confirm scope before building.
