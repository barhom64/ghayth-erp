import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import ExcelJS from "exceljs";
import {
  parseFirstSheetAOA,
  lenientWorksheetAOA,
  lenientSharedStrings,
} from "../../src/lib/excelCompat.js";

// Server-side counterpart of the browser voucher-import fix. External (Nusk /
// .NET) exporters emit nonstandard OOXML — `x:`-prefixed tags, cells WITHOUT an
// `r="A1"` coordinate, a Default `.xml` content-type with no workbook Override —
// that exceljs throws on ("reading 'sheets'"). The lenient Node fallback must
// recover them for the `/import/preview` fileBase64 path; the standard exceljs
// fast path must keep working.

describe("lenientWorksheetAOA — nonstandard dialect (x: prefix, no r refs, t=str)", () => {
  it("reads positional cells into a rectangular AOA", () => {
    const xml =
      `<x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:sheetData>` +
      `<x:row><x:c t="str"><x:v>رقم الفاتورة</x:v></x:c><x:c t="str"><x:v>عدد المعتمرين</x:v></x:c></x:row>` +
      `<x:row><x:c t="str"><x:v>INV-1</x:v></x:c><x:c t="str"><x:v>12</x:v></x:c></x:row>` +
      `</x:sheetData></x:worksheet>`;
    const aoa = lenientWorksheetAOA(xml);
    expect(aoa[0]).toEqual(["رقم الفاتورة", "عدد المعتمرين"]);
    expect(aoa[1]).toEqual(["INV-1", "12"]); // t="str" stays a string
  });

  it("decodes XML entities and honours numeric / boolean / shared cells with coordinates", () => {
    const sst = lenientSharedStrings(
      `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>عمر &amp; سعد</t></si></sst>`,
    );
    expect(sst).toEqual(["عمر & سعد"]);
    const xml =
      `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>` +
      `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1"><v>30</v></c><c r="D1" t="b"><v>1</v></c></row>` +
      `</sheetData></worksheet>`;
    const aoa = lenientWorksheetAOA(xml, sst);
    // A=shared, B=gap→"", C=number, D=boolean
    expect(aoa[0]).toEqual(["عمر & سعد", "", 30, true]);
  });
});

function buildNonstandardXlsx(headers: string[], rows: string[][]): Promise<Buffer> {
  const cell = (v: string) => `<x:c t="str"><x:v>${v.replace(/&/g, "&amp;")}</x:v></x:c>`;
  const row = (vals: string[]) => `<x:row>${vals.map(cell).join("")}</x:row>`;
  const sheet =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:sheetData>` +
    row(headers) + rows.map(row).join("") + `</x:sheetData></x:worksheet>`;
  const zip = new JSZip();
  zip.file("[Content_Types].xml",
    `<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml" />` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml" /></Types>`);
  zip.file("_rels/.rels",
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="/xl/workbook.xml" Id="R1" /></Relationships>`);
  zip.file("xl/workbook.xml",
    `<x:workbook xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<x:sheets><x:sheet name="تقرير المجموعات" sheetId="1" r:id="R2" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" /></x:sheets></x:workbook>`);
  zip.file("xl/_rels/workbook.xml.rels",
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/sheet1.xml" Id="R2" /></Relationships>`);
  zip.file("xl/worksheets/sheet1.xml", sheet);
  return zip.generateAsync({ type: "nodebuffer" });
}

describe("parseFirstSheetAOA — nonstandard file recovery", () => {
  it("recovers rows exceljs cannot read", async () => {
    const buf = await buildNonstandardXlsx(
      ["رقم الفاتورة", "اسم الوكيل"],
      [["INV-1", "وكيل أ"], ["INV-2", "وكيل ب"]],
    );

    // Precondition: exceljs really throws on this container.
    let threw = false;
    try { await new ExcelJS.Workbook().xlsx.load(buf as unknown as ArrayBuffer); }
    catch { threw = true; }
    expect(threw, "exceljs should fail on the nonstandard file").toBe(true);

    const aoa = await parseFirstSheetAOA(buf);
    expect(aoa[0]).toEqual(["رقم الفاتورة", "اسم الوكيل"]);
    expect(aoa[1]).toEqual(["INV-1", "وكيل أ"]);
    expect(aoa[2]).toEqual(["INV-2", "وكيل ب"]);
  });
});

describe("parseFirstSheetAOA — standard file still uses the fast path", () => {
  it("parses a normal exceljs-written workbook", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Sheet1");
    ws.addRow(["الاسم", "الجنسية"]);
    ws.addRow(["سعد", "سعودي"]);
    const ab = await wb.xlsx.writeBuffer();
    const aoa = await parseFirstSheetAOA(Buffer.from(ab as ArrayBuffer));
    expect(aoa[0]).toEqual(["الاسم", "الجنسية"]);
    expect(aoa[1]).toEqual(["سعد", "سعودي"]);
  });
});
