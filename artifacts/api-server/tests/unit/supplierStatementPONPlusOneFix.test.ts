/**
 * Supplier statement open-POs query — N+1 fix static guard.
 *
 * The original supplier-statement query (in finance-reports.ts) had a
 * correlated scalar subquery on supplier_payment_allocations inside
 * the open-POs SELECT:
 *
 *     COALESCE((SELECT SUM(spa.amount)
 *               FROM supplier_payment_allocations spa
 *               JOIN journal_entries je ...
 *               WHERE spa."obligationId" = po.id ...), 0)
 *      AS "paidAmount"
 *
 * For every PO returned by the outer query, postgres planned a fresh
 * SUM over the allocations + journal_entries join. A supplier with
 * 50 open POs fired 51 round-trips through that join. Same N+1 shape
 * as the employees / fleet / workflows / admin / my-space / tasks /
 * CIP fixes (#1564, #1586, #1588, #1593, #1597, #1613, #1614),
 * applied to an eighth table.
 *
 * The fix swaps the scalar subquery for a CTE that pre-aggregates
 * paid amounts once (one scan + hash aggregate filtered to active
 * journal entries) and joins the per-PO result back via LEFT JOIN.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/finance-reports.ts"),
  "utf8",
);

describe("Supplier statement — open POs / supplier_payment_allocations N+1 fix", () => {
  // The open-POs query block sits right after the "Aging of open POs"
  // comment header. Slice from there.
  const blockIdx = SRC.indexOf("Aging of open POs, net of allocations against each PO");
  const block = SRC.slice(blockIdx, blockIdx + 4000);

  it("the open-POs block is locatable in the source", () => {
    expect(blockIdx).toBeGreaterThan(0);
  });

  it("no longer carries a correlated scalar subquery on supplier_payment_allocations inside the POs SELECT", () => {
    // The legacy subquery had its own SELECT SUM + JOIN. Match the
    // double-keyword shape (SELECT SUM ... FROM supplier_payment_allocations
    // ... JOIN journal_entries) to be specific.
    expect(block).not.toMatch(
      /SELECT\s+SUM\([^)]+\)[\s\S]*?FROM\s+supplier_payment_allocations[\s\S]*?JOIN\s+journal_entries/i,
    );
  });

  it("uses a CTE (WITH po_paid AS) to pre-aggregate paid amounts once", () => {
    expect(block).toContain("WITH po_paid AS");
    expect(block).toContain(
      `SELECT spa."obligationId" AS "poId", SUM(spa.amount) AS "paidAmount"`,
    );
    expect(block).toContain("FROM supplier_payment_allocations spa");
    expect(block).toContain('JOIN journal_entries je ON je.id = spa."journalEntryId"');
    expect(block).toContain(`GROUP BY spa."obligationId"`);
  });

  it("preserves the obligationType + reversal + balancesApplied filters inside the CTE", () => {
    expect(block).toContain(`spa."obligationType" = 'purchase_order'`);
    expect(block).toContain('spa."deletedAt" IS NULL');
    expect(block).toContain('je."deletedAt" IS NULL');
    expect(block).toContain('je."balancesApplied" = true');
    expect(block).toContain('je."reversedById" IS NULL');
  });

  it("joins po_paid back to purchase_orders by id", () => {
    expect(block).toMatch(
      /LEFT JOIN po_paid pp ON pp\."poId" = po\.id/,
    );
  });

  it("COALESCEs the paidAmount so POs with no allocations return 0 (not NULL)", () => {
    expect(block).toContain(`COALESCE(pp."paidAmount", 0) AS "paidAmount"`);
  });
});
