/**
 * PR-9a (#2077) — Standard role grants seed fix (FU-1 close).
 *
 * Live measurement in PR-8a found department_manager + payroll_officer
 * logging in with 0 sidebar modules: payroll_officer had a role row
 * (migration 278) but zero rbac_role_grants; department_manager had NO
 * rbac_roles row at all, so the persona bind (INSERT…SELECT on the
 * role_key) silently inserted nothing.
 *
 * Pins:
 *   • Migration 291 seeds the department_manager role row + grant
 *     bundles for BOTH roles (idempotent WHERE NOT EXISTS — same
 *     pattern as the standard catalog seed, 258).
 *   • payroll_officer's bundle is the payroll lane ONLY — no
 *     hr.discipline, no approve on runs («لا يعتمد بنفسه», 278).
 *   • department_manager's bundle is scope='department' — وحداته لا
 *     كل النظام.
 *   • Grants use exact feature keys / module-level wildcards only:
 *     the authz engine matches feature_key === feature OR
 *     `<moduleKey>.*` OR `*` (authzEngine.ts), so a sub-namespace
 *     wildcard like 'hr.payroll.*' would be a dead grant.
 *   • roleGuard's ROLE_DEFAULT_MODULES carries both roles — that map
 *     (not the grants table) is what requireModule consults, so
 *     without these entries the sidebar would promise modules the
 *     module mounts deny.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROLE_MODULE_DEFAULTS } from "../../src/lib/rbac/roleModulesCatalog.js";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const MIGRATION = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/migrations/306_seed_standard_role_grants_fix.sql"), "utf8");
const ROLE_GUARD = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/middlewares/roleGuard.ts"), "utf8");
const JOURNEY = readFileSync(
  join(REPO_ROOT, "scripts/verify-hr-identity-sidebar-journey.sh"), "utf8");

// SQL with `--` comment lines stripped — the doctrine prose in the
// header mentions the very keys the pins forbid (hr.discipline,
// hr.payroll.*), so analysis must look at executable SQL only.
const SQL = MIGRATION.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

/** All INSERT INTO rbac_role_grants statements targeting a given role_key. */
function grantBlocksOf(roleKey: string): string[] {
  return SQL.split(";")
    .filter((s) => s.includes("INSERT INTO rbac_role_grants") && s.includes(`role_key='${roleKey}'`));
}

describe("PR-9a (#2077) — migration 291: both roles get real grant bundles", () => {
  it("seeds the missing department_manager role row (the silent-bind root cause)", () => {
    expect(MIGRATION).toMatch(/SELECT NULL, 'department_manager', 'مدير القسم'/);
    expect(MIGRATION).toMatch(/WHERE NOT EXISTS \(SELECT 1 FROM rbac_roles WHERE role_key='department_manager' AND "companyId" IS NULL\)/);
  });

  it("department_manager: ≥4 grants, HR ones scoped to department (وحداته لا كل النظام)", () => {
    const blocks = grantBlocksOf("department_manager");
    expect(blocks.length).toBeGreaterThanOrEqual(4);
    for (const key of ["hr.employees", "hr.attendance", "hr.leaves", "hr.performance"]) {
      const block = blocks.find((b) => b.includes(`'${key}'`));
      expect(block, `department_manager grant for ${key}`).toBeDefined();
      expect(block, `${key} must be department-scoped`).toMatch(/'department'/);
    }
  });

  it("payroll_officer: the payroll lane (runs + wps + payroll umbrella)", () => {
    const blocks = grantBlocksOf("payroll_officer");
    expect(blocks.length).toBeGreaterThanOrEqual(4);
    for (const key of ["hr.payroll", "hr.payroll.runs", "hr.payroll.wps"]) {
      expect(blocks.some((b) => b.includes(`'${key}'`)), `payroll_officer grant for ${key}`).toBe(true);
    }
  });

  it("payroll_officer gets NO hr.discipline grant and NO approve on runs (لا يعتمد بنفسه)", () => {
    const blocks = grantBlocksOf("payroll_officer");
    expect(blocks.some((b) => b.includes("hr.discipline"))).toBe(false);
    const runs = blocks.find((b) => b.includes("'hr.payroll.runs'"))!;
    expect(runs).toBeDefined();
    expect(runs).not.toMatch(/'approve'/);
    expect(runs).not.toMatch(/'delete'/);
  });

  it("no dead sub-namespace wildcards — engine only matches exact / <module>.* / *", () => {
    // 'hr.payroll.*' etc. would never match in authzEngine; only
    // top-level module wildcards (requests.*, documents.*) are legal.
    const subWildcards = SQL.match(/'[a-z]+\.[a-z_.]+\.\*'/g) ?? [];
    expect(subWildcards).toEqual([]);
  });

  it("idempotent: every grant INSERT is guarded by WHERE NOT EXISTS", () => {
    const inserts = MIGRATION.match(/INSERT INTO rbac_role_grants[\s\S]*?;/g) ?? [];
    expect(inserts.length).toBeGreaterThanOrEqual(10);
    for (const ins of inserts) {
      expect(ins).toMatch(/NOT EXISTS \(SELECT 1 FROM rbac_role_grants/);
    }
  });

  it("clones role + grants per company (is_template=FALSE) — /auth/me only surfaces non-templates", () => {
    // authSession.ts filters `r.is_template = FALSE` when building
    // userRoles: a bind to the bare template authorizes fine but shows
    // a 0-module sidebar — the original FU-1 symptom. The seed must
    // therefore materialize per-company clones, like every standard
    // role that already works (employee/driver/hr_manager).
    expect(MIGRATION).toMatch(/SELECT c\.id, t\.role_key, t\.label_ar, t\.label_en, t\.description, t\.level, t\.is_system, FALSE, TRUE/);
    expect(MIGRATION).toMatch(/JOIN rbac_roles cr ON cr\.role_key = tr\.role_key AND cr\."companyId" IS NOT NULL/);
    // …and repairs binds that landed on the bare template.
    expect(MIGRATION).toMatch(/UPDATE rbac_user_roles ur\s+SET role_id = cr\.id/);
  });
});

describe("PR-9a (#2077) — roleGuard module map carries both roles (mount gate ≠ dead sidebar)", () => {
  // PR-2 / #2163 — the per-role static map was inlined twice (once in
  // roleGuard.ts, once in permissions.ts). Both consumers now re-export
  // from lib/rbac/roleModulesCatalog. The PR-9a invariants are still
  // pinned — we just read the data from the catalog instead of grepping
  // the consumer's source file.
  it("ROLE_MODULE_DEFAULTS has hr-bearing entries for both roles", () => {
    expect(ROLE_MODULE_DEFAULTS.department_manager.modules).toEqual(
      expect.arrayContaining(["home", "hr", "requests", "documents", "reports", "comms"]),
    );
    expect(ROLE_MODULE_DEFAULTS.payroll_officer.modules).toEqual(
      expect.arrayContaining(["home", "hr", "requests", "documents", "comms"]),
    );
  });
  it("ROLE_MODULE_DEFAULTS levels mirror the rbac_roles.level (50) for both", () => {
    expect(ROLE_MODULE_DEFAULTS.department_manager.level).toBe(50);
    expect(ROLE_MODULE_DEFAULTS.payroll_officer.level).toBe(50);
  });
});

describe("PR-9a (#2077) — the journey asserts, never skips (no return to 0 modules)", () => {
  it("dept/payroll module counts are HARD assertions now", () => {
    expect(JOURNEY).toMatch(/department_manager still 0 modules/);
    expect(JOURNEY).toMatch(/payroll_officer still 0 modules/);
    expect(JOURNEY).not.toMatch(/dept role may be absent/);
    expect(JOURNEY).not.toMatch(/payroll role may be absent/);
  });
  it("journey probes the lane separation (payroll 200 / discipline 403)", () => {
    expect(JOURNEY).toMatch(/\/hr\/discipline\/memos/);
    expect(JOURNEY).toMatch(/expected 403/);
  });
});
