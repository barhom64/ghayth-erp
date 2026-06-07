import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/finance-journal.ts"),
  "utf8"
);
const FORM = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/create/finance/expenses-create.tsx"),
  "utf8"
);

// ─── Audit item #2 — LineAllocationPanel on single-expense form ────────────
// Locks both halves of the contract: the backend schema accepts a
// lineAllocation object, applies its dimensions on top of the auto-
// derived entityLink, and lets the operator override the accountCode.
// The frontend ships the panel + maps the operator-edited allocation
// into the request body.

describe("expense schema accepts lineAllocation", () => {
  it("createExpenseSchema references the shared lineAllocation schema", () => {
    // #1715 PR-4 extracted the inline object into a shared
    // `lineAllocationSchema` reused by expense + voucher create.
    expect(ROUTE).toContain("const lineAllocationSchema = z.object({");
    expect(ROUTE).toContain("lineAllocation: lineAllocationSchema");
  });

  it("lineAllocation supports every LineAllocationPanel field", () => {
    const idx = ROUTE.indexOf("const lineAllocationSchema = z.object({");
    expect(idx).toBeGreaterThan(-1);
    // Widened from 800 → 2000 chars after the schema grew to cover the 7
    // dims (client/vendor/driver/product/umrahSeason/department/employee)
    // that LineAllocationPanel had been submitting silently.
    const block = ROUTE.slice(idx, idx + 2000);
    for (const field of [
      "accountCode",
      "costCenterId",
      "activityType",
      "projectId",
      "vehicleId",
      "propertyId",
      "unitId",
      "assetId",
      "contractId",
      "umrahAgentId",
      "manualOverrideReason",
    ]) {
      expect(block).toContain(field);
    }
  });
});

describe("expense handler applies the overrides", () => {
  it("destructures lineAllocation from body", () => {
    expect(ROUTE).toMatch(/lineAllocation,\s*\n\s*} = b;/);
  });

  it("operator accountCode wins over the default", () => {
    expect(ROUTE).toContain("let overrideAccountCode = accountCode;");
    expect(ROUTE).toContain("if (lineAllocation.accountCode) overrideAccountCode = lineAllocation.accountCode;");
    // The JE line uses the overridden accountCode, not the original.
    expect(ROUTE).toContain("accountCode: overrideAccountCode ?? ");
  });

  it("every dimension field flows into entityLink when supplied", () => {
    const idx = ROUTE.indexOf("if (lineAllocation) {");
    expect(idx).toBeGreaterThan(-1);
    // Widened from 1400 → 3000 after wiring the 7 newly accepted fields
    // (client/vendor/driver/product/umrahSeason/department/employee).
    const block = ROUTE.slice(idx, idx + 3000);
    for (const [key, sink] of [
      ["costCenterId", "entityLink.costCenterId"],
      ["activityType", "entityLink.activityType"],
      ["vehicleId", "entityLink.vehicleId"],
      ["propertyId", "entityLink.propertyId"],
      ["unitId", "entityLink.unitId"],
      ["assetId", "entityLink.assetId"],
      ["contractId", "entityLink.contractId"],
      ["umrahAgentId", "entityLink.umrahAgentId"],
      ["manualOverrideReason", "entityLink.manualOverrideReason"],
    ] as const) {
      expect(block).toContain(`if (lineAllocation.${key}`);
      expect(block).toContain(sink);
    }
  });
});

describe("expenses-create form wires the panel", () => {
  it("imports LineAllocationPanel + helpers", () => {
    expect(FORM).toContain("LineAllocationPanel");
    expect(FORM).toContain("deriveAllocationStatus");
    expect(FORM).toContain("buildAllocationPayload");
  });

  it("renders the panel inside the form", () => {
    expect(FORM).toMatch(/<LineAllocationPanel[\s\S]{0,200}value=\{allocation\}/);
    expect(FORM).toMatch(/status=\{deriveAllocationStatus\(allocation\)\}/);
  });

  it("pre-populates allocation from existing form fields without clobbering operator pins", () => {
    expect(FORM).toContain("if (prev.manualOverrideReason) return prev");
    expect(FORM).toContain("accountCode: form.accountCode || undefined");
    expect(FORM).toMatch(/form\.relatedEntityType === "vehicle"/);
    expect(FORM).toMatch(/form\.relatedEntityType === "property"/);
    expect(FORM).toMatch(/form\.relatedEntityType === "contract"/);
  });

  it("only ships lineAllocation when something is pinned", () => {
    expect(FORM).toContain("Object.values(allocation).some");
    expect(FORM).toContain("buildAllocationPayload(allocation)");
  });
});

// ─── Override audit-trail real-call ────────────────────────────────────────
// Audit follow-through: the original PR #1346 added a comment claiming
// the override would be "logged downstream in the resolver pipeline",
// but no downstream code fires for the expense path. This block locks
// the contract that the route now ACTUALLY calls logAllocationOverride.
describe("expense handler actually logs overrides", () => {
  it("imports logAllocationOverride from accountingAllocation", () => {
    expect(ROUTE).toContain('import { logAllocationOverride } from "../lib/accountingAllocation.js"');
  });

  it("calls logAllocationOverride when manualOverrideReason is set", () => {
    expect(ROUTE).toContain("if (lineAllocation?.manualOverrideReason)");
    expect(ROUTE).toContain("await logAllocationOverride({");
    expect(ROUTE).toContain('documentType: "expense"');
    expect(ROUTE).toContain('sourceTable: "journal_lines"');
  });

  it("builds a blockers list from the pinned dimensions", () => {
    expect(ROUTE).toContain('blockers.push(`account:');
    expect(ROUTE).toContain('blockers.push(`costCenter:');
    expect(ROUTE).toContain('blockers.push(`vehicle:');
    expect(ROUTE).toContain('blockers.push(`property:');
    expect(ROUTE).toContain('blockers.push(`umrahAgent:');
  });

  it("fires inside the withTransaction block so the log rolls back with the JE", () => {
    // The log call sits between the financialEngine.postJournalEntry and
    // the initiateApprovalChain call, both of which are inside withTransaction.
    const txStart = ROUTE.indexOf("await withTransaction(async () => {");
    expect(txStart).toBeGreaterThan(-1);
    const txBody = ROUTE.slice(txStart, txStart + 7000);
    expect(txBody).toContain("await logAllocationOverride({");
  });
});
