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
  // Anchor on the POST /invoices create-handler INSERT, identified by its
  // VALUES signature that binds the discount columns as placeholders
  // ($20,$21). The finance service contract createServiceInvoiceWithLines
  // (#2837) shares the same column list but binds discounts as literals
  // (0,0) for the draft path, so a generic indexOf("INSERT INTO invoices ")
  // would match it first — anchor precisely to the handler instead.
  const VALUES_SIG = "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,'draft',$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)";
  const valuesIdx = INVOICES.indexOf(VALUES_SIG);
  // Column list sits in the ~300 chars preceding the VALUES clause.
  const section = INVOICES.slice(Math.max(0, valuesIdx - 400), valuesIdx + VALUES_SIG.length);
  it("the create-handler INSERT exists (anchored on its placeholder signature)", () => {
    expect(valuesIdx).toBeGreaterThan(-1);
  });
  it("column list includes discountAmount + discountPercent", () => {
    expect(section).toContain('"discountAmount"');
    expect(section).toContain('"discountPercent"');
  });
  it("VALUES array binds 21 placeholders (was 19 before)", () => {
    expect(section).toContain("$21");
    expect(section).not.toMatch(/VALUES\s*\([^)]*\$22/);
  });
});
