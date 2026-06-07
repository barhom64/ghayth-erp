/**
 * Nusk invoices list query — 2×N+1 fix static guard.
 *
 * The original query (in finance-vendors.ts) carried the SAME
 * correlated scalar subquery TWICE on supplier_payment_allocations:
 *
 *     -- as a direct paidAmount column
 *     COALESCE((SELECT SUM(spa.amount)
 *               FROM supplier_payment_allocations spa
 *               JOIN journal_entries je ...
 *               WHERE spa."obligationId" = ni.id ...), 0) AS "paidAmount"
 *
 *     -- AND inside the outstandingAmount math
 *     (totalAmount - refundAmount - COALESCE(<same SUM subquery>, 0))
 *      AS "outstandingAmount"
 *
 * Two correlated subqueries per row × 200 nusk invoices = 400
 * round-trips through the allocations + journal_entries join. Worst
 * N+1 fixed in this session.
 *
 * The fix swaps both for a single CTE that pre-aggregates paid
 * amounts once (one scan + hash aggregate filtered to active
 * journal entries) and references it from BOTH the paidAmount column
 * and the outstandingAmount expression via LEFT JOIN.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/finance-vendors.ts"),
  "utf8",
);

describe("Nusk invoices list — supplier_payment_allocations 2×N+1 fix", () => {
  // The block carries the `umrah_nusk` source literal — distinct
  // enough to find without index drift.
  const blockIdx = SRC.indexOf("'umrah_nusk' AS source");
  const block = SRC.slice(blockIdx - 1000, blockIdx + 3500);

  it("the nusk-invoices block is locatable in the source", () => {
    expect(blockIdx).toBeGreaterThan(0);
  });

  it("no longer carries TWO correlated scalar subqueries on supplier_payment_allocations", () => {
    // Both legacy subqueries had the same shape — SELECT SUM ... FROM
    // supplier_payment_allocations ... JOIN journal_entries. Count
    // matches; the fix removed BOTH.
    const matches = block.match(
      /SELECT\s+SUM\([^)]+\)[\s\S]*?FROM\s+supplier_payment_allocations[\s\S]*?JOIN\s+journal_entries/gi,
    );
    expect(matches?.length ?? 0).toBe(0);
  });

  it("uses a CTE (WITH nusk_paid AS) to pre-aggregate paid amounts once", () => {
    expect(block).toContain("WITH nusk_paid AS");
    expect(block).toContain(
      `SELECT spa."obligationId" AS "niId", SUM(spa.amount) AS "paidAmount"`,
    );
    expect(block).toContain("FROM supplier_payment_allocations spa");
    expect(block).toContain(`GROUP BY spa."obligationId"`);
  });

  it("preserves the nusk-invoice obligationType + journal-entry filters inside the CTE", () => {
    expect(block).toContain(`spa."obligationType" = 'nusk_invoice'`);
    expect(block).toContain('spa."deletedAt" IS NULL');
    expect(block).toContain('je."balancesApplied" = true');
    expect(block).toContain('je."reversedById" IS NULL');
  });

  it("joins nusk_paid back to umrah_nusk_invoices by id", () => {
    expect(block).toMatch(
      /LEFT JOIN nusk_paid np ON np\."niId" = ni\.id/,
    );
  });

  it("paidAmount column now reads from the CTE via COALESCE", () => {
    expect(block).toContain(`COALESCE(np."paidAmount", 0) AS "paidAmount"`);
  });

  it("outstandingAmount expression also reads from the same CTE (no duplicated subquery)", () => {
    expect(block).toMatch(
      /- COALESCE\(np\."paidAmount", 0\)\s*\n?\s*\)\s+AS\s+"outstandingAmount"/,
    );
  });
});
