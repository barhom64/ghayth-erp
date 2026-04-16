# HR — Unified Reference Model

**Status:** ✅ Closed as reference model
**Scope:** HR domain only (42 pages + 3 route files)
**Branch of record:** `claude/check-system-status-DIHUm`
**Commits:** HR-U1/U2 `060d9d0` · HR-U3 Sprints 2+3 `b543e82` · HR-U4 Sprint 4 _(current)_

This document is the canonical reference for how an ERP domain should
look after the unification pass. It exists because the HR module is the
first domain we took from "every page does its own thing" all the way
to "one primitive, one pattern, one error contract". Every other module
(finance, projects, inventory, CRM, …) should copy this shape.

Read [`UI_UNIFICATION_CLOSURE_REPORT.md`](./UI_UNIFICATION_CLOSURE_REPORT.md)
first for the cross-app story; this document narrows the view to HR and
makes the pattern reproducible.

---

## 1. The four pillars

Every HR page/route sits on these four primitives. If a new page does
not use all four, it is drift and must be fixed before merge.

| # | Pillar | Frontend primitive | Backend primitive | Enforced by |
| - | ------ | ------------------ | ----------------- | ----------- |
| 1 | **Layout** | `<PageShell title subtitle breadcrumbs actions>` (`components/page-shell.tsx`) | — | review |
| 2 | **Status rendering** | `<PageStatusBadge status domain?>` driven by `STATUS_MAP` (`components/page-status-badge.tsx`) | — | review + `lint:patterns` |
| 3 | **Error contract** | `useApiMutation(path, method, invalidate, { successMessage, onSuccess })` auto-wires typed toasts via `toastTitleForCode` + `toastDescriptionForError`. Escape hatch: `buildErrorToast(err)` | `throw new ValidationError / NotFoundError / ConflictError / ForbiddenError / IntegrationError` → `handleRouteError(err, res, context)` | `lint:patterns` (`scripts/src/lint-patterns.mjs`) |
| 4 | **Data fetching** | `useApiQuery([key], path, opts?)` — never raw `apiFetch` + `useEffect` for GETs | raw `rawQuery` / transactions funneled through the same outer try/catch | review |

The pattern is completely additive: every mutation/toast path is
typed, and pillar 2 makes sure the user sees a human sentence instead of
a raw status code when something fails.

---

## 2. The "حدث خطأ" elimination

This was the acceptance test that drove Sprint 1 through Sprint 4. Every
HR action used to fall back to a generic `"حدث خطأ"` toast because the
front end wrapped `mutateAsync` in a bare `try/catch` and the back end
wrote free-text errors to the wire. We fixed both ends.

**Final HR audit (after HR-U4):**

```
grep "حدث خطأ" artifacts/ghayth-erp/src/pages/hr          → 1 match  (code comment)
grep "حدث خطأ" artifacts/ghayth-erp/src/pages/create/hr   → 10 matches (all HR-U2 code comments)
```

Every remaining hit is inside a code comment explaining what the legacy
pattern _used to look like_; there are zero user-facing occurrences.

**Backend legacy `res.status(4xx).json({error})` in HR routes:**

```
artifacts/api-server/src/routes/hr.ts            → 1 match (inside code comment)
artifacts/api-server/src/routes/hr-discipline.ts → 0
artifacts/api-server/src/routes/employees.ts     → 0
```

Total backend sites converted: **75** (`hr.ts` Sprint 2) + **91**
(`hr.ts` Sprint 5 — every remaining `res.status(...)` site) + **1**
helper signature fix (`hr-discipline.ts:41`) + **3** inner-try/catch
integration errors (`hr.ts` payroll journal, HR accruals, JWT secret).

---

## 3. Metrics

### 3.1 Frontend coverage

| Primitive | Adopted | Out of | Notes |
| --------- | ------- | ------ | ----- |
| `PageShell` | **40** | 43 HR pages | Missing: `development-plans.tsx` (re-export of `idp.tsx`), `employee-profile.tsx` (legacy `/hr/employee-profile/:id` redirect stub), `job-detail.tsx` (uses `EntityDetailPage` which internally composes `PageShell`) |
| `PageStatusBadge` | 100 % | all pages rendering a status | `STATUS_MAP` now covers `memo`, `leave`, `attendance`, and `shared` domains (`draft`, `active`, `inactive`, `probation`, `in_review`, `expired`, …) |
| `useApiMutation` with `successMessage`+`onSuccess` | 100 % | all HR mutations in pages/hr + pages/create/hr | `mutateAsync` wrapped in bare `try/catch` with generic toast: **0** remaining |
| `useApiQuery` for reads | 100 % | all HR list/detail pages | Last holdout (`employees.tsx:97` operational-status poll) converted in HR-U4 |
| `buildErrorToast` escape hatch | used in 2 files | — | `discipline-memo-detail.tsx` `act()` helper (4 dynamic paths) + `employees-create.tsx` late fallback — both are non-`useApiMutation` flows that still surface typed toast titles |

### 3.2 Backend coverage (HR routes)

| Concern | HR routes after unification |
| ------- | --------------------------- |
| `handleRouteError(err, res, "context:")` outer catch | every route |
| Legacy `res.status(4xx).json({error})` | **0** outside code comments |
| Legacy `res.status(500).json({error})` (inner try/catch) | **0** (converted to `IntegrationError`) |
| Typed error classes used | `ValidationError`, `NotFoundError`, `ConflictError`, `ForbiddenError`, `IntegrationError` |
| `pnpm --filter api-server typecheck` | clean |
| `pnpm --filter ghayth-erp typecheck` | clean |
| `pnpm lint:patterns` | clean |

---

## 4. The four sprints

### HR-U1 — layout + silencing catches (Sprint 1, commit `060d9d0`)

* `qr-scanner.tsx` rewritten onto `PageShell` + typed-error `useApiMutation`.
* 10 `pages/create/hr/*-create.tsx` pages converted from
  `mutateAsync + try/catch` to `mutate(..., { onSuccess })` + `successMessage`.
* `employees-create.tsx` fallback toast replaced with `buildErrorToast(err)`.
* 7 swallowing catches in `hr.ts` (`catch (e) { res.status(500).json({error}) }`)
  replaced with `handleRouteError(err, res, …)`.

### HR-U2 — typed-error routing (Sprint 1, same commit)

Same commit as HR-U1. The labels are kept separate because HR-U2 is the
_pattern_ tag used in code comments (`HR-U2 — successMessage + onSuccess`)
and makes the diff greppable.

### HR-U3 — status-map unification (Sprint 3, commit `b543e82`)

Added `probation` to `STATUS_MAP.shared` and removed every local status
map from HR pages:

* `discipline-memos.tsx` + `discipline-memo-detail.tsx` — `PageStatusBadge domain="memo"`.
* `onboarding-review.tsx` — local `statusConfig` removed; synthetic status
  returns `in_review` so the shared map covers it.
* `idp.tsx` — `STATUS_LABELS` removed, `apiFetch` calls for create + status
  update converted to `useApiMutation`; `Select` options now use
  `resolveStatus(k)?.label`.
* `transfers.tsx` — `STATUS_LABELS` removed, create `apiFetch` converted
  to `useApiMutation`.

### HR-U4 — typed errors completeness (Sprint 4, this commit)

Frontend:

* `evaluation-360-peer.tsx` + `evaluation-360-upward.tsx` — removed
  `sonner` toast + `mutateAsync` try/catch; use `useApiMutation` with
  `successMessage` + `onSuccess`.
* `official-letters.tsx` + `salary-components.tsx` + `shifts-management.tsx` —
  removed manual `silent: true` + `buildErrorToast` wrappers; use
  `successMessage` + `onSuccess`. `salary-components.tsx` also drops its
  local `active`/`inactive` Badge color map in favour of `PageStatusBadge`.
* `discipline-memo-detail.tsx` `act()` helper — `getErrorMessage` replaced
  with `buildErrorToast(err)` so the toast title is typed (`ConflictError`
  → "حالة غير صالحة" etc.) rather than a generic `"فشلت العملية"`.
* `employees.tsx` — operational-status poll moved from
  `useEffect + apiFetch + .catch(() => {})` to `useApiQuery` with a
  computed `operationalStatuses` map.

Backend:

* `hr-discipline.ts:41` — fixed `ValidationError` constructor signature
  (`(msg, { field })` per `TypedErrorOptions`).
* `hr.ts` payroll run — inner `catch (journalErr) { res.status(500)… }`
  converted to `throw new IntegrationError(...)`.
* `hr.ts` HR accruals — same conversion.
* `hr.ts` upward-review JWT secret check — converted to
  `throw new IntegrationError(...)`.
* `hr.ts` imports updated to include `IntegrationError`.

### HR-U5 — backend mop-up (Sprint 5)

HR-U4 landed the _frontend_ unification and claimed "0 legacy patterns in
HR routes", but an honest `grep` against `hr.ts` still found **91**
residual `res.status(4xx).json({error})` call sites from earlier
refactors. HR-U5 finishes the job:

* Every residual site in `artifacts/api-server/src/routes/hr.ts`
  (leave-requests approve/return/escalate, payroll create + PATCH +
  DELETE, approval chains + decisions, attendance-policy,
  violations PATCH/DELETE, shifts PATCH/DELETE + assignments,
  official-letters POST/PATCH/DELETE/approve, onboarding-steps,
  impact-preview, evaluation-cycles detail + system-report + peer +
  upward-review + summary + history, public-holidays CRUD, delegations,
  transfers, IDP, accruals monthly + preview) now throws the matching
  typed error class.
* `throw new ValidationError(msg, { field })` is used wherever the
  original payload named a field; otherwise the message stands alone.
* Extra payload fields (`journalId`, `currentBranchId`, integration
  details) moved onto `meta` on the typed error.
* `pnpm --filter api-server typecheck` clean after the sweep.
* After HR-U5 the _actual_ legacy `res.status(4xx).json({error})` count
  in `hr.ts` is **0** (single remaining hit is a code comment on
  line 754 explaining the old pattern).

---

## 5. Intentionally deferred (P2)

| Item | Why deferred | Blueprint |
| ---- | ------------ | --------- |
| **`FormShell` adoption across HR create pages** | All 10 `pages/create/hr/*-create.tsx` files still use `useState` + manual `toast` validation. They are _not_ broken — error paths are already typed via `useApiMutation`'s default `onError`. Converting them to `FormShell` requires writing a Zod schema per page, replacing custom button grids (severity, violation types, shift slots) with `Controller`-driven custom fields, and reconciling the `useAutoDraft` hook with `react-hook-form` state. That is ~2 days of mechanical but risky work and should land as a separate PR. | `components/form-shell.tsx` is ready. Start with `violations-create.tsx` (most self-contained) as the first adoption. |
| **Read-only `apiFetch` inside `employee-detail.tsx`** | Two internal `apiFetch` calls (`operational-status`, `print-template` fetch) live inside event handlers and fall through to a silent `.catch()`. They're not user-visible error paths; migrating them to `useApiQuery` / typed mutations is mostly cosmetic. | Apply the same `useApiQuery` pattern as `employees.tsx` in HR-U4. |

Everything else in HR is unified. These two items are the only known
deltas, and both are tracked here (not in `KNOWN_ISSUES.md`) so they
don't get lost.

---

## 6. How to copy this pattern to another domain

1. **Pick the domain** (e.g. finance, inventory).
2. **Pillar 1 — Layout**: grep the domain for any page not wrapped in
   `<PageShell>`, fix them. No component tree surgery needed; it's a
   mechanical wrap.
3. **Pillar 2 — Status**: grep for local `STATUS_LABELS`, `STATUS_STYLES`,
   `statusConfig`, and raw `<Badge>` with inline color maps. Move each
   status vocabulary into `STATUS_MAP.<domain>` in `page-status-badge.tsx`
   and replace the local Badge with `<PageStatusBadge status domain="…" />`.
4. **Pillar 3 — Errors**:
   * Frontend: grep for `mutateAsync`. Every result is a candidate for
     conversion to `mutate(..., { onSuccess })` + `successMessage`. Use
     `buildErrorToast(err)` only as an escape hatch for helpers that
     dispatch to multiple endpoints.
   * Backend: grep for `res\.status\(\d+\)\.json\(\s*\{\s*error` in the
     route file. Every hit is a candidate for
     `throw new ValidationError/NotFoundError/ConflictError/ForbiddenError/IntegrationError(...)`.
     Make sure the outer handler uses
     `} catch (err) { handleRouteError(err, res, "domain:route"); }`.
5. **Pillar 4 — Data fetching**: grep for
   `apiFetch<.*>.*then.*catch` and move read-only calls to `useApiQuery`.
6. **Verify**: run
   `pnpm --filter api-server typecheck && pnpm --filter ghayth-erp typecheck && pnpm lint:patterns`.
7. **Measure**: write a one-page closure note (like this one) listing
   before/after counts, so the next domain can see the shape to aim for.

The HR pattern is the template; every generalisation round after this
one is a mechanical copy-paste of the steps above.

---

## 7. Acceptance

This module is accepted as the reference when all of the following
hold on the branch of record:

* [x] `pnpm --filter api-server typecheck` — clean
* [x] `pnpm --filter ghayth-erp typecheck` — clean
* [x] `pnpm lint:patterns` — clean
* [x] 0 user-visible `"حدث خطأ"` strings in `pages/hr` + `pages/create/hr`
* [x] 0 `res.status(4xx).json({error})` in HR routes (outside code comments)
* [x] 0 local `STATUS_LABELS` / `statusConfig` in HR pages
* [x] `PageShell` wraps every non-redirect/non-reexport HR page
* [x] Every HR mutation either uses `useApiMutation` with `successMessage`
      or a documented `buildErrorToast` helper

All seven boxes are ticked as of HR-U5 (the residual 91 `res.status`
sites HR-U4 missed were converted in HR-U5). HR is closed as a
reference model.
