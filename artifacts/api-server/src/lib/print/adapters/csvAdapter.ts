/**
 * csvAdapter — emits a single-table CSV from the entity payload.
 *
 * Built as the GAP_MATRIX item #8 fix so client-side CSV exports (47
 * finance pages doing `Blob → download` outside the print engine) can
 * migrate onto the unified renderPrint path: same audit row in
 * `print_jobs`, same letterhead-aware data loader, same per-feature
 * RBAC gate, same /reports/print-log visibility.
 *
 * Behavior mirrors excelAdapter but emits RFC 4180-style CSV bytes:
 *   • picks data.items / data.lines / data.movements as the primary
 *     table (first non-empty array wins).
 *   • flattens nested objects with dot notation, just like the Excel
 *     metadata sheet.
 *   • prepends BOM (﻿) so Excel / Numbers / LibreOffice open the
 *     file with Arabic correctly rendered (UTF-8 detection without BOM
 *     is unreliable in Excel for RTL text).
 *   • escapes per RFC 4180: any cell containing `,` / `"` / `\n` /
 *     `\r` is wrapped in double quotes and inner quotes are doubled.
 *
 * Returns a single sheet — no "meta" tab like Excel — because CSV is
 * single-table by definition. Metadata (company, branch, generation
 * timestamp) is emitted as a trailing comment block separated from the
 * data rows by an empty line, the same convention the universal export
 * convention uses elsewhere.
 */

import type { FormatAdapter, RenderContext } from "../types.js";

function pickRows(data: Record<string, unknown>): {
  rows: Record<string, unknown>[];
  label: string;
} {
  if (Array.isArray(data.items)) return { rows: data.items as Record<string, unknown>[], label: "البنود" };
  if (Array.isArray(data.lines)) return { rows: data.lines as Record<string, unknown>[], label: "السطور" };
  if (Array.isArray(data.movements)) return { rows: data.movements as Record<string, unknown>[], label: "الحركات" };
  return { rows: [], label: "البنود" };
}

function flatten(obj: Record<string, unknown>, prefix = ""): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) {
      Object.assign(out, flatten(v as Record<string, unknown>, key));
    } else if (Array.isArray(v)) {
      out[key] = `${v.length} items`;
    } else {
      out[key] = v as unknown;
    }
  }
  return out;
}

function toCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  switch (typeof v) {
    case "number":
      return Number.isFinite(v) ? String(v) : "";
    case "boolean":
      return v ? "نعم" : "لا";
    default:
      return String(v);
  }
}

function escapeCell(raw: string): string {
  if (raw === "") return "";
  // RFC 4180 — quote if cell contains delimiter / quote / newline.
  if (/[",\n\r]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

function buildCsv(rows: Record<string, unknown>[], headerOrder?: string[]): string {
  if (rows.length === 0) return "";
  const headers: string[] = headerOrder ?? [];
  if (!headerOrder) {
    const seen = new Set<string>();
    for (const r of rows) {
      for (const k of Object.keys(r)) {
        if (!seen.has(k)) {
          seen.add(k);
          headers.push(k);
        }
      }
    }
  }
  const lines: string[] = [];
  lines.push(headers.map((h) => escapeCell(h)).join(","));
  for (const r of rows) {
    lines.push(headers.map((h) => escapeCell(toCell(r[h]))).join(","));
  }
  return lines.join("\r\n");
}

export const csvAdapter: FormatAdapter = {
  format: "csv",
  async render(ctx) {
    const { rows } = pickRows(ctx.data);
    const dataCsv = buildCsv(rows);

    const entity = (ctx.data.entity as Record<string, unknown>) ?? {};
    const meta = flatten({
      ...entity,
      _branch: ctx.branch.branchName,
      _company: ctx.branch.companyName,
      _entityType: ctx.entityType,
      _entityId: ctx.entityId,
      _generatedAt: new Date().toISOString(),
      _copyNumber: ctx.copyNumber,
    });
    const metaRows = Object.entries(meta).map(([k, v]) => ({ "الحقل": k, "القيمة": v }));
    const metaCsv = buildCsv(metaRows);

    // Prepend BOM so Excel auto-detects UTF-8 for the Arabic columns.
    // The two sections are separated by an empty line so spreadsheet
    // tools that pull the first contiguous table still get just the
    // items; appended meta is for auditors who open in a text editor.
    const body = "﻿" + (dataCsv ? dataCsv + "\r\n\r\n" : "") + metaCsv + "\r\n";

    return {
      bytes: Buffer.from(body, "utf8"),
      mime: "text/csv; charset=utf-8",
      filename: `${ctx.entityType}-${ctx.entityId}.csv`,
    };
  },
};
