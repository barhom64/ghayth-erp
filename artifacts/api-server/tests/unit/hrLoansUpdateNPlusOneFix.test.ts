/**
 * Payroll-run loan-balance UPDATE — 3×N+1 fix static guard.
 *
 * After payroll marked installments as paid, the loan-balance UPDATE
 * carried the SAME scalar SUM subquery THREE times per row:
 *
 *     UPDATE hr_employee_loans l SET
 *       "paidAmount" = COALESCE((SELECT SUM(amount) FROM
 *         hr_loan_installments WHERE "loanId" = l.id
 *         AND status = 'paid'), 0),
 *       "remainingAmount" = l.amount - COALESCE(<same subquery>, 0),
 *       status = CASE WHEN l.amount - COALESCE(<same subquery>, 0)
 *         <= 0 THEN 'completed' ELSE l.status END,
 *       ...
 *     WHERE l."companyId" = $1 AND l.status = 'active'
 *
 * Three correlated subqueries per row × N active loans = 3N+1
 * lookups through hr_loan_installments. The worst-shape multiplied
 * N+1 fixed in this session (worse than the earlier 2× nusk-invoices
 * fix in PR #1621).
 *
 * The fix uses TWO CTEs:
 *   - paid_sums aggregates installments once.
 *   - to_update LEFT JOINs paid_sums against the active loans so
 *     every loan gets a row, even those with zero installments.
 * The outer UPDATE matches to_update by id (UPDATE FROM is implicit
 * INNER JOIN — without the indirection, zero-installment loans
 * would be skipped).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/hr.ts"),
  "utf8",
);

describe("Payroll loan-balance UPDATE — hr_loan_installments 3×N+1 fix", () => {
  // Locate the UPDATE block. It sits inside the payroll-run
  // transaction; the `to_update` CTE name is unique enough to anchor.
  const blockIdx = SRC.indexOf("WITH paid_sums AS");
  const block = SRC.slice(blockIdx, blockIdx + 2000);

  it("the new UPDATE block is locatable in the source", () => {
    expect(blockIdx).toBeGreaterThan(0);
  });

  it("no longer carries any correlated scalar subquery on hr_loan_installments inside the UPDATE", () => {
    // The three legacy subqueries had the shape
    //   (SELECT SUM(amount) FROM hr_loan_installments WHERE "loanId"
    //    = l.id AND status = 'paid')
    // Match the bare table reference inside an inline subquery.
    // Three would-be matches collapse to zero after the fix.
    const matches = block.match(
      /\(SELECT\s+SUM\([^)]+\)\s+FROM\s+hr_loan_installments\s+WHERE\s+"loanId"\s*=\s*l\.id/gi,
    );
    expect(matches?.length ?? 0).toBe(0);
  });

  it("uses paid_sums CTE to pre-aggregate paid installments once", () => {
    expect(block).toContain("WITH paid_sums AS");
    expect(block).toContain('SELECT "loanId", SUM(amount) AS paid');
    expect(block).toContain("FROM hr_loan_installments");
    expect(block).toContain("WHERE status = 'paid'");
    expect(block).toContain('GROUP BY "loanId"');
  });

  it("uses to_update CTE that LEFT JOINs paid_sums against active loans", () => {
    expect(block).toContain("to_update AS");
    expect(block).toContain("FROM hr_employee_loans l");
    expect(block).toMatch(/LEFT JOIN paid_sums ps ON ps\."loanId" = l\.id/);
    expect(block).toContain('l."companyId" = $1');
    expect(block).toContain("l.status = 'active'");
  });

  it("outer UPDATE reads from to_update via FROM + matches by id", () => {
    // Three SET expressions all reference tu.paid — proves the fix
    // collapsed three subquery executions into one CTE lookup.
    expect(block).toContain('"paidAmount" = tu.paid');
    expect(block).toContain('"remainingAmount" = l.amount - tu.paid');
    expect(block).toContain("l.amount - tu.paid <= 0");
    expect(block).toContain("FROM to_update tu");
    expect(block).toContain("WHERE l.id = tu.id");
  });

  it("zero-installment loans still update (LEFT JOIN to_update keeps them)", () => {
    // The to_update CTE uses LEFT JOIN paid_sums so loans with no
    // paid installments get COALESCE(paid, 0) = 0 — same as the
    // legacy semantics. Without the LEFT JOIN, those loans would
    // disappear from the result and never have their `updatedAt`
    // bumped.
    expect(block).toContain("COALESCE(ps.paid, 0) AS paid");
  });
});
