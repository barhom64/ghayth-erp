import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * #2230 — single-branch users shouldn't have to pick a branch. vouchers-create
 * now defaults branchId from the active scope (selectedBranchId), mirroring
 * purchase-orders-create. Multi-branch users still pick; the backend is the guard.
 */
const FORM = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/create/finance/vouchers-create.tsx"),
  "utf8",
);

describe("vouchers-create — branch auto-fill for single-branch", () => {
  it("defaults branchId from the active scope (selectedBranchId)", () => {
    expect(FORM).toMatch(/useAppContext\(\)/);
    expect(FORM).toMatch(/branchId: selectedBranchId \? String\(selectedBranchId\) : ""/);
  });
});
