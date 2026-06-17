/**
 * HR-REV-7 (#2222) — appeal-acceptance payroll deduction reversal.
 *
 * When a GM accepts an employee's appeal, the penalty deduction that the
 * original GM approval inserted into attendance_deductions must be reversed,
 * otherwise the payroll cycle still docks the employee despite the win.
 * Source-only; no database.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/hr-discipline.ts"),
  "utf8",
);

const APPEAL_BLOCK =
  SRC.match(
    /router\.post\("\/memos\/:id\/appeal-decision"[\s\S]*?^\}\);/m,
  )?.[0] || "";

describe("HR-REV-7 — appeal acceptance reverses the payroll deduction", () => {
  it("the appeal-decision handler block was extracted", () => {
    expect(APPEAL_BLOCK).not.toBe("");
  });

  it("only reverses on an accepted appeal", () => {
    expect(APPEAL_BLOCK).toMatch(/if \(decision === "accepted"\)/);
  });

  it("cancels the matching pending_payroll penalty row", () => {
    expect(APPEAL_BLOCK).toMatch(/UPDATE attendance_deductions SET status = 'cancelled'/);
    expect(APPEAL_BLOCK).toMatch(/AND type = 'penalty' AND status = 'pending_payroll'/);
  });

  it("matches by company/assignment/period/amount/minutes and reverses exactly one row", () => {
    expect(APPEAL_BLOCK).toMatch(/"companyId" = \$1 AND "assignmentId" = \$2/);
    // minutes discriminator (incidentDurationMinutes) narrows same-amount collisions
    expect(APPEAL_BLOCK).toMatch(/AND period = \$3 AND amount = \$4 AND minutes = \$5/);
    expect(APPEAL_BLOCK).toMatch(/memo\.incidentDurationMinutes \?\? 0/);
    expect(APPEAL_BLOCK).toMatch(/SELECT ctid FROM attendance_deductions[\s\S]*?LIMIT 1/);
  });

  it("derives the reversal amount from the memo's applied base + extra deduction", () => {
    expect(APPEAL_BLOCK).toMatch(/Number\(memo\.appliedDeductionAmount \?\? 0\) \+ Number\(memo\.appliedExtraDeduction \?\? 0\)/);
    expect(APPEAL_BLOCK).toMatch(/if \(totalApplied > 0\)/);
  });

  it("still flips the linked violation to appeal_accepted", () => {
    expect(APPEAL_BLOCK).toMatch(/toState: "appeal_accepted"/);
  });
});
