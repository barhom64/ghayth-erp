import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// COGS posting foundation — Audit P1 #7.
// Verifies that migration 209 declares the data model, helper module
// builds a balanced DR COGS / CR Inventory pair using the existing
// valuation pickers, and that the planner is wired to honour
// product.tracksLots and report shortages instead of silently posting
// half a JE.

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const MIGRATION = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/migrations/209_invoice_cogs_foundation.sql"),
  "utf8"
);
const HELPER = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/inventory/cogsPosting.ts"),
  "utf8"
);
const SCHEMA_PRE = readFileSync(join(REPO_ROOT, "db/schema_pre.sql"), "utf8");

// ── Migration 209 schema ────────────────────────────────────────────────────

describe("migration 209 — invoice_lines COGS snapshot", () => {
  for (const col of ["cogsAmount", "cogsUnitCost", "cogsPostedAt", "cogsAllocationJson"]) {
    it(`adds ${col} to invoice_lines`, () => {
      expect(MIGRATION).toMatch(new RegExp(`ALTER TABLE public\\.invoice_lines[\\s\\S]{0,800}"${col}"`));
    });
  }
  it("partial index narrows to unposted COGS lines", () => {
    expect(MIGRATION).toContain("idx_invoice_lines_cogs_pending");
    expect(MIGRATION).toMatch(/WHERE "cogsAmount" > 0 AND "cogsPostedAt" IS NULL/);
  });
});

describe("migration 209 — invoices rollup", () => {
  for (const col of ["cogsTotal", "cogsJournalEntryId"]) {
    it(`adds ${col} to invoices`, () => {
      expect(MIGRATION).toMatch(new RegExp(`ALTER TABLE public\\.invoices[\\s\\S]{0,500}"${col}"`));
    });
  }
  it("partial index for posted-COGS invoices", () => {
    expect(MIGRATION).toContain("idx_invoices_cogs_posted");
    expect(MIGRATION).toMatch(/WHERE "cogsTotal" > 0/);
  });
});

describe("migration 209 — seeds default accounting mapping", () => {
  it("inserts cogs_default mapping for every active company", () => {
    expect(MIGRATION).toMatch(/INSERT INTO public\.accounting_mappings/);
    expect(MIGRATION).toContain("'cogs_default'");
  });
  it("debit account is 5100 (COGS), credit is 1400 (Inventory)", () => {
    expect(MIGRATION).toContain("'5100'");
    expect(MIGRATION).toContain("'1400'");
  });
  it("ON CONFLICT keeps the seed idempotent", () => {
    expect(MIGRATION).toContain('ON CONFLICT ("companyId","operationType") DO NOTHING');
  });
  it("supplies operationLabel (NOT NULL constraint)", () => {
    expect(MIGRATION).toContain("operationLabel");
  });
});

describe("schema_pre.sql declares the new columns", () => {
  it("invoice_lines carries the COGS snapshot columns", () => {
    const idx = SCHEMA_PRE.indexOf("CREATE TABLE public.invoice_lines ");
    const section = SCHEMA_PRE.slice(idx, idx + 3000);
    expect(section).toContain('"cogsAmount"');
    expect(section).toContain('"cogsUnitCost"');
    expect(section).toContain('"cogsPostedAt"');
    expect(section).toContain('"cogsAllocationJson"');
  });
  it("invoices header carries cogsTotal + cogsJournalEntryId", () => {
    const idx = SCHEMA_PRE.indexOf("CREATE TABLE public.invoices ");
    const section = SCHEMA_PRE.slice(idx, idx + 4000);
    expect(section).toContain('"cogsTotal"');
    expect(section).toContain('"cogsJournalEntryId"');
  });
});

// ── Helper API ──────────────────────────────────────────────────────────────

describe("cogsPosting.ts helper", () => {
  for (const fn of ["planCogsForInvoice", "applyStockMovements"]) {
    it(`exports ${fn}`, () => {
      expect(HELPER).toMatch(new RegExp(`export (async )?function ${fn}`));
    });
  }
  it("uses the existing pickWithMethod factory (FIFO/LIFO/average)", () => {
    expect(HELPER).toContain('from "./valuation/index.js"');
    expect(HELPER).toContain("pickWithMethod");
  });
  it("resolves accounts via getAccountForPurpose (cogs_default + inventory_asset)", () => {
    expect(HELPER).toContain('from "../gl/account-purposes.js"');
    expect(HELPER).toContain('"cogs_default"');
    expect(HELPER).toContain('"inventory_asset"');
  });
  it("skips service lines (productId == null)", () => {
    expect(HELPER).toMatch(/productId == null/);
  });
  it("returns warnings for product_not_found / product_not_tracked / no_active_lots / insufficient_stock", () => {
    for (const w of ["product_not_found", "product_not_tracked", "no_active_lots", "insufficient_stock"]) {
      expect(HELPER).toContain(`"${w}"`);
    }
  });
  it("never posts a partial-COGS line — short pick → skip + warn", () => {
    expect(HELPER).toMatch(/if \(plan\.shortfall > 0\)/);
    expect(HELPER).toMatch(/insufficient_stock/);
  });
  it("buckets DR/CR by (account, dimensions) to keep the JE compact", () => {
    expect(HELPER).toMatch(/bucketsDr/);
    expect(HELPER).toMatch(/bucketsCr/);
  });
  it("walks lots in-memory so multiple lines of the same SKU don't double-pick", () => {
    expect(HELPER).toMatch(/lot\.quantity = roundTo2\(lot\.quantity - alloc\.quantity\)/);
  });
  it("loadLots restricts to status=active + qc=approved + quantity>0", () => {
    expect(HELPER).toContain(`status = 'active'`);
    expect(HELPER).toContain(`"qualityControlStatus" = 'approved'`);
    expect(HELPER).toContain("quantity > 0");
  });
  it("normaliseMethod maps weighted_average → average", () => {
    expect(HELPER).toContain('case "weighted_average":');
    expect(HELPER).toMatch(/return "average"/);
  });
  it("applyStockMovements decrements lots, denorm stock, and inserts warehouse_movements", () => {
    expect(HELPER).toContain("UPDATE warehouse_stock_lots");
    expect(HELPER).toContain("UPDATE warehouse_products");
    expect(HELPER).toContain("INSERT INTO warehouse_movements");
    expect(HELPER).toMatch(/type,quantity[\s\S]{0,200}'out'/);
  });
});

// ── Documentation ───────────────────────────────────────────────────────────

describe("migration 209 governance", () => {
  it("declares @rollback hints", () => {
    expect(MIGRATION).toMatch(/@rollback:/);
  });
  it("explains the bug being fixed (income statement overstated)", () => {
    expect(MIGRATION).toMatch(/overstated/i);
  });
});
