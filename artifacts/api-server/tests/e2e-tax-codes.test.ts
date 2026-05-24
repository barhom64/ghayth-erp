// E2E verification — Daftra-style tax code flow against real Postgres.
// Run with: E2E=1 DATABASE_URL=... npx vitest run tests/e2e-tax-codes.test.ts
import { describe, it, expect } from "vitest";
import {
  getTaxCode, getDefaultTaxCode, computeTaxFromTaxCode, splitFromRate,
  getOutputVatAccountCode, clearTaxCodeCache,
} from "../src/lib/taxCodes.js";

const SKIP = !process.env.E2E;
const companyId = 1;

describe.skipIf(SKIP)("Tax Codes — Daftra-style flow", () => {
  it("seeded the 5 Saudi default codes", async () => {
    clearTaxCodeCache();
    const std  = await getTaxCode(companyId, "VAT15");
    const zero = await getTaxCode(companyId, "VAT0");
    const exempt = await getTaxCode(companyId, "EXEMPT");
    const oos = await getTaxCode(companyId, "OOS");
    const rcm = await getTaxCode(companyId, "RCM15");
    expect(std?.rate).toBe(15);
    expect(std?.taxType).toBe("standard");
    expect(std?.zatcaCategoryCode).toBe("S");
    expect(zero?.taxType).toBe("zero");
    expect(zero?.zatcaCategoryCode).toBe("Z");
    expect(exempt?.taxType).toBe("exempt");
    expect(exempt?.zatcaCategoryCode).toBe("E");
    expect(oos?.taxType).toBe("out_of_scope");
    expect(oos?.zatcaCategoryCode).toBe("O");
    expect(rcm?.taxType).toBe("reverse_charge");
    expect(rcm?.rate).toBe(15);
  });

  it("getDefaultTaxCode picks VAT15", async () => {
    const def = await getDefaultTaxCode(companyId);
    expect(def?.code).toBe("VAT15");
  });

  it("INCLUSIVE math: gross 115 with VAT15 → net 100, tax 15", async () => {
    const s = await computeTaxFromTaxCode({
      companyId, amount: 115, taxInclusive: true, taxCode: "VAT15",
    });
    expect(s.net).toBe(100);
    expect(s.tax).toBe(15);
    expect(s.gross).toBe(115);
    expect(s.taxCode).toBe("VAT15");
    expect(s.rate).toBe(15);
  });

  it("EXCLUSIVE math: net 100 with VAT15 → net 100, tax 15, gross 115", async () => {
    const s = await computeTaxFromTaxCode({
      companyId, amount: 100, taxInclusive: false, taxCode: "VAT15",
    });
    expect(s.net).toBe(100);
    expect(s.tax).toBe(15);
    expect(s.gross).toBe(115);
  });

  it("VAT0 (zero-rated): net=100, tax=0", async () => {
    const s = await computeTaxFromTaxCode({
      companyId, amount: 100, taxInclusive: false, taxCode: "VAT0",
    });
    expect(s.net).toBe(100);
    expect(s.tax).toBe(0);
    expect(s.gross).toBe(100);
  });

  it("EXEMPT: net=100, tax=0, gross=100", async () => {
    const s = await computeTaxFromTaxCode({
      companyId, amount: 100, taxInclusive: true, taxCode: "EXEMPT",
    });
    expect(s.tax).toBe(0);
    expect(s.gross).toBe(100);
  });

  it("getOutputVatAccountCode resolves to the chart_of_accounts code", async () => {
    const code = await getOutputVatAccountCode(companyId, "VAT15");
    expect(code).toBe("2300");
  });

  it("splitFromRate pure math — 333.33 inclusive @ 15%", () => {
    const s = splitFromRate(333.33, true, "VAT15", 15);
    // 333.33 / 1.15 = 289.85 net; tax = 43.48
    expect(s.net).toBe(289.85);
    expect(s.tax).toBe(43.48);
    expect(s.gross).toBe(333.33);
  });

  it("splitFromRate exclusive @ 15% on 333.33", () => {
    const s = splitFromRate(333.33, false, "VAT15", 15);
    // tax = 333.33 * 0.15 = 50.00 (49.9995 rounded to 50)
    expect(s.net).toBe(333.33);
    expect(s.tax).toBe(50);
    expect(s.gross).toBe(383.33);
  });

  it("rejects invalid tax code", async () => {
    await expect(
      computeTaxFromTaxCode({ companyId, amount: 100, taxInclusive: false, taxCode: "NOSUCH" })
    ).rejects.toThrow(/Tax code not found/);
  });
});
