/**
 * Umrah financial-reconciliation count-diffs — 3×N+1 fix static guard.
 *
 * The umrah reconciliation report block had the SAME scalar COUNT
 * subquery on umrah_pilgrims repeated THREE TIMES per row:
 *
 *   - SELECT column: (SELECT COUNT(*)::int FROM umrah_pilgrims ...) AS "systemCount"
 *   - WHERE filter:  AND ni."mutamerCount" != (SELECT COUNT(*)::int ...)
 *   - ORDER BY:      ORDER BY ABS(ni."mutamerCount" - (SELECT COUNT(*) ...))
 *
 * At LIMIT 500, that's 1,501 redundant lookups through
 * umrah_pilgrims. Same shape as the hr loans UPDATE 3×N+1 fix
 * (PR #1626) and the property owners 3×N+1 fix (PR #1629), applied
 * to a sixteenth site.
 *
 * The fix uses a single pilgrim_counts CTE keyed by (groupId,
 * companyId) so the tenant boundary is preserved.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
// U-07 Phase 11: the reconciliation report (countDiffs CTE) was carved into umrah-reports.ts.
const SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-reports.ts"),
  "utf8",
);

describe("Umrah financial-reconciliation count-diffs — 3×N+1 fix", () => {
  // Locate the block by the unique `systemCount` alias inside the
  // umrah reconciliation context. The block is small enough to slice
  // from the WITH preamble.
  const blockIdx = SRC.indexOf("WITH pilgrim_counts AS");
  const block = SRC.slice(blockIdx, blockIdx + 2500);

  it("the count-diffs block is locatable in the source", () => {
    expect(blockIdx).toBeGreaterThan(0);
  });

  it("no longer carries any correlated scalar COUNT subquery on umrah_pilgrims for groupId", () => {
    // The legacy shape was `(SELECT COUNT(*)... FROM umrah_pilgrims p
    // WHERE p."groupId" = ni."groupId" ...)`. All three copies are
    // gone in the fix.
    const matches = block.match(
      /\(SELECT\s+COUNT\(\*\)[^)]*\s+FROM\s+umrah_pilgrims\s+p\s+WHERE\s+p\."groupId"\s*=\s*ni\."groupId"/gi,
    );
    expect(matches?.length ?? 0).toBe(0);
  });

  it("uses a pilgrim_counts CTE keyed by (groupId, companyId)", () => {
    expect(block).toContain("WITH pilgrim_counts AS");
    expect(block).toContain('SELECT "groupId", "companyId", COUNT(*) AS "systemCount"');
    expect(block).toContain("FROM umrah_pilgrims");
    expect(block).toContain('"deletedAt" IS NULL');
    expect(block).toContain('GROUP BY "groupId", "companyId"');
  });

  it("LEFT JOINs pilgrim_counts on (groupId, companyId) so tenant boundary holds", () => {
    expect(block).toMatch(
      /LEFT JOIN pilgrim_counts pc ON pc\."groupId" = ni\."groupId" AND pc\."companyId" = ni\."companyId"/,
    );
  });

  it("WHERE clause now compares against the CTE column via COALESCE", () => {
    expect(block).toContain(`ni."mutamerCount" != COALESCE(pc."systemCount", 0)`);
  });

  it("ORDER BY clause uses the same CTE column (no more triplicated subquery)", () => {
    expect(block).toContain(
      `ORDER BY ABS(ni."mutamerCount" - COALESCE(pc."systemCount", 0)) DESC`,
    );
  });

  it("SELECT projects systemCount as ::int via COALESCE (preserves legacy type)", () => {
    expect(block).toContain(`COALESCE(pc."systemCount", 0)::int AS "systemCount"`);
  });
});
