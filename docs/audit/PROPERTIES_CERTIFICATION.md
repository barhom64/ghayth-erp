# Properties Module Static Certification

Generated: 2026-05-25

> **Read-only.** Regenerate with
> `MODULE=properties node audit/system-review/tooling/module-cert.mjs`.
> Each cell here is one of `PASS` / `PARTIAL` / `FAIL` / `SKIP`;
> non-PASS cells should turn into an issue or a small PR.

## Scope

Files audited: **1** under `artifacts/api-server/src/routes/properties*.ts`.
Endpoints: **55** total, **30** writes.

## Dimensions evaluated

| # | Dimension | Static check |
|---|---|---|
| 1 | RBAC          | every handler is wrapped by `authorize({ feature, action })` |
| 2 | Scope         | list endpoints use `parseScopeFilters` + `buildScopedWhere`; detail/write reference `scope.companyId` |
| 3 | Audit         | every write endpoint calls `createAuditLog` (or routes via `applyTransition` / `recordSideEffects`) |
| 4 | Events        | every write endpoint calls `emitEvent` / `safeEmitEvent` (or via the wrappers above) |
| 5 | Lifecycle     | status-flipping endpoints route through `applyTransition` rather than raw `UPDATE … SET status = …` |
| 6 | GL bridge     | GL-relevant Properties write endpoints reference a journal posting helper (`postJournalEntry`, `financialEngine`, `finance-gl-helpers`) |

Out of scope (Phase 5): concurrency / locking correctness, large-dataset performance, real GL posting end-to-end, multi-tenant runtime isolation.

## Per-file matrix

| File | Endpoints | RBAC | Scope | Audit | Events | Lifecycle | GL bridge |
|---|---:|---|---|---|---|---|---|
| `properties.ts` | 55 (30w) | ✅ PASS | 🟡 PARTIAL | ✅ PASS | ✅ PASS | 🟡 PARTIAL | 🟡 PARTIAL |

## Module-level totals (files)

| Dimension | PASS | PARTIAL | FAIL | SKIP |
|---|---:|---:|---:|---:|
| RBAC | 1 | 0 | 0 | 0 |
| Scope | 0 | 1 | 0 | 0 |
| Audit | 1 | 0 | 0 | 0 |
| Events | 1 | 0 | 0 | 0 |
| Lifecycle | 0 | 1 | 0 | 0 |
| GL bridge | 0 | 1 | 0 | 0 |

## Cross-reference: workflow-audit findings on Properties files

- **Direct `UPDATE … SET "status" = …` bypassing `applyTransition`**: **3** hits across Properties files (see #664). Breakdown:
  - `properties.ts` — 3

- **fromState graph mismatches** on Properties files: **0** hits.
  - _None._

## Endpoint-level non-PASS detail

### `properties.ts`

| Line | Endpoint | RBAC | Scope | Audit | Events | Lifecycle | GL bridge |
|---:|---|---|---|---|---|---|---|
| 503 | `GET /units` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 536 | `POST /units` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 649 | `GET /units/:id/impact-preview` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 662 | `PATCH /units/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 800 | `DELETE /units/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 856 | `POST /contracts/impact-preview` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 986 | `GET /contracts` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1019 | `POST /contracts` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | 🟡 PARTIAL |
| 1231 | `PATCH /contracts/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 1380 | `DELETE /contracts/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 1425 | `POST /contracts/:id/renew` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | 🟡 PARTIAL |
| 1546 | `POST /contracts/:id/terminate` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | 🟡 PARTIAL |
| 1638 | `GET /tenants/list` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1710 | `PATCH /tenants/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 1802 | `DELETE /tenants/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 1849 | `GET /payments` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1882 | `POST /payments/:id/pay` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | 🟡 PARTIAL |
| 1979 | `POST /late-rent/escalate` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 2120 | `GET /maintenance-requests` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 2154 | `POST /maintenance-requests` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 2328 | `PATCH /maintenance-requests/:id/approve` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | 🟡 PARTIAL |
| 2395 | `POST /maintenance-requests/:id/complete` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | 🟡 PARTIAL |
| 2567 | `GET /technicians` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 2575 | `GET /tenants` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 2591 | `POST /tenants` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 2706 | `GET /buildings` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 2754 | `POST /buildings` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 2832 | `PATCH /buildings/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 2912 | `DELETE /buildings/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 2957 | `GET /maintenance` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 2972 | `POST /maintenance` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 3016 | `GET /stats` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 3094 | `PATCH /maintenance-requests/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 3233 | `GET /operations-dashboard` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 3290 | `GET /owners` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 3324 | `POST /owners` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 3383 | `PATCH /owners/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 3435 | `DELETE /owners/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 3490 | `GET /contracts/:id/schedule` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 3504 | `POST /contracts/:id/schedule/:installmentId/pay` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | 🟡 PARTIAL |
| 3570 | `GET /inspections` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 3591 | `POST /inspections` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 3641 | `PATCH /inspections/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | 🟡 PARTIAL |
| 3741 | `GET /deposits` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 3763 | `POST /deposits` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 3832 | `PATCH /deposits/:id/refund` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | 🟡 PARTIAL |
| 3905 | `GET /occupancy-report` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 3955 | `GET /tenants/:id/letters` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |

## Reproducing this audit

```bash
MODULE=properties node audit/system-review/tooling/module-cert.mjs
```
