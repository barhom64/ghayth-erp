/**
 * Cycle-count pending list — N+1 fix static guard.
 *
 * The pending-cycle-counts query (in finance-gl-helpers.ts) carried
 * a correlated scalar subquery on warehouse_cycle_count_lines in its
 * SELECT list:
 *
 *     (SELECT COUNT(*)::text
 *      FROM warehouse_cycle_count_lines l
 *      WHERE l."cycleCountId" = cc.id) AS "lineCount"
 *
 * Postgres planned that once per returned row, so at LIMIT 200 a
 * single list call fired 201 lookups through
 * warehouse_cycle_count_lines. Same N+1 shape as the earlier fixes,
 * applied to a thirteenth table.
 *
 * The fix swaps the scalar subquery for a CTE that pre-aggregates
 * line counts once (one scan + hash aggregate) and joins the per-
 * cycle-count result back via a LEFT JOIN.
 *
 * The sibling NOT EXISTS check (lines with adjustmentJournalEntryId
 * IS NOT NULL) is left as-is — postgres optimizes it to a single
 * semi-join, no N+1 there.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/finance-gl-helpers.ts"),
  "utf8",
);

describe("Cycle-count pending list — warehouse_cycle_count_lines N+1 fix", () => {
  // The block is uniquely identifiable by the lineCount alias.
  const blockIdx = SRC.indexOf('AS "lineCount"');
  const block = SRC.slice(blockIdx - 2000, blockIdx + 1500);

  it("the cycle-count pending-list query is locatable", () => {
    expect(blockIdx).toBeGreaterThan(0);
  });

  it("no longer carries a correlated scalar COUNT subquery on warehouse_cycle_count_lines for the lineCount column", () => {
    // The legacy shape was `(SELECT COUNT(*)::text FROM
    // warehouse_cycle_count_lines l WHERE l."cycleCountId" = cc.id)`.
    expect(block).not.toMatch(
      /\(SELECT\s+COUNT\([^)]+\)::text\s+FROM\s+warehouse_cycle_count_lines\s+l\s+WHERE\s+l\."cycleCountId"\s*=\s*cc\.id\)/,
    );
  });

  it("uses a CTE (WITH line_counts AS) to pre-aggregate counts once", () => {
    expect(block).toContain("WITH line_counts AS");
    expect(block).toContain('SELECT "cycleCountId", COUNT(*) AS lines');
    expect(block).toContain("FROM warehouse_cycle_count_lines");
    expect(block).toContain('GROUP BY "cycleCountId"');
  });

  it("joins line_counts back to warehouse_cycle_counts by cycleCountId", () => {
    expect(block).toMatch(
      /LEFT JOIN line_counts lc ON lc\."cycleCountId" = cc\.id/,
    );
  });

  it("COALESCEs the count so cycle-counts with no lines return 0 (not NULL)", () => {
    expect(block).toContain("COALESCE(lc.lines, 0)::text");
  });

  it("preserves the NOT EXISTS sibling check (lines with adjustmentJournalEntryId)", () => {
    // postgres optimizes this to a semi-join, so it doesn't need to
    // change. The whole point of the fix was the per-row COUNT, not
    // the EXISTS predicate.
    expect(block).toContain("NOT EXISTS");
    expect(block).toContain('"adjustmentJournalEntryId" IS NOT NULL');
  });
});
