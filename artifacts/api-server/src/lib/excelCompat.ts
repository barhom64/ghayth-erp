// excelCompat.ts
// ----------------------------------------------------------------------
// Thin wrapper around exceljs providing the small surface area we need
// for both write paths (excelExport.ts) and read paths
// (genericImportEngine.ts, umrahImportEngine.ts, print/). Replaces the
// former `xlsx@0.18.5` dependency which carried unfixed
// Prototype-Pollution + ReDoS advisories (Task #269).
//
// We deliberately keep this small (build + parse-AOA + cell normalize)
// instead of re-exporting the whole exceljs surface — every additional
// helper is one more thing the next migration has to re-implement.

import ExcelJS from "exceljs";

export interface ExcelSheet {
  name: string;
  headers: string[];
  rows: (string | number | Date | null)[][];
  colWidths?: number[];
}

/** Coerce an exceljs cell value into the plain JS shape that the old
 *  xlsx-based code relied on (string | number | Date | "" for empty).
 *  Handles the richText / hyperlink / formula-result wrappers. */
export function normalizeCellValue(v: unknown): unknown {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v;
  if (typeof v !== "object") return v;

  const o = v as Record<string, unknown>;
  if (Array.isArray((o as { richText?: unknown }).richText)) {
    const parts = (o as { richText: { text?: string }[] }).richText;
    return parts.map((p) => p.text ?? "").join("");
  }
  if ("text" in o) {
    const t = o.text as unknown;
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
    if (typeof r === "object") return normalizeCellValue(r);
    return r;
  }
  if ("error" in o) return "";
  return "";
}

/** Parse the first worksheet of an .xlsx buffer into an array-of-arrays
 *  (header row first, then data rows), mirroring the old
 *  `XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" })` output. */
export async function parseFirstSheetAOA(buffer: Buffer): Promise<unknown[][]> {
  const wb = new ExcelJS.Workbook();
  // exceljs accepts ArrayBuffer / Buffer / Uint8Array; cast keeps TS happy.
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];

  const aoa: unknown[][] = [];
  const colCount = Math.max(ws.columnCount, 1);
  ws.eachRow({ includeEmpty: false }, (row) => {
    const arr: unknown[] = new Array(colCount);
    for (let c = 1; c <= colCount; c++) {
      arr[c - 1] = normalizeCellValue(row.getCell(c).value);
    }
    aoa.push(arr);
  });
  return aoa;
}

/** Build an .xlsx Buffer from a list of sheets. Preserves the
 *  bold/centered header + light-grey fill + RTL view + per-column
 *  widths that the old buildWorkbook + workbookToBuffer pair produced. */
export async function buildXlsxBuffer(sheets: ExcelSheet[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31), {
      views: [{ rightToLeft: true }],
    });
    ws.addRow(s.headers);
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true };
    headerRow.alignment = { horizontal: "center" };
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE2E8F0" },
      };
    });

    for (const r of s.rows) ws.addRow(r);

    const widths = s.colWidths ?? s.headers.map((h) => Math.max(h.length + 4, 12));
    widths.forEach((w, i) => {
      ws.getColumn(i + 1).width = w;
    });
  }
  const ab = await wb.xlsx.writeBuffer();
  return Buffer.from(ab as ArrayBuffer);
}
