/**
 * unified-export — wrapper around `downloadDocument` for the 47 list-style
 * client-side CSV exports flagged by GHAITH_SYSTEM_SWEEP item #7.
 *
 * Every page that currently builds CSV with
 *
 *     const blob = new Blob([...], { type: "text/csv" });
 *     const url = URL.createObjectURL(blob); …
 *
 * bypasses the print engine entirely — no print_jobs row, no
 * letterhead, no /reports/print-log visibility, no server-side
 * permission re-check. Migrating each site to the unified path keeps
 * the audit story consistent across the platform.
 *
 * Usage (drop-in replacement for the local exportCSV() helper):
 *
 *     import { exportRowsToCsv } from "@/lib/unified-export";
 *
 *     await exportRowsToCsv({
 *       entityType: "report_fixed_assets",
 *       title: "سجل الأصول",
 *       rows: filtered,                // any object[] from the page
 *       columns: [
 *         { key: "code",     label: "الرمز" },
 *         { key: "name",     label: "الاسم" },
 *         { key: "cost",     label: "التكلفة", format: (v) => Number(v).toFixed(2) },
 *       ],
 *     });
 *
 *   • columns is order-preserving and acts as both header and projection.
 *   • If `format` is omitted the cell is stringified as-is.
 *   • The function is async — await it so the busy state can clear.
 *
 * The actual CSV serialization happens on the server (csvAdapter), so
 * BOM / RFC 4180 quoting / Arabic boolean rendering all match the
 * shared adapter logic.
 */

import { downloadDocument } from "@/lib/print-client";

export interface ExportColumn<T> {
  /** Source field on each row. Dot notation NOT supported — flatten first. */
  key: keyof T & string;
  /** Header label shown to the user (and emitted as the CSV column). */
  label: string;
  /** Optional cell formatter. Receives the raw value, returns a string-ish. */
  format?: (v: unknown, row: T) => string | number | null | undefined;
}

export interface UnifiedCsvExportOptions<T> {
  /**
   * entityType used both for the print_jobs row and the optional
   * per-entity template. Conventionally `report_<thing>` for list
   * exports (e.g. report_audit_logs, report_fixed_assets,
   * report_trial_balance). The universal-fallback template handles
   * any entityType that doesn't have a custom preset.
   */
  entityType: string;
  /** Document title — propagates to the universal template's header. */
  title?: string;
  /** Rows to export, after page-level filters have been applied. */
  rows: T[];
  /** Order-preserving column projection. */
  columns: ExportColumn<T>[];
  /**
   * Stable entityId used for the print_jobs row. Defaults to "list" so
   * multiple exports of the same report show up grouped in the
   * /reports/print-log query for that entityType.
   */
  entityId?: string;
}

/**
 * Projects `rows` through `columns` into the `{ "label": value }` shape
 * the csvAdapter expects, then routes the request through
 * `/api/print/render` with `format: "csv"`.
 */
export async function exportRowsToCsv<T extends Record<string, unknown>>(
  opts: UnifiedCsvExportOptions<T>,
): Promise<void> {
  const { entityType, title, rows, columns, entityId = "list" } = opts;

  const items = rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const col of columns) {
      const raw = row[col.key];
      out[col.label] = col.format ? col.format(raw, row) : (raw ?? "");
    }
    return out;
  });

  await downloadDocument({
    entityType,
    entityId,
    format: "csv",
    payload: {
      entity: { id: entityId, title: title ?? entityType, ref: title ?? entityType },
      items,
    },
  });
}
