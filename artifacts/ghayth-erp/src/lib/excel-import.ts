// excel-import.ts
// ----------------------------------------------------------------------
// Browser-side .xlsx reader for the Umrah import wizards. Replaces the
// former `xlsx@0.18.5` dependency (unfixed Prototype-Pollution + ReDoS
// advisories) with exceljs, exposing only the slice the wizards relied
// on: `XLSX.read` + `sheet_to_json(sheet, { defval: "" })`.
//
// Pages reach this module via a dynamic `import()` so exceljs is
// code-split into its own lazy chunk and never weighs down the main
// bundle.

import ExcelJS from "exceljs";

export type CellValue = string | number | boolean | Date;

/** Unwrap an exceljs cell value into a plain JS value, mapping empty /
 *  formula-error cells to "" (matching the old `defval: ""` behaviour
 *  and the richText / formula-result wrappers exceljs hands back). */
function normalizeCell(v: unknown): CellValue {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v;
  if (typeof v !== "object") return v as CellValue;

  const o = v as Record<string, unknown>;
  if (Array.isArray((o as { richText?: unknown }).richText)) {
    const parts = (o as { richText: { text?: string }[] }).richText;
    return parts.map((p) => p.text ?? "").join("");
  }
  if ("text" in o) {
    const t = o.text;
    if (typeof t === "string") return t;
    if (t && typeof t === "object" && Array.isArray((t as { richText?: unknown }).richText)) {
      const parts = (t as { richText: { text?: string }[] }).richText;
      return parts.map((p) => p.text ?? "").join("");
    }
    return String(t ?? "");
  }
  if ("result" in o) {
    const r = o.result;
    if (r === null || r === undefined) return "";
    if (r instanceof Date) return r;
    if (typeof r === "object") return "";
    return r as CellValue;
  }
  return "";
}

/** Parse the first worksheet of an .xlsx file into row objects keyed by
 *  the header row — the shape the old `sheet_to_json(sheet, { defval: "" })`
 *  produced. Fully-empty rows are skipped; empty cells become "". */
export async function parseXlsxToObjects(
  bytes: Uint8Array,
): Promise<Record<string, CellValue>[]> {
  const wb = new ExcelJS.Workbook();
  // exceljs typings declare `load(buffer: Buffer)`; at runtime JSZip
  // accepts an ArrayBuffer just as well. Cast keeps TS happy.
  await wb.xlsx.load(bytes.buffer as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];

  const colCount = Math.max(ws.columnCount, 1);
  const headerRow = ws.getRow(1);
  const headers: string[] = [];
  for (let c = 1; c <= colCount; c++) {
    const h = normalizeCell(headerRow.getCell(c).value);
    headers[c - 1] = h === "" ? "" : String(h);
  }

  const out: Record<string, CellValue>[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj: Record<string, CellValue> = {};
    for (let c = 1; c <= colCount; c++) {
      const key = headers[c - 1];
      if (!key) continue;
      obj[key] = normalizeCell(row.getCell(c).value);
    }
    out.push(obj);
  });
  return out;
}
