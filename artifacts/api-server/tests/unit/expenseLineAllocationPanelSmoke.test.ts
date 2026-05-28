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
  it("createExpenseSchema declares lineAllocation field", () => {
    expect(ROUTE).toContain("lineAllocation: z.object({");
  });

  it("lineAllocation supports every LineAllocationPanel field", () => {
    const idx = ROUTE.indexOf("lineAllocation: z.object({");
    expect(idx).toBeGreaterThan(-1);
    const block = ROUTE.slice(idx, idx + 800);
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
    const block = ROUTE.slice(idx, idx + 1400);
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
