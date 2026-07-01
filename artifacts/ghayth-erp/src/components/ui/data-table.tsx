/**
 * DataTable — unified declarative table component.
 *
 * Goals:
 *  - Arabic / RTL by default
 *  - Built-in sorting (via useSortedData)
 *  - Built-in filtering (search + status, via useFilters + applyFilters)
 *  - Built-in bulk + individual row selection (via useBulkSelection)
 *  - Built-in pagination (client-side by default, server-side when total is passed)
 *  - Loading / error / empty states
 *
 * This component composes the existing primitives (Table, DataTableWrapper,
 * SortableTableHead, useSortedData, useFilters, useBulkSelection, PaginationBar,
 * BulkCheckbox) into a single API that pages can adopt instead of wiring these
 * pieces by hand.
 */
import { Fragment, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Filter, X, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { DataTableWrapper, PaginationBar } from "@/components/data-table-wrapper";
import { SortableTableHead } from "@/components/sortable-table-head";
import { useSortedData } from "@/hooks/use-sorted-data";
import { useRateLimitCooldown } from "@/hooks/use-rate-limit-cooldown";
import { BulkCheckbox, useBulkSelection } from "@/components/shared/bulk-actions";
import { useIsMobile } from "@/hooks/use-mobile";
import { useOptionalAuth } from "@/lib/auth";

export type Align = "start" | "center" | "end";

export interface DataTableColumn<T> {
  /** Unique key — also used as sort key unless sortKey is set. */
  key: string;
  /** Arabic header label. */
  header: string;
  /** Whether this column is sortable (default false). */
  sortable?: boolean;
  /** Override sort key (defaults to `key`). */
  sortKey?: string;
  /** Whether this column is searchable (default false). When true, text in the
   *  global search input will match against this column value. */
  searchable?: boolean;
  /** Cell renderer. If omitted, renders `row[key] ?? "-"`. */
  render?: (row: T, index: number) => ReactNode;
  /** Column width (CSS). */
  width?: string;
  /** Cell + header alignment. Defaults to "start" (RTL-safe). */
  align?: Align;
  /** Force LTR direction on the cell (useful for phone numbers / IDs). */
  ltr?: boolean;
  /** Extra class name for the cells. */
  className?: string;
  /**
   * Per-CELL class name, computed from the row. Merged after `className`.
   * Use for value-dependent cell styling that a static `className` can't
   * express — e.g. a budget heatmap where each cell's background encodes its
   * own ratio, or a conditional danger/success cell tint. Applied to the body
   * cell (and the mobile value span); never to the header.
   */
  cellClassName?: (row: T, index: number) => string | undefined;
  /**
   * Per-COLUMN total cell, rendered in a column-aligned footer row at the
   * bottom of the table (over all filtered+sorted rows). When ANY column sets
   * `footer`, the table renders one total row with a cell under each column —
   * the canonical, column-aligned alternative to the single-`colSpan`
   * `renderGrandTotal`. Use for matrix / financial tables whose totals must sit
   * directly under their columns. Columns without `footer` render an empty
   * total cell.
   */
  footer?: (rows: T[]) => ReactNode;
  /**
   * Per-COLUMN group subtotal cell, rendered in a column-aligned subtotal row
   * after each group (only when `groupBy` is set). The column-aligned analogue
   * of `renderGroupSubtotal` (which spans all columns in one cell) — use it for
   * statement-style tables (P&L / cash-flow) whose section subtotals must sit
   * under their own columns. Receives that group's rows + value. Columns without
   * `groupFooter` render an empty subtotal cell.
   */
  groupFooter?: (groupRows: T[], groupValue: string) => ReactNode;
  /** Hide the column entirely — used for feature gating without re-declaring. */
  hidden?: boolean;
  /** Value used when exporting selected rows to CSV. Defaults to `row[key]`.
   *  Set this when the cell uses `render` and the raw value differs from the
   *  displayed text. */
  exportValue?: (row: T) => string | number;
}

export interface BulkAction {
  label: string;
  icon?: ReactNode;
  onClick: (ids: number[]) => void | Promise<void>;
  variant?: "default" | "destructive" | "outline";
  disabled?: boolean;
}

export interface StatusFilterOption {
  value: string;
  label: string;
}

/**
 * A one-click toolbar toggle that narrows the rows to those matching a
 * predicate the caller owns — e.g. «يحتاج إجراء مني» (rows awaiting the
 * current user's decision). Unlike a status filter (single field equality),
 * a quick filter expresses arbitrary row logic the page already knows. Pure
 * client-side filtering over the rows already in hand — no new fetch, no
 * cross-path logic.
 */
export interface QuickFilter<T> {
  /** Stable key for toggle state. */
  key: string;
  /** Toolbar label (Arabic). */
  label: string;
  /** Rows for which this returns true are kept while the toggle is active. */
  predicate: (row: T) => boolean;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[] | undefined | null;
  isLoading?: boolean;
  isError?: boolean;
  error?: Error | null;
  onRetry?: () => void;

  /**
   * Optional row key accessor. Used as the React key for each row and for
   * selection identifiers. Defaults to `row.id` when not provided. Use this
   * when rows don't have an `id` field, or when their `id` is a string.
   */
  rowKey?: (row: T, index: number) => string | number;

  /** Row click handler. */
  onRowClick?: (row: T) => void;
  /** Optional row-level class name. */
  rowClassName?: (row: T) => string | undefined;

  /** Enable bulk + individual selection. Requires rows to have a numeric `id`. */
  selectable?: boolean;
  /** Notified when the selection changes. */
  onSelectionChange?: (ids: number[]) => void;
  /**
   * Notified whenever the rows the table is about to render change — i.e.
   * after filter + sort, before pagination. Pages use this to feed the
   * same ordering into the PrintButton payload so prints respect the
   * user's current sort.
   */
  onSortedDataChange?: (rows: T[]) => void;
  /** Bulk action buttons shown when ≥1 row selected. */
  bulkActions?: BulkAction[];
  /** Override the built-in "تصدير المحدّد" CSV export of the selected rows. */
  onExportSelected?: (rows: T[]) => void;

  /** Global search input placeholder. Set to null to hide the search input. */
  searchPlaceholder?: string | null;
  /** Status filter options. Set to omit to hide the filter. */
  statusOptions?: StatusFilterOption[];
  /** Key on the row object used by the status filter. Default "status". */
  statusField?: string;
  /**
   * One-click toolbar toggles (e.g. «يحتاج إجراء مني») that filter the rows
   * by an arbitrary predicate. Multiple active toggles combine with AND.
   * Omit to render none. Ignored when `noToolbar` is set.
   */
  quickFilters?: QuickFilter<T>[];
  /** Additional toolbar content (rendered on the start side of the toolbar). */
  toolbarStart?: ReactNode;
  /** Additional toolbar content (rendered on the end side of the toolbar). */
  toolbarEnd?: ReactNode;
  /** CSV export handler. Hidden if not provided. */
  onExportCSV?: () => void;

  /** Empty state label. */
  emptyMessage?: string;
  /** Empty state icon. */
  emptyIcon?: ReactNode;
  /** Empty state action. */
  emptyAction?: { label: string; onClick: () => void };

  /** Page size (default 20). Set 0 to disable pagination. */
  pageSize?: number;
  /**
   * Server-side total count. When passed, pagination is considered server-driven
   * and the component does NOT slice `data`, it relies on `data` being the
   * current page. When omitted, pagination is client-side.
   */
  total?: number;
  /** External page state (for server-side pagination). */
  page?: number;
  onPageChange?: (page: number) => void;

  /**
   * When true, skip the internal toolbar entirely (sometimes pages render their
   * own AdvancedFilters/search above the table and just want the selectable
   * sortable table body).
   */
  noToolbar?: boolean;

  /** Additional row content rendered after each row (e.g. expanded detail,
   *  inline edit form). Return null to skip. */
  renderRowExtras?: (row: T) => ReactNode;

  /** Optional caption above the table (e.g. small helper text). */
  caption?: ReactNode;

  /**
   * Group rows by this field key. When set, pagination is bypassed (all rows
   * are shown) and rows are rendered in named groups. Use with
   * `renderGroupHeader` / `renderGroupSubtotal` to add section headers and
   * aggregate rows between groups, and `renderGrandTotal` for a bottom total.
   *
   * GAP_MATRIX P1 — enables finance/reports pages to adopt DataTable instead
   * of hand-rolling raw <table> with subtotals.
   */
  groupBy?: string;
  /** Renders a header row before each group. Receives group value + rows. */
  renderGroupHeader?: (groupValue: string, groupRows: T[]) => ReactNode;
  /** Renders a subtotal row after each group. Receives group value + rows. */
  renderGroupSubtotal?: (groupValue: string, groupRows: T[]) => ReactNode;
  /** Renders a grand-total row at the bottom of the table body. */
  renderGrandTotal?: (allRows: T[]) => ReactNode;

  className?: string;
}

function alignClass(align?: Align): string {
  if (align === "center") return "text-center";
  if (align === "end") return "text-end";
  return "text-start";
}

/** Row-count choices for the page-size selector. */
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 200];

/** Structural columns (not backed by sortable data) — never auto-sortable. */
const NON_DATA_COLUMN_KEY =
  /^(actions?|_actions?|select|_select|controls?|menu|buttons?|rowactions?|expand|drag|handle)$/i;

/**
 * Whether a column should be sortable. An explicit `sortable` always wins;
 * when unset, every data column sorts by DEFAULT — except structural columns
 * (action/select columns, or columns with no header text).
 */
function isSortableColumn<T>(col: DataTableColumn<T>): boolean {
  if (col.sortable !== undefined) return col.sortable;
  if (!col.header || !col.header.trim()) return false;
  if (NON_DATA_COLUMN_KEY.test(col.key)) return false;
  return true;
}

/** CSV-escape a single cell value. */
function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Download the given rows as a CSV of the visible columns (selected-rows export). */
function downloadRowsCsv<T>(columns: DataTableColumn<T>[], rows: T[]): void {
  const cols = columns.filter((c) => !c.hidden);
  const header = cols.map((c) => csvCell(c.header)).join(",");
  const body = rows.map((row) =>
    cols
      .map((c) => csvCell(c.exportValue ? c.exportValue(row) : (row as any)[c.key]))
      .join(","),
  );
  // Prepend a BOM so Excel renders the Arabic headers/content correctly.
  const csv = "﻿" + [header, ...body].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `selected-${new Date().toISOString().slice(0, 10)}.csv`; // utc-ok: CSV download filename label, not wall-clock business data
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function DataTable<T>({
  columns,
  data,
  isLoading = false,
  isError = false,
  error,
  onRetry,
  rowKey,
  onRowClick,
  rowClassName,
  selectable = false,
  onSelectionChange,
  onSortedDataChange,
  bulkActions,
  onExportSelected,
  searchPlaceholder = "بحث...",
  statusOptions,
  statusField = "status",
  quickFilters,
  toolbarStart,
  toolbarEnd,
  onExportCSV,
  emptyMessage = "لا توجد بيانات",
  emptyIcon,
  emptyAction,
  pageSize = 20,
  total,
  page: pageProp,
  onPageChange: onPageChangeProp,
  noToolbar = false,
  renderRowExtras,
  caption,
  groupBy,
  renderGroupHeader,
  renderGroupSubtotal,
  renderGrandTotal,
  className,
}: DataTableProps<T>) {
  const visibleColumns = useMemo(() => columns.filter((c) => !c.hidden), [columns]);

  // Non-throwing — DataTable also renders in tests/storybook without an
  // AuthProvider, where this is null and persistence simply no-ops.
  const auth = useOptionalAuth();
  const persistedPageSize = auth?.user?.tablePrefs?.pageSize;

  // --- Search / status / quick filters (internal when noToolbar is false) ---
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [activeQuick, setActiveQuick] = useState<Set<string>>(new Set());
  // Task #170 — pause typing while a 429 cooldown is active so we don't
  // fire a fresh request on every keystroke and keep getting throttled.
  const cooldown = useRateLimitCooldown();

  const searchableKeys = useMemo(
    () => visibleColumns.filter((c) => c.searchable).map((c) => c.key),
    [visibleColumns]
  );

  const filteredData = useMemo(() => {
    if (!data) return data;
    let out = data as T[];
    if (!noToolbar && search && searchableKeys.length > 0) {
      const q = search.toLowerCase().trim();
      if (q) {
        out = out.filter((row) =>
          searchableKeys.some((k) =>
            String((row as any)[k] ?? "").toLowerCase().includes(q)
          )
        );
      }
    }
    if (!noToolbar && status && statusOptions) {
      out = out.filter((row) => String((row as any)[statusField] ?? "") === status);
    }
    if (!noToolbar && quickFilters && activeQuick.size > 0) {
      const active = quickFilters.filter((q) => activeQuick.has(q.key));
      out = out.filter((row) => active.every((q) => q.predicate(row)));
    }
    return out;
  }, [data, search, status, activeQuick, noToolbar, searchableKeys, statusOptions, statusField, quickFilters]);

  // --- Sort ---
  const { sortedData, sortState, handleSort } = useSortedData<T>(filteredData ?? []);

  // Publish post-filter+sort rows so PrintButton can use the user's
  // current ordering instead of the original `data` order.
  useEffect(() => {
    onSortedDataChange?.(sortedData ?? []);
  }, [sortedData, onSortedDataChange]);

  // --- Pagination ---
  const isServerPaginated = typeof total === "number" && typeof pageProp === "number";
  const [localPage, setLocalPage] = useState(1);
  const currentPage = isServerPaginated ? pageProp! : localPage;
  const setCurrentPage = (p: number) => {
    if (isServerPaginated) onPageChangeProp?.(p);
    else setLocalPage(p);
  };

  // Effective page size. The caller's `pageSize` is the default (0 disables
  // pagination entirely — structural, never overridden). For client-side
  // tables we adopt the user's persisted choice once it loads, unless the
  // user changed it this session. Server-paginated and grouped tables keep
  // the caller's size (the server / grouping controls the layout).
  const [pageSizeState, setPageSizeState] = useState<number>(
    pageSize === 0 ? 0 : pageSize || 20,
  );
  const userTouchedPageSize = useRef(false);
  useEffect(() => {
    if (pageSize === 0 || isServerPaginated || groupBy) return;
    if (userTouchedPageSize.current) return;
    if (persistedPageSize && PAGE_SIZE_OPTIONS.includes(persistedPageSize)) {
      setPageSizeState((cur) => (cur === persistedPageSize ? cur : persistedPageSize));
    }
  }, [persistedPageSize, pageSize, isServerPaginated, groupBy]);

  const handlePageSizeChange = (size: number) => {
    userTouchedPageSize.current = true;
    setPageSizeState(size);
    setCurrentPage(1);
    if (auth?.setPreferences && PAGE_SIZE_OPTIONS.includes(size)) {
      // Persist to the user's account; the local change already applied, so a
      // failed save is non-fatal (swallow rather than reject).
      auth.setPreferences({ tablePrefs: { pageSize: size } }).catch(() => {});
    }
  };

  const pagedData = useMemo(() => {
    if (isServerPaginated || !sortedData) return sortedData;
    if (!pageSizeState) return sortedData;
    const start = (currentPage - 1) * pageSizeState;
    return sortedData.slice(start, start + pageSizeState);
  }, [sortedData, currentPage, pageSizeState, isServerPaginated]);

  const effectiveTotal = isServerPaginated ? total! : (sortedData?.length ?? 0);

  // --- Row key resolution ---
  const getRowKey = (row: T, index: number): string | number => {
    if (rowKey) return rowKey(row, index);
    const id = (row as any)?.id;
    return id ?? index;
  };

  // --- Selection ---
  const { selectedIds, toggle, toggleAll, clear } = useBulkSelection();
  const pageIds = useMemo(
    () => (pagedData ?? []).map((r) => (r as any).id as number),
    [pagedData]
  );
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const somePageSelected = pageIds.some((id) => selectedIds.has(id));
  const indeterminate = somePageSelected && !allPageSelected;

  const notifySelection = (next: Set<number>) => {
    onSelectionChange?.(Array.from(next));
  };

  const handleToggleRow = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    toggle(id);
    notifySelection(next);
  };

  const handleToggleAll = () => {
    toggleAll(pageIds);
    const next = allPageSelected ? new Set<number>() : new Set(pageIds);
    notifySelection(next);
  };

  const handleClearSelection = () => {
    clear();
    notifySelection(new Set());
  };

  // Selected rows (resolved from the current filtered+sorted set) for the
  // built-in "تصدير المحدّد" export.
  const selectedRows = useMemo(() => {
    const src = (sortedData ?? (data as T[] | null) ?? []) as T[];
    return src.filter((r) => selectedIds.has((r as any).id as number));
  }, [sortedData, data, selectedIds]);

  const downloadSelectedCsv = () => {
    if (selectedRows.length === 0) return;
    if (onExportSelected) onExportSelected(selectedRows);
    else downloadRowsCsv(visibleColumns, selectedRows);
  };

  const colCount = visibleColumns.length + (selectable ? 1 : 0);

  // Column-aligned footer total row — rendered when ANY column declares a
  // `footer`. Each column gets its own total cell under its own header (unlike
  // `renderGrandTotal`, which spans all columns in one cell). Computed over the
  // full filtered+sorted set, so it reflects the user's current filter/sort.
  const hasFooter = visibleColumns.some((c) => c.footer);
  const footerRow =
    hasFooter && sortedData && sortedData.length > 0 ? (
      <TableRow className="border-t-4 bg-muted font-bold">
        {selectable && <TableCell className="w-[44px]" />}
        {visibleColumns.map((col) => (
          <TableCell
            key={col.key}
            className={cn(alignClass(col.align), col.className)}
            dir={col.ltr ? "ltr" : undefined}
          >
            {col.footer ? col.footer(sortedData) : null}
          </TableCell>
        ))}
      </TableRow>
    ) : null;

  // Mobile (<768px): render the common (non-grouped) happy-path list as
  // stacked label:value cards instead of a horizontally-scrolling table, so
  // every DataTable-based page (~307 of them) is genuinely phone-usable. The
  // desktop table is untouched; grouped/loading/error/empty stay on the table
  // path (which already scrolls + shows those states).
  const isMobile = useIsMobile();
  const showMobileCards =
    isMobile && !groupBy && !isLoading && !isError && (pagedData?.length ?? 0) > 0;

  return (
    <div className={cn("space-y-3", className)} dir="rtl">
      {!noToolbar && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            {toolbarStart}
            {searchPlaceholder !== null && searchableKeys.length > 0 && (
              <div className="relative flex-1 min-w-[180px] max-w-sm">
                <Search className="absolute end-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  value={search}
                  onChange={(e) => {
                    if (cooldown.isCoolingDown) return;
                    setSearch(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder={cooldown.isCoolingDown ? cooldown.label : searchPlaceholder}
                  disabled={cooldown.isCoolingDown}
                  aria-disabled={cooldown.isCoolingDown}
                  title={cooldown.isCoolingDown ? cooldown.label : undefined}
                  className="pe-8"
                />
                {cooldown.isCoolingDown && (
                  <div
                    role="status"
                    aria-live="polite"
                    className="mt-1 text-[11px] text-status-warning-foreground"
                  >
                    {cooldown.label}
                  </div>
                )}
              </div>
            )}
            {statusOptions && statusOptions.length > 0 && (
              <Select
                value={status || "__all__"}
                onValueChange={(v) => {
                  setStatus(v === "__all__" ? "" : v);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="الحالة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">الكل</SelectItem>
                  {statusOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {quickFilters && quickFilters.length > 0 && quickFilters.map((q) => {
              const on = activeQuick.has(q.key);
              return (
                <Button
                  key={q.key}
                  type="button"
                  variant={on ? "default" : "outline"}
                  size="sm"
                  aria-pressed={on}
                  onClick={() => {
                    setActiveQuick((prev) => {
                      const next = new Set(prev);
                      if (next.has(q.key)) next.delete(q.key);
                      else next.add(q.key);
                      return next;
                    });
                    setCurrentPage(1);
                  }}
                  className="gap-1"
                >
                  <Filter className="h-3.5 w-3.5" />
                  {q.label}
                </Button>
              );
            })}
            {(search || status || activeQuick.size > 0) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setStatus("");
                  setActiveQuick(new Set());
                  setCurrentPage(1);
                }}
                className="gap-1"
              >
                <X className="h-3.5 w-3.5" />
                مسح
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {onExportCSV && (
              <Button variant="outline" size="sm" onClick={onExportCSV} className="gap-1">
                <Download className="h-3.5 w-3.5" />
                تصدير جدولي
              </Button>
            )}
            {toolbarEnd}
          </div>
        </div>
      )}

      {selectable && selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-status-info-surface bg-status-info-surface p-3 animate-in fade-in slide-in-from-top-1">
          <Badge className="bg-blue-600 text-white hover:bg-blue-600">
            {selectedIds.size}
          </Badge>
          <span className="text-sm font-medium text-status-info-foreground">
            سجل محدد
          </span>
          <div className="ms-auto flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={downloadSelectedCsv}
              className="gap-1"
            >
              <Download className="h-3.5 w-3.5" />
              تصدير المحدّد
            </Button>
            {bulkActions?.map((action, i) => (
              <Button
                key={i}
                size="sm"
                variant={action.variant ?? "outline"}
                onClick={() => action.onClick(Array.from(selectedIds))}
                disabled={action.disabled}
                className="gap-1"
              >
                {action.icon}
                {action.label}
              </Button>
            ))}
            <Button size="sm" variant="ghost" onClick={handleClearSelection}>
              إلغاء التحديد
            </Button>
          </div>
        </div>
      )}

      {caption && <div className="text-xs text-muted-foreground">{caption}</div>}

      <div className="rounded-lg border bg-card">
        {showMobileCards ? (
          <div className="divide-y" data-testid="data-table-mobile-cards">
            {(pagedData ?? []).map((row, rowIndex) => {
              const rowId = (row as any)?.id as number | undefined;
              const selected = rowId != null && selectedIds.has(rowId);
              const extras = renderRowExtras?.(row);
              const key = getRowKey(row, rowIndex);
              return (
                <div
                  key={key}
                  data-state={selected ? "selected" : undefined}
                  className={cn("p-3", rowClassName?.(row))}
                >
                  {/* Only the field rows are clickable — extras (expansion
                      panels, nested actions) sit OUTSIDE the row-click area
                      and stop propagation, matching the desktop table where
                      extras live in their own non-clickable row. */}
                  <div
                    className={cn("space-y-1.5", onRowClick && "cursor-pointer active:bg-surface-subtle")}
                    onClick={() => onRowClick?.(row)}
                  >
                    {selectable && (
                      <div className="pb-1" onClick={(e) => e.stopPropagation()}>
                        <BulkCheckbox checked={selected} onChange={() => rowId != null && handleToggleRow(rowId)} />
                      </div>
                    )}
                    {visibleColumns.map((col) => {
                      const content = col.render ? col.render(row, rowIndex) : ((row as any)[col.key] ?? "-");
                      return (
                        <div key={col.key} className="flex items-start justify-between gap-3 text-sm">
                          <span className="text-muted-foreground shrink-0">{col.header}</span>
                          <span className={cn("min-w-0 break-words text-end", col.className, col.cellClassName?.(row, rowIndex))} dir={col.ltr ? "ltr" : undefined}>
                            {content}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {extras && (
                    <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
                      {extras}
                    </div>
                  )}
                </div>
              );
            })}
            {/* Column footers (totals/balances) also belong on mobile — the
                desktop <tfoot> row has no place in a card list, so mirror it as
                a final bold card of header:total pairs for the footable columns. */}
            {hasFooter && sortedData && sortedData.length > 0 && (
              <div className="p-3 bg-muted font-bold" data-testid="data-table-mobile-footer">
                <div className="space-y-1.5">
                  {visibleColumns.filter((col) => col.footer).map((col) => (
                    <div key={col.key} className="flex items-start justify-between gap-3 text-sm">
                      <span className="text-muted-foreground shrink-0">{col.header}</span>
                      <span className={cn("min-w-0 break-words text-end", col.className)} dir={col.ltr ? "ltr" : undefined}>
                        {col.footer!(sortedData)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {selectable && (
                <TableHead className="w-[44px]">
                  <BulkCheckbox
                    checked={allPageSelected}
                    indeterminate={indeterminate}
                    onChange={handleToggleAll}
                  />
                </TableHead>
              )}
              {visibleColumns.map((col) =>
                isSortableColumn(col) ? (
                  <SortableTableHead
                    key={col.key}
                    column={col.sortKey ?? col.key}
                    label={col.header}
                    sortState={sortState}
                    onSort={handleSort}
                    className={cn(alignClass(col.align), col.className)}
                    style={col.width ? { width: col.width } : undefined}
                  />
                ) : (
                  <TableHead
                    key={col.key}
                    className={cn(alignClass(col.align), col.className)}
                    style={col.width ? { width: col.width } : undefined}
                  >
                    {col.header}
                  </TableHead>
                )
              )}
            </TableRow>
          </TableHeader>
          <DataTableWrapper
            isLoading={isLoading}
            isError={isError}
            error={error}
            onRetry={onRetry}
            data={groupBy ? sortedData : pagedData}
            colCount={colCount}
            emptyMessage={emptyMessage}
            emptyIcon={emptyIcon}
            emptyAction={emptyAction}
            // «الجداول طالعة نازلة» — يحجز التحميل ارتفاع صفحة بيانات كاملة
            // (حجم الصفحة الفعلي، بحدّ ٢٠) بدل ٥ صفوف ثابتة، فلا تقفز الصفحة
            // لأسفل عند وصول البيانات. صفحة بلا ترقيم (0) → ٨ كحدّ معقول.
            skeletonRows={pageSizeState > 0 ? Math.min(pageSizeState, 20) : 8}
          >
            {groupBy
              ? (() => {
                  // Build ordered groups preserving first-seen order.
                  const groupMap = new Map<string, T[]>();
                  for (const row of sortedData ?? []) {
                    const gv = String((row as any)[groupBy] ?? "");
                    if (!groupMap.has(gv)) groupMap.set(gv, []);
                    groupMap.get(gv)!.push(row);
                  }
                  const allGrouped = Array.from(groupMap.entries());
                  return (
                    <>
                      {allGrouped.map(([groupValue, groupRows]) => (
                        <Fragment key={`group-${groupValue}`}>
                          {renderGroupHeader && (
                            <TableRow className="bg-surface-subtle">
                              <TableCell colSpan={colCount} className="py-1.5 px-3 font-semibold text-sm">
                                {renderGroupHeader(groupValue, groupRows)}
                              </TableCell>
                            </TableRow>
                          )}
                          {groupRows.map((row, rowIndex) => {
                            const rowId = (row as any)?.id as number | undefined;
                            const selected = rowId != null && selectedIds.has(rowId);
                            const extraClass = rowClassName?.(row);
                            const extras = renderRowExtras?.(row);
                            const key = getRowKey(row, rowIndex);
                            return (
                              <Fragment key={key}>
                                <TableRow
                                  data-state={selected ? "selected" : undefined}
                                  className={cn(onRowClick && "cursor-pointer", extraClass)}
                                  onClick={() => onRowClick?.(row)}
                                >
                                  {selectable && (
                                    <TableCell className="w-[44px]" onClick={(e) => e.stopPropagation()}>
                                      <BulkCheckbox checked={selected} onChange={() => rowId != null && handleToggleRow(rowId)} />
                                    </TableCell>
                                  )}
                                  {visibleColumns.map((col) => {
                                    const content = col.render ? col.render(row, rowIndex) : ((row as any)[col.key] ?? "-");
                                    return (
                                      <TableCell key={col.key} className={cn(alignClass(col.align), col.className, col.cellClassName?.(row, rowIndex))} dir={col.ltr ? "ltr" : undefined}>
                                        {content}
                                      </TableCell>
                                    );
                                  })}
                                </TableRow>
                                {extras && (
                                  <TableRow>
                                    <TableCell colSpan={colCount} className="p-0">{extras}</TableCell>
                                  </TableRow>
                                )}
                              </Fragment>
                            );
                          })}
                          {renderGroupSubtotal && (
                            <TableRow className="border-t-2 bg-surface-subtle font-medium">
                              <TableCell colSpan={colCount} className="py-1.5 px-3">
                                {renderGroupSubtotal(groupValue, groupRows)}
                              </TableCell>
                            </TableRow>
                          )}
                          {visibleColumns.some((c) => c.groupFooter) && (
                            <TableRow className="border-t-2 bg-surface-subtle font-medium">
                              {selectable && <TableCell className="w-[44px]" />}
                              {visibleColumns.map((col) => (
                                <TableCell
                                  key={col.key}
                                  className={cn(alignClass(col.align), col.className)}
                                  dir={col.ltr ? "ltr" : undefined}
                                >
                                  {col.groupFooter ? col.groupFooter(groupRows, groupValue) : null}
                                </TableCell>
                              ))}
                            </TableRow>
                          )}
                        </Fragment>
                      ))}
                      {renderGrandTotal && sortedData && sortedData.length > 0 && (
                        <TableRow className="border-t-4 bg-muted font-bold">
                          <TableCell colSpan={colCount} className="py-2 px-3">
                            {renderGrandTotal(sortedData)}
                          </TableCell>
                        </TableRow>
                      )}
                      {footerRow}
                    </>
                  );
                })()
              : (pagedData ?? []).map((row, rowIndex) => {
                  const rowId = (row as any)?.id as number | undefined;
                  const selected = rowId != null && selectedIds.has(rowId);
                  const extraClass = rowClassName?.(row);
                  const extras = renderRowExtras?.(row);
                  const key = getRowKey(row, rowIndex);
                  return (
                    <Fragment key={key}>
                      <TableRow
                        data-state={selected ? "selected" : undefined}
                        className={cn(onRowClick && "cursor-pointer", extraClass)}
                        onClick={() => onRowClick?.(row)}
                      >
                        {selectable && (
                          <TableCell className="w-[44px]" onClick={(e) => e.stopPropagation()}>
                            <BulkCheckbox checked={selected} onChange={() => rowId != null && handleToggleRow(rowId)} />
                          </TableCell>
                        )}
                        {visibleColumns.map((col) => {
                          const content = col.render
                            ? col.render(row, rowIndex)
                            : ((row as any)[col.key] ?? "-");
                          return (
                            <TableCell key={col.key} className={cn(alignClass(col.align), col.className, col.cellClassName?.(row, rowIndex))} dir={col.ltr ? "ltr" : undefined}>
                              {content}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                      {extras && (
                        <TableRow>
                          <TableCell colSpan={colCount} className="p-0">{extras}</TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
                {!groupBy && renderGrandTotal && sortedData && sortedData.length > 0 && (
                  <TableRow className="border-t-4 bg-muted font-bold">
                    <TableCell colSpan={colCount} className="py-2 px-3">
                      {renderGrandTotal(sortedData)}
                    </TableCell>
                  </TableRow>
                )}
                {!groupBy && footerRow}
          </DataTableWrapper>
        </Table>
        )}
        {pageSizeState > 0 && (
          <PaginationBar
            page={currentPage}
            pageSize={pageSizeState}
            total={effectiveTotal}
            onPageChange={setCurrentPage}
            pageSizeOptions={isServerPaginated || groupBy ? undefined : PAGE_SIZE_OPTIONS}
            onPageSizeChange={isServerPaginated || groupBy ? undefined : handlePageSizeChange}
          />
        )}
      </div>
    </div>
  );
}
