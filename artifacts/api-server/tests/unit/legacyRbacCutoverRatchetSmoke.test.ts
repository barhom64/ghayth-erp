/**
 * HR-018 — legacy RBAC cutover ratchet.
 *
 * Migration 269 physically dropped: user_roles, role_permissions, custom_roles,
 * permissions, roles. RBAC v2 (rbac_roles / rbac_user_roles / rbac_role_grants /
 * rbac_field_policies / rbac_approval_limits) is now the sole authority.
 *
 * This test is a one-way ratchet: if any route or middleware reintroduces a
 * SELECT/UPDATE/DELETE against the legacy tables, CI fails immediately.
 * Without this guard, schema drift could leak silently into a future PR and
 * cause "phantom permissions" (the cache 30s window in roleGuard would mask
 * the bug until a server restart).
 *
 * Comment-only mentions (// user_roles legacy …) are stripped before checking
 * so the test doesn't fight documentation.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const SCAN_DIRS = [
  join(REPO_ROOT, "artifacts/api-server/src/routes"),
  join(REPO_ROOT, "artifacts/api-server/src/middlewares"),
  join(REPO_ROOT, "artifacts/api-server/src/lib"),
];

// Legacy tables dropped in migration 269. Any code that still touches
// them is a regression. `roles` and `permissions` are too generic to
// regex safely (they collide with column names, variables, comments)
// so we only ratchet the three name-unique ones.
const FORBIDDEN_TABLES = ["user_roles", "role_permissions", "custom_roles"] as const;

// SQL verbs that would consume the legacy tables.
const SQL_READ_VERBS = ["FROM", "JOIN", "UPDATE", "INSERT INTO", "DELETE FROM"];

interface Violation {
  file: string;
  line: number;
  table: string;
  excerpt: string;
}

function* walkTs(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) yield* walkTs(p);
    else if (entry.isFile() && entry.name.endsWith(".ts")) yield p;
  }
}

function findViolations(): Violation[] {
  const violations: Violation[] = [];
  for (const dir of SCAN_DIRS) {
    for (const file of walkTs(dir)) {
      const src = readFileSync(file, "utf8");
      // Strip block + line comments so documentation references don't trip.
      const stripped = src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/[^\n]*/g, "");
      // Also strip rawQuery template comment-style lines (-- comment).
      const noSqlComments = stripped.replace(/--[^\n]*/g, "");

      for (const tbl of FORBIDDEN_TABLES) {
        // Need a SQL verb immediately before the table name (with optional
        // whitespace + optional schema-prefix) to count as a real read.
        // Word-boundaries on both sides so `user_roles` doesn't match
        // `rbac_user_roles`.
        const re = new RegExp(
          `\\b(${SQL_READ_VERBS.join("|")})\\s+(?:public\\.)?\\b${tbl}\\b`,
          "i",
        );
        if (re.test(noSqlComments)) {
          // Find approximate line number in original source.
          const lines = src.split("\n");
          const lineIdx = lines.findIndex((ln) =>
            new RegExp(`\\b${tbl}\\b`).test(ln) &&
            !ln.trim().startsWith("//") && !ln.trim().startsWith("*") && !ln.trim().startsWith("--"),
          );
          violations.push({
            file: file.replace(REPO_ROOT + "/", ""),
            line: lineIdx >= 0 ? lineIdx + 1 : 0,
            table: tbl,
            excerpt: lineIdx >= 0 ? lines[lineIdx].trim().slice(0, 120) : "",
          });
        }
      }
    }
  }
  return violations;
}

describe("HR-018 — legacy RBAC cutover ratchet (#1791 / migration 269)", () => {
  it("no route, middleware, or lib reads from the dropped legacy tables", () => {
    const violations = findViolations();
    const formatted = violations.map((v) =>
      `  ${v.file}:${v.line}  →  ${v.table}\n      ${v.excerpt}`,
    ).join("\n");
    expect(
      violations,
      `Found ${violations.length} reference(s) to legacy RBAC tables ` +
      `that were dropped by migration 269. These will fail with a Postgres ` +
      `"relation does not exist" error in production. Migrate the query to ` +
      `rbac_user_roles / rbac_roles / rbac_role_grants.\n\n${formatted}`,
    ).toEqual([]);
  });

  it("migration 269 still exists and drops the 5 legacy tables", () => {
    const mig = readFileSync(
      join(REPO_ROOT, "artifacts/api-server/src/migrations/269_drop_legacy_rbac_tables.sql"),
      "utf8",
    );
    for (const t of ["user_roles", "role_permissions", "custom_roles", "permissions", "roles"]) {
      expect(mig).toMatch(new RegExp(`DROP TABLE IF EXISTS ${t} CASCADE`));
    }
    // Make sure the policy annotations are still there so the migration
    // guard accepts it as an intentional destructive op.
    expect(mig).toMatch(/@policy:destructive/);
    expect(mig).toMatch(/@rollback:/);
  });

  it("rbac v2 tables are the authority (sanity check on roleGuard middleware)", () => {
    const src = readFileSync(
      join(REPO_ROOT, "artifacts/api-server/src/middlewares/roleGuard.ts"),
      "utf8",
    );
    expect(src).toMatch(/rbac_user_roles/);
    expect(src).toMatch(/rbac_roles/);
    // The whole point of #1791 + this ratchet: the legacy fallback path
    // is gone. roleGuard reads v2 only.
    expect(src).not.toMatch(/\bFROM\s+user_roles\b/);
    expect(src).not.toMatch(/\bFROM\s+custom_roles\b/);
  });
});
