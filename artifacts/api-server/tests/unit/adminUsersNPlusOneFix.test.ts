/**
 * Admin users list endpoint — N+1 fix static guard.
 *
 * The original `GET /admin/users` query carried a correlated scalar
 * subquery on security_log in its SELECT list:
 *
 *     (SELECT COUNT(*) FROM security_log sl
 *      WHERE sl."userId" = u.id AND sl.reason = 'auth_failed'
 *        AND sl."createdAt" > NOW() - INTERVAL '7 days')
 *       AS "failedAttempts7d"
 *
 * Postgres planned that subquery once per returned row, so at the
 * route's 500-user page limit a single list call fired 501 index
 * lookups through security_log. Same N+1 shape as the employees,
 * fleet, and workflows fixes (PR #1564, #1586, #1588), applied to a
 * fourth table.
 *
 * The fix swaps the scalar subquery for a CTE that pre-aggregates
 * the failed-login counts (one scan over the same 7-day window) and
 * joins the per-user result back via a LEFT JOIN.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/admin.ts"),
  "utf8",
);

describe("GET /admin/users — security_log N+1 fix", () => {
  const handlerIdx = SRC.indexOf('router.get("/users"');
  const handler = SRC.slice(handlerIdx, handlerIdx + 3500);

  it("handler is anchored at GET /users", () => {
    expect(handlerIdx).toBeGreaterThan(0);
  });

  it("no longer carries a correlated scalar subquery on security_log", () => {
    expect(handler).not.toMatch(
      /SELECT\s+COUNT\(\*\)\s+FROM\s+security_log/,
    );
  });

  it("uses a CTE (WITH failed_login_counts AS) to pre-aggregate counts once", () => {
    expect(handler).toContain("WITH failed_login_counts AS");
    expect(handler).toContain('SELECT "userId", COUNT(*) AS "failedAttempts7d"');
    expect(handler).toContain("FROM security_log");
    expect(handler).toContain("reason = 'auth_failed'");
    expect(handler).toContain('GROUP BY "userId"');
  });

  it("preserves the 7-day window filter inside the CTE", () => {
    expect(handler).toContain(`"createdAt" > NOW() - INTERVAL '7 days'`);
  });

  it("joins failed_login_counts back to users by userId", () => {
    expect(handler).toMatch(
      /LEFT JOIN failed_login_counts flc ON flc\."userId" = u\.id/,
    );
  });

  it("COALESCEs the count so users with no failed logins return 0 (not NULL)", () => {
    expect(handler).toContain('COALESCE(flc."failedAttempts7d", 0)::int');
  });
});
