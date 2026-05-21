import { describe, it, expect } from "vitest";
import {
  buildXlsxBuffer,
  parseFirstSheetAOA,
  normalizeCellValue,
} from "../../src/lib/excelCompat.js";

describe("excelCompat — exceljs build/parse round-trip", () => {
  it("buildXlsxBuffer produces a real .xlsx (zip) buffer", async () => {
    const buf = await buildXlsxBuffer([
      { name: "S", headers: ["a"], rows: [["x"]] },
    ]);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
    // .xlsx is a zip — magic bytes "PK".
    expect(buf.subarray(0, 2).toString("latin1")).toBe("PK");
  });

  it("round-trips Arabic strings and numbers without loss", async () => {
    const headers = ["الرمز", "اسم الحساب", "الرصيد"];
    const rows: (string | number | null)[][] = [
      ["1001", "النقدية في الصندوق", 15000.5],
      ["2001", "ذمم دائنة", -320],
    ];
    const buf = await buildXlsxBuffer([{ name: "ميزان", headers, rows }]);
    const aoa = await parseFirstSheetAOA(buf);

    expect(aoa[0]).toEqual(headers);
    expect(aoa[1]).toEqual(["1001", "النقدية في الصندوق", 15000.5]);
    expect(aoa[2]).toEqual(["2001", "ذمم دائنة", -320]);
  });

  it("keeps each sheet independent in a multi-sheet workbook", async () => {
    const buf = await buildXlsxBuffer([
      { name: "الإيرادات", headers: ["ر", "مبلغ"], rows: [["4001", 900]] },
      { name: "المصروفات", headers: ["ر", "مبلغ"], rows: [["5001", 400]] },
    ]);
    // parseFirstSheetAOA reads worksheet 0 — the revenue sheet.
    const aoa = await parseFirstSheetAOA(buf);
    expect(aoa[0]).toEqual(["ر", "مبلغ"]);
    expect(aoa[1]).toEqual(["4001", 900]);
  });

  it("normalizeCellValue unwraps richText / formula-result and maps empty to \"\"", () => {
    expect(normalizeCellValue(null)).toBe("");
    expect(normalizeCellValue(undefined)).toBe("");
    expect(normalizeCellValue("plain")).toBe("plain");
    expect(normalizeCellValue(42)).toBe(42);
    expect(
      normalizeCellValue({ richText: [{ text: "اسم " }, { text: "مركّب" }] }),
    ).toBe("اسم مركّب");
    expect(normalizeCellValue({ result: 7 })).toBe(7);
    expect(normalizeCellValue({ error: "#DIV/0!" })).toBe("");
  });
});
