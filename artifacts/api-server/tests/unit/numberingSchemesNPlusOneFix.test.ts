/**
 * Numbering schemes list — N+1 fix static guard.
 *
 * The numbering-schemes list endpoint carried a correlated scalar
 * subquery on numbering_assignments:
 *
 *     (SELECT COUNT(*)::int FROM numbering_assignments a
 *      WHERE a."schemeId" = s.id) AS "assignmentCount"
 *
 * Postgres planned that once per returned row, so a company with N
 * numbering schemes fired N+1 lookups through
 * numbering_assignments. Same N+1 shape as the earlier fixes
 * (#1564 → #1629), applied to a fifteenth table.
 *
 * The fix swaps the scalar subquery for a CTE that pre-aggregates
 * assignment counts once and joins the per-scheme result back via
 * LEFT JOIN.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/numbering.ts"),
  "utf8",
);

describe("Numbering schemes list — numbering_assignments N+1 fix", () => {
  // The block is uniquely identifiable by the
  // assignmentCount column alias.
  const blockIdx = SRC.indexOf('AS "assignmentCount"');
  const block = SRC.slice(blockIdx - 2500, blockIdx + 800);

  it("the numbering-schemes list query is locatable", () => {
    expect(blockIdx).toBeGreaterThan(0);
  });

  it("no longer carries a correlated scalar COUNT subquery on numbering_assignments", () => {
    // The legacy shape was `(SELECT COUNT(*)::int FROM
    // numbering_assignments a WHERE a."schemeId" = s.id)`.
    expect(block).not.toMatch(
      /\(SELECT\s+COUNT\([^)]+\)::int\s+FROM\s+numbering_assignments\s+a\s+WHERE\s+a\."schemeId"\s*=\s*s\.id\)/,
    );
  });

  it("uses a CTE (WITH assignment_counts AS) to pre-aggregate counts once", () => {
    expect(block).toContain("WITH assignment_counts AS");
    expect(block).toContain('SELECT "schemeId", COUNT(*) AS "assignmentCount"');
    expect(block).toContain("FROM numbering_assignments");
    expect(block).toContain('GROUP BY "schemeId"');
  });

  it("joins assignment_counts back to numbering_schemes by schemeId", () => {
    expect(block).toMatch(
      /LEFT JOIN assignment_counts ac ON ac\."schemeId" = s\.id/,
    );
  });

  it("COALESCEs the count so schemes with no assignments return 0::int (not NULL)", () => {
    expect(block).toContain('COALESCE(ac."assignmentCount", 0)::int');
  });
});
