# HR Module Static Certification

Generated: 2026-05-25

> **Read-only.** Regenerate with
> `MODULE=hr node audit/system-review/tooling/module-cert.mjs`.
> Each cell here is one of `PASS` / `PARTIAL` / `FAIL` / `SKIP`;
> non-PASS cells should turn into an issue or a small PR.

## Scope

Files audited: **6** under `artifacts/api-server/src/routes/hr*.ts`.
Endpoints: **171** total, **97** writes.

## Dimensions evaluated

| # | Dimension | Static check |
|---|---|---|
| 1 | RBAC          | every handler is wrapped by `authorize({ feature, action })` |
| 2 | Scope         | list endpoints use `parseScopeFilters` + `buildScopedWhere`; detail/write reference `scope.companyId` |
| 3 | Audit         | every write endpoint calls `createAuditLog` (or routes via `applyTransition` / `recordSideEffects`) |
| 4 | Events        | every write endpoint calls `emitEvent` / `safeEmitEvent` (or via the wrappers above) |
| 5 | Lifecycle     | status-flipping endpoints route through `applyTransition` rather than raw `UPDATE … SET status = …` |
| 6 | GL bridge     | GL-relevant HR write endpoints reference a journal posting helper (`postJournalEntry`, `financialEngine`, `finance-gl-helpers`) |

Out of scope (Phase 5): concurrency / locking correctness, large-dataset performance, real GL posting end-to-end, multi-tenant runtime isolation.

## Per-file matrix

| File | Endpoints | RBAC | Scope | Audit | Events | Lifecycle | GL bridge |
|---|---:|---|---|---|---|---|---|
| `hr-contracts.ts` | 12 (10w) | ✅ PASS | ✅ PASS | 🟡 PARTIAL | ✅ PASS | ❌ FAIL | 🟡 PARTIAL |
| `hr-discipline.ts` | 24 (15w) | ✅ PASS | 🟡 PARTIAL | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP |
| `hr-exit.ts` | 6 (4w) | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | 🟡 PARTIAL | — SKIP |
| `hr-loans.ts` | 6 (3w) | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | 🟡 PARTIAL |
| `hr-overtime.ts` | 7 (3w) | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | — SKIP |
| `hr.ts` | 116 (62w) | ✅ PASS | 🟡 PARTIAL | 🟡 PARTIAL | 🟡 PARTIAL | 🟡 PARTIAL | 🟡 PARTIAL |

## Module-level totals (files)

| Dimension | PASS | PARTIAL | FAIL | SKIP |
|---|---:|---:|---:|---:|
| RBAC | 6 | 0 | 0 | 0 |
| Scope | 4 | 2 | 0 | 0 |
| Audit | 4 | 2 | 0 | 0 |
| Events | 5 | 1 | 0 | 0 |
| Lifecycle | 1 | 2 | 3 | 0 |
| GL bridge | 0 | 3 | 0 | 3 |

## Cross-reference: workflow-audit findings on HR files

- **Direct `UPDATE … SET "status" = …` bypassing `applyTransition`**: **40** hits across HR files (see #664). Breakdown:
  - `hr.ts` — 22
  - `hr-contracts.ts` — 5
  - `hr-discipline.ts` — 5
  - `hr-loans.ts` — 3
  - `hr-overtime.ts` — 3
  - `hr-exit.ts` — 2

- **fromState graph mismatches** on HR files: **0** hits.
  - _None._

## Endpoint-level non-PASS detail

### `hr-contracts.ts`

| Line | Endpoint | RBAC | Scope | Audit | Events | Lifecycle | GL bridge |
|---:|---|---|---|---|---|---|---|
| 132 | `POST /` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 207 | `PATCH /:id` | ✅ PASS | ✅ PASS | ❌ FAIL | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 269 | `POST /:id/submit` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | 🟡 PARTIAL |
| 310 | `POST /:id/approve` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | 🟡 PARTIAL |
| 354 | `POST /:id/reject` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | 🟡 PARTIAL |
| 398 | `POST /:id/sign-company` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | 🟡 PARTIAL |
| 452 | `POST /:id/sign-employee` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | 🟡 PARTIAL |
| 499 | `POST /:id/activate` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | 🟡 PARTIAL |
| 541 | `POST /:id/terminate` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | 🟡 PARTIAL |
| 587 | `POST /:id/renew` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |

### `hr-discipline.ts`

| Line | Endpoint | RBAC | Scope | Audit | Events | Lifecycle | GL bridge |
|---:|---|---|---|---|---|---|---|
| 265 | `GET /regulation` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 585 | `GET /memos` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1274 | `GET /employee/:employeeId/summary` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1311 | `GET /stats` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1339 | `GET /auto-detection/settings` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1410 | `GET /auto-detection/log` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1427 | `GET /auto-detection/summary` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |

### `hr-exit.ts`

| Line | Endpoint | RBAC | Scope | Audit | Events | Lifecycle | GL bridge |
|---:|---|---|---|---|---|---|---|
| 551 | `PATCH /exit/clearance/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | — SKIP |

### `hr-loans.ts`

| Line | Endpoint | RBAC | Scope | Audit | Events | Lifecycle | GL bridge |
|---:|---|---|---|---|---|---|---|
| 319 | `POST /loans` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 436 | `PATCH /loans/:id/approve` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | ✅ PASS |
| 596 | `PATCH /loans/:id/reject` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | 🟡 PARTIAL |

### `hr-overtime.ts`

| Line | Endpoint | RBAC | Scope | Audit | Events | Lifecycle | GL bridge |
|---:|---|---|---|---|---|---|---|
| 407 | `PATCH /overtime/:id/approve` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | — SKIP |
| 525 | `PATCH /overtime/:id/reject` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | — SKIP |

### `hr.ts`

| Line | Endpoint | RBAC | Scope | Audit | Events | Lifecycle | GL bridge |
|---:|---|---|---|---|---|---|---|
| 475 | `POST /check-in` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 842 | `POST /check-out` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 1139 | `GET /attendance/today-summary` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1187 | `PATCH /attendance/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 1235 | `GET /leave-types` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1249 | `GET /leave-balance` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1421 | `POST /leave-requests` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 1823 | `PATCH /leave-requests/:id/approve` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | 🟡 PARTIAL |
| 2251 | `GET /leave-requests/:id/stages` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 2299 | `PATCH /leave-requests/:id/escalate` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | 🟡 PARTIAL |
| 2393 | `GET /payroll` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 2462 | `GET /payroll/:id/lines` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 2494 | `POST /payroll` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | 🟡 PARTIAL |
| 2954 | `PATCH /payroll/:id/approve` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | 🟡 PARTIAL |
| 2986 | `GET /violations` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 3032 | `POST /violations` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 3164 | `GET /shifts` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 3172 | `POST /shifts` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 3230 | `GET /performance` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 3263 | `POST /performance` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 3342 | `GET /attendance-stats` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 3374 | `GET /leave-stats` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 3392 | `GET /salary-components` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 3402 | `POST /salary-components` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 3426 | `PATCH /salary-components/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 3456 | `DELETE /salary-components/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 3473 | `GET /approval-chains` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 3496 | `GET /approval-chain-definitions` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 3513 | `POST /approval-chain-definitions` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 3553 | `DELETE /approval-chain-definitions/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 3575 | `GET /approval-requests` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 3592 | `PATCH /approval-requests/:id/decide` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | ✅ PASS |
| 3724 | `GET /attendance-policy` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 3741 | `PUT /attendance-policy` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 3775 | `GET /payroll-summary` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 3831 | `GET /violations-stats` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 3848 | `PATCH /violations/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | 🟡 PARTIAL |
| 3924 | `PATCH /violations/:id/approve` | ✅ PASS | ❌ FAIL | ❌ FAIL | ❌ FAIL | — SKIP | 🟡 PARTIAL |
| 3925 | `PATCH /violations/:id/reject` | ✅ PASS | ❌ FAIL | ❌ FAIL | ❌ FAIL | — SKIP | 🟡 PARTIAL |
| 3926 | `PATCH /violations/:id/return` | ✅ PASS | ❌ FAIL | ❌ FAIL | ❌ FAIL | — SKIP | 🟡 PARTIAL |
| 3928 | `PATCH /shifts/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 3971 | `DELETE /shifts/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 3988 | `GET /shift-assignments` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 4006 | `POST /shift-assignments` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 4063 | `GET /official-letters` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 4080 | `POST /official-letters` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | 🟡 PARTIAL |
| 4168 | `GET /monthly-attendance` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 4186 | `PATCH /leave-requests/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 4227 | `POST /leave-requests/:id/cancel` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | 🟡 PARTIAL |
| 4318 | `DELETE /leave-requests/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | 🟡 PARTIAL |
| 4383 | `PATCH /payroll/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | 🟡 PARTIAL |
| 4502 | `DELETE /payroll/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | ✅ PASS |
| 4580 | `PATCH /performance/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 4621 | `DELETE /performance/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 4645 | `DELETE /violations/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 4697 | `PATCH /official-letters/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 4733 | `DELETE /official-letters/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 4756 | `PATCH /official-letters/:id/approve` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | 🟡 PARTIAL |
| 4879 | `GET /stats` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 4914 | `GET /deductions` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 4931 | `GET /onboarding-steps` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 4946 | `PUT /onboarding-steps` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 4977 | `POST /impact-preview/leave` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 5000 | `POST /impact-preview/termination` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 5022 | `POST /impact-preview/violation` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 5065 | `GET /employees-status` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 5243 | `GET /evaluation-cycles` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 5299 | `POST /evaluation-cycles` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | 🟡 PARTIAL |
| 5484 | `GET /evaluation-cycles/:id/system-report` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 5553 | `POST /evaluation-cycles/:id/peer-evaluation` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 5641 | `POST /evaluation-cycles/:id/upward-review` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 5741 | `GET /evaluation-cycles/:id/summary` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 5822 | `GET /employees/:id/evaluation-history` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 5926 | `GET /delegations` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 5945 | `POST /delegations` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 6005 | `GET /public-holidays` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 6020 | `POST /public-holidays` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 6047 | `PATCH /public-holidays/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 6083 | `GET /public-holidays/check` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 6096 | `DELETE /public-holidays/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 6120 | `GET /transfers` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 6172 | `PATCH /transfers/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 6231 | `POST /transfers` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 6326 | `PATCH /transfers/:id/approve` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | 🟡 PARTIAL |
| 6430 | `PATCH /transfers/:id/return` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | 🟡 PARTIAL |
| 6490 | `PATCH /transfers/:id/receive` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | 🟡 PARTIAL |
| 6618 | `GET /idp` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 6640 | `POST /idp` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 6667 | `PATCH /idp/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 6700 | `DELETE /idp/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 6926 | `GET /accruals/preview` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 6997 | `GET /turnover-report` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 7088 | `GET /expiring-documents` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 7248 | `GET /company-documents` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 7270 | `POST /company-documents` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 7300 | `GET /employee-documents` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 7345 | `POST /employee-documents` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 7376 | `GET /excuse-requests` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 7419 | `POST /excuse-requests` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 7460 | `PATCH /excuse-requests/:id/approve` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | 🟡 PARTIAL |
| 7516 | `PATCH /excuse-requests/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | 🟡 PARTIAL |

## Reproducing this audit

```bash
MODULE=hr node audit/system-review/tooling/module-cert.mjs
```
