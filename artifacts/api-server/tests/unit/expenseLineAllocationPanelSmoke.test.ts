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
// #2238 — the entityLink + JE-line assembly was extracted into this shared
// module so the save path and the journal-preview build the SAME lines.
const PLAN = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/expenseJournalPlan.ts"),
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

describe("expense handler applies the overrides (via shared resolver #2238)", () => {
  it("destructures lineAllocation from body", () => {
    // lineAllocation is destructured from `b`; later fields (maintenanceTicket,
    // assetCreation, fuelLog, date) may follow before the closing `} = b;`.
    expect(ROUTE).toMatch(/lineAllocation,[\s\S]*?\n\s*} = b;/);
  });

  it("builds entityLink + account override through the shared buildExpenseEntityLink", () => {
    // #2238 — the inline entityLink/override block was extracted into the shared
    // expenseJournalPlan so the save path and the journal-preview build the SAME
    // lines from ONE source. The route now calls the shared builder.
    expect(ROUTE).toContain("const { entityLink, accountCodeOverride } = buildExpenseEntityLink({");
    expect(ROUTE).toContain("let overrideAccountCode = accountCodeOverride ?? accountCode;");
  });

  it("operator accountCode wins over the default (in the shared resolver)", () => {
    expect(PLAN).toContain("if (la.accountCode) accountCodeOverride = la.accountCode;");
  });

  it("the assembled JE lines come from the shared buildExpenseLines", () => {
    expect(ROUTE).toContain("buildExpenseLines({");
    // `role` is stripped so the posted line shape stays identical to the
    // pre-refactor lines (byte-identical INSERT payload).
    expect(ROUTE).toContain(".map(({ role, ...line }) => line)");
  });

  it("every dimension field flows into entityLink when supplied (shared resolver)", () => {
    const idx = PLAN.indexOf("const la = input.lineAllocation;");
    expect(idx).toBeGreaterThan(-1);
    const block = PLAN.slice(idx, idx + 3000);
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
      expect(block).toContain(`if (la.${key}`);
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
  });

  it("derives the linked entity from the scenario, not a legacy duplicate picker (#1945)", () => {
    // #1945 — the old «الجهة المرتبطة» picker (form.relatedEntityType) was
    // removed; the linked entity now comes solely from the operation-context
    // scenario via the shared deriveRelatedEntity helper.
    expect(FORM).toContain("deriveRelatedEntity(allocTarget.target");
    expect(FORM).not.toMatch(/form\.relatedEntityType === "vehicle"/);
    expect(FORM).not.toMatch(/form\.relatedEntityType === "property"/);
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
