import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assertNotSelfApproval } from "../../src/lib/rbac/selfApprovalCreators.js";

/**
 * Closes a maker-checker (segregation-of-duties) gap: the unified approval
 * chain (routes/hr.ts) blocks a creator from approving their OWN request, but
 * the finance-DIRECT approval endpoints (custody / expense / salary-advance)
 * flipped `status` to 'approved' without that guard — so a creator who already
 * posted the JE at creation could self-finalise their own cash custody/expense
 * via the direct path. These pin the shared `assertNotSelfApproval` guard onto
 * each direct endpoint's APPROVE branch (reject/return stay open).
 */
const read = (p: string) => readFileSync(join(import.meta.dirname!, p), "utf8");
const CUSTODIES = read("../../src/routes/finance-custodies.ts");
const JOURNAL = read("../../src/routes/finance-journal.ts");
const PURCHASE = read("../../src/routes/finance-purchase.ts");

describe("assertNotSelfApproval — helper contract", () => {
  it("is exempt for a null approver (owners / non-employee approvers)", async () => {
    // null short-circuits BEFORE any DB lookup, so this runs without a database.
    await expect(assertNotSelfApproval("custody", 1, 1, null)).resolves.toBeUndefined();
    await expect(assertNotSelfApproval("custody", 1, 1, undefined)).resolves.toBeUndefined();
  });
});

describe("finance-direct approval endpoints enforce maker-checker on APPROVE", () => {
  it("custody approve calls the guard for the 'custody' refType", () => {
    expect(CUSTODIES).toMatch(/assertNotSelfApproval\("custody", custodyId, scope\.companyId, scope\.employeeId\)/);
  });

  it("expense approve calls the guard for the 'expense' refType", () => {
    expect(JOURNAL).toMatch(/assertNotSelfApproval\("expense", expenseId, scope\.companyId, scope\.employeeId\)/);
  });

  it("salary-advance approve calls the guard for the 'salary_advance' refType", () => {
    expect(JOURNAL).toMatch(/assertNotSelfApproval\("salary_advance", advanceId, scope\.companyId, scope\.employeeId\)/);
  });

  it("purchase-order approve calls the guard for the 'purchase_order' refType", () => {
    expect(PURCHASE).toMatch(/assertNotSelfApproval\("purchase_order", id, scope\.companyId, scope\.employeeId\)/);
  });

  it("only self-APPROVAL is blocked — the guard sits behind newStatus === 'approved'", () => {
    // reject/return must remain available to the creator, so the guard is gated.
    expect(CUSTODIES).toMatch(/if \(newStatus === "approved"\) \{\s*await assertNotSelfApproval\("custody"/);
    expect(JOURNAL).toMatch(/if \(newStatus === "approved"\) \{\s*await assertNotSelfApproval\("expense"/);
    expect(JOURNAL).toMatch(/if \(newStatus === "approved"\) \{\s*await assertNotSelfApproval\("salary_advance"/);
  });
});
