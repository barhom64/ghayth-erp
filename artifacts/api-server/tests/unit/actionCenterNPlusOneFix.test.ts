/**
 * Action Center pending-advances + pending-custodies N+1 fix.
 *
 * The action-center endpoint had TWO sibling queries (one each for
 * advances and custodies) that BOTH carried a correlated scalar
 * subquery on journal_lines:
 *
 *     COALESCE((SELECT SUM(jl.debit) FROM journal_lines jl
 *               WHERE jl."journalId" = je.id AND jl.debit > 0), 0)
 *      AS amount
 *
 * Both LIMITs were 20 rows, so each query fired ~21 lookups. Same
 * N+1 shape as the earlier fixes (#1564, #1586, #1588, #1593,
 * #1597, #1613, #1614, #1617, #1621), applied to a tenth + eleventh
 * site simultaneously.
 *
 * The fix gives each query its own CTE (adv_debit / cust_debit) that
 * pre-aggregates debit sums once, then LEFT JOINs them back.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/actionCenter.ts"),
  "utf8",
);

describe("Action Center — journal_lines N+1 fix (advances + custodies)", () => {
  it("no correlated scalar subquery on journal_lines anywhere in the source", () => {
    // Both legacy subqueries were `COALESCE((SELECT SUM(jl.debit)
    // FROM journal_lines jl WHERE jl."journalId" = je.id ...), 0)`.
    // Match the bare table reference inside an inline subquery; if
    // either copy returned, this test would catch it.
    expect(SRC).not.toMatch(
      /\(SELECT\s+SUM\([^)]+\)\s+FROM\s+journal_lines\s+jl\s+WHERE\s+jl\."journalId"/,
    );
  });

  it("pendingAdvances query uses adv_debit CTE", () => {
    const block = SRC.slice(
      SRC.indexOf("pendingAdvances"),
      SRC.indexOf('"pendingAdvances"'),
    );
    expect(block).toContain("WITH adv_debit AS");
    expect(block).toContain('SELECT "journalId", SUM(debit) AS amount');
    expect(block).toContain("FROM journal_lines");
    expect(block).toContain('GROUP BY "journalId"');
  });

  it("pendingAdvances LEFT JOINs adv_debit back to journal_entries", () => {
    const block = SRC.slice(
      SRC.indexOf("WITH adv_debit AS"),
      SRC.indexOf('"pendingAdvances"'),
    );
    expect(block).toMatch(
      /LEFT JOIN adv_debit ad ON ad\."journalId" = je\.id/,
    );
    expect(block).toContain("COALESCE(ad.amount, 0) AS amount");
  });

  it("pendingCustodies query uses cust_debit CTE", () => {
    const block = SRC.slice(
      SRC.indexOf("WITH cust_debit AS"),
      SRC.indexOf('"pendingCustodies"'),
    );
    expect(block).toContain("WITH cust_debit AS");
    expect(block).toContain('SELECT "journalId", SUM(debit) AS amount');
  });

  it("pendingCustodies LEFT JOINs cust_debit back to journal_entries", () => {
    const block = SRC.slice(
      SRC.indexOf("WITH cust_debit AS"),
      SRC.indexOf('"pendingCustodies"'),
    );
    expect(block).toMatch(
      /LEFT JOIN cust_debit cd ON cd\."journalId" = je\.id/,
    );
    expect(block).toContain("COALESCE(cd.amount, 0) AS amount");
  });

  it("both CTEs preserve the debit > 0 filter (only positive lines count)", () => {
    const advBlock = SRC.slice(
      SRC.indexOf("WITH adv_debit AS"),
      SRC.indexOf("WITH adv_debit AS") + 500,
    );
    expect(advBlock).toContain("WHERE debit > 0");
    const custBlock = SRC.slice(
      SRC.indexOf("WITH cust_debit AS"),
      SRC.indexOf("WITH cust_debit AS") + 500,
    );
    expect(custBlock).toContain("WHERE debit > 0");
  });
});
