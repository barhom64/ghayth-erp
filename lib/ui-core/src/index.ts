// @workspace/ui-core — Ghaith UI Standard Kit (Phase 1: re-export shim).
//
// See README.md and docs/UNIFICATION_PLAN.md §P8 for the migration plan.
//
// Phase 1 invariant: this file uses deep-relative imports into
// artifacts/ghayth-erp/src/components. The component source still lives
// there until Phase 2 physically moves it. The boundary is documented but
// not yet enforced — no app currently imports from this package.

// ─── Page layout ──────────────────────────────────────────────────────
export { PageShell, PageSection } from "../../../artifacts/ghayth-erp/src/components/page-shell";
export type { PageShellProps, Breadcrumb } from "../../../artifacts/ghayth-erp/src/components/page-shell";

export { PageHeader } from "../../../artifacts/ghayth-erp/src/components/page-header";

export { PageErrorBoundary } from "../../../artifacts/ghayth-erp/src/components/page-error-boundary";

// ─── ListPage composite (UNIFICATION_PLAN §P7) ───────────────────────
// First non-shim export in the kit: a real composition built on top of
// PageShell + DataTable + AdvancedFilters. Consumers pass a queryKey +
// endpoint + columns; ListPage owns the React Query call, the filter
// state, the stats grid and the loading/empty/error fallbacks.
export { ListPage } from "../../../artifacts/ghayth-erp/src/components/list-page";
export type {
  ListPageProps,
  ListPageStat,
  ListPagePrimaryAction,
  StatTone,
} from "../../../artifacts/ghayth-erp/src/components/list-page";

// ─── Tables ───────────────────────────────────────────────────────────
export { DataTable } from "../../../artifacts/ghayth-erp/src/components/ui/data-table";
export type {
  DataTableColumn,
  BulkAction,
  StatusFilterOption,
  Align,
} from "../../../artifacts/ghayth-erp/src/components/ui/data-table";

export { DataTableWrapper, PaginationBar } from "../../../artifacts/ghayth-erp/src/components/data-table-wrapper";

export {
  textColumn,
  currencyColumn,
  dateColumn,
  statusColumn,
  linkColumn,
  actionsColumn,
  booleanColumn,
  numberColumn,
} from "../../../artifacts/ghayth-erp/src/components/data-table-presets";

// ─── Forms ────────────────────────────────────────────────────────────
export {
  FormShell,
  FormTextField,
  FormEmailField,
  FormPhoneField,
  FormNumberField,
  FormDateField,
  FormTextareaField,
  FormSelectField,
  FormGrid,
} from "../../../artifacts/ghayth-erp/src/components/form-shell";
export type {
  FormShellProps,
  FormTextFieldProps,
  FormTextareaFieldProps,
  FormSelectFieldProps,
  FormSelectOption,
} from "../../../artifacts/ghayth-erp/src/components/form-shell";

// ─── Status ───────────────────────────────────────────────────────────
export {
  PageStatusBadge,
  STATUS_MAP,
  resolveStatus,
} from "../../../artifacts/ghayth-erp/src/components/page-status-badge";
export type {
  PageStatusBadgeProps,
  StatusTone,
  StatusDomain,
  StatusDef,
} from "../../../artifacts/ghayth-erp/src/components/page-status-badge";

// ─── Filters ──────────────────────────────────────────────────────────
export {
  AdvancedFilters,
  useFilters,
  useAdvancedFilters,
  applyFilters,
  exportToCSV,
} from "../../../artifacts/ghayth-erp/src/components/shared/advanced-filters";
export type {
  FilterConfig,
  FilterValues,
  FilterOption,
} from "../../../artifacts/ghayth-erp/src/components/shared/advanced-filters";
