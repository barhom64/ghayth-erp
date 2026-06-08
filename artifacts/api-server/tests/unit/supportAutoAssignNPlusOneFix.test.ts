/**
 * Support ticket auto-assign — N+1 fix on agent picker.
 *
 * POST /api/support/tickets auto-assigns a new ticket when the body
 * omits `assigneeId`. The picker query ranked agents by open-ticket
 * load + avg-resolution speed:
 *
 *   SELECT e.id, e.name,
 *          COUNT(st.id) AS "openTickets",
 *          COALESCE(
 *            (SELECT AVG(...)/3600
 *             FROM support_tickets st2
 *             WHERE st2."assigneeId" = e.id ...),
 *            999
 *          ) AS "avgResolution"
 *     FROM employees e ...
 *    ORDER BY "openTickets" ASC, "avgResolution" ASC
 *    LIMIT 5
 *
 * The correlated subquery fired once per active employee scanned
 * BEFORE the outer LIMIT 5 capped the result. A company with 200
 * active employees burned 200 AVG scans on support_tickets for what
 * was already a single-number-per-assignee aggregate.
 *
 * The fix uses one GROUP BY CTE (`avg_resolution`) keyed by
 * assigneeId, then LEFT JOINed back to the agent query.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/support.ts"),
  "utf8",
);

describe("Support auto-assign — agent picker N+1 fix", () => {
  it("no correlated AVG subquery on support_tickets st2 for st2.assigneeId = e.id remains", () => {
    expect(SRC).not.toMatch(
      /\(SELECT\s+AVG\([\s\S]*?\)\s+FROM\s+support_tickets\s+st2\s+WHERE\s+st2\."assigneeId"\s*=\s*e\.id/,
    );
  });

  it("uses an avg_resolution CTE keyed by assigneeId", () => {
    expect(SRC).toContain("WITH avg_resolution AS");
    expect(SRC).toMatch(/GROUP BY st2\."assigneeId"/);
  });

  it("LEFT JOINs the CTE back to employees by assigneeId", () => {
    expect(SRC).toMatch(
      /LEFT JOIN avg_resolution ar ON ar\."assigneeId" = e\.id/,
    );
  });

  it("COALESCEs the avg back to 999 (the cold-start sentinel)", () => {
    expect(SRC).toMatch(/COALESCE\(ar\."avgHours",\s*999\)\s*AS\s*"avgResolution"/);
  });

  it("preserves the LIMIT 5 candidate cap", () => {
    const picker = SRC.slice(SRC.indexOf("avg_resolution AS"));
    expect(picker).toMatch(/LIMIT 5/);
  });

  it("ORDER BY composite still ranks openTickets ASC then avgResolution ASC", () => {
    const picker = SRC.slice(SRC.indexOf("avg_resolution AS"));
    expect(picker).toMatch(
      /ORDER BY\s+"openTickets"\s+ASC,\s+"avgResolution"\s+ASC/,
    );
  });

  it("CTE filters to resolved + non-null resolvedAt to keep the AVG meaningful", () => {
    expect(SRC).toContain("st2.status = 'resolved'");
    expect(SRC).toContain('st2."resolvedAt" IS NOT NULL');
  });
});
