# UI Unification — Final Closure Report

**Status:** ✅ Closed
**Phase window:** R.1 → R.13 (plus the preceding architectural phases
C.1 – C.8, Phase 2, 5, 6, 7, 7.1, 8, 8.1, 9, 9.1)
**Branch of record:** `main` (all work merged)
**Pull requests:** #5 (architectural) · #6 → #14 (UI unification rounds)
**Reference document:** [`docs/UI_TEMPLATES.md`](./UI_TEMPLATES.md)

This is the closing document for the unification phase that started as
“dedupe + clean up + normalise patterns” and grew into a full pass over
the frontend plus a hardening pass over the API. After this report the
project moves into a new phase: **Operational Practical Review**.

No new wide-sweep unification rounds will be opened. Anything still
outside the unified pattern is treated as low-priority technical debt
and is listed in §4.

---

## 1. What was unified

### 1.1 API layer (architectural, PR #5 and predecessors)

| Concern | Unified pattern | File |
| ------- | --------------- | ---- |
| Error contract | `TypedError` hierarchy (`ValidationError`, `NotFoundError`, `ConflictError`, `ForbiddenError`, `IntegrationError`, `LifecycleError`) + `handleRouteError({error, code, field, fix, meta})` | `artifacts/api-server/src/lib/errorHandler.ts` |
| Role guards | Single shared `assertRole(req, roles[])` | `artifacts/api-server/src/lib/roleGuards.ts` |
| Lifecycle transitions | `applyTransition()` — reads row under `FOR UPDATE`, validates `fromStates`, writes `event_logs`, emits bus event, writes `audit_logs`, all in one transaction | `artifacts/api-server/src/lib/lifecycleEngine.ts` |
| Events & audit | Every transition goes through `emitEvent → listeners → audit_logs` — no direct inline audit writes | `artifacts/api-server/src/lib/events.ts` + listeners |
| Delete guards | Phase C.7b — each destructive endpoint returns `409 CONFLICT` with `meta.blockers: string[]` instead of a free-text error | all delete routes |
| Soft-delete schema | `deletedAt` columns + `WHERE deletedAt IS NULL` filters, cross-module swept in Phase 9/9.1 | `db/schema.sql` + migrations |

**Counts after merge:**

* `handleRouteError` used in **53** route files
* `assertRole` used in **11** route files
* `requireRole` local helper — **0** remaining
* `validationError(res, ...)` legacy call site — **0** remaining
* Phase 6 lint guard (`scripts/src/lint-patterns.mjs`) enforces both

### 1.2 UI layer (PRs #6 → #14)

| Concern | Unified primitive | File |
| ------- | ----------------- | ---- |
| Page frame | `PageShell` + `PageSection` | `components/page-shell.tsx` |
| Page header + breadcrumbs + error boundary | folded into `PageShell` | same |
| Status chip | `PageStatusBadge` with central `STATUS_MAP` (domains: `hr`, `finance`, `fleet`, `legal`, `projects`, `property`, `support`, `custody`, `zatca`, `communications`, `shared`) | `components/page-status-badge.tsx` |
| Create / Edit forms | `CreatePageLayout` + `FormShell` + field primitives (`FormTextField`, `FormSelectField`, `FormGrid`, `FormActions`) auto-routing `VALIDATION_ERROR` to `form.setError` | `components/form-shell.tsx`, `components/create-page-layout.tsx` |
| Detail / view pages | `EntityDetailPage` + `EntityTimeline` | `components/shared/entity-detail-page.tsx`, `components/shared/entity-timeline.tsx` |
| Destructive actions | `ConfirmDeleteDialog` — fetches `/impact-preview`, surfaces `meta.blockers` from the server | `components/shared/confirm-delete-dialog.tsx` |
| Mutations | `useApiMutation` — reads `{code, field, fix, meta}` from `ApiError`, picks Arabic toast titles by code, supports `silent`, `onFieldError`, `onCodeError`, success override | `lib/api.ts` |
| Queries | `useApiQuery` (React Query wrapper with typed errors) | `lib/api.ts` |

**Adoption counts (across `artifacts/ghayth-erp/src/pages`):**

| Metric | Before R.1 | After R.13 |
| ------ | ---------- | ---------- |
| Total `.tsx` pages | 322 | 322 |
| Files importing `PageShell` | ~58 (18%) | **143** (44%) |
| Files importing `PageStatusBadge` | ~6 | **81** |
| Files importing `useApiMutation` | 76 | **107** |
| Raw `useMutation` call sites in pages | ~70 | **0** (the 5 remaining textual hits are all doc-comments describing the migration, not real calls) |
| `StatusBadge` shim (`components/ui/status-badge.tsx`) | present | **deleted** (R.10) |

---

## 2. What legacy patterns were removed

These were patterns actively in use that have been retired:

1. **Local `requireRole(req, roles)` helpers** — every route file that
   had its own copy now imports `assertRole`. The lint guard forbids
   regression.
2. **`validationError(res, ...)` ad-hoc JSON responses** — all errors now
   flow through `TypedError → handleRouteError` so the body shape is
   guaranteed. Lint guard enforces this.
3. **Raw `useMutation` + `useToast` + `useQueryClient` triplets** —
   replaced with `useApiMutation` which bundles the three and plugs
   into the typed error contract. Zero real call sites remain in the
   page tree.
4. **Per-page ad-hoc `statusMap` objects** with template-literal Tailwind
   classes like `` `bg-${color}-100` `` — these were silently purged by
   Tailwind and rendered as blank chips. Retired in R.13 in favour of
   `PageStatusBadge`.
5. **The `StatusBadge` shim** (`components/ui/status-badge.tsx`) that
   was kept as a re-export during the migration — deleted in R.10. The
   lint rule `legacy-status-badge-import` blocks any regression.
6. **Inline `AlertDialog` delete flows** copy-pasted per page — replaced
   with `ConfirmDeleteDialog` which also surfaces Phase C.7b blockers.
7. **Per-page `try { await mutate(...) } catch(err) { toast(err.message) }`
   blocks that leaked raw error strings** — replaced with
   `useApiMutation` + `onCodeError` / `onFieldError`.
8. **Duplicate `AdvancedFilters` blocks** rendered twice on the same
   page (found and removed in R.4).
9. **Silent `statusField: ""` bug** in finance list pages (fixed in R.3).
10. **`finance.ts` monolith** — Phase 7.1 deleted the 882-line legacy
    monolith in favour of 14 canonical `finance-*.ts` routers.

---

## 3. What was intentionally left and why

These items were noticed during the sweep and **deliberately not
touched** so the unification phase could actually close.

| Item | Reason kept |
| ---- | ----------- |
| Internal tab components inside certain detail pages (e.g. `FinancialTab`, `EntityDocuments`, `EntityComments`) | They already sit inside `PageShell`/`EntityDetailPage`. Their internal markup predates the template catalogue but their *surface* is unified. Refactoring internals is cosmetic. |
| `governance/`, `admin/`, `bi/` subtabs | These are mostly dashboards reading aggregated views; they render inside a `PageShell` parent, so the shell is unified even where the inner grids still use bespoke layouts. Replacing the inner grids is aesthetic, not structural. |
| A handful of `*-detail.tsx` sub-views that embed `<Card>` directly instead of `PageSection` | They read correctly and live under a parent `EntityDetailPage`. Migrating to `PageSection` is a visual refinement with zero behavioural payoff. |
| `severityMap` objects in support/incident pages (not status, severity) | `PageStatusBadge` is deliberately scoped to *status*. Severity chips are a separate, tiny concept used in <5 places. Merging them into `STATUS_MAP` would overload the `domain` prop for no real benefit. |
| Some pre-existing technical debt (e.g. the Replit auto-sync merge artefacts) | Out of scope for UI unification. Tracked under `KNOWN_ISSUES.md`. |
| Legacy `delete-confirm-impact.tsx` card (inline variant) | Still used by a handful of pages that don't open a modal delete. Replacing them is additional surface area, not a unification gap — the modal path and the inline path both surface `meta.blockers` correctly. |

**General rule applied**: if a page already sits inside `PageShell`,
uses `PageStatusBadge` for any status it renders, and routes mutations
through `useApiMutation`, the unification contract is satisfied even if
its internal blocks still use some bespoke composition. No further
cosmetic rewrite was done on such pages.

---

## 4. Remaining risks

None critical. Calibrated risk list:

| # | Risk | Severity | Mitigation in place |
| - | ---- | -------- | ------------------- |
| 1 | A future PR re-introduces a local `requireRole` or `validationError` | Low | Phase 6 lint guard fails CI |
| 2 | A future page re-imports `@/components/ui/status-badge` | Low | Phase 6 lint rule `legacy-status-badge-import` fails CI |
| 3 | A future page writes a new `statusMap` with `` `bg-${color}-100` `` template literals | Low–medium | Not lint-enforced. Caught in code review. Could become an R.x iteration if it recurs. |
| 4 | `EntityDetailPage` still accepts both an inline legacy `StatusBadge` fallback and an explicit variant prop | Low | Documented in `UI_TEMPLATES.md` §3; new callers pass the variant explicitly. |
| 5 | Adoption of `useApiMutation` is 107 pages out of 322 — the rest are pure read-only pages with no mutations | None — by construction | — |
| 6 | `PageShell` adoption is 143 / 322 — the remaining 179 are mostly small sub-views, detail-tab panels, and pages that render *inside* a parent `PageShell` | None — by construction | — |

The two guard rails (§1.1 lint + §4 rows 1–2) mean unification can't
silently regress in the places where it most hurts (API error contract
+ legacy status badge). Everything else is review-caught.

---

## 5. Pages / components still outside the unified pattern

These are the concrete pockets still running legacy composition. They
are **low priority**, will not be swept in a dedicated round, and will
only be touched when the *Operational Practical Review* phase surfaces
an actual user-visible issue on one of them.

### 5.1 Pages that never received a `PageShell` wrap

Roughly 179 `.tsx` files under `src/pages/` still render their own root
layout. The great majority of these are one of:

* Tab panel bodies that already live inside a parent `PageShell`
  (e.g. `finance/invoice-lines-tab.tsx`, `hr/employee-documents.tsx`).
  These do **not** need a `PageShell` of their own — wrapping would be
  wrong.
* Sub-views reached from a detail page (e.g. `.../:id/edit.tsx` split
  files) that get their chrome from `CreatePageLayout` or
  `EntityDetailPage`.
* A handful of small standalone pages (print views, reports, exports,
  a few settings tabs) that are effectively read-only and whose
  visible chrome already matches what `PageShell` would produce.

No individual page in this bucket is blocking the *unified contract*
(status chip + mutation path + error toast), which is what R.1–R.13
were really about.

### 5.2 Components still rendering bespoke chrome

* `financial-tab.tsx`, `entity-documents.tsx`, `entity-comments.tsx`,
  `file-drop-zone.tsx`, `bulk-actions.tsx` — internal composition uses
  raw `Card` / `div` instead of `PageSection`. Surface is fine.
* `impact-preview.tsx` — still the legacy inline card variant that
  `ConfirmDeleteDialog` superseded. Kept because a few pages still use
  it directly.

### 5.3 Finance sub-pages with doc-comment references to `useMutation`

Five files still contain the literal string `useMutation` but **only
inside JSDoc/block-comment history** describing how they were migrated:

```
artifacts/ghayth-erp/src/pages/finance/bank-guarantees.tsx        (comment)
artifacts/ghayth-erp/src/pages/finance/journal-manual-detail.tsx  (comment)
artifacts/ghayth-erp/src/pages/finance/journal-manual.tsx         (comment)
artifacts/ghayth-erp/src/pages/finance/journal.tsx                (comment)
artifacts/ghayth-erp/src/pages/finance/recurring-journals.tsx     (comment)
```

These are **not** real call sites. They are the migration narrative
left inline on purpose so the next person reading the file understands
the “before”. Zero raw `useMutation` remains.

---

## 6. PR ledger

| PR | Title | Scope |
| -- | ----- | ----- |
| #5  | Architectural unification (TypedError, lifecycleEngine, assertRole, Phase 6 lint, Phase 7.1 finance monolith deletion, Phase 8/8.1 lifecycle, Phase 9/9.1 soft-delete) | API |
| #6  | R.1 — Finance dashboard reference page + `ConfirmDeleteDialog` + `StatusBadge` deprecation shim + `useApiMutation` CONFLICT blockers surfacing + `UI_TEMPLATES.md` | UI |
| #7  | R.2 — Finance cascade (vendors, accounts, fiscal-periods, journal-manual list + detail) | UI |
| #8  | R.3 — Finance end-to-end (bank-guarantees, custodies, custody-detail, invoices polish) | UI |
| #9  | R.4 — Finance extended (recurring-journals, purchase-orders, salary-advances, invoice-detail lifecycle) | UI |
| #10 | R.5 → R.8 — System-wide cascade: PageShell wrapping across all modules + top-level pages batch | UI |
| #11 | R.9 — StatusBadge shim retirement + legacy unknown-error cleanup | UI |
| #12 | R.10 — Delete StatusBadge shim file + migrate 23 files / ~51 mutations from raw `useMutation` to `useApiMutation` | UI |
| #13 | R.11 + R.12 — Create pages + detail pages unified (25 files) | UI |
| #14 | R.13 — Final cleanup: statusMap retirement + last raw `useMutation` in create pages | UI |

**Total files touched across the UI unification rounds: ≈ 240+.**

---

## 7. Operating rules going forward

Locked in until a new phase explicitly changes them:

1. **No new unification rounds are opened.** R.1 → R.13 is the complete
   sweep.
2. **Anything still outside the unified pattern is technical debt**,
   tracked in §5 of this report, not in the active backlog.
3. **New pages must use the templates.** `UI_TEMPLATES.md` is the
   contract. Phase 6 lint is the fence. Code review is the backstop.
4. **Existing pages stay as they are** unless a later phase (e.g. the
   Operational Practical Review) surfaces a concrete user-facing issue
   that can only be fixed by migrating them.
5. **No cosmetic refactors.** If a page renders correctly, routes its
   mutations through `useApiMutation`, and uses `PageStatusBadge`, it
   is “done” for unification purposes — even if its inner composition
   is bespoke.

---

## 8. Next phase — Operational Practical Review

With this report the project officially transitions to:

**Phase: Operational Practical Review**

Objective: exercise the system *as a user would*, now that it is in
its unified shape, and produce a punch list of real operational issues
(confusing pages, unclear actions, endpoints that still return generic
messages in practice, flows that feel wrong end-to-end).

Non-goals (locked):

* No new redesigns.
* No new libraries.
* No new component sweeps.
* No cosmetic improvements unless they emerge directly from a concrete
  operational finding.

The intake format for the next phase is a flat list of observations,
each one tied to a specific page or flow, so that individual fixes can
be scheduled without reopening a global sweep.

---

*Closure report authored at the end of R.13. This document is the
source of truth for the state of UI unification in this repository.*
