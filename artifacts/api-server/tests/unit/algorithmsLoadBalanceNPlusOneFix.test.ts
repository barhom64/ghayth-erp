/**
 * loadBalanceAssign — N+1 fix on workload count.
 *
 * `loadBalanceAssign` in lib/algorithms.ts is called by smart-assign
 * (POST /api/intelligence/smart-assign), support auto-assign, the
 * proactive engine's task-routing logic, and a couple of automation
 * paths. It loads every active assignment in the company alongside
 * their current task workload.
 *
 * The previous shape evaluated a correlated scalar COUNT subquery
 * per active assignment over the `tasks` table:
 *
 *   (SELECT COUNT(*) FROM tasks t
 *    WHERE t."assignedTo" = ea.id AND t."companyId" = $1
 *    AND t.status NOT IN ('completed','cancelled'))::int AS workload
 *
 * For a company with 200 active assignments that's 200 lookups
 * against `tasks` per smart-assign call. With smart-assign being on
 * the hot path of every new ticket / task / cargo / property
 * maintenance ingest, this query runs many times per minute.
 *
 * The fix uses a single GROUP BY CTE (`workload_counts`) keyed by
 * `tasks."assignedTo"`, then LEFT JOINs back to active assignments.
 * COALESCE → 0 for assignments with no active tasks.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/algorithms.ts"),
  "utf8",
);

describe("loadBalanceAssign — workload N+1 fix", () => {
  const handlerIdx = SRC.indexOf("export async function loadBalanceAssign");
  const handler = SRC.slice(handlerIdx, handlerIdx + 3500);

  it("loadBalanceAssign is locatable", () => {
    expect(handlerIdx).toBeGreaterThan(0);
  });

  it("no correlated COUNT subquery on tasks for ea.id remains", () => {
    expect(handler).not.toMatch(
      /\(SELECT\s+COUNT\(\*\)\s+FROM\s+tasks\s+t\s+WHERE\s+t\."assignedTo"\s*=\s*ea\.id/,
    );
  });

  it("uses a workload_counts CTE keyed by tasks.assignedTo", () => {
    expect(handler).toContain("WITH workload_counts AS");
    expect(handler).toMatch(/GROUP BY t\."assignedTo"/);
  });

  it("LEFT JOINs the CTE back to employee_assignments by id", () => {
    expect(handler).toMatch(
      /LEFT JOIN workload_counts wc ON wc\."assignmentId" = ea\.id/,
    );
  });

  it("COALESCEs workload to 0 for assignments with no active tasks", () => {
    expect(handler).toMatch(/COALESCE\(wc\.workload,\s*0\)\s+AS\s+workload/);
  });

  it("ORDER BY workload ASC preserved (load-balance picks the least-loaded)", () => {
    expect(handler).toMatch(/ORDER BY\s+workload\s+ASC/);
  });

  it("CTE filters tasks to non-terminal statuses", () => {
    expect(handler).toContain("t.status NOT IN ('completed','cancelled')");
  });

  it("CTE scopes to the company via companyId = $1", () => {
    expect(handler).toMatch(/WHERE\s+t\."companyId"\s*=\s*\$1/);
  });
});
