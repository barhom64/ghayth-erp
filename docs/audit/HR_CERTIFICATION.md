# HR Module Static Certification

Generated: 2026-05-19

> **Read-only.** Regenerate with
> `MODULE=hr node audit/system-review/tooling/module-cert.mjs`.
> Each cell here is one of `PASS` / `PARTIAL` / `FAIL` / `SKIP`;
> non-PASS cells should turn into an issue or a small PR.

## Scope

Files audited: **6** under `artifacts/api-server/src/routes/hr*.ts`.
Endpoints: **165** total, **91** writes.

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
| `hr-contracts.ts` | 12 (10w) | ✅ PASS | 🟡 PARTIAL | 🟡 PARTIAL | ✅ PASS | ❌ FAIL | 🟡 PARTIAL |
| `hr-discipline.ts` | 24 (15w) | ✅ PASS | 🟡 PARTIAL | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP |
| `hr-exit.ts` | 6 (4w) | ✅ PASS | 🟡 PARTIAL | ✅ PASS | ✅ PASS | 🟡 PARTIAL | — SKIP |
| `hr-loans.ts` | 6 (3w) | ✅ PASS | 🟡 PARTIAL | ✅ PASS | ✅ PASS | ❌ FAIL | 🟡 PARTIAL |
| `hr-overtime.ts` | 7 (3w) | ✅ PASS | 🟡 PARTIAL | ✅ PASS | ✅ PASS | ❌ FAIL | — SKIP |
| `hr.ts` | 110 (56w) | ✅ PASS | 🟡 PARTIAL | 🟡 PARTIAL | 🟡 PARTIAL | 🟡 PARTIAL | 🟡 PARTIAL |

## Module-level totals (files)

| Dimension | PASS | PARTIAL | FAIL | SKIP |
|---|---:|---:|---:|---:|
| RBAC | 6 | 0 | 0 | 0 |
| Scope | 0 | 6 | 0 | 0 |
| Audit | 4 | 2 | 0 | 0 |
| Events | 5 | 1 | 0 | 0 |
| Lifecycle | 1 | 2 | 3 | 0 |
| GL bridge | 0 | 3 | 0 | 3 |

## Cross-reference: workflow-audit findings on HR files

- **Direct `UPDATE … SET "status" = …` bypassing `applyTransition`**: **43** hits across HR files (see #664). Breakdown:
  - `hr.ts` — 25
  - `hr-contracts.ts` — 5
  - `hr-discipline.ts` — 5
  - `hr-loans.ts` — 3
  - `hr-overtime.ts` — 3
  - `hr-exit.ts` — 2

- **fromState graph mismatches** on HR files: **3** hits.
  - `hr-discipline.ts:1000` — hr_inquiry_memos pending_employee → cancelled
  - `hr-discipline.ts:1000` — hr_inquiry_memos pending_manager → cancelled
  - `hr-discipline.ts:1000` — hr_inquiry_memos pending_gm → cancelled

## Endpoint-level non-PASS detail

### `hr-contracts.ts`

| Line | Endpoint | RBAC | Scope | Audit | Events | Lifecycle | GL bridge |
|---:|---|---|---|---|---|---|---|
| 53 | `GET /` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 117 | `POST /` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 183 | `PATCH /:id` | ✅ PASS | ✅ PASS | ❌ FAIL | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 245 | `POST /:id/submit` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | 🟡 PARTIAL |
| 286 | `POST /:id/approve` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | 🟡 PARTIAL |
| 330 | `POST /:id/reject` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | 🟡 PARTIAL |
| 374 | `POST /:id/sign-company` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | 🟡 PARTIAL |
| 428 | `POST /:id/sign-employee` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | 🟡 PARTIAL |
| 475 | `POST /:id/activate` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | 🟡 PARTIAL |
| 517 | `POST /:id/terminate` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | 🟡 PARTIAL |
| 563 | `POST /:id/renew` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |

### `hr-discipline.ts`

| Line | Endpoint | RBAC | Scope | Audit | Events | Lifecycle | GL bridge |
|---:|---|---|---|---|---|---|---|
| 246 | `GET /regulation` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 566 | `GET /memos` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1225 | `GET /employee/:employeeId/summary` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1262 | `GET /stats` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1290 | `GET /auto-detection/settings` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1361 | `GET /auto-detection/log` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1378 | `GET /auto-detection/summary` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |

### `hr-exit.ts`

| Line | Endpoint | RBAC | Scope | Audit | Events | Lifecycle | GL bridge |
|---:|---|---|---|---|---|---|---|
| 173 | `GET /exit` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 519 | `PATCH /exit/clearance/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | — SKIP |

### `hr-loans.ts`

| Line | Endpoint | RBAC | Scope | Audit | Events | Lifecycle | GL bridge |
|---:|---|---|---|---|---|---|---|
| 170 | `GET /loans` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 239 | `GET /loans/my` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 293 | `POST /loans` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 410 | `PATCH /loans/:id/approve` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | 🟡 PARTIAL |
| 563 | `PATCH /loans/:id/reject` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | 🟡 PARTIAL |

### `hr-overtime.ts`

| Line | Endpoint | RBAC | Scope | Audit | Events | Lifecycle | GL bridge |
|---:|---|---|---|---|---|---|---|
| 134 | `GET /overtime` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 182 | `GET /overtime/my` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 203 | `GET /overtime/summary` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 374 | `PATCH /overtime/:id/approve` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | — SKIP |
| 492 | `PATCH /overtime/:id/reject` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | — SKIP |

### `hr.ts`

| Line | Endpoint | RBAC | Scope | Audit | Events | Lifecycle | GL bridge |
|---:|---|---|---|---|---|---|---|
| 423 | `POST /check-in` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 790 | `POST /check-out` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 1087 | `GET /attendance/today-summary` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1135 | `GET /leave-types` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1149 | `GET /leave-balance` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1321 | `POST /leave-requests` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 1723 | `PATCH /leave-requests/:id/approve` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | 🟡 PARTIAL |
| 2149 | `GET /leave-requests/:id/stages` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 2197 | `PATCH /leave-requests/:id/escalate` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | 🟡 PARTIAL |
| 2291 | `GET /payroll` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 2358 | `GET /payroll/:id/lines` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 2390 | `POST /payroll` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | 🟡 PARTIAL |
| 2808 | `PATCH /payroll/:id/approve` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | 🟡 PARTIAL |
| 2840 | `GET /violations` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 2886 | `POST /violations` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 3018 | `GET /shifts` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 3026 | `POST /shifts` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 3082 | `GET /performance` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 3115 | `POST /performance` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 3194 | `GET /attendance-stats` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 3226 | `GET /leave-stats` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 3244 | `GET /salary-components` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 3254 | `POST /salary-components` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 3278 | `GET /approval-chains` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 3301 | `GET /approval-chain-definitions` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 3318 | `POST /approval-chain-definitions` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 3358 | `DELETE /approval-chain-definitions/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 3380 | `GET /approval-requests` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 3397 | `PATCH /approval-requests/:id/decide` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | ✅ PASS |
| 3529 | `GET /attendance-policy` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 3546 | `PUT /attendance-policy` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 3580 | `GET /payroll-summary` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 3636 | `GET /violations-stats` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 3653 | `PATCH /violations/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | 🟡 PARTIAL |
| 3725 | `PATCH /violations/:id/approve` | ✅ PASS | ❌ FAIL | ❌ FAIL | ❌ FAIL | — SKIP | 🟡 PARTIAL |
| 3726 | `PATCH /violations/:id/reject` | ✅ PASS | ❌ FAIL | ❌ FAIL | ❌ FAIL | — SKIP | 🟡 PARTIAL |
| 3727 | `PATCH /violations/:id/return` | ✅ PASS | ❌ FAIL | ❌ FAIL | ❌ FAIL | — SKIP | 🟡 PARTIAL |
| 3729 | `PATCH /shifts/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 3772 | `DELETE /shifts/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 3789 | `GET /shift-assignments` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 3807 | `POST /shift-assignments` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 3864 | `GET /official-letters` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 3881 | `POST /official-letters` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | 🟡 PARTIAL |
| 3969 | `GET /monthly-attendance` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 3987 | `PATCH /leave-requests/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 4028 | `POST /leave-requests/:id/cancel` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | 🟡 PARTIAL |
| 4119 | `DELETE /leave-requests/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | 🟡 PARTIAL |
| 4184 | `PATCH /payroll/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | 🟡 PARTIAL |
| 4315 | `DELETE /payroll/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | ✅ PASS |
| 4393 | `PATCH /performance/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 4434 | `DELETE /performance/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 4458 | `DELETE /violations/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 4510 | `PATCH /official-letters/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 4546 | `DELETE /official-letters/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 4569 | `PATCH /official-letters/:id/approve` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | 🟡 PARTIAL |
| 4692 | `GET /stats` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 4727 | `GET /deductions` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 4744 | `GET /onboarding-steps` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 4759 | `PUT /onboarding-steps` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 4790 | `POST /impact-preview/leave` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 4813 | `POST /impact-preview/termination` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 4835 | `POST /impact-preview/violation` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 4878 | `GET /employees-status` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 5056 | `GET /evaluation-cycles` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 5112 | `POST /evaluation-cycles` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | 🟡 PARTIAL |
| 5297 | `GET /evaluation-cycles/:id/system-report` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 5366 | `POST /evaluation-cycles/:id/peer-evaluation` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 5454 | `POST /evaluation-cycles/:id/upward-review` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 5554 | `GET /evaluation-cycles/:id/summary` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 5635 | `GET /employees/:id/evaluation-history` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 5739 | `GET /delegations` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 5758 | `POST /delegations` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 5818 | `GET /public-holidays` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 5833 | `POST /public-holidays` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 5860 | `PATCH /public-holidays/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 5896 | `GET /public-holidays/check` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 5909 | `DELETE /public-holidays/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 5933 | `GET /transfers` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 5983 | `POST /transfers` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 6078 | `PATCH /transfers/:id/approve` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | 🟡 PARTIAL |
| 6170 | `PATCH /transfers/:id/receive` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | 🟡 PARTIAL |
| 6298 | `GET /idp` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 6320 | `POST /idp` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 6347 | `PATCH /idp/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 6380 | `DELETE /idp/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 6606 | `GET /accruals/preview` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 6677 | `GET /turnover-report` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 6768 | `GET /expiring-documents` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 6928 | `GET /company-documents` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 6950 | `POST /company-documents` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 6980 | `GET /employee-documents` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 7025 | `POST /employee-documents` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 7056 | `GET /excuse-requests` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 7099 | `POST /excuse-requests` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 7140 | `PATCH /excuse-requests/:id/approve` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | 🟡 PARTIAL |

## Reproducing this audit

```bash
MODULE=hr node audit/system-review/tooling/module-cert.mjs
```
