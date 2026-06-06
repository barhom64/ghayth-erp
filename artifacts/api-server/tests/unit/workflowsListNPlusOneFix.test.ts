/**
 * Workflows definitions list endpoint — N+1 fix static guard.
 *
 * The original `GET /workflows/definitions` query carried a correlated
 * scalar subquery in its SELECT list:
 *
 *     (SELECT COUNT(*) FROM workflow_steps ws
 *      WHERE ws."definitionId" = wd.id) AS "stepCount"
 *
 * Postgres planned that subquery once per returned row, so at the
 * route's 500-definition page limit a single list call fired 501
 * index lookups through workflow_steps. Same N+1 shape as the
 * employees and fleet fixes (PR #1564, #1586).
 *
 * The fix swaps the scalar subquery for a CTE that pre-aggregates
 * step counts once (one scan + hash aggregate) and joins the
 * per-definition counts back via a LEFT JOIN.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/workflows.ts"),
  "utf8",
);

describe("GET /workflows/definitions — workflow_steps N+1 fix", () => {
  const handlerIdx = SRC.indexOf('router.get("/definitions"');
  const handler = SRC.slice(handlerIdx, handlerIdx + 3000);

  it("handler is anchored at GET /definitions", () => {
    expect(handlerIdx).toBeGreaterThan(0);
  });

  it("no longer carries a correlated scalar subquery on workflow_steps", () => {
    expect(handler).not.toMatch(
      /SELECT\s+COUNT\(\*\)\s+FROM\s+workflow_steps/,
    );
  });

  it("uses a CTE (WITH step_counts AS) to pre-aggregate counts once", () => {
    expect(handler).toContain("WITH step_counts AS");
    expect(handler).toContain('SELECT "definitionId", COUNT(*) AS "stepCount"');
    expect(handler).toContain('FROM workflow_steps');
    expect(handler).toContain('GROUP BY "definitionId"');
  });

  it("joins step_counts back to definitions by definitionId", () => {
    expect(handler).toMatch(
      /LEFT JOIN step_counts sc ON sc\."definitionId" = wd\.id/,
    );
  });

  it("COALESCEs the count so definitions with no steps return 0 (not NULL)", () => {
    expect(handler).toContain('COALESCE(sc."stepCount", 0)::int');
  });
});
