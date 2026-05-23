import { type ReactNode } from "react";
import { Plus } from "lucide-react";
import { type LucideIcon } from "lucide-react";

import { useApiQuery } from "@/lib/api";
import { PageShell, type Breadcrumb } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import {
  AdvancedFilters,
  useFilters,
  applyFilters,
  type FilterConfig,
} from "@/components/shared/advanced-filters";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/ui/data-table";

/**
 * ListPage — the composite list page primitive (UNIFICATION_PLAN §P7).
 *
 * Before this component, every list page in the system hand-assembled
 * the same 5 pieces — PageShell shell, optional stats grid, AdvancedFilters
 * bar, DataTable, and a primary "create" action — in 50-80 lines of
 * boilerplate. ~107 list pages duplicate that pattern.
 *
 * ListPage compresses the structural concerns into one declarative API:
 *
 *   <ListPage<Period>
 *     title="الفترات المالية"
 *     subtitle="إنشاء وإقفال..."
 *     queryKey={["fiscal-periods-v2"]}
 *     endpoint="/finance/fiscal-periods-v2"
 *     columns={[textColumn("name", "الفترة"), statusColumn(...)]}
 *     rowKey={(r) => String(r.id)}
 *     filters={{ searchPlaceholder: "بحث...", statuses: [...] }}
 *     primaryAction={{ label: "فترة جديدة", onClick: () => setOpen(true) }}
 *     stats={[
 *       { label: "إجمالي", value: rows.length, icon: <Calendar /> },
 *       { label: "مفتوحة", value: openCount, tone: "emerald" },
 *     ]}
 *     emptyMessage="لا توجد فترات"
 *   >
 *     {/* dialogs live as children so they share queryClient cache *\/}
 *     <CreateDialog ... />
 *   </ListPage>
 *
 * The component owns:
 *   - The React Query call (using `queryKey` + `endpoint`)
 *   - The filter state (search + status)
 *   - The PageShell layout (header + breadcrumbs + actions + loading bar)
 *   - The stats grid (when `stats` is provided)
 *   - The empty / error / loading states of the DataTable
 *
 * The consumer keeps full control over:
 *   - Column rendering (via `columns`)
 *   - Row actions (via `rowActions` callback)
 *   - Dialogs and side panels (via `children`)
 *   - Cache invalidation from mutations (just pass the same `queryKey`
 *     to `useApiMutation`'s `invalidateKeys`)
 *
 * Adoption is opt-in. A page that needs structure ListPage doesn't
 * support (e.g. a list with two parallel tables, or a chart-heavy
 * dashboard) keeps the longhand `PageShell + DataTable` form. New
 * list pages should reach for ListPage by default.
 */

export type StatTone = "info" | "emerald" | "slate" | "amber" | "rose";

export interface ListPageStat {
  /** Label rendered below the icon. */
  label: string;
  /** Number or short string. */
  value: number | string;
  /** Icon node (typically a lucide icon at h-5 w-5). */
  icon?: ReactNode;
  /** Tone — drives the icon/value colour. Default "info". */
  tone?: StatTone;
}

export interface ListPagePrimaryAction {
  label: string;
  /** Lucide icon component. Defaults to `Plus`. */
  icon?: LucideIcon;
  onClick: () => void;
  /**
   * Permission code (e.g. "finance:create"). When set, the button
   * renders through GuardedButton so users without the permission see
   * a disabled button.
   */
  permission?: string;
  /** data-testid forwarded onto the button. */
  testid?: string;
}

export interface ListPageProps<T> {
  // ─── Header ─────────────────────────────────────────────────────────
  title: string;
  subtitle?: string;
  breadcrumbs?: Breadcrumb[];

  // ─── Data ───────────────────────────────────────────────────────────
  /** React Query key. Pass the same array to any mutation's `invalidateKeys`. */
  queryKey: readonly string[];
  /**
   * API endpoint to GET. The response is expected to follow the
   * `{ data: T[] }` envelope; override with `selector` if it doesn't.
   */
  endpoint: string;
  /**
   * Extract the row array from the raw response. Default reads
   * `response.data` (the standard envelope). Use to adapt unusual
   * endpoints without rewriting them.
   */
  selector?: (response: unknown) => T[];

  // ─── Table ──────────────────────────────────────────────────────────
  columns: DataTableColumn<T>[];
  rowKey: (row: T) => string | number;
  /**
   * Trailing action column renderer. When set, an extra "إجراء" column
   * is appended that calls this function per row.
   */
  rowActions?: (row: T) => ReactNode;
  /** DataTable page size. Default 20. */
  pageSize?: number;
  /** Empty-state message. */
  emptyMessage?: string;
  /** Empty-state icon. */
  emptyIcon?: ReactNode;
  /** Optional row-level className (e.g. highlight active rows). */
  rowClassName?: (row: T) => string | undefined;

  // ─── Filters ────────────────────────────────────────────────────────
  /**
   * Filter bar config. When omitted, no filter bar is rendered.
   * The default applyFilters() runs against the row array — pass
   * `searchFields` and `statusField` to control which fields the filter
   * matches.
   *
   * Mutually exclusive with `customFilterBar` — set one or the other.
   */
  filters?: {
    config: FilterConfig;
    searchFields?: readonly (keyof T & string)[];
    statusField?: keyof T & string;
  };

  /**
   * Custom filter bar rendered in place of the default AdvancedFilters.
   * Use when the page needs server-side filtering, pill-style status
   * tabs, or any non-config filter UI. When this is set:
   *   - The default AdvancedFilters + useFilters wiring is skipped
   *   - `applyFilters` is NOT run; ListPage trusts the consumer's
   *     endpoint/queryKey to return the right rows
   *   - The consumer owns its own filter state and bakes the active
   *     values into `endpoint` + `queryKey` so React Query refetches
   *     when they change
   */
  customFilterBar?: ReactNode;

  // ─── Row click navigation ───────────────────────────────────────────
  /**
   * Optional row click handler — typically navigates to the detail page.
   * Forwarded to DataTable.onRowClick.
   */
  onRowClick?: (row: T) => void;

  // ─── Primary action (top-right) ────────────────────────────────────
  primaryAction?: ListPagePrimaryAction;

  // ─── Optional stats grid (above the filter bar) ────────────────────
  stats?: ListPageStat[];

  // ─── Children rendered after the table (dialogs, panels, ...) ─────
  children?: ReactNode;
}

const TONE_BG: Record<StatTone, string> = {
  info: "bg-status-info-surface",
  emerald: "bg-emerald-50",
  slate: "bg-slate-100",
  amber: "bg-amber-50",
  rose: "bg-rose-50",
};

const TONE_FG: Record<StatTone, string> = {
  info: "text-status-info-foreground",
  emerald: "text-emerald-600",
  slate: "text-slate-600",
  amber: "text-amber-600",
  rose: "text-rose-600",
};

export function ListPage<T>(props: ListPageProps<T>) {
  const {
    title,
    subtitle,
    breadcrumbs,
    queryKey,
    endpoint,
    selector,
    columns,
    rowKey,
    rowActions,
    pageSize = 20,
    emptyMessage,
    emptyIcon,
    rowClassName,
    filters,
    customFilterBar,
    onRowClick,
    primaryAction,
    stats,
    children,
  } = props;

  const { data, isLoading, isError, error, refetch } = useApiQuery<unknown>(
    [...queryKey],
    endpoint,
  );

  const rows: T[] = selector
    ? selector(data)
    : ((data as { data?: T[] })?.data ?? []);

  // useFilters() runs unconditionally because it's a React hook and the
  // Rules of Hooks forbid skipping it. The result is only consumed when
  // there's no `customFilterBar` — see the conditional render below. When
  // `customFilterBar` is set, the consumer owns filter state and bakes it
  // into endpoint/queryKey, so rows already come pre-filtered from the
  // server and applyFilters() is the only thing actually skipped here.
  const [filterValues, setFilterValues] = useFilters();
  const filtered: T[] = customFilterBar
    ? rows
    : filters
      ? (applyFilters(
          rows as unknown as Record<string, unknown>[],
          filterValues,
          {
            searchFields: filters.searchFields
              ? ([...filters.searchFields] as string[])
              : undefined,
            statusField: filters.statusField as string | undefined,
          },
        ) as unknown as T[])
      : rows;

  const tableColumns: DataTableColumn<T>[] = rowActions
    ? [
        ...columns,
        {
          key: "__actions__" as keyof T & string,
          header: "إجراء",
          width: "140px",
          align: "end",
          render: (row) => rowActions(row),
        },
      ]
    : columns;

  const actions = primaryAction ? <PrimaryActionButton {...primaryAction} /> : undefined;

  return (
    <PageShell
      title={title}
      subtitle={subtitle}
      breadcrumbs={breadcrumbs}
      actions={actions}
      loading={isLoading}
    >
      {stats && stats.length > 0 && (
        <div
          // Tailwind's JIT scanner only sees literal class strings, so the
          // grid template is picked from an explicit switch rather than
          // an interpolated `md:grid-cols-${N}` — otherwise the runtime
          // utilities (md:grid-cols-1..4) would be invisible to the build
          // and silently collapse to a 1-col layout.
          className={
            stats.length === 1
              ? "grid gap-3 grid-cols-1"
              : stats.length === 2
                ? "grid gap-3 grid-cols-2 md:grid-cols-2"
                : stats.length === 3
                  ? "grid gap-3 grid-cols-2 md:grid-cols-3"
                  : "grid gap-3 grid-cols-2 md:grid-cols-4"
          }
        >
          {stats.map((s, i) => (
            <StatTile key={`${s.label}-${i}`} {...s} />
          ))}
        </div>
      )}

      {customFilterBar
        ? customFilterBar
        : filters && (
            <AdvancedFilters
              config={filters.config}
              values={filterValues}
              onChange={setFilterValues}
              resultCount={filtered.length}
            />
          )}

      <DataTable
        columns={tableColumns}
        data={filtered}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={refetch}
        noToolbar
        rowKey={rowKey}
        rowClassName={rowClassName}
        onRowClick={onRowClick}
        emptyMessage={emptyMessage}
        emptyIcon={emptyIcon}
        pageSize={pageSize}
      />

      {children}
    </PageShell>
  );
}

// ─── Internal pieces ──────────────────────────────────────────────────

function PrimaryActionButton(action: ListPagePrimaryAction) {
  const Icon = action.icon ?? Plus;
  const content = (
    <>
      <Icon className="h-4 w-4 ml-1" />
      {action.label}
    </>
  );
  if (action.permission) {
    return (
      <GuardedButton
        perm={action.permission}
        onClick={action.onClick}
        data-testid={action.testid}
      >
        {content}
      </GuardedButton>
    );
  }
  return (
    <Button onClick={action.onClick} data-testid={action.testid}>
      {content}
    </Button>
  );
}

function StatTile(s: ListPageStat) {
  const tone = s.tone ?? "info";
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        {s.icon && (
          <div className={`p-2 ${TONE_BG[tone]} rounded-lg ${TONE_FG[tone]}`}>
            {s.icon}
          </div>
        )}
        <div>
          <p className="text-xs text-muted-foreground">{s.label}</p>
          <p className={`text-xl font-bold ${TONE_FG[tone]}`}>{s.value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
