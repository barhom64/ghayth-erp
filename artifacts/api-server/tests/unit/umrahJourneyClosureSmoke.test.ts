import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * U-19-P8 — journey-flow closure smoke.
 *
 * Scope (autonomous-class under
 * UMRAH_REMAINING_WORK_ROADMAP.md §4 + U-19 audit §3.8):
 *   - One static end-to-end pin across the journey-helper APIs +
 *     the recovery hub. The per-phase smokes each cover ONE route;
 *     this one pins the integration.
 *
 *   Chain (read path):
 *     GET /umrah/sub-agents/:id/journey   — P1
 *     GET /umrah/groups/:id/journey       — P1b
 *     GET /umrah/reports/recovery-hub     — P6
 *   Each is RBAC-gated, tenant-scoped, READ-ONLY, and surfaces
 *   either the 4-stage timeline or the 4-bucket recovery rollup.
 *
 * Non-goals (Permanent Hard Rails):
 *   - No engine change. No new column. No FE.
 *   - Observation-only smoke.
 *
 * Failure modes pinned:
 *   - Any of the 3 routes loses its authorize gate → §A fails.
 *   - The 4 stages drift on either journey endpoint → §B fails.
 *   - The 4 recovery buckets drift → §C fails.
 *   - Any of the 3 handlers gains a write (INSERT/UPDATE/JE) → §D
 *     fails (the read-only contract is the whole point of this slice).
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const ROUTES = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-journey-reports.ts"),
  "utf8",
);

// Slice each handler so the §D negative assertions can scope to it.
// Anchored on `router.get("<path>"` (the actual route definition) so
// the file-header comment block listing the same paths doesn't get
// mistaken for the route body.
const SUB_AGENT_HANDLER =
  ROUTES.match(/router\.get\(\s*\n?\s*["']\/sub-agents\/:id\/journey["'][\s\S]+?(?=^router\.|^\/\/ ─{3}|^export default)/m)?.[0] ??
  "";
const GROUP_HANDLER =
  ROUTES.match(/router\.get\(\s*\n?\s*["']\/groups\/:id\/journey["'][\s\S]+?(?=^router\.|^\/\/ ─{3}|^export default)/m)?.[0] ??
  "";
const RECOVERY_HANDLER =
  ROUTES.match(/router\.get\(\s*\n?\s*["']\/reports\/recovery-hub["'][\s\S]+?(?=^router\.|^\/\/ ─{3}|^export default)/m)?.[0] ??
  "";

// ─────────────────────────────────────────────────────────────────────────────
// §A — All 3 routes wired + authorize-gated under umrah
// ─────────────────────────────────────────────────────────────────────────────
describe("U-19-P8 §A — every journey + recovery route is wired + RBAC-gated", () => {
  it("sub-agent journey route exists + authorize(view)", () => {
    expect(ROUTES).toMatch(
      /router\.get\(\s*\n?\s*["']\/sub-agents\/:id\/journey["']/,
    );
    expect(SUB_AGENT_HANDLER).toMatch(
      /authorize\(\s*\{\s*feature:\s*["']umrah["'],\s*action:\s*["']view["']\s*\}\s*\)/,
    );
  });

  it("group journey route exists + authorize(view)", () => {
    expect(ROUTES).toMatch(
      /router\.get\(\s*\n?\s*["']\/groups\/:id\/journey["']/,
    );
    expect(GROUP_HANDLER).toMatch(
      /authorize\(\s*\{\s*feature:\s*["']umrah["'],\s*action:\s*["']view["']\s*\}\s*\)/,
    );
  });

  it("recovery hub route exists + authorize(list)", () => {
    expect(ROUTES).toMatch(
      /router\.get\(\s*\n?\s*["']\/reports\/recovery-hub["']/,
    );
    expect(RECOVERY_HANDLER).toMatch(
      /authorize\(\s*\{\s*feature:\s*["']umrah["'],\s*action:\s*["']list["']\s*\}\s*\)/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — Both journey endpoints surface the 4 canonical stages
// ─────────────────────────────────────────────────────────────────────────────
describe("U-19-P8 §B — both journey endpoints surface the 4 stages", () => {
  for (const stage of ["imported", "linked", "invoiced", "collected"]) {
    it(`sub-agent journey emits stage '${stage}'`, () => {
      expect(SUB_AGENT_HANDLER).toMatch(new RegExp(`stage:\\s*["']${stage}["']`));
    });

    it(`group journey emits stage '${stage}'`, () => {
      expect(GROUP_HANDLER).toMatch(new RegExp(`stage:\\s*["']${stage}["']`));
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — Recovery hub surfaces the 4 canonical buckets
// ─────────────────────────────────────────────────────────────────────────────
describe("U-19-P8 §C — recovery hub surfaces the 4 stuck-item buckets", () => {
  for (const bucket of [
    "stuckImports",
    "unlinkedSubAgents",
    "uninvoicedGroups",
    "unpaidInvoices",
  ]) {
    it(`bucket '${bucket}' is present in the response shape`, () => {
      expect(RECOVERY_HANDLER).toMatch(new RegExp(`${bucket}:`));
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// §D — Every handler is pure read (no writes / JE / events / audit)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-19-P8 §D — every handler is a pure SELECT (no write surface)", () => {
  const handlers: Array<[string, string]> = [
    ["sub-agent journey", SUB_AGENT_HANDLER],
    ["group journey", GROUP_HANDLER],
    ["recovery hub", RECOVERY_HANDLER],
  ];

  for (const [label, body] of handlers) {
    it(`${label} has no INSERT INTO`, () => {
      expect(body).not.toMatch(/\bINSERT\s+INTO\b/i);
    });

    it(`${label} has no UPDATE … SET`, () => {
      expect(body).not.toMatch(/\bUPDATE\s+\w+\s+SET\b/i);
    });

    it(`${label} has no DELETE FROM`, () => {
      expect(body).not.toMatch(/\bDELETE\s+FROM\b/i);
    });

    it(`${label} does not emit JE / event / audit log`, () => {
      expect(body).not.toMatch(/createGuardedJournalEntry/);
      expect(body).not.toMatch(/emitEvent\(/);
      expect(body).not.toMatch(/createAuditLog\(/);
    });
  }
});
