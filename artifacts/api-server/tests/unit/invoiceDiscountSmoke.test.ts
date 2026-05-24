import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const INVOICES = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/finance-invoices.ts"),
  "utf8"
);

// ─── Header-level discount (audit Gap #11) ──────────────────────────────────
// invoices.discountAmount / discountPercent existed in the schema for years
// but nobody read them. Now they're accepted by the create route, applied
// to subtotal BEFORE VAT (Saudi convention), and persisted on insert.

describe("createInvoiceSchema accepts discount fields", () => {
  it("declares discountAmount", () => {
    expect(INVOICES).toMatch(/discountAmount:\s*z\.coerce\.number\(\)\.min\(0\)\.optional\(\)/);
  });
  it("declares discountPercent bounded to 0..100", () => {
    expect(INVOICES).toMatch(/discountPercent:\s*z\.coerce\.number\(\)\.min\(0\)\.max\(100\)\.optional\(\)/);
  });
  it("destructures both from parsed", () => {
    expect(INVOICES).toContain("rawDiscountAmount");
    expect(INVOICES).toContain("rawDiscountPercent");
  });
});

describe("discount validation + math", () => {
  it("rejects both percent and amount together (mutually exclusive)", () => {
    expect(INVOICES).toContain("لا يمكن إدخال نسبة وقيمة خصم معاً");
  });

  it("computes amount from percent: discountAmount = baseAmount * percent/100", () => {
    expect(INVOICES).toMatch(/discountAmount = roundTo2\(baseAmount \* \(discountPercent \/ 100\)\)/);
  });

  it("computes percent from amount: discountPercent = (amount/base)*100", () => {
    expect(INVOICES).toMatch(/discountPercent = baseAmount > 0 \? roundTo2\(\(discountAmount \/ baseAmount\) \* 100\) : 0/);
  });

  it("rejects discount exceeding subtotal", () => {
    expect(INVOICES).toMatch(/discountAmount > baseAmount \+ 0\.005/);
    expect(INVOICES).toContain("قيمة الخصم");
    expect(INVOICES).toContain("تتجاوز");
  });
});

describe("discount applied BEFORE VAT (Saudi convention)", () => {
  it("discountedSubtotal = baseAmount - discountAmount", () => {
    expect(INVOICES).toContain("const discountedSubtotal = roundTo2(baseAmount - discountAmount)");
  });

  it("VAT recomputed on discountedSubtotal when no per-line breakdown", () => {
    expect(INVOICES).toMatch(/computeVat\(discountedSubtotal/);
  });

  it("per-line VAT scaled proportionally when lines exist", () => {
    expect(INVOICES).toMatch(/grossVat \* \(discountedSubtotal \/ baseAmount\)/);
  });

  it("total = discountedSubtotal + vatAmount", () => {
    expect(INVOICES).toContain("const total = roundTo2(discountedSubtotal + vatAmount)");
  });

  it("persisted invoice.subtotal is the DISCOUNTED net", () => {
    // baseAmount reassigned to discountedSubtotal before INSERT
    expect(INVOICES).toMatch(/baseAmount = discountedSubtotal;/);
  });
});

describe("INSERT INTO invoices persists discount columns", () => {
  it("column list includes discountAmount + discountPercent", () => {
    const idx = INVOICES.indexOf("INSERT INTO invoices ");
    const section = INVOICES.slice(idx, idx + 1500);
    expect(section).toContain('"discountAmount"');
    expect(section).toContain('"discountPercent"');
  });
  it("VALUES array binds 21 placeholders (was 19 before)", () => {
    const idx = INVOICES.indexOf("INSERT INTO invoices ");
    const section = INVOICES.slice(idx, idx + 1500);
    expect(section).toContain("$21");
    expect(section).not.toMatch(/VALUES\s*\([^)]*\$22/);
  });
});
