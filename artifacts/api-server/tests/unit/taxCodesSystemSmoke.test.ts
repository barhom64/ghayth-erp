import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const MIGRATION = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/migrations/205_tax_codes_system.sql"),
  "utf8"
);
const HELPER = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/taxCodes.ts"),
  "utf8"
);
const INVOICES_ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/finance-invoices.ts"),
  "utf8"
);
const ACCOUNTS_ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/finance-accounts.ts"),
  "utf8"
);
const SCHEMA_PRE = readFileSync(join(REPO_ROOT, "db/schema_pre.sql"), "utf8");

// ─── Tax Codes System (migration 205) ───────────────────────────────────────
// Daftra-style flow: pick a tax code (rate + GL account + ZATCA category)
// + declare gross/net, helper computes net+tax+gross. Replaces scattered
// `roundTo2(x * 0.15)` literals.

describe("migration 205 — tax_codes table", () => {
  it("creates the tax_codes table", () => {
    expect(MIGRATION).toContain("CREATE TABLE IF NOT EXISTS public.tax_codes");
  });
  for (const col of [
    "companyId", "taxType",
    "accountId", "inputAccountId", "isInclusiveDefault",
    "zatcaCategoryCode", "zatcaExemptionReason", "isActive",
  ]) {
    it(`tax_codes declares quoted ${col}`, () => {
      expect(MIGRATION).toContain(`"${col}"`);
    });
  }
  // code / name / rate are unquoted (lowercase, no need to quote in pg).
  for (const col of ["code", "name", "rate"]) {
    it(`tax_codes declares ${col}`, () => {
      expect(MIGRATION).toMatch(new RegExp(`^\\s+${col}\\s`, "m"));
    });
  }
  it("CHECK constraint covers all 5 tax types", () => {
    expect(MIGRATION).toContain("tax_codes_type_check");
    for (const t of ["standard", "zero", "exempt", "out_of_scope", "reverse_charge"]) {
      expect(MIGRATION).toContain(`'${t}'`);
    }
  });
  it("CHECK constraint bounds rate 0..100", () => {
    expect(MIGRATION).toContain("tax_codes_rate_check");
    expect(MIGRATION).toContain("rate >= 0 AND rate <= 100");
  });
  it("unique (companyId, code)", () => {
    expect(MIGRATION).toContain("tax_codes_company_code_uniq");
  });
});

describe("migration 205 — seeds 5 default Saudi codes per company", () => {
  for (const seed of ["VAT15", "VAT0", "EXEMPT", "OOS", "RCM15"]) {
    it(`seeds ${seed}`, () => {
      expect(MIGRATION).toContain(`'${seed}'`);
    });
  }
  it("seeds ZATCA category codes S/Z/E/O", () => {
    expect(MIGRATION).toMatch(/'S'/);
    expect(MIGRATION).toMatch(/'Z'/);
    expect(MIGRATION).toMatch(/'E'/);
    expect(MIGRATION).toMatch(/'O'/);
  });
});

describe("migration 205 — line tables get taxInclusive flag", () => {
  for (const tbl of ["invoice_lines", "purchase_order_items", "purchase_request_items", "goods_receipt_items"]) {
    it(`adds taxInclusive to ${tbl}`, () => {
      expect(MIGRATION).toMatch(new RegExp(`ALTER TABLE public\\.${tbl}[\\s\\S]{0,300}"taxInclusive" boolean`));
    });
  }
  it("adds taxCode + taxInclusive to credit_memos + debit_memos", () => {
    expect(MIGRATION).toMatch(/ALTER TABLE public\.credit_memos[\s\S]{0,400}"taxCode"[\s\S]{0,300}"taxInclusive"/);
    expect(MIGRATION).toMatch(/ALTER TABLE public\.debit_memos[\s\S]{0,400}"taxCode"[\s\S]{0,300}"taxInclusive"/);
  });
  it("adds taxCode + taxInclusive header on invoices", () => {
    expect(MIGRATION).toMatch(/ALTER TABLE public\.invoices[\s\S]{0,300}"taxCode"[\s\S]{0,300}"taxInclusive"/);
  });
});

describe("schema_pre.sql declares tax_codes + new columns", () => {
  it("declares tax_codes table", () => {
    expect(SCHEMA_PRE).toContain("CREATE TABLE public.tax_codes");
  });
  it("invoices has taxCode + taxInclusive", () => {
    const idx = SCHEMA_PRE.indexOf("CREATE TABLE public.invoices ");
    const section = SCHEMA_PRE.slice(idx, idx + 3000);
    expect(section).toContain('"taxCode"');
    expect(section).toContain('"taxInclusive"');
  });
  it("invoice_lines has taxInclusive", () => {
    const idx = SCHEMA_PRE.indexOf("CREATE TABLE public.invoice_lines ");
    const section = SCHEMA_PRE.slice(idx, idx + 2500);
    expect(section).toContain('"taxInclusive"');
  });
  for (const tbl of ["credit_memos", "debit_memos"]) {
    it(`${tbl} has taxCode + taxInclusive`, () => {
      const idx = SCHEMA_PRE.indexOf(`CREATE TABLE public.${tbl} `);
      const section = SCHEMA_PRE.slice(idx, idx + 2500);
      expect(section).toContain('"taxCode"');
      expect(section).toContain('"taxInclusive"');
    });
  }
});

describe("taxCodes.ts helper", () => {
  for (const fn of [
    "getTaxCode", "getDefaultTaxCode", "computeTaxFromTaxCode",
    "splitFromRate", "getOutputVatAccountCode", "getInputVatAccountCode",
    "clearTaxCodeCache",
  ]) {
    it(`exports ${fn}`, () => {
      expect(HELPER).toMatch(new RegExp(`export (async )?function ${fn}|export const ${fn}`));
    });
  }
  it("TaxSplit returns { net, tax, gross, taxCode, rate }", () => {
    expect(HELPER).toContain("net: number");
    expect(HELPER).toContain("tax: number");
    expect(HELPER).toContain("gross: number");
  });
  it("inclusive math: net = amount / (1 + rate/100)", () => {
    expect(HELPER).toContain("amount / (1 + rate / 100)");
  });
  it("exclusive math: tax = net * rate/100", () => {
    expect(HELPER).toContain("net * (rate / 100)");
  });
  it("rate=0 short-circuits (zero/exempt/OOS)", () => {
    expect(HELPER).toMatch(/if \(rate === 0\)/);
  });
  it("invalid rate throws", () => {
    expect(HELPER).toMatch(/rate < 0 \|\| rate > 100/);
  });
});

describe("invoice route wired to tax codes", () => {
  it("schema accepts header taxCode + taxInclusive", () => {
    expect(INVOICES_ROUTE).toMatch(/taxCode:\s*z\.string\(\)\.optional\(\)/);
    expect(INVOICES_ROUTE).toMatch(/taxInclusive:\s*z\.boolean\(\)\.optional\(\)/);
  });
  it("schema accepts per-line taxCode + taxInclusive", () => {
    // Both appear inside the lines array sub-schema
    const linesBlock = INVOICES_ROUTE.slice(
      INVOICES_ROUTE.indexOf("lines: z.array"),
      INVOICES_ROUTE.indexOf("vatRate: z.coerce.number()")
    );
    expect(linesBlock).toContain("taxCode");
    expect(linesBlock).toContain("taxInclusive");
  });
  it("dynamically imports computeTaxFromTaxCode + splitFromRate + getDefaultTaxCode", () => {
    expect(INVOICES_ROUTE).toContain("computeTaxFromTaxCode");
    expect(INVOICES_ROUTE).toContain("splitFromRate");
    expect(INVOICES_ROUTE).toContain("getDefaultTaxCode");
  });
  it("falls back to legacy vatRate when no taxCode provided", () => {
    expect(INVOICES_ROUTE).toMatch(/Legacy path[\s\S]{0,200}vatRate/);
  });
  it("INSERT INTO invoices persists header taxCode + taxInclusive", () => {
    const idx = INVOICES_ROUTE.indexOf("INSERT INTO invoices ");
    const section = INVOICES_ROUTE.slice(idx, idx + 1200);
    expect(section).toContain('"taxCode","taxInclusive"');
  });
  it("INSERT INTO invoice_lines persists taxInclusive", () => {
    const idx = INVOICES_ROUTE.indexOf("INSERT INTO invoice_lines");
    const section = INVOICES_ROUTE.slice(idx, idx + 1500);
    expect(section).toContain('"taxInclusive"');
  });
  it("uses 28 columns in the line bulk INSERT", () => {
    expect(INVOICES_ROUTE).toContain("const COLS_PER_ROW = 28");
  });
});

describe("tax_codes CRUD endpoints", () => {
  for (const ep of [
    'accountsRouter.get("/tax-codes"',
    'accountsRouter.get("/tax-codes/:id"',
    'accountsRouter.post("/tax-codes"',
    'accountsRouter.patch("/tax-codes/:id"',
    'accountsRouter.delete("/tax-codes/:id"',
  ]) {
    it(`registers ${ep}`, () => {
      expect(ACCOUNTS_ROUTE).toContain(ep);
    });
  }
  it("PATCH uses .partial()", () => {
    expect(ACCOUNTS_ROUTE).toContain("upsertTaxCodeSchema.partial()");
  });
  it("DELETE is soft (sets deletedAt + isActive=false)", () => {
    const idx = ACCOUNTS_ROUTE.indexOf('accountsRouter.delete("/tax-codes/:id"');
    const section = ACCOUNTS_ROUTE.slice(idx, idx + 800);
    expect(section).toContain('"deletedAt" = NOW()');
    expect(section).toContain('"isActive" = false');
  });
  it("create + update + delete invalidate clearTaxCodeCache", () => {
    expect(ACCOUNTS_ROUTE).toContain("clearTaxCodeCache");
  });
  it("schema rejects rate < 0 or > 100", () => {
    expect(ACCOUNTS_ROUTE).toMatch(/rate:\s*z\.coerce\.number\(\)\.min\(0\)\.max\(100\)/);
  });
});
