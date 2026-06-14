import { describe, it, expect } from "vitest";
import {
  expectedDimensionForAccount,
  DIMENSION_COLUMN,
  type ExpectedDimension,
} from "../../src/lib/gl/ledgerTruth.js";

/**
 * FIN-INTEGRITY-CONTRACT (#2246) — heuristic classifier unit test.
 *
 * Pins the provisional account→required-dimension mapping used ONLY by the
 * read-only ledger-truth measurement report. No posting/enforcement here.
 */
describe("#2246 expectedDimensionForAccount — provisional measurement heuristic", () => {
  it("classifies vehicle expense + vehicle depreciation accounts as 'vehicle'", () => {
    expect(expectedDimensionForAccount("5510")).toBe("vehicle"); // وقود
    expect(expectedDimensionForAccount("5520")).toBe("vehicle"); // صيانة
    expect(expectedDimensionForAccount("5560")).toBe("vehicle"); // مخالفات
    expect(expectedDimensionForAccount("5710")).toBe("vehicle"); // إهلاك مركبة
  });

  it("classifies property expense accounts (56xx) as 'property'", () => {
    expect(expectedDimensionForAccount("5610")).toBe("property");
    expect(expectedDimensionForAccount("5640")).toBe("property");
  });

  it("classifies project cost/revenue as 'project'", () => {
    expect(expectedDimensionForAccount("5130")).toBe("project");
    expect(expectedDimensionForAccount("4140")).toBe("project");
  });

  it("classifies AP supplier accounts (2111–2113) as 'vendor'", () => {
    expect(expectedDimensionForAccount("2111")).toBe("vendor"); // موردون محليون
    expect(expectedDimensionForAccount("2112")).toBe("vendor"); // مقاولون
    expect(expectedDimensionForAccount("2113")).toBe("vendor"); // شيكات صادرة
  });

  it("classifies AR customer accounts (1131–1133) as 'client'", () => {
    expect(expectedDimensionForAccount("1131")).toBe("client"); // عملاء
    expect(expectedDimensionForAccount("1132")).toBe("client"); // مستأجرون
    expect(expectedDimensionForAccount("1133")).toBe("client"); // عملاء مشاريع
  });

  it("returns null for non-dimensioned accounts (cash/bank/VAT/equity/AP-parent)", () => {
    expect(expectedDimensionForAccount("1111")).toBeNull(); // الصندوق
    expect(expectedDimensionForAccount("1124")).toBeNull(); // بنك
    expect(expectedDimensionForAccount("2131")).toBeNull(); // ضريبة مخرجات
    expect(expectedDimensionForAccount("2110")).toBeNull(); // أصل الذمم (غير قابل للترحيل)
    expect(expectedDimensionForAccount("3100")).toBeNull(); // حقوق ملكية
    expect(expectedDimensionForAccount("2160")).toBeNull(); // إيراد مؤجل
  });

  it("is null-safe on empty/garbage codes", () => {
    expect(expectedDimensionForAccount("")).toBeNull();
    expect(expectedDimensionForAccount(null)).toBeNull();
    expect(expectedDimensionForAccount(undefined)).toBeNull();
    expect(expectedDimensionForAccount("  ")).toBeNull();
  });

  it("every ExpectedDimension has a journal_lines column mapping", () => {
    const dims: ExpectedDimension[] = ["vehicle", "property", "project", "vendor", "client"];
    for (const d of dims) {
      expect(DIMENSION_COLUMN[d]).toMatch(/^[a-zA-Z]+Id$/);
    }
  });
});
