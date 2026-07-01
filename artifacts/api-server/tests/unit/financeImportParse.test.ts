import { describe, it, expect } from "vitest";
import {
  parseCsvTable,
  aoaToTable,
  mapTableToDocument,
  templateToCsv,
  findTemplate,
  detectMapping,
  sanitizeMapping,
  isFinanceImportField,
  FINANCE_IMPORT_TEMPLATES,
} from "../../src/lib/financeImportParse.js";

/**
 * م٢-أ — بوابة الاستيراد الحتمية. هذه الوحدة نقية بلا قاعدة بيانات: نثبت أن
 * تحويل CSV/Excel → بنود المستند حتمي وصحيح، وأن المخرج مطابق لشكل بنود
 * POST /finance/documents (لا اشتقاق قيد هنا — يبقى في المنفذ القائم).
 */

describe("parseCsvTable", () => {
  it("splits header + rows and trims", () => {
    const t = parseCsvTable("a,b,c\n1,2,3\n4,5,6\n");
    expect(t.headers).toEqual(["a", "b", "c"]);
    expect(t.rows).toEqual([
      ["1", "2", "3"],
      ["4", "5", "6"],
    ]);
  });

  it("honours quoted fields with embedded commas + escaped quotes", () => {
    const t = parseCsvTable('name,note\n"دفعة، نقدًا","قال ""تم"""\n');
    expect(t.headers).toEqual(["name", "note"]);
    expect(t.rows).toEqual([["دفعة، نقدًا", 'قال "تم"']]);
  });

  it("skips blank lines and # comments", () => {
    const t = parseCsvTable("# تعليق\na,b\n\n1,2\n");
    expect(t.headers).toEqual(["a", "b"]);
    expect(t.rows).toEqual([["1", "2"]]);
  });

  it("returns empty table for empty input", () => {
    expect(parseCsvTable("")).toEqual({ headers: [], rows: [] });
  });
});

describe("aoaToTable (Excel AOA)", () => {
  it("takes first row as header, stringifies cells, drops empty rows", () => {
    const aoa: unknown[][] = [
      ["الوصف", "المبلغ"],
      ["إيجار", 5000],
      ["", ""],
      ["وقود", 230.5],
    ];
    const t = aoaToTable(aoa);
    expect(t.headers).toEqual(["الوصف", "المبلغ"]);
    expect(t.rows).toEqual([
      ["إيجار", "5000"],
      ["وقود", "230.5"],
    ]);
  });
});

describe("mapTableToDocument", () => {
  const detailed = findTemplate("expense-detailed")!;
  const paySimple = findTemplate("payment-simple")!;

  it("maps detailed expense rows: qty × unitPrice + tax, preserves item/desc/unit", () => {
    const table = parseCsvTable(
      "الصنف/الخدمة,الوصف,الكمية,الوحدة,سعر الوحدة,نسبة الضريبة\nوقود,ديزل,200,لتر,2.3,15\n",
    );
    const res = mapTableToDocument(table, detailed);
    expect(res.direction).toBe("payment");
    expect(res.documentKind).toBe("expense");
    expect(res.lines).toHaveLength(1);
    expect(res.lines[0]).toMatchObject({
      lineNo: 1,
      itemName: "وقود",
      description: "ديزل",
      quantity: 200,
      unit: "لتر",
      unitPrice: 2.3,
      taxRatePercent: 15,
    });
  });

  it("simple template: single amount → quantity 1, unitPrice = amount", () => {
    const table = parseCsvTable("البيان,المبلغ,نسبة الضريبة\nإيجار مكتب,5000,0\n");
    const res = mapTableToDocument(table, paySimple);
    expect(res.lines).toHaveLength(1);
    expect(res.lines[0]).toMatchObject({ quantity: 1, unitPrice: 5000, description: "إيجار مكتب", taxRatePercent: 0 });
  });

  it("parses Arabic-Indic digits, thousands separators and % suffix in numbers", () => {
    const table = parseCsvTable("البيان,المبلغ,نسبة الضريبة\nخدمة,١٢٬٥٠٠,15%\n");
    const res = mapTableToDocument(table, paySimple);
    expect(res.lines[0]).toMatchObject({ unitPrice: 12500, taxRatePercent: 15 });
  });

  it("skips rows with no valid amount and records a skip warning", () => {
    const table = parseCsvTable("البيان,المبلغ\nصالح,100\nبلا مبلغ,\nصفر,0\n");
    const res = mapTableToDocument(table, paySimple);
    expect(res.lines).toHaveLength(1);
    expect(res.stats.skippedRows).toBe(2);
    expect(res.warnings.filter((w) => w.severity === "skip")).toHaveLength(2);
  });

  it("recognises column aliases case-insensitively (English headers)", () => {
    const table = parseCsvTable("description,amount,tax\nrent,5000,0\n");
    const res = mapTableToDocument(table, paySimple);
    expect(res.lines).toHaveLength(1);
    expect(res.stats.recognizedColumns).toEqual(["description", "amount", "tax"]);
    expect(res.stats.unrecognizedColumns).toEqual([]);
  });

  it("flags unrecognised columns as info, still maps the known ones", () => {
    const table = parseCsvTable("البيان,المبلغ,عمود غريب\nخدمة,300,xyz\n");
    const res = mapTableToDocument(table, paySimple);
    expect(res.lines).toHaveLength(1);
    expect(res.stats.unrecognizedColumns).toEqual(["عمود غريب"]);
    expect(res.warnings.some((w) => w.severity === "info")).toBe(true);
  });

  it("warns when no column is recognised at all", () => {
    const table = parseCsvTable("foo,bar\n1,2\n");
    const res = mapTableToDocument(table, paySimple);
    expect(res.stats.recognizedColumns).toEqual([]);
    expect(res.warnings.some((w) => w.severity === "warn")).toBe(true);
  });

  it("carries optional accountCode + costCenter through when present", () => {
    const table = parseCsvTable(
      "الصنف/الخدمة,الكمية,سعر الوحدة,الحساب,مركز التكلفة\nصيانة,1,800,5320,CC-1\n",
    );
    const res = mapTableToDocument(table, detailed);
    expect(res.lines[0]).toMatchObject({ counterAccountCode: "5320", costCenter: "CC-1" });
  });
});

describe("templateToCsv + templates registry", () => {
  it("round-trips: a template's own sample CSV maps back to one line", () => {
    for (const tpl of FINANCE_IMPORT_TEMPLATES) {
      const csv = templateToCsv(tpl);
      const table = parseCsvTable(csv);
      const res = mapTableToDocument(table, tpl);
      expect(res.lines.length).toBe(1);
      expect(res.lines[0].unitPrice).toBeGreaterThan(0);
      expect(res.stats.unrecognizedColumns).toEqual([]);
    }
  });

  it("every template has a unique key, direction, and headerMap", () => {
    const keys = FINANCE_IMPORT_TEMPLATES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const t of FINANCE_IMPORT_TEMPLATES) {
      expect(["receipt", "payment"]).toContain(t.direction);
      expect(Object.keys(t.headerMap).length).toBeGreaterThan(0);
      expect(t.sampleHeaders.length).toBe(t.sampleRow.length);
    }
  });
});

describe("م٢-ب: detectMapping + override mapping + sanitize", () => {
  const detailed = findTemplate("expense-detailed")!;
  const paySimple = findTemplate("payment-simple")!;

  it("detectMapping returns the auto-detected field per header ('' when unknown)", () => {
    const table = parseCsvTable("الوصف,قيمة غريبة,سعر الوحدة\nأ,ب,3\n");
    const det = detectMapping(table, detailed);
    expect(det["الوصف"]).toBe("description");
    expect(det["سعر الوحدة"]).toBe("unitPrice");
    expect(det["قيمة غريبة"]).toBe("");
  });

  it("override mapping rescues an unrecognised header → maps a custom partner column", () => {
    // ملف شريك: العمود اسمه «المبلغ الكلي» لا يطابق أي قالب.
    const table = parseCsvTable("البند,المبلغ الكلي\nاستشارة,900\n");
    const without = mapTableToDocument(table, paySimple);
    expect(without.lines).toHaveLength(0); // «المبلغ الكلي» غير معروف → لا مبلغ

    const res = mapTableToDocument(table, paySimple, { "المبلغ الكلي": "amount", "البند": "description" });
    expect(res.lines).toHaveLength(1);
    expect(res.lines[0]).toMatchObject({ description: "استشارة", quantity: 1, unitPrice: 900 });
  });

  it("override '' explicitly ignores an otherwise-recognised column", () => {
    const table = parseCsvTable("البيان,المبلغ\nأ,100\n");
    const res = mapTableToDocument(table, paySimple, { "المبلغ": "" });
    expect(res.lines).toHaveLength(0); // المبلغ مُتجاهَل صراحةً → لا قيمة
  });

  it("sanitizeMapping keeps known fields + '', drops unknown values", () => {
    const clean = sanitizeMapping({ a: "amount", b: "", c: "not_a_field", d: 42 });
    expect(clean).toEqual({ a: "amount", b: "" });
  });

  it("isFinanceImportField guards the field union", () => {
    expect(isFinanceImportField("unitPrice")).toBe(true);
    expect(isFinanceImportField("bogus")).toBe(false);
    expect(isFinanceImportField(undefined)).toBe(false);
  });
});
