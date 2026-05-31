# PRINT_EXPORT_EXECUTION_MATRIX

Status of every non-finance page in `artifacts/ghayth-erp/src/pages/**`
that emits printable or exportable output, after Agent 6 (Printing &
Export Unification) pass on branch
`claude/enterprise-hardening-roadmap-AOfO7`.

Status values:
- **unified** — routes through `exportRowsToCsv` / `downloadDocument` /
  `previewDocument` / `<PrintButton>` / `<ExportButton>` (server URL).
- **legacy (Blob)** — builds CSV/Excel client-side via `new Blob` +
  `URL.createObjectURL`, bypassing `print_jobs`.
- **legacy (window.print)** — calls `window.print()` directly instead
  of the unified `<PrintButton>` system.
- **hybrid** — uses both paths.

## Inventory

### List & report pages (non-finance) — CSV export

These all call the centralized `exportToCSV` helper exported from
`@/components/shared/advanced-filters`. After this pass, that helper
delegates to `exportRowsToCsv`, so every caller is unified by
transitivity (no per-page code change required).

| Page | Output type | Current implementation | Status | Action |
| --- | --- | --- | --- | --- |
| `pages/clients.tsx` | CSV | `exportToCSV(filtered, cols, name)` | unified (via helper) | none |
| `pages/crm.tsx` | CSV | `exportToCSV(filtered, cols, name)` | unified (via helper) | none |
| `pages/tasks.tsx` | CSV | `exportToCSV(filtered, cols, name)` | unified (via helper) | none |
| `pages/projects.tsx` | CSV | `exportToCSV(filtered, cols, name)` | unified (via helper) | none |
| `pages/legal.tsx` | CSV | `exportToCSV(filtered, cols, name)` | unified (via helper) | none |
| `pages/support.tsx` | CSV | `exportToCSV(filtered, cols, name)` | unified (via helper) | none |
| `pages/employees.tsx` | CSV | `exportToCSV(filtered, cols, name)` | unified (via helper) | none |
| `pages/fleet.tsx` | CSV | `exportToCSV(filtered, cols, name)` | unified (via helper) | none |
| `pages/warehouse.tsx` | CSV | `exportToCSV(filtered, cols, name)` | unified (via helper) | none |
| `pages/store.tsx` | CSV | `exportToCSV(filtered, cols, name)` | unified (via helper) | none |
| `pages/properties.tsx` | CSV | `exportToCSV(filtered, cols, name)` | unified (via helper) | none |
| `pages/properties-contracts.tsx` | CSV | `exportToCSV(filtered, cols, name)` | unified (via helper) | none |
| `pages/properties-tenants.tsx` | CSV | `exportToCSV(filtered, cols, name)` | unified (via helper) | none |
| `pages/properties-owners.tsx` | CSV | `exportToCSV(filtered, cols, name)` | unified (via helper) | none |
| `pages/properties-payments.tsx` | CSV | `exportToCSV(filtered, cols, name)` | unified (via helper) | none |
| `pages/properties-maintenance.tsx` | CSV | `exportToCSV(filtered, cols, name)` | unified (via helper) | none |
| `pages/hr/recruitment.tsx` | CSV | `exportToCSV(filtered, cols, name)` | unified (via helper) | none |
| `pages/hr/overtime.tsx` | CSV | `exportToCSV(filtered, cols, name)` | unified (via helper) | none |
| `pages/hr/loans.tsx` | CSV | `exportToCSV(filtered, cols, name)` | unified (via helper) | none |
| `pages/hr/exit-requests.tsx` | CSV | `exportToCSV(filtered, cols, name)` | unified (via helper) | none |
| `pages/hr/violations-management.tsx` | CSV | `exportToCSV(filtered, cols, name)` | unified (via helper) | none |
| `pages/hr/turnover-report.tsx` | CSV | `exportToCSV(filtered, cols, name)` | unified (via helper) | none |
| `pages/governance/risks-tab.tsx` | CSV | `exportToCSV(filtered, cols, name)` | unified (via helper) | none |
| `pages/governance/audits-tab.tsx` | CSV | `exportToCSV(filtered, cols, name)` | unified (via helper) | none |
| `pages/governance/policies-tab.tsx` | CSV | `exportToCSV(filtered, cols, name)` | unified (via helper) | none |
| `pages/governance/compliance-tab.tsx` | CSV | `exportToCSV(filtered, cols, name)` | unified (via helper) | none |
| `pages/bi/dashboards-tab.tsx` | CSV | `exportToCSV(filtered, cols, name)` | unified (via helper) | none |
| `pages/bi/kpis-tab.tsx` | CSV | `exportToCSV(filtered, cols, name)` | unified (via helper) | none |
| `pages/bi/reports-tab.tsx` | CSV | `exportToCSV(filtered, cols, name)` | unified (via helper) | none |

### Pages already on the unified path before this pass

| Page | Output type | Implementation | Status |
| --- | --- | --- | --- |
| `pages/admin/logs.tsx` | CSV (audit logs) | `exportRowsToCsv` directly | unified |
| `pages/reports/print-log.tsx` | CSV | `exportRowsToCsv` directly | unified |
| `pages/manager-board/reprint-approvals.tsx` | (lists reprint requests, no own export) | n/a | unified |
| `pages/hr/payroll.tsx` | Excel | `<ExportButton endpoint="/export/excel/payroll">` | unified (server URL) |
| `pages/hr/attendance.tsx` | Excel | `<ExportButton ...>` | unified (server URL) |
| `pages/fleet/reports.tsx` | Excel | `<ExportButton endpoint="/export/excel/fleet">` | unified (server URL) |
| `pages/finance/reports.tsx` *(boundary)* | Excel | `<ExportButton ...>` | unified (server URL) |
| `pages/admin-integrations-diagnostics.tsx` | Excel | server-endpoint anchor (`/export/excel/invoices`) | unified (server URL) |
| `pages/admin/print-templates.tsx` | PDF preview | `previewDocument({ entityType, templateId })` then opens blob URL | unified (server-rendered) |
| `pages/details/*` (detail screens) | PDF | `<PrintButton entityType=...>` | unified |
| `pages/employee-detail.tsx`, `client-detail.tsx`, `legal-case-detail.tsx`, `umrah/pilgrim-detail.tsx`, `crm/lead-detail.tsx`, etc. | PDF | `<PrintButton>` | unified |
| `pages/my-payslip.tsx` | PDF | `<PrintButton>` | unified |
| `pages/umrah/daily-runsheet.tsx` | PDF | `<PrintButton>` | unified |
| `pages/hr/official-letters.tsx` | PDF | `<PrintButton>` | unified |
| `pages/fleet/trip-detail.tsx`, `properties/contract-detail.tsx`, `store/order-detail.tsx`, etc. | PDF | `<PrintButton>` | unified |

### Page-specific export (one-off, migrated this pass)

| Page | Output type | Before | After | Status |
| --- | --- | --- | --- | --- |
| `pages/umrah/import-wizard.tsx` | CSV (rejected import rows) | local `downloadRejectedRowsCsv` with Blob+createObjectURL, custom csvEscape | calls `exportRowsToCsv({ entityType: "report_umrah_rejected_<type>", ... })` with dynamic sample columns flattened | unified |

### Non-CSV blob exports (out of scope for CSV unification)

These produce non-CSV output and are documented for completeness; the
mission is print/CSV unification, not JSON/PNG/PDF download.

| Page | Output type | Implementation | Notes |
| --- | --- | --- | --- |
| `pages/admin-pdpl.tsx` | JSON | DSAR per-employee export — `new Blob([JSON.stringify(...)], { type: "application/json" })` | Legal data subject access right (PDPL Article 11). Not a list export — bespoke single-record bundle. Could be migrated to a backend endpoint later but the JSON-blob path is appropriate for ad-hoc DSAR pulls. |
| `pages/documents-page.tsx` | original file | `await res.blob()` from `/api/documents/:id/download` then anchor click | Not client-built — the blob is the server response body. Correct pattern for arbitrary user uploads. |
| `pages/bi-operations.tsx`, `pages/bi/shared.tsx` (`useChartExport`) | PNG | `html-to-image` `toPng()` then anchor download | Chart screenshots are inherently client-side; the print engine produces print/CSV jobs, not raster images. Out of scope. |
| `pages/admin/print-templates.tsx` (preview/sample render) | PDF | `previewDocument` returns a blob from `/api/print/render`, opened in new tab | Already routed through the print engine — the blob is the server-rendered PDF response. |

## Remaining legacy patterns by category

After Agent 6 pass:

### Blob+createObjectURL CSV builders (non-finance)
- **0**. All non-finance CSV builders now route through `exportRowsToCsv`:
  - 29 list pages via the centralised `exportToCSV` helper (whose body
    now delegates to `exportRowsToCsv`).
  - 1 bespoke export (`umrah/import-wizard.tsx`) migrated in place.
- Verification: `grep -rlF 'text/csv' artifacts/ghayth-erp/src/pages/`
  returns one match — `create/finance/opening-balances-create.tsx` line
  154 — which is a `<input accept=".csv,text/csv">` upload attribute,
  not a download. (Finance scope; skipped per mission rules.)

### Direct `window.print()` calls
- **0**. `grep -rln 'window\.print()' artifacts/ghayth-erp/src/pages/`
  returns no results. The only reference platform-wide is the
  `window.print()` call inside `components/shared/print-button.tsx`,
  which IS the unified PrintButton implementation.

### xlsx / SheetJS direct client-side use
- **0**. The five files that import `xlsx`-related strings are all
  references to:
  - the `.xlsx` file extension in a filename / `accept` attribute
    (`umrah/import.tsx`, `umrah/import-wizard.tsx`);
  - a server URL pointing at `/export/excel/*` rendered into an
    `<ExportButton>` or `<a href=...>` (the actual Excel building
    happens on the backend, not in the browser).
- No file calls `XLSX.write` / `XLSX.utils.book_new` etc. in the
  browser.

### JSON / blob downloads (PDPL DSAR style)
- **1** documented, intentional: `admin-pdpl.tsx` Article 11 DSAR
  bundle. Bespoke single-record JSON export; not a list / report. Left
  as-is — migrating a one-record JSON dump through `csvAdapter` would
  semantically distort the artifact (DSAR is not a CSV row list).
  Recommend a future `dsarAdapter` if/when more DSAR endpoints land.

## Verification

```bash
$ grep -rlF 'text/csv' artifacts/ghayth-erp/src/pages/ | wc -l
1   # opening-balances-create.tsx <input accept=...>, not a download

$ grep -rln 'window\.print()' artifacts/ghayth-erp/src/pages/
(empty)
```

## Files modified this pass

- `artifacts/ghayth-erp/src/components/shared/advanced-filters.tsx` —
  `exportToCSV` body replaced with a thin `await exportRowsToCsv(...)`
  delegation. Signature kept identical; 29 callers unchanged. (Also
  used by `components/shared/bulk-actions.tsx` for selected-row
  exports, so bulk exports unify as well by the same path.)
- `artifacts/ghayth-erp/src/pages/umrah/import-wizard.tsx` — removed
  local `csvEscape` + `downloadRejectedRowsCsv` body; now flattens
  dynamic sample columns into a rows array and calls
  `exportRowsToCsv({ entityType: "report_umrah_rejected_<type>", ... })`.

## Files intentionally skipped

- `pages/create/finance/opening-balances-create.tsx` — finance scope
  AND the `text/csv` token is on an upload `<input accept>`, not a
  download.
- `pages/admin-pdpl.tsx` — out-of-shape (single-record JSON DSAR
  bundle, not a list CSV). Documented above.
- `pages/documents-page.tsx` — server-returned binary download, not
  client-built CSV.
- `pages/bi-operations.tsx`, `pages/bi/shared.tsx` — chart PNG
  screenshots via `html-to-image`. Inherent to the chart use-case;
  the print engine produces print/CSV jobs, not raster images.
- `pages/admin/print-templates.tsx` — preview path already routes
  through `/api/print/render`; the `createObjectURL` call wraps the
  server-rendered PDF blob.
- All finance pages (43 list-style + finance create wizard) — already
  migrated per the parent workflow; Agent 6 scope is non-finance only.
