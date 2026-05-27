import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const ALLOC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/accountingAllocation.ts"),
  "utf8",
);
const INVOICES = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/finance-invoices.ts"),
  "utf8",
);
const PURCHASE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/finance-purchase.ts"),
  "utf8",
);
const ACCOUNTS = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/finance-accounts.ts"),
  "utf8",
);
const FEATURES = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/rbac/featureCatalog.ts"),
  "utf8",
);
const MIGRATION = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/migrations/223_finance_enforce_line_allocation.sql"),
  "utf8",
);

// ─── Migration 223 — enforce_line_allocation enforcement scaffolding ───────
// Locks the surface that the invoice + GRN approve handlers depend on so
// no future refactor silently drops the gate or the audit table.

describe("migration 223 schema", () => {
  it("creates allocation_override_log with the columns the helper writes", () => {
    expect(MIGRATION).toMatch(/CREATE TABLE[^;]+allocation_override_log/i);
    for (const col of [
      '"companyId"', '"branchId"', '"actorAssignmentId"', '"actorUserId"',
      '"documentType"', '"documentId"', '"sourceTable"',
      '"blockersJson"', '"overrideReason"', '"createdAt"',
    ]) {
      expect(MIGRATION).toContain(col);
    }
  });

  it("seeds finance.enforce_line_allocation = 'false' at system scope", () => {
    expect(MIGRATION).toContain("'finance.enforce_line_allocation'");
    expect(MIGRATION).toMatch(/INSERT\s+INTO\s+public\.system_settings/i);
    expect(MIGRATION).toMatch(/'false'/);
  });

  it("is idempotent (re-runnable)", () => {
    expect(MIGRATION).toMatch(/CREATE TABLE IF NOT EXISTS/i);
    expect(MIGRATION).toMatch(/CREATE INDEX IF NOT EXISTS/i);
    expect(MIGRATION).toMatch(/NOT EXISTS\s*\(/i);
    expect(MIGRATION).toMatch(/ADD COLUMN IF NOT EXISTS/i);
  });
});

describe("accountingAllocation enforcement helpers", () => {
  it("exports getEnforceLineAllocation", () => {
    expect(ALLOC).toMatch(/export async function getEnforceLineAllocation/);
  });
  it("getEnforceLineAllocation queries system_settings with branch→company→system precedence", () => {
    expect(ALLOC).toContain("'finance.enforce_line_allocation'");
    expect(ALLOC).toMatch(/FROM\s+system_settings/i);
    expect(ALLOC).toMatch(/ORDER BY \("branchId" IS NULL\) ASC, \("companyId" IS NULL\) ASC/);
  });
  it("getEnforceLineAllocation accepts true/1/yes/on as truthy", () => {
    for (const tok of ['"true"', '"1"', '"yes"', '"on"']) {
      expect(ALLOC).toContain(tok);
    }
  });
  it("exports logAllocationOverride writing to allocation_override_log", () => {
    expect(ALLOC).toMatch(/export async function logAllocationOverride/);
    expect(ALLOC).toMatch(/INSERT INTO allocation_override_log/);
  });
});

describe("RBAC permission finance.allocation.override", () => {
  it("is registered in featureCatalog under finance.accounts", () => {
    expect(FEATURES).toContain('"finance.allocation.override"');
    expect(FEATURES).toMatch(/parentKey:\s*"finance\.accounts"/);
  });
  it("is narrow: action=create only, scope=company only, systemCritical", () => {
    const match = FEATURES.match(/"finance\.allocation\.override"[\s\S]{0,400}/);
    expect(match).not.toBeNull();
    const block = match![0];
    expect(block).toContain('availableActions: ["create"]');
    expect(block).toContain('availableScopes: ["company"]');
    expect(block).toContain("systemCritical: true");
  });
});

describe("invoice approve gate wiring", () => {
  it("imports the enforcement helpers", () => {
    expect(INVOICES).toContain("getEnforceLineAllocation");
    expect(INVOICES).toContain("validateAllocationCompleteness");
    expect(INVOICES).toContain("logAllocationOverride");
    expect(INVOICES).toContain('import { checkAccess } from "../lib/rbac/authzEngine.js"');
  });
  it("reads overrideReason and requires >=10 chars", () => {
    expect(INVOICES).toContain('req.body?.overrideReason');
    expect(INVOICES).toMatch(/overrideReason\.length\s*<\s*10/);
  });
  it("checks finance.allocation.override before bypassing the gate", () => {
    expect(INVOICES).toMatch(/checkAccess\(scope,\s*\{\s*feature:\s*"finance\.allocation\.override"/);
  });
  it("calls logAllocationOverride with documentType=invoice", () => {
    expect(INVOICES).toMatch(/logAllocationOverride\(\s*\{[\s\S]{0,300}documentType:\s*"invoice"/);
  });
});

describe("purchase / GRN approve gate wiring", () => {
  it("imports the enforcement helpers", () => {
    expect(PURCHASE).toContain("getEnforceLineAllocation");
    expect(PURCHASE).toContain("validateAllocationCompleteness");
    expect(PURCHASE).toContain("logAllocationOverride");
    expect(PURCHASE).toContain('import { checkAccess } from "../lib/rbac/authzEngine.js"');
  });
  it("calls logAllocationOverride with documentType=grn", () => {
    expect(PURCHASE).toMatch(/logAllocationOverride\(\s*\{[\s\S]{0,300}documentType:\s*"grn"/);
  });
});

describe("finance-accounts settings endpoints", () => {
  it("exposes GET /finance/settings/enforce-line-allocation", () => {
    expect(ACCOUNTS).toMatch(/accountsRouter\.get\(\s*"\/settings\/enforce-line-allocation"/);
  });
  it("exposes PUT /finance/settings/enforce-line-allocation gated by finance.accounts:update", () => {
    const m = ACCOUNTS.match(/accountsRouter\.put\(\s*"\/settings\/enforce-line-allocation"[\s\S]{0,400}/);
    expect(m).not.toBeNull();
    expect(m![0]).toContain('feature: "finance.accounts"');
    expect(m![0]).toContain('action: "update"');
  });
  it("exposes GET /finance/allocation-override-log", () => {
    expect(ACCOUNTS).toMatch(/accountsRouter\.get\(\s*"\/allocation-override-log"/);
    expect(ACCOUNTS).toContain("FROM allocation_override_log");
  });
});
