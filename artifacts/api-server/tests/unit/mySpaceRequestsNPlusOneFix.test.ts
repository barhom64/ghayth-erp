/**
 * mySpace /requests endpoint — N+1 fix static guard.
 *
 * The original `GET /my-space/requests` query carried a correlated
 * scalar subquery on workflow_step_actions in its SELECT list:
 *
 *     (SELECT COUNT(*) FROM workflow_step_actions wsa
 *      WHERE wsa."instanceId" = wi.id) AS "actionCount"
 *
 * Postgres planned that subquery once per returned row, so at the
 * route's 500-instance page limit a single list call fired 501 index
 * lookups through workflow_step_actions. Same N+1 shape as the
 * employees / fleet / workflows / admin fixes (#1564, #1586, #1588,
 * #1593), applied to a fifth table.
 *
 * The fix swaps the scalar subquery for a CTE that pre-aggregates
 * action counts once (one scan + hash aggregate) and joins the
 * per-instance result back via a LEFT JOIN.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/mySpace.ts"),
  "utf8",
);

describe("GET /my-space/requests — workflow_step_actions N+1 fix", () => {
  const handlerIdx = SRC.indexOf('router.get("/requests"');
  const handler = SRC.slice(handlerIdx, handlerIdx + 3500);

  it("handler is anchored at GET /requests", () => {
    expect(handlerIdx).toBeGreaterThan(0);
  });

  it("no longer carries a correlated scalar subquery on workflow_step_actions", () => {
    expect(handler).not.toMatch(
      /SELECT\s+COUNT\(\*\)\s+FROM\s+workflow_step_actions/,
    );
  });

  it("uses a CTE (WITH action_counts AS) to pre-aggregate counts once", () => {
    expect(handler).toContain("WITH action_counts AS");
    expect(handler).toContain('SELECT "instanceId", COUNT(*) AS "actionCount"');
    expect(handler).toContain("FROM workflow_step_actions");
    expect(handler).toContain('GROUP BY "instanceId"');
  });

  it("joins action_counts back to workflow_instances by instanceId", () => {
    expect(handler).toMatch(
      /LEFT JOIN action_counts ac ON ac\."instanceId" = wi\.id/,
    );
  });

  it("COALESCEs the count so instances with no actions return 0 (not NULL)", () => {
    expect(handler).toContain('COALESCE(ac."actionCount", 0)::int');
  });
});
