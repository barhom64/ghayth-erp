/**
 * excelAdapter — emits a workbook (.xlsx) from the entity payload. Picks a
 * sensible default by flattening items/lines/movements into a single sheet
 * plus a metadata sheet built from the top-level entity fields.
 */

import { buildXlsxBuffer, type ExcelSheet } from "../../excelCompat.js";
import type { FormatAdapter, RenderContext } from "../types.js";

function pickRows(data: Record<string, unknown>): {
  rows: Record<string, unknown>[];
  label: string;
} {
  if (Array.isArray(data.items)) return { rows: data.items as Record<string, unknown>[], label: "Items" };
  if (Array.isArray(data.lines)) return { rows: data.lines as Record<string, unknown>[], label: "Lines" };
  if (Array.isArray(data.movements))
    return { rows: data.movements as Record<string, unknown>[], label: "Movements" };
  return { rows: [], label: "Items" };
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

/** Coerce an arbitrary payload value into a plain cell the compat layer
 *  accepts. Mirrors the old `xlsx.json_to_sheet` coercion: dates/numbers
 *  stay typed, booleans render as TRUE/FALSE, everything else stringifies. */
function toCell(v: unknown): string | number | Date | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  switch (typeof v) {
    case "number":
      return Number.isFinite(v) ? v : String(v);
    case "string":
      return v;
    case "boolean":
      return v ? "TRUE" : "FALSE";
    default:
      return String(v);
  }
}

/** Build a sheet from an array of objects, the way `xlsx.json_to_sheet`
 *  did: column set is the union of keys in first-seen order. */
function sheetFromObjects(name: string, objs: Record<string, unknown>[]): ExcelSheet {
  const headers: string[] = [];
  const seen = new Set<string>();
  for (const o of objs) {
    for (const k of Object.keys(o)) {
      if (!seen.has(k)) {
        seen.add(k);
        headers.push(k);
      }
    }
  }
  const rows = objs.map((o) => headers.map((h) => toCell(o[h])));
  return { name, headers, rows };
}

export const excelAdapter: FormatAdapter = {
  format: "excel",
  async render(ctx) {
    const sheets: ExcelSheet[] = [];
    const { rows, label } = pickRows(ctx.data);

    if (rows.length > 0) {
      sheets.push(sheetFromObjects(label, rows));
    }

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
    const metaRows = Object.entries(meta).map(([k, v]) => ({ field: k, value: v }));
    sheets.push(sheetFromObjects("Info", metaRows));

    const buf = await buildXlsxBuffer(sheets);
    return {
      bytes: buf,
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      filename: `${ctx.entityType}-${ctx.entityId}.xlsx`,
    };
  },
};
