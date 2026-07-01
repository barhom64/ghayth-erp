// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import ExcelJS from "exceljs";
import {
  parseXlsxToObjects,
  worksheetXmlToAoa,
  parseSharedStrings,
  columnRefToIndex,
  aoaToObjects,
} from "./excel-import";

// Regression coverage for the Umrah voucher import: external (Nusk / .NET)
// exporters emit nonstandard OOXML — `x:`-prefixed tags, cells WITHOUT an
// `r="A1"` coordinate, and a Default `.xml` content-type instead of a workbook
// Override. exceljs throws "Cannot read properties of undefined (reading
// 'sheets')" on these. The lenient fallback must recover them; the standard
// (exceljs) fast path must keep working.

describe("columnRefToIndex", () => {
  it("maps leading letters of a cell ref to a 0-based column", () => {
    expect(columnRefToIndex("A1")).toBe(0);
    expect(columnRefToIndex("B12")).toBe(1);
    expect(columnRefToIndex("Z9")).toBe(25);
    expect(columnRefToIndex("AA1")).toBe(26);
    expect(columnRefToIndex("")).toBe(-1);
    expect(columnRefToIndex("7")).toBe(-1);
  });
});

describe("worksheetXmlToAoa — nonstandard dialect (x: prefix, no r refs, t=str)", () => {
  const xml =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:sheetData>` +
    `<x:row><x:c t="str"><x:v>رقم الفاتورة</x:v></x:c><x:c t="str"><x:v>اسم الوكيل</x:v></x:c><x:c t="str"><x:v>عدد المعتمرين</x:v></x:c></x:row>` +
    `<x:row><x:c t="str"><x:v>INV-1</x:v></x:c><x:c t="str"><x:v>وكيل أ</x:v></x:c><x:c t="str"><x:v>12</x:v></x:c></x:row>` +
    `</x:sheetData></x:worksheet>`;

  it("reads positional cells (no coordinates) into a rectangular AOA", () => {
    const aoa = worksheetXmlToAoa(xml);
    expect(aoa[0]).toEqual(["رقم الفاتورة", "اسم الوكيل", "عدد المعتمرين"]);
    // t="str" cells stay strings (the exporter declared them so); the wizard
    // stringifies everything downstream regardless.
    expect(aoa[1]).toEqual(["INV-1", "وكيل أ", "12"]);
  });
});

describe("worksheetXmlToAoa — standard dialect (r refs + shared strings)", () => {
  it("resolves shared strings and honours cell coordinates, filling gaps", () => {
    const sst = parseSharedStrings(
      `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      `<si><t>الاسم</t></si><si><t>عمر</t></si></sst>`,
    );
    expect(sst).toEqual(["الاسم", "عمر"]);
    const xml =
      `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>` +
      `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>` +
      `<row r="2"><c r="A2" t="str"><v>سعد</v></c><c r="C2"><v>30</v></c></row>` +
      `</sheetData></worksheet>`;
    const aoa = worksheetXmlToAoa(xml, sst);
    // B column is a gap → "" ; C carries the value
    expect(aoa[0]).toEqual(["الاسم", "", "عمر"]);
    expect(aoa[1]).toEqual(["سعد", "", 30]);
  });
});

describe("aoaToObjects", () => {
  it("keys rows by the header row and drops fully-empty rows / blank headers", () => {
    const objs = aoaToObjects([
      ["أ", "", "ب"],
      ["1", "x", "2"],
      ["", "", ""],
    ]);
    expect(objs).toEqual([{ "أ": "1", "ب": "2" }]); // blank-header column dropped, empty row skipped
  });
});

// ── helpers to synthesise workbooks in each dialect ───────────────────

function buildNonstandardXlsx(headers: string[], rows: string[][]): Promise<Uint8Array> {
  const cell = (v: string) => `<x:c t="str"><x:v>${v}</x:v></x:c>`;
  const row = (vals: string[]) => `<x:row>${vals.map(cell).join("")}</x:row>`;
  const sheet =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:sheetData>` +
    row(headers) + rows.map(row).join("") +
    `</x:sheetData></x:worksheet>`;
  const zip = new JSZip();
  // Default xml = workbook content-type, NO Override for the workbook (the trait
  // that makes exceljs fail to locate the workbook).
  zip.file("[Content_Types].xml",
    `<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml" />` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml" /></Types>`);
  zip.file("_rels/.rels",
    `<?xml version="1.0" encoding="utf-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="/xl/workbook.xml" Id="R1" /></Relationships>`);
  zip.file("xl/workbook.xml",
    `<?xml version="1.0" encoding="utf-8"?><x:workbook xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<x:sheets><x:sheet name="تقرير المجموعات" sheetId="1" r:id="R2" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" /></x:sheets></x:workbook>`);
  zip.file("xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="utf-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/sheet1.xml" Id="R2" /></Relationships>`);
  zip.file("xl/worksheets/sheet1.xml", sheet);
  return zip.generateAsync({ type: "uint8array" });
}

describe("parseXlsxToObjects — nonstandard file (the failing Umrah voucher case)", () => {
  it("recovers rows that exceljs cannot read", async () => {
    const bytes = await buildNonstandardXlsx(
      ["رقم الفاتورة", "اسم الوكيل", "عدد المعتمرين"],
      [["INV-1", "وكيل أ", "12"], ["INV-2", "وكيل ب", "7"]],
    );

    // Precondition: exceljs really does throw on this container.
    let threw = false;
    try { await new ExcelJS.Workbook().xlsx.load(bytes.buffer as ArrayBuffer); }
    catch { threw = true; }
    expect(threw, "exceljs is expected to fail on the nonstandard file").toBe(true);

    // The public parser recovers it via the lenient fallback.
    const objs = await parseXlsxToObjects(bytes);
    expect(objs).toEqual([
      { "رقم الفاتورة": "INV-1", "اسم الوكيل": "وكيل أ", "عدد المعتمرين": "12" },
      { "رقم الفاتورة": "INV-2", "اسم الوكيل": "وكيل ب", "عدد المعتمرين": "7" },
    ]);
  });
});

describe("parseXlsxToObjects — standard file still uses the fast path", () => {
  it("parses a normal exceljs-written workbook", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Sheet1");
    ws.addRow(["الاسم", "الجنسية"]);
    ws.addRow(["سعد", "سعودي"]);
    const ab = await wb.xlsx.writeBuffer();
    const objs = await parseXlsxToObjects(new Uint8Array(ab as ArrayBuffer));
    expect(objs).toEqual([{ "الاسم": "سعد", "الجنسية": "سعودي" }]);
  });
});
