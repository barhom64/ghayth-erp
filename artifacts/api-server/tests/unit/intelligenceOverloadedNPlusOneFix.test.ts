/**
 * Intelligence /suggestions overloaded-employees query — 2× N+1 fix.
 *
 * GET /api/intelligence/suggestions emits an "overloaded employees"
 * suggestion bucket by listing assignments with > 6 active tasks.
 *
 * The previous shape evaluated the SAME correlated COUNT subquery
 * TWICE per assignment row — once in the SELECT (`activeTasks`) and
 * once in the WHERE (`> 6`):
 *
 *   SELECT ..., (SELECT COUNT(*) FROM tasks ... WHERE t."assignedTo" = ea.id ...) AS "activeTasks"
 *     FROM employee_assignments ea ...
 *    WHERE ea.status = 'active'
 *      AND (SELECT COUNT(*) FROM tasks ... WHERE t."assignedTo" = ea.id ...) > 6
 *
 * Postgres can sometimes fold identical subqueries, but the planner
 * is not guaranteed to — the safe path is to aggregate once.
 *
 * The fix uses a single GROUP BY CTE (`active_task_counts`) keyed by
 * assignment id, then INNER JOINs to filter + project in one pass.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/intelligence.ts"),
  "utf8",
);

describe("Intelligence /suggestions overloaded employees — 2× N+1 fix", () => {
  const handlerIdx = SRC.indexOf('router.get("/suggestions"');
  const handler = SRC.slice(handlerIdx, handlerIdx + 4500);

  it("the /suggestions handler is locatable", () => {
    expect(handlerIdx).toBeGreaterThan(0);
  });

  it("no correlated COUNT subquery on tasks for ea.id remains in the WHERE clause", () => {
    expect(handler).not.toMatch(
      /WHERE[\s\S]*?\(SELECT\s+COUNT\(\*\)\s+FROM\s+tasks\s+t\s+WHERE\s+t\."assignedTo"\s*=\s*ea\.id[\s\S]*?\)\s*::int\s*>\s*6/,
    );
  });

  it("uses an active_task_counts CTE keyed by assignment id", () => {
    expect(handler).toContain("WITH active_task_counts AS");
    expect(handler).toContain('GROUP BY t."assignedTo"');
  });

  it("INNER JOINs the CTE back to employee_assignments by id", () => {
    expect(handler).toMatch(
      /JOIN active_task_counts atc ON atc\."assignmentId" = ea\.id/,
    );
  });

  it("filters overload threshold against the CTE, not a re-evaluated subquery", () => {
    expect(handler).toMatch(/atc\.c\s*>\s*6/);
  });

  it("still projects activeTasks for the suggestion payload", () => {
    expect(handler).toMatch(/atc\.c\s+AS\s+"activeTasks"/);
  });

  it("retains the LIMIT 5 cap for the suggestions bucket", () => {
    expect(handler).toMatch(/LIMIT 5/);
  });
});
