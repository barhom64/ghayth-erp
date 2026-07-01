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
 *  `XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" })` output.
 *
 *  Tries exceljs first; on failure falls back to the tolerant reader for
 *  nonstandard OOXML (see `parseFirstSheetAOALenient`) so the server-side
 *  import path (`/import/preview` with `fileBase64`, umrah + generic engines)
 *  accepts the same voucher exports the browser wizard now does. */
export async function parseFirstSheetAOA(buffer: Buffer): Promise<unknown[][]> {
  try {
    return await parseFirstSheetAOAExcelJs(buffer);
  } catch (err) {
    const recovered = await parseFirstSheetAOALenient(buffer).catch(() => [] as unknown[][]);
    if (recovered.length > 0) return recovered;
    throw err;
  }
}

async function parseFirstSheetAOAExcelJs(buffer: Buffer): Promise<unknown[][]> {
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

// ── Lenient reader (Node) ─────────────────────────────────────────────
// Some external systems (Nusk / voucher exporters on the .NET stack) emit
// technically-nonstandard OOXML that exceljs cannot read: `x:`-prefixed tags,
// cells WITHOUT an `r="A1"` coordinate, and a Default `.xml` content-type with
// no workbook `<Override>`. Excel/Sheets open them and the import engines are
// designed to ingest exactly these files, so we recover them with a small
// string-based reader (no DOM — this runs in Node). Mirrors the browser-side
// fallback in ghayth-erp `src/lib/excel-import.ts`.

const PFX = "(?:[A-Za-z_][\\w.-]*:)?"; // optional namespace prefix, e.g. `x:`

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, "&"); // decode &amp; LAST so it can't re-trigger the others
}

/** "A" → 0, "AA" → 26. Reads only the leading letters of a cell ref; -1 if none. */
function columnRefToIndex(ref: string): number {
  let n = 0;
  let seen = 0;
  for (const ch of ref) {
    const code = ch.charCodeAt(0);
    if (code >= 65 && code <= 90) { n = n * 26 + (code - 64); seen++; }
    else if (code >= 97 && code <= 122) { n = n * 26 + (code - 96); seen++; }
    else break;
  }
  return seen === 0 ? -1 : n - 1;
}

/** Parse `xl/sharedStrings.xml` into a plain string array (namespace-agnostic,
 *  concatenating rich-text runs per entry). */
export function lenientSharedStrings(xml: string): string[] {
  if (!xml) return [];
  const out: string[] = [];
  const siRe = new RegExp(`<${PFX}si\\b[^>]*>([\\s\\S]*?)</${PFX}si>`, "g");
  const tRe = new RegExp(`<${PFX}t\\b[^>]*>([\\s\\S]*?)</${PFX}t>`, "g");
  let m: RegExpExecArray | null;
  while ((m = siRe.exec(xml))) {
    let s = "";
    let tm: RegExpExecArray | null;
    tRe.lastIndex = 0;
    while ((tm = tRe.exec(m[1]))) s += decodeXmlEntities(tm[1]);
    out.push(s);
  }
  return out;
}

/** Parse a worksheet XML into an array-of-arrays. Tolerant of `x:` prefixes,
 *  cells with OR without an `r` coordinate (positional fallback), and
 *  shared / inline / typed-string / numeric cells. Empty cells → "". */
export function lenientWorksheetAOA(xml: string, sharedStrings: string[] = []): unknown[][] {
  const rowRe = new RegExp(`<${PFX}row\\b[^>]*>([\\s\\S]*?)</${PFX}row>`, "g");
  const cellRe = new RegExp(`<${PFX}c\\b([^>]*?)(?:/>|>([\\s\\S]*?)</${PFX}c>)`, "g");
  const vRe = new RegExp(`<${PFX}v\\b[^>]*>([\\s\\S]*?)</${PFX}v>`);
  const tRe = new RegExp(`<${PFX}t\\b[^>]*>([\\s\\S]*?)</${PFX}t>`, "g");

  const aoa: unknown[][] = [];
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(xml))) {
    const rowXml = rm[1];
    const arr: unknown[] = [];
    let cursor = 0;
    let cm: RegExpExecArray | null;
    cellRe.lastIndex = 0;
    while ((cm = cellRe.exec(rowXml))) {
      const attrs = cm[1] || "";
      const inner = cm[2] || "";
      const tAttr = /(?:^|\s)t="([^"]*)"/.exec(attrs)?.[1] ?? "";
      const rAttr = /(?:^|\s)r="([^"]*)"/.exec(attrs)?.[1] ?? "";
      const idxFromRef = rAttr ? columnRefToIndex(rAttr) : -1;
      const col = idxFromRef >= 0 ? idxFromRef : cursor;
      cursor = col + 1;

      let value: unknown = "";
      if (tAttr === "inlineStr") {
        let s = "";
        let tm: RegExpExecArray | null;
        tRe.lastIndex = 0;
        while ((tm = tRe.exec(inner))) s += decodeXmlEntities(tm[1]);
        value = s;
      } else {
        const vm = vRe.exec(inner);
        const raw = vm ? decodeXmlEntities(vm[1]) : "";
        if (tAttr === "s") {
          const n = Number(raw);
          value = Number.isInteger(n) && n >= 0 && n < sharedStrings.length ? sharedStrings[n] : "";
        } else if (tAttr === "str") {
          value = raw;
        } else if (tAttr === "b") {
          value = raw === "1" || raw.toLowerCase() === "true";
        } else if (raw === "") {
          value = "";
        } else {
          const n = Number(raw);
          value = Number.isFinite(n) ? n : raw;
        }
      }
      arr[col] = value;
    }
    for (let c = 0; c < arr.length; c++) if (arr[c] === undefined) arr[c] = "";
    aoa.push(arr);
  }
  return aoa;
}

async function parseFirstSheetAOALenient(buffer: Buffer): Promise<unknown[][]> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buffer);
  const sheetFiles = zip
    .file(/^xl\/worksheets\/sheet[^/]*\.xml$/i)
    .sort((a, b) => a.name.localeCompare(b.name, "en"));
  if (sheetFiles.length === 0) return [];

  const sstFile = zip.file("xl/sharedStrings.xml");
  const sharedStrings = sstFile ? lenientSharedStrings(await sstFile.async("string")) : [];

  const sheetXml = await sheetFiles[0].async("string");
  return lenientWorksheetAOA(sheetXml, sharedStrings);
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
