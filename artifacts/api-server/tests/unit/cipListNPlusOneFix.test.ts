/**
 * Finance CIP (construction in progress) list endpoint — N+1 fix
 * static guard.
 *
 * The original `GET /finance/algorithms/cip` query carried a
 * correlated scalar subquery on cip_costs in its SELECT list:
 *
 *     COALESCE((SELECT COUNT(*) FROM cip_costs cc
 *               WHERE cc."cipId" = cip.id AND cc."deletedAt" IS NULL), 0)
 *      AS "costEntryCount"
 *
 * Postgres planned that subquery once per returned row, so at the
 * route's 500-project page limit a single list call fired 501 index
 * lookups through cip_costs. Same N+1 shape as the employees /
 * fleet / workflows / admin / my-space / tasks fixes (#1564, #1586,
 * #1588, #1593, #1597, #1613), applied to a seventh table.
 *
 * The fix swaps the scalar subquery for a CTE that pre-aggregates
 * cost-entry counts (one scan + hash aggregate filtered to active
 * rows) and joins the per-project result back via a LEFT JOIN.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/finance-algorithms.ts"),
  "utf8",
);

describe("GET /finance/algorithms/cip — cip_costs N+1 fix", () => {
  const handlerIdx = SRC.indexOf('financeAlgorithmsRouter.get("/cip"');
  const handler = SRC.slice(handlerIdx, handlerIdx + 3500);

  it("handler is anchored at GET /cip", () => {
    expect(handlerIdx).toBeGreaterThan(0);
  });

  it("no longer carries a correlated scalar subquery on cip_costs", () => {
    expect(handler).not.toMatch(
      /SELECT\s+COUNT\(\*\)\s+FROM\s+cip_costs/,
    );
  });

  it("uses a CTE (WITH cost_counts AS) to pre-aggregate counts once", () => {
    expect(handler).toContain("WITH cost_counts AS");
    expect(handler).toContain('SELECT "cipId", COUNT(*) AS "costEntryCount"');
    expect(handler).toContain("FROM cip_costs");
    expect(handler).toContain('GROUP BY "cipId"');
  });

  it("preserves the deletedAt IS NULL filter inside the CTE", () => {
    expect(handler).toContain('"deletedAt" IS NULL');
  });

  it("joins cost_counts back to construction_in_progress by cipId", () => {
    expect(handler).toMatch(
      /LEFT JOIN cost_counts cc ON cc\."cipId" = cip\.id/,
    );
  });

  it("COALESCEs the count so projects with no costs return 0 (not NULL)", () => {
    expect(handler).toContain('COALESCE(cc."costEntryCount", 0)');
  });
});
