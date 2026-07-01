import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins the concurrency fix on the supplier-payment over-allocation cap (#901).
 *
 * The cap sums existing allocations to an obligation (PO / nusk invoice) and
 * rejects a voucher that would push the total over the obligation value. But
 * the obligation row was read WITHOUT a lock, so two concurrent vouchers
 * paying the same PO each read a stale Σ (neither tx sees the other's
 * uncommitted allocation under READ COMMITTED), both pass the cap, and both
 * INSERT — over-paying the obligation. rawQuery is ALS-bound to the active
 * withTransaction, so adding FOR UPDATE locks the obligation inside the tx and
 * serialises concurrent vouchers. These assertions stop the lock from being
 * dropped in a future refactor.
 */
const SRC = readFileSync(
  join(import.meta.dirname!, "../../src/routes/finance-journal.ts"),
  "utf8",
);

describe("supplier payment allocation cap — obligation row is locked", () => {
  it("locks the purchase_orders obligation row (FOR UPDATE) during the cap check", () => {
    expect(SRC).toMatch(
      /SELECT "totalAmount" FROM purchase_orders\s+WHERE id = \$1 AND "companyId" = \$2 AND "deletedAt" IS NULL\s+FOR UPDATE/,
    );
  });

  it("locks the umrah_nusk_invoices obligation row (FOR UPDATE) during the cap check", () => {
    expect(SRC).toMatch(
      /SELECT "totalAmount", "refundAmount" FROM umrah_nusk_invoices\s+WHERE id = \$1 AND "companyId" = \$2 AND "deletedAt" IS NULL\s+FOR UPDATE/,
    );
  });

  it("still sums prior allocations (amount + whtAmount) and rejects over-allocation", () => {
    // The lock only matters because the cap that follows is real: keep both.
    expect(SRC).toMatch(/SUM\(amount \+ COALESCE\("whtAmount", 0\)\)/);
    expect(SRC).toMatch(/يتجاوز قيمة الالتزام/);
  });
});
