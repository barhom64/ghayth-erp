import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const MIGRATION = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/migrations/203_accounting_allocation_rules_and_catalog.sql"),
  "utf8"
);
const SCHEMA_PRE = readFileSync(
  join(REPO_ROOT, "db/schema_pre.sql"),
  "utf8"
);

// ─── Phase 5 P1 — Allocation Rules + Product/Service Catalog ────────────────
// Migration 203 lands the resolver's two backing tables
// (accounting_allocation_rules, accounting_allocation_results) plus
// the product-level routing hints (defaultRevenueAccountId, etc).
// The resolver service itself ships in Phase 5.2.

describe("migration 203 — allocation rules table", () => {
  it("creates accounting_allocation_rules", () => {
    expect(MIGRATION).toContain("CREATE TABLE IF NOT EXISTS public.accounting_allocation_rules");
  });

  for (const col of [
    "companyId", "documentType", "lineType", "activityType", "entityType",
    "conditionsJson", "debitAccountId", "creditAccountId",
    "revenueAccountId", "expenseAccountId", "assetAccountId",
    "inventoryAccountId", "vatAccountId",
    "costCenterStrategy", "dimensionStrategyJson",
    "autoCreateMissing", "requiresEntityLink",
    "priority", "isActive", "deletedAt",
  ]) {
    it(`accounting_allocation_rules has ${col}`, () => {
      const idx = MIGRATION.indexOf("accounting_allocation_rules");
      const end = MIGRATION.indexOf(");", idx);
      const block = MIGRATION.slice(idx, end);
      expect(block).toContain(col);
    });
  }

  it("rules match index is partial (active + not-deleted)", () => {
    expect(MIGRATION).toContain("idx_allocation_rules_match");
    expect(MIGRATION).toContain('WHERE "deletedAt" IS NULL AND "isActive" = true');
  });
});

describe("migration 203 — allocation results table", () => {
  it("creates accounting_allocation_results", () => {
    expect(MIGRATION).toContain("CREATE TABLE IF NOT EXISTS public.accounting_allocation_results");
  });

  for (const col of [
    "companyId", "sourceTable", "sourceLineId", "documentType",
    "resolvedAccountId", "resolvedAccountCode", "costCenterId",
    "dimensionsJson", "ruleId", "resolutionStatus",
    "warningsJson", "resolvedBy", "manualOverrideBy", "manualOverrideReason",
  ]) {
    it(`accounting_allocation_results has ${col}`, () => {
      expect(MIGRATION).toContain(col);
    });
  }

  it("unique constraint per (sourceTable, sourceLineId, companyId)", () => {
    expect(MIGRATION).toContain("uq_allocation_results_source_line");
    expect(MIGRATION).toMatch(/UNIQUE INDEX[\s\S]{0,200}"sourceTable", "sourceLineId", "companyId"/);
  });

  it("status index is partial (not-resolved hot path)", () => {
    expect(MIGRATION).toContain("idx_allocation_results_status");
    expect(MIGRATION).toContain("'resolved'");
  });
});

describe("migration 203 — products catalog routing", () => {
  for (const col of [
    "itemType",
    "defaultRevenueAccountId", "defaultExpenseAccountId",
    "defaultInventoryAccountId", "defaultAssetAccountId",
    "defaultTaxCode", "defaultActivityType",
    "requiresVehicle", "requiresProperty", "requiresProject",
    "requiresContract", "requiresUmrahAgent", "requiresUmrahSeason",
    "defaultCostCenterStrategy", "allowedDocumentTypes",
  ]) {
    it(`products has ${col}`, () => {
      expect(MIGRATION).toContain(`"${col}"`);
    });
  }

  it("itemType CHECK constraint covers all 5 values", () => {
    expect(MIGRATION).toContain("products_item_type_check");
    for (const t of ["product", "service", "asset", "consumable", "digital"]) {
      expect(MIGRATION).toContain(`'${t}'`);
    }
  });
});

describe("migration 203 — cost_centers entity link", () => {
  for (const col of [
    "linkedEntityType", "linkedEntityId",
    "isActive", "deletedAt",
    "autoCreatedBy", "autoCreatedReason",
  ]) {
    it(`cost_centers has ${col}`, () => {
      expect(MIGRATION).toContain(`"${col}"`);
    });
  }

  it("cost_centers gets the linked-entity index", () => {
    expect(MIGRATION).toContain("idx_cost_centers_linked_entity");
  });
});

describe("schema_pre.sql declares the new tables and columns", () => {
  it("declares accounting_allocation_rules", () => {
    expect(SCHEMA_PRE).toContain("CREATE TABLE public.accounting_allocation_rules");
  });

  it("declares accounting_allocation_results", () => {
    expect(SCHEMA_PRE).toContain("CREATE TABLE public.accounting_allocation_results");
  });

  it("declares product routing columns", () => {
    const idx = SCHEMA_PRE.indexOf("CREATE TABLE public.products");
    const section = SCHEMA_PRE.slice(idx, idx + 2500);
    expect(section).toContain('"defaultRevenueAccountId"');
    expect(section).toContain('"requiresVehicle"');
    expect(section).toContain('"defaultCostCenterStrategy"');
  });

  it("declares cost_centers linked-entity columns", () => {
    const idx = SCHEMA_PRE.indexOf("CREATE TABLE public.cost_centers");
    const section = SCHEMA_PRE.slice(idx, idx + 1500);
    expect(section).toContain('"linkedEntityType"');
    expect(section).toContain('"linkedEntityId"');
  });
});
