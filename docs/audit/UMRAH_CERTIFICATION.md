# Umrah Module Static Certification

Generated: 2026-05-19

> **Read-only.** Regenerate with
> `MODULE=umrah node audit/system-review/tooling/module-cert.mjs`.
> Each cell here is one of `PASS` / `PARTIAL` / `FAIL` / `SKIP`;
> non-PASS cells should turn into an issue or a small PR.

## Scope

Files audited: **2** under `artifacts/api-server/src/routes/umrah*.ts`.
Endpoints: **100** total, **57** writes.

## Dimensions evaluated

| # | Dimension | Static check |
|---|---|---|
| 1 | RBAC          | every handler is wrapped by `authorize({ feature, action })` |
| 2 | Scope         | list endpoints use `parseScopeFilters` + `buildScopedWhere`; detail/write reference `scope.companyId` |
| 3 | Audit         | every write endpoint calls `createAuditLog` (or routes via `applyTransition` / `recordSideEffects`) |
| 4 | Events        | every write endpoint calls `emitEvent` / `safeEmitEvent` (or via the wrappers above) |
| 5 | Lifecycle     | status-flipping endpoints route through `applyTransition` rather than raw `UPDATE … SET status = …` |
| 6 | GL bridge     | GL-relevant Umrah write endpoints reference a journal posting helper (`postJournalEntry`, `financialEngine`, `finance-gl-helpers`) |

Out of scope (Phase 5): concurrency / locking correctness, large-dataset performance, real GL posting end-to-end, multi-tenant runtime isolation.

## Per-file matrix

| File | Endpoints | RBAC | Scope | Audit | Events | Lifecycle | GL bridge |
|---|---:|---|---|---|---|---|---|
| `umrah-entities.ts` | 51 (27w) | ✅ PASS | 🟡 PARTIAL | ✅ PASS | 🟡 PARTIAL | ❌ FAIL | 🟡 PARTIAL |
| `umrah.ts` | 49 (30w) | ✅ PASS | 🟡 PARTIAL | 🟡 PARTIAL | 🟡 PARTIAL | 🟡 PARTIAL | 🟡 PARTIAL |

## Module-level totals (files)

| Dimension | PASS | PARTIAL | FAIL | SKIP |
|---|---:|---:|---:|---:|
| RBAC | 2 | 0 | 0 | 0 |
| Scope | 0 | 2 | 0 | 0 |
| Audit | 1 | 1 | 0 | 0 |
| Events | 0 | 2 | 0 | 0 |
| Lifecycle | 0 | 1 | 1 | 0 |
| GL bridge | 0 | 2 | 0 | 0 |

## Cross-reference: workflow-audit findings on Umrah files

- **Direct `UPDATE … SET "status" = …` bypassing `applyTransition`**: **3** hits across Umrah files (see #664). Breakdown:
  - `umrah.ts` — 2
  - `umrah-entities.ts` — 1

- **fromState graph mismatches** on Umrah files: **0** hits.
  - _None._

## Endpoint-level non-PASS detail

### `umrah-entities.ts`

| Line | Endpoint | RBAC | Scope | Audit | Events | Lifecycle | GL bridge |
|---:|---|---|---|---|---|---|---|
| 204 | `GET /sub-agents` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 221 | `POST /sub-agents` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 263 | `GET /sub-agents/unlinked` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 293 | `PATCH /sub-agents/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 317 | `DELETE /sub-agents/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 332 | `PUT /sub-agents/:id/link` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 382 | `POST /sub-agents/link-by-nusk` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 403 | `POST /sub-agents/:id/link-client` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 430 | `GET /pricing` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 448 | `POST /pricing` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 479 | `PATCH /pricing/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 524 | `DELETE /pricing/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 542 | `GET /groups` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 605 | `POST /groups` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 621 | `PATCH /groups/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | — SKIP | 🟡 PARTIAL |
| 652 | `DELETE /groups/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | — SKIP | 🟡 PARTIAL |
| 686 | `POST /groups/:id/split` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 772 | `POST /groups/merge` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 850 | `GET /nusk-invoices` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 930 | `POST /nusk-invoices` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 953 | `PATCH /nusk-invoices/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 987 | `DELETE /nusk-invoices/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 1011 | `GET /employees/:employeeId/assignments` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1030 | `GET /commission-plans` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1074 | `POST /commission-plans` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 1139 | `PATCH /commission-plans/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 1198 | `POST /commission-plans/:id/simulate` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 1211 | `POST /commission-plans/:id/calculate` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 1224 | `GET /commission-calculations` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1249 | `GET /import/batches` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1264 | `GET /import/batches/:id/changes` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1285 | `GET /invoices` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1308 | `POST /invoices/generate` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 1328 | `GET /sales-wizard/uninvoiced-groups` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1343 | `PATCH /invoices/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 1376 | `GET /payments` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1396 | `POST /payments` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 1442 | `GET /statements/:subAgentId/pdf` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1468 | `GET /letters/:id/pdf` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1493 | `POST /letters/:id/dispatch` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | 🟡 PARTIAL |
| 1583 | `GET /reports/daily-runsheet` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1592 | `GET /reports/daily-runsheet/pdf` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1649 | `GET /attachments` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1671 | `POST /attachments` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 1707 | `DELETE /attachments/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | — SKIP | 🟡 PARTIAL |
| 1740 | `GET /reports/reconciliation` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |

### `umrah.ts`

| Line | Endpoint | RBAC | Scope | Audit | Events | Lifecycle | GL bridge |
|---:|---|---|---|---|---|---|---|
| 335 | `GET /seasons` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 356 | `POST /seasons` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 371 | `PATCH /seasons/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 429 | `GET /agents` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 453 | `POST /agents` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 468 | `PATCH /agents/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 506 | `DELETE /agents/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 523 | `GET /packages` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 531 | `POST /packages` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 566 | `PATCH /packages/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 588 | `DELETE /packages/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | 🟡 PARTIAL |
| 610 | `GET /pilgrims` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 646 | `POST /pilgrims` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 730 | `PATCH /pilgrims/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | 🟡 PARTIAL |
| 823 | `DELETE /pilgrims/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 844 | `POST /import/preview` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | 🟡 PARTIAL |
| 875 | `POST /import/mutamers` | ✅ PASS | ❌ FAIL | ❌ FAIL | ❌ FAIL | — SKIP | 🟡 PARTIAL |
| 887 | `POST /import/vouchers` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | 🟡 PARTIAL |
| 988 | `POST /import` | ✅ PASS | ❌ FAIL | ❌ FAIL | ❌ FAIL | — SKIP | 🟡 PARTIAL |
| 996 | `GET /dashboard` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1048 | `POST /run-daily-status` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | 🟡 PARTIAL |
| 1110 | `POST /run-penalty-engine` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | 🟡 PARTIAL |
| 1162 | `GET /penalties` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1198 | `PATCH /penalties/:id/waive` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | 🟡 PARTIAL |
| 1239 | `POST /penalties/waive-bulk` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | 🟡 PARTIAL |
| 1309 | `POST /agent-invoices/:id/record-payment` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | 🟡 PARTIAL |
| 1340 | `POST /agent-invoices/generate` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | 🟡 PARTIAL |
| 1429 | `GET /agent-invoices` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1474 | `GET /transport` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1511 | `DELETE /transport/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 1527 | `POST /transport` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 1579 | `PATCH /transport/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | 🟡 PARTIAL |
| 1641 | `POST /transport/:id/assign-pilgrims` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 1672 | `GET /import-logs` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1680 | `GET /unassigned` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1692 | `POST /assign-bulk` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 1711 | `GET /violations` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1752 | `POST /violations` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 1767 | `PATCH /violations/:id` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | 🟡 PARTIAL |
| 1790 | `DELETE /violations/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 1809 | `POST /penalties` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |

## Reproducing this audit

```bash
MODULE=umrah node audit/system-review/tooling/module-cert.mjs
```
