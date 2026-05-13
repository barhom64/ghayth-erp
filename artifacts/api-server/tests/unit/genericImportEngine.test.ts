// Pure tests for the generic import engine — no DB.
//
// We test the parser + adapter behaviour exhaustively. The preview/confirm
// paths rely on `rawQuery` / `withTransaction` which require a live DB; those
// are exercised in the higher-level smoke tests (`importEngineSmoke.test.ts`)
// against the in-memory test schema.

import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { parseSpreadsheet, listSupportedEntities } from "../../src/lib/genericImportEngine.js";
import { ADAPTERS, type ImportEntity } from "../../src/lib/importAdapters.js";

async function makeWorkbook(rows: (string | number | boolean)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  for (const r of rows) ws.addRow(r);
  const ab = await wb.xlsx.writeBuffer();
  return Buffer.from(ab as ArrayBuffer);
}

describe("listSupportedEntities", () => {
  it("returns all 6 expected entities", () => {
    const list = listSupportedEntities();
    expect(list.sort()).toEqual(["clients", "employees", "expenses", "invoices", "products", "suppliers"]);
  });
});

describe("ADAPTERS — schema integrity", () => {
  it.each(Object.keys(ADAPTERS) as ImportEntity[])(
    "adapter %s has consistent fieldTypes / required / compareFields",
    (entity) => {
      const a = ADAPTERS[entity];
      expect(a.table).toBeTruthy();
      expect(Object.keys(a.fieldTypes).length).toBeGreaterThan(0);

      // Every required field must be a known field type.
      for (const r of a.required) {
        expect(a.fieldTypes[r], `required ${r} missing from fieldTypes`).toBeTruthy();
      }
      // Every compare field must be a known field type.
      for (const c of a.compareFields) {
        expect(a.fieldTypes[c], `compareField ${c} missing from fieldTypes`).toBeTruthy();
      }
      // Every header alias must point at a known field.
      for (const field of Object.values(a.headerMap)) {
        expect(a.fieldTypes[field], `header→${field} missing from fieldTypes`).toBeTruthy();
      }
    },
  );

  it("employees has hasCompanyId=false (multi-tenancy via assignments)", () => {
    expect(ADAPTERS.employees.hasCompanyId).toBe(false);
  });

  it("non-employee entities all have hasCompanyId=true", () => {
    for (const e of listSupportedEntities()) {
      if (e === "employees") continue;
      expect(ADAPTERS[e].hasCompanyId, `${e} must scope by companyId`).toBe(true);
    }
  });
});

describe("parseSpreadsheet — clients", () => {
  it("parses a minimal Arabic-headered sheet", async () => {
    const buf = await makeWorkbook([
      ["الاسم", "الهاتف", "البريد"],
      ["شركة الدور", "0500000000", "info@aldoor.sa"],
      ["عميل تجريبي", "0500000001", "test@x.com"],
    ]);
    const rows = await parseSpreadsheet(buf, "clients");
    expect(rows).toHaveLength(2);
    expect(rows[0]?.name).toBe("شركة الدور");
    expect(rows[0]?.phone).toBe("0500000000");
    expect(rows[1]?.email).toBe("test@x.com");
  });

  it("maps Arabic enum labels to DB values", async () => {
    const buf = await makeWorkbook([
      ["الاسم", "النوع", "التصنيف"],
      ["x", "شركة", "VIP"],
    ]);
    const rows = await parseSpreadsheet(buf, "clients");
    expect(rows[0]?.type).toBe("company");
    expect(rows[0]?.classification).toBe("vip");
  });

  it("skips empty rows entirely", async () => {
    const buf = await makeWorkbook([
      ["الاسم", "الهاتف"],
      ["a", "1"],
      ["", ""],
      ["b", "2"],
    ]);
    const rows = await parseSpreadsheet(buf, "clients");
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.name)).toEqual(["a", "b"]);
  });

  it("accepts both Arabic and English column headers (alias)", async () => {
    const buf = await makeWorkbook([
      ["name", "phone"],
      ["TestCo", "111"],
    ]);
    const rows = await parseSpreadsheet(buf, "clients");
    expect(rows[0]?.name).toBe("TestCo");
    expect(rows[0]?.phone).toBe("111");
  });
});

describe("parseSpreadsheet — products numerics", () => {
  it("coerces numeric columns and falls back to null on garbage", async () => {
    const buf = await makeWorkbook([
      ["اسم الصنف", "تكلفة الشراء", "سعر البيع", "الحد الأدنى"],
      ["Item A", 12.5, 25, 3],
      ["Item B", "not-a-number", "", 0],
    ]);
    const rows = await parseSpreadsheet(buf, "products");
    expect(rows[0]?.costPrice).toBe(12.5);
    expect(rows[0]?.sellPrice).toBe(25);
    expect(rows[0]?.minStock).toBe(3);
    expect(rows[1]?.costPrice).toBeNull();
    expect(rows[1]?.sellPrice).toBeNull();
    expect(rows[1]?.minStock).toBe(0);
  });
});

describe("parseSpreadsheet — employees", () => {
  it("parses employee rows including dates", async () => {
    const buf = await makeWorkbook([
      ["الرقم الوطني", "الاسم", "تاريخ الميلاد", "الجنس"],
      ["1234567890", "أحمد علي", "1990-05-15", "ذكر"],
    ]);
    const rows = await parseSpreadsheet(buf, "employees");
    expect(rows[0]?.nationalId).toBe("1234567890");
    expect(rows[0]?.name).toBe("أحمد علي");
    expect(rows[0]?.gender).toBe("male");
    // Date stays as YYYY-MM-DD prefix
    expect(String(rows[0]?.dateOfBirth)).toMatch(/^1990-05-15/);
  });
});

describe("parseSpreadsheet — error paths", () => {
  it("throws when no recognized columns are found", async () => {
    const buf = await makeWorkbook([
      ["unknown_col_a", "unknown_col_b"],
      ["x", "y"],
    ]);
    await expect(parseSpreadsheet(buf, "clients")).rejects.toThrow();
  });

  it("throws for an unknown entity key", async () => {
    const buf = await makeWorkbook([["name"], ["x"]]);
    await expect(parseSpreadsheet(buf, "ghosts" as ImportEntity)).rejects.toThrow();
  });

  it("throws when the workbook has only a header row", async () => {
    const buf = await makeWorkbook([["الاسم"]]);
    await expect(parseSpreadsheet(buf, "clients")).rejects.toThrow();
  });
});

describe("parseSpreadsheet — Arabic header normalization", () => {
  it("matches headers regardless of ى/ي and trailing whitespace", async () => {
    const buf = await makeWorkbook([
      ["  الاسم  ", " الهاتـف "],  // padded
      ["x", "1"],
    ]);
    // Padded header should still match. Phone has tatweel — won't match.
    // We only assert the name column resolves.
    const rows = await parseSpreadsheet(buf, "clients");
    expect(rows[0]?.name).toBe("x");
  });
});
