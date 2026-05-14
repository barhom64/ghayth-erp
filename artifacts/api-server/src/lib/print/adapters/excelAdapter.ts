/**
 * excelAdapter — emits a workbook (.xlsx) from the entity payload. Picks a
 * sensible default by flattening items/lines/movements into a single sheet
 * plus a metadata sheet built from the top-level entity fields.
 */

import * as XLSX from "xlsx";
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

export const excelAdapter: FormatAdapter = {
  format: "excel",
  async render(ctx) {
    const wb = XLSX.utils.book_new();
    const { rows, label } = pickRows(ctx.data);

    if (rows.length > 0) {
      const sheet = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, sheet, label);
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
    const metaSheet = XLSX.utils.json_to_sheet(metaRows);
    XLSX.utils.book_append_sheet(wb, metaSheet, "Info");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    return {
      bytes: buf,
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      filename: `${ctx.entityType}-${ctx.entityId}.xlsx`,
    };
  },
};
