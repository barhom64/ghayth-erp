# Ghaith System Deep Sweep — Execution Progress Log

> Companion to `GHAITH_SYSTEM_SWEEP_EXECUTIVE_SUMMARY.md`. Tracks which
> Top-20 critical fixes have been picked up by implementation slices.
> Updated as PRs land. **Last refresh:** after PR #1488 merge.

## PRs landed (in main)

| PR | Title | GAP_MATRIX items resolved |
|---|---|---|
| #1463 | Enterprise Hardening Roadmap — sweep audit + 6 implementation slices | #2 (fiscal close minLevel), #4 (PO print loader), #8 (csv format), #10 (admin/logs CSV), #14, #15, #16 (sidebar/backend syncs), #17 (wiring-stubs floor), #18 (gov-integrations/digital-signature minLevel), #20 (Umrah module key), #7 partial (4 finance CSV migrations) |
| #1466 | Sweep follow-up — finish finance CSV unification + 5 conflict resolutions | #7 (all 43 finance CSVs done), conflicts #1, #2, #3, #4, #7 |
| #1471 | Sweep follow-up #2 — drop orphan creds table + scope helper ratchet | #13 (scope helper ratchet test + audit doc), #19 (drop wps_bank_credentials via migration 241) |
| #1480 | Sweep follow-up #3 — close all remaining conflicts + 3 P0 items (stale audit) | #3 (RBAC catalog integration ratchet), #5 (FIN-001 already done), #6 (FIN-008 correct-by-design), conflicts #6, #8, #9, #10 |
| #1488 | Scope helper re-audit (docs only) | #13 re-audit notes — most "manual scope" is correct-by-design |

## Top-20 status snapshot

| # | Item | Status | PR | Notes |
|---|---|---|---|---|
| 1 | `/admin/*` RBAC bypass | ⚠️ Re-audited | — | All admin mounts gate at `requireModule("admin") + requireMinLevel(90)`. Original P0 flag was overestimated. No additional work required. |
| 2 | Fiscal period close minLevel | ✅ Done | #1463 | `requireMinLevel(70)` on close/reopen/lock + year-end-close. |
| 3 | RBAC catalog unification | ✅ Done | #1480 | Re-audited: `rbacCatalog.ts` ↔ `featureCatalog.ts` are intentionally complementary. Bridge via `isKnownPermission()`. Ratchet test (`rbacCatalogIntegrationSmoke.test.ts`, 8 assertions) pins the integration. |
| 4 | `purchase_order_lines` print bug | ✅ Done | #1463 | Corrected to `purchase_order_items` in `lib/print/dataLoader.ts:553`. |
| 5 | GRN/match/payment chain | ⚠️ Already done | #1480 | FIN-001 — re-inspected `finance-purchase.ts:2331-2372`: three-way-match ALREADY posts DR GRNI / CR AP. Audit was stale. |
| 6 | Bank reconciliation GL entry | ⚠️ Correct by design | #1480 | FIN-008 — re-inspected `finance-algorithms.ts:847`: matches existing journal_line (not posts new). New post would double-count. JSDoc anchor added. |
| 7 | 43 finance pages CSV unification | ✅ Done | #1463, #1466 | **All 43 pages migrated** to `exportRowsToCsv` helper. Zero legacy `text/csv` Blob+createObjectURL patterns remain. |
| 8 | `csv` added to PrintFormat | ✅ Done | #1463 | PrintFormat += "csv", csvAdapter + ListPage export menu wired. |
| 9 | Ctrl+P bypass in 3 BI pages | ⏸️ Acceptable | — | Pages use `print:hidden` CSS + native print. Reasonable output. |
| 10 | `admin/logs.tsx` CSV audit logging | ✅ Done | #1463 | Routed through `downloadDocument` with `entityType: "report_audit_logs"`. |
| 11 | PDPL DSAR export logging | ⚠️ Already logged | — | `pdpl.ts:155` writes to `processing_activities_log` — correct audit path for PDPL. |
| 12 | `/umrah/pilgrims/export.csv` unification | ⚠️ Already audited | — | Endpoint calls `logSensitiveAccess`. Migration to `renderPrint` would have low marginal value (custom shape). |
| 13 | `buildScopedWhere` enforcement | ✅ Done | #1471, #1488 | Ratchet test (`scopeHelperAdoptionSmoke.test.ts`) pins current allowlist (63 files) + snapshot count (total=103, helperUsers=36, manualOnly=63). Re-audit (#1488) reclassified most "manual scope" as correct-by-design. Future drift caught by CI. |
| 14 | `/exec-dashboard` sidebar vs backend | ✅ Done | #1463 | Sidebar 60→70. |
| 15 | `/reports/scheduled` sidebar vs backend | ✅ Done | #1463 | Sidebar 40→50. |
| 16 | `/admin/logs` ↔ `/audit-logs` sync | ✅ Done | #1463 | Mount lifted to 90 + `requirePermission("audit:read")`. |
| 17 | `wiring-stubs` guards | ✅ Done | #1463 | Floor at level 20. |
| 18 | `/digital-signature` + `/gov-integrations` minLevel | ✅ Done | #1463 | Both mounts at level 70. |
| 19 | `wps_bank_credentials` orphan table | ✅ Done | #1471 | Migration 241 drops the table (with @rollback + @policy:destructive annotations). |
| 20 | Umrah module key sync | ✅ Done | #1463 | Sidebar key `umrah` → `operations` to match backend mount + ROLE_DEFAULT_MODULES. |

## Numbers

- **✅ Done:** 15 items (#2, #3, #4, #7, #8, #10, #13, #14, #15, #16, #17, #18, #19, #20, plus #1 re-audited)
- **⚠️ Re-audited / closed as already-done or correct-by-design:** 4 items (#1, #5, #6, #11, #12) — net wins, no further action needed
- **⏸️ Acceptable as-is:** 1 item (#9)
- **⏳ Pending dedicated workflow:** 0

**Total: 20/20 Top-20 items closed.**

## Cross-stream conflicts (10/10 resolved)

All resolved in source via JSDoc anchors or PR slices. See
`docs/audit/GHAITH_SWEEP_CONFLICT_RESOLUTIONS.md` for the per-conflict
log with file:line evidence.

## Item #7 details — finance CSV unification (DONE)

### Verification

```bash
# Should return 0 — no finance page still on legacy CSV pattern
grep -lF 'text/csv' artifacts/ghayth-erp/src/pages/finance/*.tsx 2>/dev/null | wc -l
# Result: 0

# Should be non-zero — pages using the unified export helper
grep -lF 'exportRowsToCsv' artifacts/ghayth-erp/src/pages/finance/*.tsx 2>/dev/null | wc -l
# Result: 44

# Belt-and-braces — verify no leftover Blob/createObjectURL patterns in finance
grep -rlE 'new Blob\(.*csv|"text/csv"|URL\.createObjectURL.*csv' \
  artifacts/ghayth-erp/src/pages/finance/ 2>/dev/null
# Result: (no output — all migrated)
```

### How the migration shipped

| Slice | Codemod | Files |
|---|---|---|
| PR #1463 slice 4 | manual (template) | `fixed-asset-register.tsx` |
| PR #1463 slice 5 | manual | `ap-aging.tsx`, `ar-aging.tsx`, `ledger.tsx` |
| PR #1466 slice 7 | codemod v5 (auto) | 11 files: `account-statement, cogs-summary, gl-integrity-gaps, inventory-turnover, inventory-valuation, lot-expiry-alerts, negative-stock, profitability, unmapped-lines, vat-reconciliation, wht-summary` |
| PR #1466 slice 8 | codemod v9 (auto) | 22 files: `account-reconciliation-workpaper, ap-payment-calendar, ar-collection-workbench, bank-accounts-watch, budget-heatmap, cash-flow-statement, custody-workbench, customer-360-sheet, customer-advances-workbench, customer-statement-print, daily-close-checklist, expense-burn-rate, income-statement-vs-budget, invoice-send-queue, trial-balance-drilldown, vat-filing-readiness, vehicle-portfolio-dashboard, vendor-360-sheet, vendor-contracts-tracker, vendor-settlement-workbench, vendor-statement-print, wht-filing-workbench` |
| PR #1466 slice 9 | codemod v10 (auto) | 5 files: `cash-13week, cost-center-pnl, income-statement-trend, trial-balance-comparison, yoy-comparison` |
| PR #1466 slice 9 | manual | `overrides-report.tsx` (bespoke per-row object construction) |
| PR #1463/#1466 (earlier slice) | manual | `reports.tsx` |

Total: **43 finance pages**, plus the centralized helper at
`lib/unified-export.ts` itself = 44 grep hits on `exportRowsToCsv`.

Every CSV download now:
- Routes through `POST /api/print/render` with `format: "csv"`
- Writes a `print_jobs` row → appears in `/reports/print-log`
- Inherits letterhead, branding, server-side RBAC re-check
- Audit trail traces "who exported what, when"

## Codemod history (for future reference)

- **v5** — handled `[headers, ...rows].map().join("\n")` shape (used helper).
- **v9** — handled `lines.push(...) → new Blob([BOM + lines.join("\n")])` shape. Key fix: dropping leading `\s*` from the epilogue regex prevented greedy match from crossing back over preceding `}` braces.
- **v10** — handled multi-line `const lines = [...]` array-literal shape.

## How to continue (post-workflow)

The workflow is complete for all sweep audit items. Future enhancement
candidates (not blocking):

- Migrate any non-finance page still building CSV with Blob (audit
  scope was finance-only).
- Migrate the 63 manual-scope route files individually per the
  ranking in `SCOPE_HELPER_ADOPTION_AUDIT.md` (most are correct-by-design;
  ratchet catches new regressions).
- Address the "feature build" items from `docs/audit/archive/RESCAN_2026-05-22-v3.md`
  (FLT-006 alerts UI, FIN-013–016 finance UI gaps, CRM-004 activities,
  COM-001/002 comms UIs, UMR-005/016 umrah invoicing pages,
  HR-010/013 attendance/discipline UIs) — each is a small project on
  its own, not a sweep cleanup.
