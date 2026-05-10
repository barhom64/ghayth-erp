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
import { Fragment, ReactNode, useMemo, useState } from "react";
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
  /** Hide the column entirely — used for feature gating without re-declaring. */
  hidden?: boolean;
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
  /** Bulk action buttons shown when ≥1 row selected. */
  bulkActions?: BulkAction[];

  /** Global search input placeholder. Set to null to hide the search input. */
  searchPlaceholder?: string | null;
  /** Status filter options. Set to omit to hide the filter. */
  statusOptions?: StatusFilterOption[];
  /** Key on the row object used by the status filter. Default "status". */
  statusField?: string;
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

  className?: string;
}

function alignClass(align?: Align): string {
  if (align === "center") return "text-center";
  if (align === "end") return "text-end";
  return "text-start";
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
  bulkActions,
  searchPlaceholder = "بحث...",
  statusOptions,
  statusField = "status",
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
  className,
}: DataTableProps<T>) {
  const visibleColumns = useMemo(() => columns.filter((c) => !c.hidden), [columns]);

  // --- Search / status filter (internal when noToolbar is false) ---
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
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
    return out;
  }, [data, search, status, noToolbar, searchableKeys, statusOptions, statusField]);

  // --- Sort ---
  const { sortedData, sortState, handleSort } = useSortedData<T>(filteredData ?? []);

  // --- Pagination ---
  const isServerPaginated = typeof total === "number" && typeof pageProp === "number";
  const [localPage, setLocalPage] = useState(1);
  const currentPage = isServerPaginated ? pageProp! : localPage;
  const setCurrentPage = (p: number) => {
    if (isServerPaginated) onPageChangeProp?.(p);
    else setLocalPage(p);
  };

  const pagedData = useMemo(() => {
    if (isServerPaginated || !sortedData) return sortedData;
    if (!pageSize) return sortedData;
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize, isServerPaginated]);

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

  const colCount = visibleColumns.length + (selectable ? 1 : 0);

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
                    className="mt-1 text-[11px] text-amber-600"
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
            {(search || status) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setStatus("");
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
        <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 animate-in fade-in slide-in-from-top-1">
          <Badge className="bg-blue-600 text-white hover:bg-blue-600">
            {selectedIds.size}
          </Badge>
          <span className="text-sm font-medium text-blue-700">
            سجل محدد
          </span>
          <div className="ms-auto flex items-center gap-1.5">
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
                col.sortable ? (
                  <SortableTableHead
                    key={col.key}
                    column={col.sortKey ?? col.key}
                    label={col.header}
                    sortState={sortState}
                    onSort={handleSort}
                    className={cn(alignClass(col.align), col.className)}
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
            data={pagedData}
            colCount={colCount}
            emptyMessage={emptyMessage}
            emptyIcon={emptyIcon}
            emptyAction={emptyAction}
          >
            {(pagedData ?? []).map((row, rowIndex) => {
              const rowId = (row as any)?.id as number | undefined;
              const selected = rowId != null && selectedIds.has(rowId);
              const extraClass = rowClassName?.(row);
              const extras = renderRowExtras?.(row);
              const key = getRowKey(row, rowIndex);
              return (
                <Fragment key={key}>
                  <TableRow
                    data-state={selected ? "selected" : undefined}
                    className={cn(
                      onRowClick && "cursor-pointer",
                      extraClass
                    )}
                    onClick={() => onRowClick?.(row)}
                  >
                    {selectable && (
                      <TableCell
                        className="w-[44px]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <BulkCheckbox
                          checked={selected}
                          onChange={() => rowId != null && handleToggleRow(rowId)}
                        />
                      </TableCell>
                    )}
                    {visibleColumns.map((col) => {
                      const content = col.render
                        ? col.render(row, rowIndex)
                        : ((row as any)[col.key] ?? "-");
                      return (
                        <TableCell
                          key={col.key}
                          className={cn(alignClass(col.align), col.className)}
                          dir={col.ltr ? "ltr" : undefined}
                        >
                          {content}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                  {extras && (
                    <TableRow>
                      <TableCell colSpan={colCount} className="p-0">
                        {extras}
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </DataTableWrapper>
        </Table>
        {pageSize > 0 && (
          <PaginationBar
            page={currentPage}
            pageSize={pageSize}
            total={effectiveTotal}
            onPageChange={setCurrentPage}
          />
        )}
      </div>
    </div>
  );
}
