import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const SVC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/accountingAllocation.ts"),
  "utf8"
);

// ─── Phase 5.2 — accountingAllocation resolver service ──────────────────────
// Pure-module contract assertions. The resolver turns a raw line into
// a fully-allocated journal-line payload using the rules from migration
// 203. These smoke tests lock the public surface + the resolution
// algorithm's branching contract.

describe("public surface", () => {
  it("exports resolveLineAllocation", () => {
    expect(SVC).toContain("export async function resolveLineAllocation");
  });
  it("exports resolveDocumentAllocations", () => {
    expect(SVC).toContain("export async function resolveDocumentAllocations");
  });
  it("exports writeAllocationResult", () => {
    expect(SVC).toContain("export async function writeAllocationResult");
  });
  it("exports validateAllocationCompleteness", () => {
    expect(SVC).toContain("export function validateAllocationCompleteness");
  });
  it("exports the AllocationInput / AllocationResult types", () => {
    expect(SVC).toContain("export interface AllocationInput");
    expect(SVC).toContain("export interface AllocationResult");
    expect(SVC).toContain("export type AllocationStatus");
  });
});

describe("AllocationInput shape", () => {
  it("requires companyId, documentType, sourceTable, sourceLineId", () => {
    // Search the entire SVC since AllocationInput has a nested type
    // literal that breaks simple brace-matching.
    expect(SVC).toMatch(/companyId:\s*number/);
    expect(SVC).toMatch(/documentType:\s*string/);
    expect(SVC).toMatch(/sourceTable:\s*string/);
    expect(SVC).toMatch(/sourceLineId:\s*number/);
  });

  it("carries dimensional context the rule may match on", () => {
    for (const dim of [
      "vehicleId", "propertyId", "projectId", "contractId",
      "employeeId", "umrahAgentId", "umrahSeasonId",
    ]) {
      expect(SVC).toContain(dim);
    }
  });
});

describe("resolution status enum", () => {
  it("includes resolved / unmapped / manual_override / failed", () => {
    expect(SVC).toContain('"resolved"');
    expect(SVC).toContain('"unmapped"');
    expect(SVC).toContain('"manual_override"');
    expect(SVC).toContain('"failed"');
  });
});

describe("resolution algorithm", () => {
  it("caller-pinned accountCode/accountId short-circuits to manual_override", () => {
    expect(SVC).toMatch(/if \(input\.accountCode \|\| input\.accountId\)/);
    expect(SVC).toMatch(/status:\s*"manual_override"/);
  });

  it("reads rules from accounting_allocation_rules filtered by active + not-deleted", () => {
    expect(SVC).toContain("FROM accounting_allocation_rules");
    expect(SVC).toContain('"isActive" = true');
    expect(SVC).toContain('"deletedAt" IS NULL');
    expect(SVC).toContain("ORDER BY priority ASC");
  });

  it("emits 'no_matching_rule' warning when no rule fires", () => {
    expect(SVC).toContain("no_matching_rule");
  });

  it("emits 'rule_missing_account' when matched rule has no account for documentType", () => {
    expect(SVC).toContain("rule_missing_account");
  });

  it("emits 'missing_required_entity' when requiresEntityLink fails", () => {
    expect(SVC).toContain("missing_required_entity");
  });
});

describe("cost centre resolution strategies", () => {
  for (const s of [
    "from_vehicle", "from_property", "from_unit", "from_project",
    "from_employee", "from_contract", "from_umrah_agent", "from_umrah_season",
    "explicit", "none",
  ]) {
    it(`handles strategy '${s}'`, () => {
      expect(SVC).toContain(s);
    });
  }

  it("looks up cost_centers by linkedEntityType + linkedEntityId", () => {
    expect(SVC).toContain('"linkedEntityType" = $2');
    expect(SVC).toContain('"linkedEntityId" = $3');
  });
});

describe("required-entity checks per entityType", () => {
  for (const e of [
    "vehicle", "property", "unit", "asset", "project",
    "employee", "driver", "contract",
    "umrah_agent", "umrah_season", "client", "supplier",
  ]) {
    it(`recognises entityType '${e}'`, () => {
      expect(SVC).toContain(`"${e}"`);
    });
  }
});

describe("writeAllocationResult UPSERTs on the unique index", () => {
  it("uses ON CONFLICT on (sourceTable, sourceLineId, companyId)", () => {
    expect(SVC).toContain('ON CONFLICT ("sourceTable", "sourceLineId", "companyId")');
    expect(SVC).toContain("DO UPDATE SET");
  });

  it("UPSERT updates resolvedAt = NOW() on conflict", () => {
    expect(SVC).toContain('"resolvedAt" = NOW()');
  });
});

describe("validateAllocationCompleteness", () => {
  it("flips ok=false when any result is unmapped or failed", () => {
    expect(SVC).toMatch(/status === "unmapped" \|\| r\.status === "failed"/);
  });
  it("returns the blocker list per warning message", () => {
    expect(SVC).toContain("blockers.push");
  });
});

describe("documentType-specific account picking", () => {
  it("invoice picks revenueAccountId then creditAccountId", () => {
    expect(SVC).toMatch(/case "invoice":[\s\S]{0,100}rule\.revenueAccountId/);
  });
  it("purchase_order / grn / expense picks expenseAccountId then inventory / asset / debit", () => {
    expect(SVC).toMatch(/case "(purchase_order|grn|expense)":/);
    expect(SVC).toContain("rule.expenseAccountId");
    expect(SVC).toContain("rule.inventoryAccountId");
    expect(SVC).toContain("rule.assetAccountId");
  });
});

describe("pure-module guarantee", () => {
  // Pull only the import block at the top of the file so doc-comment
  // text further down doesn't false-positive these assertions.
  const importBlock = SVC.slice(0, SVC.indexOf("// ─── Public types"));

  it("does not import Express", () => {
    expect(importBlock).not.toMatch(/from\s+["']express["']/);
  });
  it("does not import authorize", () => {
    expect(importBlock).not.toMatch(/from\s+.*authorize/);
    expect(importBlock).not.toMatch(/from\s+.*rbac\//);
  });
  it("does not import a Router", () => {
    expect(importBlock).not.toContain("Router()");
    expect(importBlock).not.toMatch(/from\s+["']express["']/);
  });
});
