import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Saudi Withholding Tax (WHT) compliance foundation — Audit P1 #10.
// Verifies that migration 208 declares the data model, helper exposes
// the canonical computeWHT contract, and routes wire the new fields.
//
// ZATCA rules (Income Tax Law Article 68):
//   resident          → no WHT
//   non-resident      → 15% royalties/technical, 20% management, 5% else
// Treaty rates override per supplier.

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const MIGRATION = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/migrations/208_withholding_tax_foundation.sql"),
  "utf8"
);
const HELPER = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/withholdingTax.ts"),
  "utf8"
);
const ACCOUNTS_ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/finance-accounts.ts"),
  "utf8"
);
const VENDORS_ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/finance-vendors.ts"),
  "utf8"
);
const SCHEMA_PRE = readFileSync(join(REPO_ROOT, "db/schema_pre.sql"), "utf8");

// ── Migration 208 schema ────────────────────────────────────────────────────

describe("migration 208 — wht_categories table", () => {
  it("creates the wht_categories table", () => {
    expect(MIGRATION).toContain("CREATE TABLE IF NOT EXISTS public.wht_categories");
  });
  for (const col of ["companyId", "nameEn", "appliesTo", "payableAccountId", "isActive"]) {
    it(`declares quoted ${col}`, () => {
      expect(MIGRATION).toContain(`"${col}"`);
    });
  }
  for (const col of ["code", "name", "rate", "description"]) {
    it(`declares ${col}`, () => {
      expect(MIGRATION).toMatch(new RegExp(`^\\s+${col}\\s`, "m"));
    });
  }
  it("CHECK constraint bounds rate 0..100", () => {
    expect(MIGRATION).toContain("wht_categories_rate_check");
    expect(MIGRATION).toContain("rate >= 0 AND rate <= 100");
  });
  it("CHECK constraint covers all 11 appliesTo categories", () => {
    expect(MIGRATION).toContain("wht_categories_applies_check");
    for (const cat of [
      "royalties", "technical_services", "management_fees",
      "dividends", "interest", "rent_movable",
      "telecommunications", "air_tickets", "freight",
      "insurance_premium", "other",
    ]) {
      expect(MIGRATION).toContain(`'${cat}'`);
    }
  });
  it("unique (companyId, code)", () => {
    expect(MIGRATION).toContain("wht_categories_company_code_uniq");
  });
});

describe("migration 208 — seeds 10 default Saudi categories per company", () => {
  for (const seed of [
    "WHT-ROY15", "WHT-TEC15", "WHT-MGT20",
    "WHT-DIV5", "WHT-INT5", "WHT-RNT5",
    "WHT-TEL5", "WHT-AIR5", "WHT-FRT5", "WHT-INS5",
  ]) {
    it(`seeds ${seed}`, () => {
      expect(MIGRATION).toContain(`'${seed}'`);
    });
  }
  it("seeds rates 5 / 15 / 20", () => {
    expect(MIGRATION).toMatch(/\b15,\s*'royalties'/);
    expect(MIGRATION).toMatch(/\b15,\s*'technical_services'/);
    expect(MIGRATION).toMatch(/\b20,\s*'management_fees'/);
    expect(MIGRATION).toMatch(/\b5,\s*'dividends'/);
  });
  it("attempts to wire WHT-payable account code 2330", () => {
    expect(MIGRATION).toContain("code = '2330'");
  });
});

describe("migration 208 — suppliers gain residency + default WHT", () => {
  for (const col of ["residencyStatus", "taxResidenceCountry", "defaultWhtRate", "whtCategoryDefault"]) {
    it(`adds ${col} to suppliers`, () => {
      expect(MIGRATION).toMatch(new RegExp(`ALTER TABLE public\\.suppliers[\\s\\S]{0,500}"${col}"`));
    });
  }
  it("CHECK constraint covers all 4 residency values", () => {
    for (const r of ["resident", "non_resident_gcc", "non_resident_treaty", "non_resident_other"]) {
      expect(MIGRATION).toContain(`'${r}'`);
    }
  });
  it("partial index narrows to non-resident suppliers", () => {
    expect(MIGRATION).toContain("idx_suppliers_non_resident");
    expect(MIGRATION).toMatch(/WHERE\s+"residencyStatus"\s+IS\s+NOT\s+NULL/);
  });
});

describe("migration 208 — supplier_payment_allocations WHT snapshot", () => {
  for (const col of ["whtAmount", "whtRate", "whtCategory"]) {
    it(`adds ${col} to supplier_payment_allocations`, () => {
      expect(MIGRATION).toMatch(new RegExp(`ALTER TABLE public\\.supplier_payment_allocations[\\s\\S]{0,500}"${col}"`));
    });
  }
  it("partial index for allocations that actually withheld", () => {
    expect(MIGRATION).toContain("idx_supplier_payment_allocations_wht");
    expect(MIGRATION).toMatch(/WHERE\s+"whtAmount"\s+>\s+0/);
  });
});

describe("schema_pre.sql declares wht_categories + new columns", () => {
  it("declares wht_categories table", () => {
    expect(SCHEMA_PRE).toContain("CREATE TABLE public.wht_categories");
  });
  it("suppliers carries the WHT columns", () => {
    const idx = SCHEMA_PRE.indexOf("CREATE TABLE public.suppliers ");
    const section = SCHEMA_PRE.slice(idx, idx + 4000);
    expect(section).toContain('"residencyStatus"');
    expect(section).toContain('"taxResidenceCountry"');
    expect(section).toContain('"defaultWhtRate"');
    expect(section).toContain('"whtCategoryDefault"');
  });
  it("supplier_payment_allocations carries the snapshot columns", () => {
    const idx = SCHEMA_PRE.indexOf("CREATE TABLE public.supplier_payment_allocations ");
    const section = SCHEMA_PRE.slice(idx, idx + 3000);
    expect(section).toContain('"whtAmount"');
    expect(section).toContain('"whtRate"');
    expect(section).toContain('"whtCategory"');
  });
});

// ── Helper API ──────────────────────────────────────────────────────────────

describe("withholdingTax.ts helper", () => {
  for (const fn of [
    "computeWHT", "getWhtCategory", "getSupplier",
    "isNonResident", "listWhtCategories", "clearWhtCache",
  ]) {
    it(`exports ${fn}`, () => {
      expect(HELPER).toMatch(new RegExp(`export (async )?function ${fn}|export const ${fn}`));
    });
  }
  it("WhtSplit returns { net, wht, gross, rate, applies, ... }", () => {
    expect(HELPER).toContain("net: number");
    expect(HELPER).toContain("wht: number");
    expect(HELPER).toContain("gross: number");
    expect(HELPER).toContain("applies: boolean");
  });
  it("resident suppliers short-circuit (applies=false, wht=0)", () => {
    expect(HELPER).toMatch(/residencyStatus === "resident"/);
  });
  it("rate resolution: override → category → supplier default → 0", () => {
    expect(HELPER).toContain("rateOverride");
    expect(HELPER).toContain("category.rate");
    expect(HELPER).toContain("supplier.defaultWhtRate");
  });
  it("invalid rate (<0 or >100) throws", () => {
    expect(HELPER).toMatch(/rate < 0 \|\| rate > 100/);
  });
  it("payable account code is resolved from category.payableAccountId", () => {
    expect(HELPER).toContain("payableAccountId");
    expect(HELPER).toContain("FROM chart_of_accounts");
  });
  it("rate=0 short-circuits with applies=false (no math)", () => {
    expect(HELPER).toMatch(/if \(rate === 0\)/);
  });
  it("WHT math: gross * rate/100, net = gross - wht", () => {
    expect(HELPER).toContain("roundTo2(gross * (rate / 100))");
    expect(HELPER).toContain("roundTo2(gross - wht)");
  });
});

// ── wht_categories CRUD ─────────────────────────────────────────────────────

describe("wht_categories CRUD endpoints", () => {
  for (const ep of [
    'accountsRouter.get("/wht-categories"',
    'accountsRouter.get("/wht-categories/:id"',
    'accountsRouter.post("/wht-categories"',
    'accountsRouter.patch("/wht-categories/:id"',
    'accountsRouter.delete("/wht-categories/:id"',
  ]) {
    it(`registers ${ep}`, () => {
      expect(ACCOUNTS_ROUTE).toContain(ep);
    });
  }
  it("PATCH uses .partial()", () => {
    expect(ACCOUNTS_ROUTE).toContain("upsertWhtCategorySchema.partial()");
  });
  it("DELETE is soft (sets deletedAt + isActive=false)", () => {
    const idx = ACCOUNTS_ROUTE.indexOf('accountsRouter.delete("/wht-categories/:id"');
    const section = ACCOUNTS_ROUTE.slice(idx, idx + 800);
    expect(section).toContain('"deletedAt" = NOW()');
    expect(section).toContain('"isActive" = false');
  });
  it("create + update + delete invalidate clearWhtCache", () => {
    const occurrences = ACCOUNTS_ROUTE.split("clearWhtCache(scope.companyId)").length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(3);
  });
  it("schema rejects rate < 0 or > 100", () => {
    const idx = ACCOUNTS_ROUTE.indexOf("upsertWhtCategorySchema");
    const section = ACCOUNTS_ROUTE.slice(idx, idx + 800);
    expect(section).toMatch(/rate:\s*z\.coerce\.number\(\)\.min\(0\)\.max\(100\)/);
  });
});

// ── Supplier route surfaces WHT fields ──────────────────────────────────────

describe("supplier route exposes WHT fields", () => {
  it("create schema accepts residency + WHT", () => {
    const idx = VENDORS_ROUTE.indexOf("createVendorSchema = z.object");
    const section = VENDORS_ROUTE.slice(idx, idx + 1500);
    expect(section).toContain("residencyStatus");
    expect(section).toContain("taxResidenceCountry");
    expect(section).toContain("defaultWhtRate");
    expect(section).toContain("whtCategoryDefault");
  });
  it("update schema accepts residency + WHT (nullable)", () => {
    const idx = VENDORS_ROUTE.indexOf("updateVendorSchema = z.object");
    const section = VENDORS_ROUTE.slice(idx, idx + 1500);
    expect(section).toContain("residencyStatus");
    expect(section).toContain("defaultWhtRate");
    expect(section).toMatch(/nullable\(\)/);
  });
  it("residency enum covers all 4 ZATCA values", () => {
    for (const r of [
      "resident", "non_resident_gcc",
      "non_resident_treaty", "non_resident_other",
    ]) {
      expect(VENDORS_ROUTE).toContain(`"${r}"`);
    }
  });
  it("INSERT INTO suppliers persists residencyStatus + WHT columns", () => {
    const idx = VENDORS_ROUTE.indexOf("INSERT INTO suppliers");
    const section = VENDORS_ROUTE.slice(idx, idx + 1500);
    expect(section).toContain('"residencyStatus"');
    expect(section).toContain('"taxResidenceCountry"');
    expect(section).toContain('"defaultWhtRate"');
    expect(section).toContain('"whtCategoryDefault"');
  });
  it("country code is normalized to upper-case on insert", () => {
    expect(VENDORS_ROUTE).toContain("taxResidenceCountry.toUpperCase()");
  });
});

// ── Documentation ─ rollback hints + ZATCA reference  ───────────────────────

describe("migration 208 governance", () => {
  it("declares @rollback hints", () => {
    expect(MIGRATION).toMatch(/@rollback:/);
  });
  it("references ZATCA Income Tax Law Article 68", () => {
    expect(MIGRATION).toMatch(/Article 68/);
  });
});
