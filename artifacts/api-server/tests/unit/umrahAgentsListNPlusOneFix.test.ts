/**
 * Umrah agents list — pilgrimCount N+1 fix static guard.
 *
 * The agents list endpoint carried a correlated scalar COUNT
 * subquery on umrah_pilgrims for the `pilgrimCount` column:
 *
 *     (SELECT COUNT(*)::int FROM umrah_pilgrims p
 *      WHERE p."agentId" = a.id
 *        AND p."companyId" = a."companyId"
 *        AND p."deletedAt" IS NULL) AS "pilgrimCount"
 *
 * Postgres planned that as one execution per returned agent. Same
 * N+1 shape as the earlier 23 sites already fixed in this session.
 * Twenty-fourth site.
 *
 * The fix swaps the scalar subquery for a CTE that pre-aggregates
 * agent pilgrim counts once and joins them back via LEFT JOIN keyed
 * by (agentId, companyId) so the tenant boundary is preserved.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
// U-07 Phase 13 — the agent-balances report (which owns the
// agent_pilgrim_counts CTE) was carved into umrah-reports.ts.
const SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-reports.ts"),
  "utf8",
);

describe("Umrah agents list — pilgrimCount N+1 fix", () => {
  const blockIdx = SRC.indexOf("WITH agent_pilgrim_counts AS");
  const block = SRC.slice(blockIdx, blockIdx + 3000);

  it("the agents-list block is locatable", () => {
    expect(blockIdx).toBeGreaterThan(0);
  });

  it("no correlated scalar COUNT subquery on umrah_pilgrims for agentId = a.id remains", () => {
    expect(block).not.toMatch(
      /\(SELECT\s+COUNT\(\*\)::int\s+FROM\s+umrah_pilgrims\s+p\s+WHERE\s+p\."agentId"\s*=\s*a\.id/,
    );
  });

  it("uses an agent_pilgrim_counts CTE to pre-aggregate counts once", () => {
    expect(block).toContain("WITH agent_pilgrim_counts AS");
    expect(block).toContain('SELECT "agentId", "companyId", COUNT(*) AS "pilgrimCount"');
    expect(block).toContain("FROM umrah_pilgrims");
    expect(block).toContain('"deletedAt" IS NULL');
    expect(block).toContain('"agentId" IS NOT NULL');
    expect(block).toContain('GROUP BY "agentId", "companyId"');
  });

  it("LEFT JOINs agent_pilgrim_counts back to umrah_agents by (agentId, companyId)", () => {
    expect(block).toMatch(
      /LEFT JOIN agent_pilgrim_counts apc\s+ON apc\."agentId" = a\.id AND apc\."companyId" = a\."companyId"/,
    );
  });

  it("COALESCEs the pilgrimCount so agents with no pilgrims return 0::int", () => {
    expect(block).toContain('COALESCE(apc."pilgrimCount", 0)::int AS "pilgrimCount"');
  });
});
