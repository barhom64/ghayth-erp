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
const MIGRATION = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/migrations/385_attendance_deduction_memo_link.sql"),
  "utf8",
);

describe("HR-REV-7 — memoId link (migration 385)", () => {
  it("migration adds a nullable memoId column + partial index, additive", () => {
    expect(MIGRATION).toMatch(/ADD COLUMN IF NOT EXISTS "memoId" INTEGER/);
    expect(MIGRATION).toMatch(/CREATE INDEX IF NOT EXISTS idx_attendance_deductions_memo_live/);
    expect(MIGRATION).toMatch(/@rollback:/);
    // column is nullable — no `"memoId" INTEGER NOT NULL` (the index's partial
    // `WHERE "memoId" IS NOT NULL` is fine and not a column constraint)
    expect(MIGRATION).not.toMatch(/"memoId" INTEGER NOT NULL/);
  });
  it("gm-decision stamps the penalty insert with the memo id", () => {
    expect(SRC).toMatch(/INSERT INTO attendance_deductions[\s\S]*?"memoId"\)\s*\n\s*VALUES \(\$1,\$2,'penalty',\$3,\$4,\$5,'pending_payroll',\$6\)/);
  });
});

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

  it("targets the exact row via the memoId link (migration 385), not a heuristic", () => {
    expect(APPEAL_BLOCK).toMatch(/WHERE "memoId" = \$1 AND "companyId" = \$2/);
    // the old amount/minutes heuristic must be gone
    expect(APPEAL_BLOCK).not.toMatch(/amount = \$4 AND minutes = \$5/);
    expect(APPEAL_BLOCK).not.toMatch(/SELECT ctid FROM attendance_deductions/);
  });

  it("derives the reversal amount from the memo's applied base + extra deduction", () => {
    expect(APPEAL_BLOCK).toMatch(/Number\(memo\.appliedDeductionAmount \?\? 0\) \+ Number\(memo\.appliedExtraDeduction \?\? 0\)/);
    expect(APPEAL_BLOCK).toMatch(/if \(totalApplied > 0\)/);
  });

  it("still flips the linked violation to appeal_accepted", () => {
    expect(APPEAL_BLOCK).toMatch(/toState: "appeal_accepted"/);
  });
});
