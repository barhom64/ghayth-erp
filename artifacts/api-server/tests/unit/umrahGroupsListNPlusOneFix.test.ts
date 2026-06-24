/**
 * Umrah groups list endpoint — 5×N+1 fix static guard.
 *
 * The WORST N+1 pattern fixed in this session. The umrah-groups
 * list endpoint carried FIVE correlated scalar subqueries per row:
 *
 *   2 on umrah_nusk_invoices:
 *     (SELECT COUNT(*) ...)  AS "nuskInvoiceCount"
 *     (SELECT SUM(totalAmount) ...) AS "nuskCostTotal"
 *
 *   3 on umrah_pilgrims:
 *     (SELECT COUNT(*) ... status IN ('arrived','active','overstayed'))
 *      AS "pilgrimsInside"
 *     (SELECT COUNT(*) ... status = 'overstayed') AS "pilgrimsOverstayed"
 *     (SELECT COUNT(*) ... visaExpiry < CURRENT_DATE + INTERVAL '7 days')
 *      AS "visaAtRisk"
 *
 * 500 groups × 5 subqueries = 2501 lookups across two tables. This
 * is the worst aggregate count fixed in the N+1 sweep — even worse
 * than the 3×N+1 in property owners (PR #1629) and the 2×N+1 in
 * nusk-invoices itself (PR #1621).
 *
 * The fix uses TWO CTEs:
 *   - nusk_stats: count + sum in a single GROUP BY scan.
 *   - pilgrim_stats: three counters via COUNT(*) FILTER (WHERE ...)
 *     in a single GROUP BY scan.
 *
 * Both CTEs preserve the original `AND ni/p."companyId" =
 * g."companyId"` tenant boundary by carrying companyId through into
 * the join condition (LEFT JOIN ON (groupId, companyId)).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
// U-07 Phase 22 — GET /umrah/groups (the N+1-fixed list) carved into umrah-groups.ts.
const SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-groups.ts"),
  "utf8",
);

describe("Umrah groups list — 5×N+1 fix", () => {
  const blockIdx = SRC.indexOf("WITH nusk_stats AS");
  const block = SRC.slice(blockIdx, blockIdx + 4000);

  it("the groups-list query is locatable", () => {
    expect(blockIdx).toBeGreaterThan(0);
  });

  it("no longer carries any correlated COUNT/SUM subquery on umrah_nusk_invoices for groupId", () => {
    expect(block).not.toMatch(
      /\(SELECT\s+COUNT\(\*\)\s+FROM\s+umrah_nusk_invoices\s+ni\s+WHERE\s+ni\."groupId"\s*=\s*g\.id/,
    );
    expect(block).not.toMatch(
      /\(SELECT\s+SUM\([^)]+\)\s+FROM\s+umrah_nusk_invoices\s+ni\s+WHERE\s+ni\."groupId"\s*=\s*g\.id/,
    );
  });

  it("no longer carries any correlated COUNT subquery on umrah_pilgrims for groupId", () => {
    expect(block).not.toMatch(
      /\(SELECT\s+COUNT\(\*\)\s+FROM\s+umrah_pilgrims\s+p\s+WHERE\s+p\."groupId"\s*=\s*g\.id/,
    );
  });

  it("uses a nusk_stats CTE that collapses both COUNT + SUM into ONE scan", () => {
    expect(block).toContain("WITH nusk_stats AS");
    expect(block).toContain('COUNT(*) AS "nuskInvoiceCount"');
    expect(block).toContain('COALESCE(SUM("totalAmount"), 0) AS "nuskCostTotal"');
    expect(block).toContain("FROM umrah_nusk_invoices");
    expect(block).toContain('"nuskStatus" != \'cancelled\'');
    expect(block).toContain('GROUP BY "groupId", "companyId"');
  });

  it("uses a pilgrim_stats CTE with COUNT(*) FILTER for all three counters", () => {
    expect(block).toContain("pilgrim_stats AS");
    expect(block).toContain(
      `COUNT(*) FILTER (WHERE status IN ('arrived','active','overstayed')) AS "pilgrimsInside"`,
    );
    expect(block).toContain(
      `COUNT(*) FILTER (WHERE status = 'overstayed') AS "pilgrimsOverstayed"`,
    );
    expect(block).toContain('AS "visaAtRisk"');
    expect(block).toContain(`status NOT IN ('departed','cancelled','deceased','visa_rejected')`);
    expect(block).toContain(`"visaExpiry" < CURRENT_DATE + INTERVAL '7 days'`);
  });

  it("LEFT JOINs both CTEs back to umrah_groups by (groupId, companyId)", () => {
    expect(block).toMatch(
      /LEFT JOIN nusk_stats ns ON ns\."groupId" = g\.id AND ns\."companyId" = g\."companyId"/,
    );
    expect(block).toMatch(
      /LEFT JOIN pilgrim_stats ps ON ps\."groupId" = g\.id AND ps\."companyId" = g\."companyId"/,
    );
  });

  it("COALESCEs all 5 derived counters so groups with no data return 0", () => {
    expect(block).toContain('COALESCE(ns."nuskInvoiceCount", 0) AS "nuskInvoiceCount"');
    expect(block).toContain('COALESCE(ns."nuskCostTotal", 0) AS "nuskCostTotal"');
    expect(block).toContain('COALESCE(ps."pilgrimsInside", 0) AS "pilgrimsInside"');
    expect(block).toContain('COALESCE(ps."pilgrimsOverstayed", 0) AS "pilgrimsOverstayed"');
    expect(block).toContain('COALESCE(ps."visaAtRisk", 0) AS "visaAtRisk"');
  });
});
