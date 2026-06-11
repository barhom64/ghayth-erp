/**
 * PR-10 (#2077) — Closure Gate: bootstrap catalog parity with migration 291.
 *
 * Migration 291 closed FU-1 for tenants that existed when it was
 * applied. The bootstrap catalog (lib/rbac/autoMigrate.ts) is the
 * code path a NEWLY-created company goes through, so it must produce
 * the same bundles for the two roles — otherwise a brand-new tenant
 * would silently reproduce the 0-modules symptom.
 *
 * Pins:
 *   • Both roles are registered in every bootstrap map (LABELS / LEVELS
 *     / COLORS / DEFAULT_SCOPE). Missing from any one map causes the
 *     symptom: ROLE_LEVELS miss → level NaN; DEFAULT_SCOPE miss → scope
 *     defaults to "self" (wrong for dept manager). The user mandate is
 *     «لا يُنتج دورًا بلا grants».
 *   • The permission shorthand uses exact feature keys
 *     (hr.payroll[.runs|.wps], hr.employees, …) — without this the
 *     payroll lane would either spill into hr.discipline (via hr:*) or
 *     express nothing (the legacy translator only knew module:*).
 *   • payroll_officer carries no hr.discipline grant and no approve on
 *     payroll runs («لا يعتمد بنفسه», migration 278) — same invariant
 *     as the migration smoke (hrStandardRoleGrantsSmoke).
 *   • department_manager defaults to scope=department.
 *   • payroll_officer defaults to scope=company.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const AUTO = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/rbac/autoMigrate.ts"), "utf8");

const PERMS_FOR = (roleKey: string): string => {
  // Match `{ role: "<key>", permissions: [ ... ] }`. Captures the array
  // literal so we can assert on what's in it without regex-matching
  // across the whole DEFAULT_ROLE_DEFS literal.
  const re = new RegExp(`\\{\\s*role:\\s*"${roleKey}",\\s*permissions:\\s*\\[([^\\]]*)\\]`);
  const m = AUTO.match(re);
  if (!m) throw new Error(`role ${roleKey} not in DEFAULT_ROLE_DEFS`);
  return m[1];
};

describe("PR-10 (#2077) — bootstrap catalog knows both standard roles", () => {
  for (const key of ["department_manager", "payroll_officer"] as const) {
    it(`${key} is registered in every bootstrap map`, () => {
      // ROLE_LABELS — used for label_ar; missing label = the role row
      // gets seeded but with the role_key as its label (visible bug).
      expect(AUTO).toMatch(new RegExp(`${key}: "[؀-ۿ]+`));
      // ROLE_LEVELS — missing entry collapses to NaN via `?? 30`; the
      // role would seed but at the wrong sort position. Live tenant
      // currently shows level=50 for both, so pin that exact value.
      expect(AUTO).toMatch(new RegExp(`${key}: 50`));
      // ROLE_DEFAULT_SCOPE — missing entry falls back to "self", which
      // for a manager role would over-clamp every grant to self-only.
      const scope = key === "department_manager" ? "department" : "company";
      expect(AUTO).toMatch(new RegExp(`${key}: "${scope}"`));
      // ROLE_COLORS — cosmetic but pinned so the role picker shows the
      // intended swatch.
      expect(AUTO).toMatch(new RegExp(`${key}: "#[0-9a-fA-F]{6}"`));
    });
  }
});

describe("PR-10 (#2077) — DEFAULT_ROLE_DEFS bundles equal migration 291 (the live-tenant seed)", () => {
  it("department_manager: hr employee/attendance/leaves/performance + reports + requests/documents/comms", () => {
    const p = PERMS_FOR("department_manager");
    for (const key of [
      "hr.employees:read",
      "hr.attendance:read",
      "hr.attendance:export",
      "hr.leaves:read",
      "hr.leaves:approve",
      "hr.leaves:reject",
      "hr.performance:read",
      "hr.performance:create",
      "hr.performance:update",
      "reports:read",
      "requests:*",
      "documents:read",
    ]) {
      expect(p, `dept_manager must carry ${key}`).toContain(`"${key}"`);
    }
    // NEVER express discipline at the manager-of-department level —
    // discipline is HR central, not departmental.
    expect(p).not.toMatch(/hr\.discipline/);
    expect(p).not.toMatch(/hr\.violations/);
  });

  it("payroll_officer: payroll/runs/wps prepare lane + attendance read + requests/documents/comms", () => {
    const p = PERMS_FOR("payroll_officer");
    for (const key of [
      "hr.payroll:read",
      "hr.payroll:export",
      "hr.payroll.runs:read",
      "hr.payroll.runs:create",
      "hr.payroll.runs:update",
      "hr.payroll.wps:read",
      "hr.payroll.wps:create",
      "hr.payroll.wps:submit",
      "hr.attendance:read",
      "requests:*",
      "documents:read",
    ]) {
      expect(p, `payroll_officer must carry ${key}`).toContain(`"${key}"`);
    }
    // The point of the bundle: NO discipline anywhere; NO approve on
    // runs ("لا يعتمد بنفسه", migration 278); NO delete on runs.
    expect(p).not.toMatch(/hr\.discipline/);
    expect(p).not.toMatch(/hr\.violations/);
    expect(p).not.toMatch(/hr\.payroll\.runs:approve/);
    expect(p).not.toMatch(/hr\.payroll\.runs:delete/);
  });
});

describe("PR-10 (#2077) — translateLegacy understands dotted feature keys", () => {
  it("dotted left-hand-side branches to direct catalog lookup", () => {
    // Without this notation extension, the bundles above couldn't be
    // expressed in the legacy shorthand: 'hr.payroll:read' would hit
    // the module-wide path (no match: modules don't contain dots), and
    // we'd be forced to choose between hr:* (leaks discipline) and
    // raw SQL (the fragmentation FU-1 already exposed). Pin the early
    // return so a refactor can't quietly delete it.
    expect(AUTO).toMatch(/if \(module\.includes\("\."\)\)\s*\{/);
    expect(AUTO).toMatch(/FEATURE_CATALOG\.find\(\(f\) => f\.key === module\)/);
  });
});
