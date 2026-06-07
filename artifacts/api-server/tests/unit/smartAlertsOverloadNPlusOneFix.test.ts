/**
 * smartAlerts.checkEmployeeOverload — 3× N+1 fix on workload counts.
 *
 * `checkEmployeeOverload` runs hourly via `runHourlyAlerts()` in
 * lib/cronScheduler.ts. It flags employees with > 6 active tasks and
 * tries to redistribute one task to the least-loaded peer.
 *
 * The previous shape evaluated correlated COUNT(*) subqueries over
 * `tasks` THREE TIMES:
 *
 *   1. SELECT … (SELECT COUNT(*) FROM tasks t WHERE t."assignedTo" = ea.id …) AS activeTasks
 *   2. WHERE   … (SELECT COUNT(*) FROM tasks t WHERE t."assignedTo" = ea.id …) > 6
 *   3. inside the for-loop: same subquery for the least-loaded
 *      candidate-picker query
 *
 * For 200 active assignments and N overloaded employees the cron
 * fires 400 + 200·N task lookups every hour. The hot path of any
 * company that uses smart-assign.
 *
 * The fix uses a single GROUP BY CTE (`active_task_counts`) in each
 * query, keyed by `tasks."assignedTo"`. The outer queries INNER JOIN
 * (overload picker) or LEFT JOIN + COALESCE (least-loaded picker) to
 * fold the per-assignment counts back in one scan.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/smartAlerts.ts"),
  "utf8",
);

describe("smartAlerts.checkEmployeeOverload — workload N+1 fix", () => {
  const handlerIdx = SRC.indexOf("async function checkEmployeeOverload");
  const handler = SRC.slice(handlerIdx, handlerIdx + 5000);

  it("checkEmployeeOverload is locatable", () => {
    expect(handlerIdx).toBeGreaterThan(0);
  });

  it("no correlated COUNT subquery on tasks for ea.id remains", () => {
    expect(handler).not.toMatch(
      /\(SELECT\s+COUNT\(\*\)\s+FROM\s+tasks\s+t\s+WHERE\s+t\."assignedTo"\s*=\s*ea\.id/,
    );
  });

  it("both queries use active_task_counts CTE keyed by tasks.assignedTo", () => {
    const occurrences = handler.match(/WITH active_task_counts AS/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
    const groupBys = handler.match(/GROUP BY t\."assignedTo"/g) ?? [];
    expect(groupBys.length).toBeGreaterThanOrEqual(2);
  });

  it("overload picker uses INNER JOIN to the CTE so only assignments with tasks pass", () => {
    expect(handler).toMatch(
      /JOIN active_task_counts atc ON atc\."assignmentId" = ea\.id\s+WHERE/,
    );
  });

  it("least-loaded picker uses LEFT JOIN so zero-task candidates rank lowest", () => {
    expect(handler).toMatch(
      /LEFT JOIN active_task_counts atc ON atc\."assignmentId" = ea\.id/,
    );
    expect(handler).toMatch(/COALESCE\(atc\.c, 0\)\s+AS\s+workload/);
  });

  it("overload threshold remains > 6 against the CTE column", () => {
    expect(handler).toMatch(/atc\.c\s*>\s*6/);
  });

  it("least-loaded picker still excludes the overloaded employee and LIMITs to 1", () => {
    expect(handler).toMatch(/ea\."employeeId"\s*!=\s*\$2/);
    expect(handler).toMatch(/ORDER BY workload ASC LIMIT 1/);
  });

  it("CTE filters tasks to non-terminal statuses", () => {
    expect(handler).toContain("t.status NOT IN ('completed','cancelled')");
  });
});
