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
//
// ── Lenient fallback ──────────────────────────────────────────────────
// Some external systems (Nusk / voucher exporters written on the .NET
// stack) emit *technically-nonstandard* OOXML that exceljs cannot read:
//   • every element carries an `x:` namespace prefix (`<x:worksheet>`…),
//   • cells omit the `r="A1"` coordinate attribute,
//   • `[Content_Types].xml` declares the workbook type as the default for
//     `.xml` with no `<Override>` for `/xl/workbook.xml`.
// exceljs throws "Cannot read properties of undefined (reading 'sheets')"
// (or "…'col'") on these. Excel/Sheets open them fine, and the Umrah
// import engine is *designed* to ingest exactly these voucher files, so we
// fall back to a small, tolerant reader (namespace-agnostic, coordinate
// optional) instead of rejecting a valid workbook.

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
 *  produced. Fully-empty rows are skipped; empty cells become "".
 *
 *  Tries exceljs first; on failure falls back to the tolerant reader for
 *  nonstandard OOXML (see file header). */
export async function parseXlsxToObjects(
  bytes: Uint8Array,
): Promise<Record<string, CellValue>[]> {
  try {
    return await parseWithExcelJs(bytes);
  } catch (err) {
    // Only reach for the fallback when exceljs actually chokes on the
    // container — if the lenient reader recovers nothing, surface the
    // original exceljs error so genuinely-broken files still report clearly.
    const recovered = await parseXlsxLenient(bytes).catch(() => [] as Record<string, CellValue>[]);
    if (recovered.length > 0) return recovered;
    throw err;
  }
}

async function parseWithExcelJs(
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

// ── Lenient reader ────────────────────────────────────────────────────

/** "A" → 0, "B" → 1, … "AA" → 26. Reads only the leading letters of a
 *  cell ref (`"C7"` → column C). Returns -1 when there are no letters. */
export function columnRefToIndex(ref: string): number {
  let n = 0;
  let seen = 0;
  for (const ch of ref) {
    const code = ch.charCodeAt(0);
    if (code >= 65 && code <= 90) { n = n * 26 + (code - 64); seen++; }        // A-Z
    else if (code >= 97 && code <= 122) { n = n * 26 + (code - 96); seen++; }  // a-z
    else break;
  }
  return seen === 0 ? -1 : n - 1;
}

function firstText(el: Element | null): string {
  return el ? (el.textContent ?? "") : "";
}

/** Parse `xl/sharedStrings.xml` into a plain string array. Namespace-agnostic
 *  (matches `<si>` / `<x:si>`), concatenating rich-text runs within each entry. */
export function parseSharedStrings(xml: string): string[] {
  if (!xml) return [];
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const sis = doc.getElementsByTagNameNS("*", "si");
  const out: string[] = [];
  for (let i = 0; i < sis.length; i++) {
    const ts = sis[i].getElementsByTagNameNS("*", "t");
    let s = "";
    for (let j = 0; j < ts.length; j++) s += ts[j].textContent ?? "";
    out.push(s);
  }
  return out;
}

/** Parse a worksheet XML into an array-of-arrays (header row first).
 *  Tolerant of: `x:`-prefixed tags, cells with OR without an `r` coordinate
 *  (falls back to positional order), shared / inline / typed-string / numeric
 *  cells. Empty cells become "". */
export function worksheetXmlToAoa(xml: string, sharedStrings: string[] = []): CellValue[][] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const rows = doc.getElementsByTagNameNS("*", "row");
  const aoa: CellValue[][] = [];

  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i].getElementsByTagNameNS("*", "c");
    const arr: CellValue[] = [];
    let cursor = 0; // next positional column when a cell has no `r`
    for (let j = 0; j < cells.length; j++) {
      const cell = cells[j];
      const ref = cell.getAttribute("r") ?? "";
      const idxFromRef = ref ? columnRefToIndex(ref) : -1;
      const col = idxFromRef >= 0 ? idxFromRef : cursor;
      cursor = col + 1;

      const t = cell.getAttribute("t") ?? "";
      let value: CellValue = "";
      if (t === "inlineStr") {
        const is = cell.getElementsByTagNameNS("*", "is")[0] ?? null;
        const ts = is ? is.getElementsByTagNameNS("*", "t") : null;
        let s = "";
        if (ts) for (let k = 0; k < ts.length; k++) s += ts[k].textContent ?? "";
        value = s;
      } else {
        const raw = firstText(cell.getElementsByTagNameNS("*", "v")[0] ?? null);
        if (t === "s") {
          const n = Number(raw);
          value = Number.isInteger(n) && n >= 0 && n < sharedStrings.length ? sharedStrings[n] : "";
        } else if (t === "str") {
          value = raw;
        } else if (t === "b") {
          value = raw === "1" || raw.toLowerCase() === "true";
        } else {
          // numeric (or untyped). Empty → ""; otherwise a finite number, else the raw text.
          if (raw === "") value = "";
          else { const n = Number(raw); value = Number.isFinite(n) ? n : raw; }
        }
      }
      arr[col] = value;
    }
    // Backfill positional gaps left by sparse `r` refs.
    for (let c = 0; c < arr.length; c++) if (arr[c] === undefined) arr[c] = "";
    aoa.push(arr);
  }
  return aoa;
}

/** Turn a header-first array-of-arrays into row objects keyed by the header
 *  row — mirrors the exceljs path (skip fully-empty rows, blank header cells
 *  dropped, empty cells → ""). */
export function aoaToObjects(aoa: CellValue[][]): Record<string, CellValue>[] {
  if (aoa.length === 0) return [];
  const headers = (aoa[0] ?? []).map((h) => (h === "" || h === undefined ? "" : String(h)));
  const width = headers.length;
  const out: Record<string, CellValue>[] = [];
  for (let r = 1; r < aoa.length; r++) {
    const row = aoa[r] ?? [];
    const nonEmpty = row.some((v) => v !== "" && v !== undefined && v !== null);
    if (!nonEmpty) continue;
    const obj: Record<string, CellValue> = {};
    for (let c = 0; c < width; c++) {
      const key = headers[c];
      if (!key) continue;
      const v = row[c];
      obj[key] = v === undefined || v === null ? "" : v;
    }
    out.push(obj);
  }
  return out;
}

async function parseXlsxLenient(
  bytes: Uint8Array,
): Promise<Record<string, CellValue>[]> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(bytes);

  // First worksheet, by sorted part name (sheet1 before sheet2…).
  const sheetFiles = zip
    .file(/^xl\/worksheets\/sheet[^/]*\.xml$/i)
    .sort((a, b) => a.name.localeCompare(b.name, "en"));
  if (sheetFiles.length === 0) return [];

  const sstFile = zip.file("xl/sharedStrings.xml");
  const sharedStrings = sstFile ? parseSharedStrings(await sstFile.async("string")) : [];

  const sheetXml = await sheetFiles[0].async("string");
  return aoaToObjects(worksheetXmlToAoa(sheetXml, sharedStrings));
}
