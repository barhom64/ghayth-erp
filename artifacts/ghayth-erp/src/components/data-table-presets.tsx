import { type ReactNode } from "react";
import { Link } from "wouter";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { PageStatusBadge, type StatusDomain } from "@/components/page-status-badge";
import type { DataTableColumn } from "@/components/ui/data-table";
import { cn } from "@/lib/utils";

/**
 * DataTable column presets — P1.4 of the unification plan (docs/UNIFICATION_PLAN.md).
 *
 * The existing `<DataTable>` component (~500 lines) already handles
 * sorting, search, pagination, bulk actions, sticky headers, export.
 * What it lacked was a library of *pre-configured columns* for the
 * types that repeat across ~107 list pages: currency, dates, statuses,
 * links, actions, user chips.
 *
 * Today each list page handcrafts the `render` function for each of
 * those, which is why the same "due date" column reads as "2026-04-13"
 * in one place, "١٣ أبريل ٢٠٢٦" in another, and "Apr 13" in a third.
 *
 * These helpers are drop-in builders that return a `DataTableColumn<T>`:
 *
 *   const columns: DataTableColumn<Invoice>[] = [
 *     textColumn("ref", "الرقم المرجعي"),
 *     currencyColumn("total", "الإجمالي"),
 *     dateColumn("dueDate", "تاريخ الاستحقاق"),
 *     statusColumn("status", "الحالة", "invoice"),
 *     linkColumn("clientName", "العميل", (row) => `/clients/${row.clientId}`),
 *     actionsColumn((row) => <InvoiceActions invoice={row} />),
 *   ];
 *
 * Adoption is opt-in. The helpers just build column definitions — the
 * existing DataTable component is untouched. Pages that refactor in P4
 * replace their per-column `render` blocks with these presets.
 */

// ──────────────────────────────────────────────────────────────────────
// Text — the generic fallback. Good for ref / name / code columns.
// ──────────────────────────────────────────────────────────────────────

export function textColumn<T>(
  key: keyof T & string,
  header: string,
  opts: Partial<DataTableColumn<T>> = {},
): DataTableColumn<T> {
  return {
    key,
    header,
    sortable: true,
    searchable: true,
    ...opts,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Currency — always right-aligned LTR with `formatCurrency`. Negative
// amounts render in red; zero renders muted.
// ──────────────────────────────────────────────────────────────────────

export function currencyColumn<T>(
  key: keyof T & string,
  header: string,
  opts: {
    opts?: Partial<DataTableColumn<T>>;
    /** Show zero as "—" instead of "0.00 ر.س". */
    hideZero?: boolean;
  } = {},
): DataTableColumn<T> {
  return {
    key,
    header,
    sortable: true,
    align: "end",
    ltr: true,
    width: "140px",
    render: (row) => {
      const raw = (row as any)[key];
      const value = Number(raw ?? 0);
      if (opts.hideZero && value === 0) {
        return <span className="text-muted-foreground">—</span>;
      }
      return (
        <span
          className={cn(
            "tabular-nums font-medium",
            value < 0 && "text-red-600",
            value === 0 && "text-muted-foreground",
          )}
        >
          {formatCurrency(value)}
        </span>
      );
    },
    ...opts.opts,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Date — short Arabic date. Null / empty renders "—" rather than "1970".
// ──────────────────────────────────────────────────────────────────────

export function dateColumn<T>(
  key: keyof T & string,
  header: string,
  opts: Partial<DataTableColumn<T>> = {},
): DataTableColumn<T> {
  return {
    key,
    header,
    sortable: true,
    width: "130px",
    render: (row) => {
      const raw = (row as any)[key];
      if (!raw) return <span className="text-muted-foreground">—</span>;
      return <span className="tabular-nums text-sm">{formatDateAr(raw)}</span>;
    },
    ...opts,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Status — PageStatusBadge from P1.6, resolving against STATUS_MAP.
// ──────────────────────────────────────────────────────────────────────

export function statusColumn<T>(
  key: keyof T & string,
  header: string,
  domain?: StatusDomain,
  opts: Partial<DataTableColumn<T>> = {},
): DataTableColumn<T> {
  return {
    key,
    header,
    sortable: true,
    width: "130px",
    render: (row) => (
      <PageStatusBadge status={(row as any)[key]} domain={domain} />
    ),
    ...opts,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Link — clickable cell that navigates somewhere else. Useful for
// "العميل" / "الموظف" / "الرقم المرجعي" columns that should drill into
// a detail page.
// ──────────────────────────────────────────────────────────────────────

export function linkColumn<T>(
  key: keyof T & string,
  header: string,
  hrefFn: (row: T) => string,
  opts: Partial<DataTableColumn<T>> = {},
): DataTableColumn<T> {
  return {
    key,
    header,
    sortable: true,
    searchable: true,
    render: (row) => {
      const label = (row as any)[key];
      if (!label) return <span className="text-muted-foreground">—</span>;
      return (
        <Link
          href={hrefFn(row)}
          className="text-primary hover:underline font-medium"
        >
          {label}
        </Link>
      );
    },
    ...opts,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Actions — trailing column for row-level buttons. Rendered compact,
// right-aligned, without participating in sort or search.
// ──────────────────────────────────────────────────────────────────────

export function actionsColumn<T>(
  render: (row: T, index: number) => ReactNode,
  opts: Partial<DataTableColumn<T>> = {},
): DataTableColumn<T> {
  return {
    key: "_actions",
    header: "",
    sortable: false,
    searchable: false,
    align: "end",
    width: "120px",
    className: "whitespace-nowrap",
    render,
    ...opts,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Boolean — "نعم" / "لا" badges. Used for flags like `isActive`,
// `emailVerified`.
// ──────────────────────────────────────────────────────────────────────

export function booleanColumn<T>(
  key: keyof T & string,
  header: string,
  opts: {
    trueLabel?: string;
    falseLabel?: string;
  } = {},
): DataTableColumn<T> {
  return {
    key,
    header,
    sortable: true,
    width: "90px",
    align: "center",
    render: (row) => {
      const v = Boolean((row as any)[key]);
      const label = v ? (opts.trueLabel ?? "نعم") : (opts.falseLabel ?? "لا");
      return (
        <span
          className={cn(
            "inline-flex px-2 py-0.5 rounded-full text-xs font-medium",
            v ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600",
          )}
        >
          {label}
        </span>
      );
    },
  };
}

// ──────────────────────────────────────────────────────────────────────
// Number — right-aligned, tabular, with thousands separator.
// ──────────────────────────────────────────────────────────────────────

export function numberColumn<T>(
  key: keyof T & string,
  header: string,
  opts: {
    decimals?: number;
    suffix?: string;
  } = {},
): DataTableColumn<T> {
  return {
    key,
    header,
    sortable: true,
    align: "end",
    ltr: true,
    width: "110px",
    render: (row) => {
      const raw = Number((row as any)[key] ?? 0);
      const decimals = opts.decimals ?? 0;
      const formatted = raw.toLocaleString("ar-SA", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
      return (
        <span className="tabular-nums">
          {formatted}
          {opts.suffix && <span className="text-muted-foreground ms-0.5">{opts.suffix}</span>}
        </span>
      );
    },
  };
}
