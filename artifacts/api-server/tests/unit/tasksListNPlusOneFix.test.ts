/**
 * Tasks list endpoint — N+1 fix static guard.
 *
 * The original `GET /tasks` query (added in PR #1537's multi-assignee
 * work) carried a correlated scalar subquery on task_assignees in its
 * SELECT list:
 *
 *     (SELECT COUNT(*)::int FROM task_assignees ta
 *      WHERE ta."taskId" = t.id AND ta."removedAt" IS NULL)
 *       AS "assigneeCount"
 *
 * Postgres planned that subquery once per returned row, so at the
 * route's 500-task page limit a single list call fired 501 index
 * lookups through task_assignees. Same N+1 shape as the employees /
 * fleet / workflows / admin / my-space fixes (#1564, #1586, #1588,
 * #1593, #1597), applied to a sixth table.
 *
 * The fix swaps the scalar subquery for a CTE that pre-aggregates
 * counts once (one scan + hash aggregate filtered to active rows)
 * and joins the per-task result back via a LEFT JOIN.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/tasks.ts"),
  "utf8",
);

describe("GET /tasks — task_assignees N+1 fix", () => {
  // Slice the list handler — sits between `router.get("/"` and the
  // entity-search endpoint.
  const handlerIdx = SRC.indexOf('router.get("/"');
  const handler = SRC.slice(
    handlerIdx,
    SRC.indexOf('router.get("/entity-search"'),
  );

  it("handler is anchored at GET /", () => {
    expect(handlerIdx).toBeGreaterThan(0);
  });

  it("no longer carries a correlated scalar subquery on task_assignees inside the SELECT", () => {
    expect(handler).not.toMatch(
      /\(SELECT\s+COUNT\(\*\)::int\s+FROM\s+task_assignees/,
    );
  });

  it("uses a CTE (WITH assignee_counts AS) to pre-aggregate counts once", () => {
    expect(handler).toContain("WITH assignee_counts AS");
    expect(handler).toContain('SELECT "taskId", COUNT(*) AS "assigneeCount"');
    expect(handler).toContain("FROM task_assignees");
    expect(handler).toContain('GROUP BY "taskId"');
  });

  it("preserves the removedAt IS NULL filter inside the CTE (active assignees only)", () => {
    expect(handler).toContain('"removedAt" IS NULL');
  });

  it("joins assignee_counts back to tasks by taskId", () => {
    expect(handler).toMatch(
      /LEFT JOIN assignee_counts ac ON ac\."taskId" = t\.id/,
    );
  });

  it("COALESCEs the count so tasks with no assignees return 0 (not NULL)", () => {
    expect(handler).toContain('COALESCE(ac."assigneeCount", 0)::int');
  });
});
