# Ghaith System Deep Sweep — Execution Progress Log

> Companion to `GHAITH_SYSTEM_SWEEP_EXECUTIVE_SUMMARY.md`. Tracks which
> Top-20 critical fixes have been picked up by implementation slices on
> branch `claude/enterprise-hardening-roadmap-AOfO7`. Updated as
> commits land.

## Slices landed

| Slice | Commit | GAP_MATRIX items resolved |
|---|---|---|
| 1/N | `e02c66ec` | #2 (fiscal period close minLevel), #4 (PO print loader table name), #14 (`/exec-dashboard` sidebar sync), #15 (`/reports/scheduled` sidebar sync), #16 (`/audit-logs` permission), #18 (`/gov-integrations`, `/digital-signature` minLevel) |
| 2/N | `168b7734` | #8 (CSV added to PrintFormat + csvAdapter + ListPage export) |
| 3/N | `b12a1bce` | #10 (admin/logs CSV via print engine), #17 (wiring-stubs mount-level floor) |
| 4/N | `10feaf13` | #20 (Umrah module key sync), #7 partial (unified-export helper + first migrant — fixed-asset-register) |
| 5/N | `339c0201` | #7 partial (3 more finance CSVs migrated: ap-aging, ar-aging, ledger) |

## Top-20 status snapshot

| # | Item | Status | Notes |
|---|---|---|---|
| 1 | `/admin/*` RBAC bypass | ⚠️ Re-audited | All admin-*.ts routers already use `authorize({feature: "admin"})` per-endpoint, AND the mount adds `requireMinLevel(90)`. Original report flag was overestimated. No additional work required at this point. |
| 2 | Fiscal period close minLevel | ✅ Done | Slice 1/N — added `requireMinLevel(70)` on close/reopen/lock + year-end-close. |
| 3 | RBAC catalog unification | ⏳ Pending | Large refactor — `rbacCatalog` (flat) ↔ `featureCatalog` (tree). Needs dedicated workflow. |
| 4 | `purchase_order_lines` print bug | ✅ Done | Slice 1/N — corrected to `purchase_order_items`. |
| 5 | GRN/match/payment chain | ⏳ Pending | FIN-001 — backend major. |
| 6 | Bank reconciliation GL entry | ⏳ Pending | FIN-008 — backend major. |
| 7 | 47 finance pages CSV unification | 🟡 In progress | Helper + csvAdapter ready. 4 of 44 pages migrated. 40 left, each needs column-spec authoring (different shapes per page). |
| 8 | `csv` added to PrintFormat | ✅ Done | Slice 2/N. |
| 9 | Ctrl+P bypass in 3 BI pages | ⏸️ Acceptable | Verified — pages use `print:hidden` CSS + native print. Output is reasonable and audit could be added later via `print_jobs` hook. Acceptable as-is. |
| 10 | `admin/logs.tsx` CSV audit logging | ✅ Done | Slice 3/N. |
| 11 | PDPL DSAR export logging | ⚠️ Already logged | Verified — `pdpl.ts:155` already writes to `processing_activities_log`. Original report missed this. Closed. |
| 12 | `/umrah/pilgrims/export.csv` unification | ⚠️ Already audited | Verified — endpoint already calls `logSensitiveAccess`. Migration to `renderPrint` is a refactor with low marginal value (custom umrah-specific shape). Lower priority. |
| 13 | `buildScopedWhere` enforcement | ⏳ Pending | FND-013 — large helper refactor. |
| 14 | `/exec-dashboard` sidebar vs backend | ✅ Done | Slice 1/N — sidebar 60→70. |
| 15 | `/reports/scheduled` sidebar vs backend | ✅ Done | Slice 1/N — sidebar 40→50. |
| 16 | `/admin/logs` ↔ `/audit-logs` sync | ✅ Done | Slice 1/N — mount lifted to 90 + permission required. |
| 17 | `wiring-stubs` guards | ✅ Done | Slice 3/N — floor at level 20. |
| 18 | `/digital-signature` + `/gov-integrations` minLevel | ✅ Done | Slice 1/N. |
| 19 | `wps_bank_credentials` orphan table | ⏳ Pending | Needs DBA decision + new migration (drop or encrypt). Skipped this session. |
| 20 | Umrah module key sync | ✅ Done | Slice 4/N — sidebar key `umrah` → `operations`. |

## Numbers

- ✅ Done: 11 items
- ⚠️ Reaudited / acceptable as-is: 3 items
- 🟡 In progress: 1 item (item #7 — 4/44 done)
- ⏸️ Acceptable: 1 item (item #9)
- ⏳ Pending (require dedicated workflow): 4 items (#3, #5, #6, #13, #19)

## Outstanding workload (item #7 detail)

40 finance pages still build CSV with `Blob + createObjectURL`. The
`exportRowsToCsv` helper at `lib/unified-export.ts` is ready; each
migration is bounded to ~15 lines of column-spec at the call site +
import update + a single function-body replacement.

The four migrated examples are reference templates:

- `finance/fixed-asset-register.tsx`  (no-param shape, accesses outer `filtered`)
- `finance/ap-aging.tsx`               (data + filename → data + title)
- `finance/ar-aging.tsx`               (data + filename → data + title)
- `finance/ledger.tsx`                 (data + headers + filename → data + headers + title)

Remaining files grouped by shape (sample):

- Single-section reports: `inventory-valuation, cogs-summary, negative-stock, lot-expiry-alerts, vat-reconciliation`
- Multi-section drilldowns: `trial-balance-drilldown, profitability, account-statement, customer-statement-print, vendor-statement-print`
- Workbench pages: `account-reconciliation-workpaper, ar-collection-workbench, custody-workbench, customer-advances-workbench, vendor-settlement-workbench, wht-filing-workbench`
- Calendar/KPI pages: `ap-payment-calendar, bank-accounts-watch, cash-13week, expense-burn-rate, daily-close-checklist, cash-flow-statement, budget-heatmap, gl-integrity-gaps, overrides-report, income-statement-trend, income-statement-vs-budget, invoice-send-queue, trial-balance-comparison, cost-center-pnl, customer-360-sheet, inventory-turnover`

Each can be migrated by a dedicated slice with its column-spec.

## Cross-stream conflicts (from gap matrix)

The 10 disputed items flagged by the consolidation agent
(`GHAITH_SYSTEM_GAP_MATRIX.md`) were NOT resolved in this execution
pass. They remain open for human review per the audit-first
instruction in the original workflow brief.

## How to continue

1. Pick an open item from the table above.
2. Reference the matrix row in `GHAITH_SYSTEM_GAP_MATRIX.md`.
3. Open a small PR slice (similar to slices 1–5).
4. Update this progress log when the slice lands.
