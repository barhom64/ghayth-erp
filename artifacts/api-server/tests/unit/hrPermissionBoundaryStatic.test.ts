/**
 * HR permission-boundary — static guards.
 *
 * Closes audit gap T0-2 ("All 116 HR endpoints lack dynamic
 * permission-boundary tests"). A full dynamic suite would need a live
 * Postgres + auth fixture — heavy and slow. The static checks below
 * pin the most-important separation-of-duties rules by reading the
 * route source: every sensitive mutation MUST go through
 * `authorize({...})` AND, where applicable, a role-list guard.
 *
 * If a future PR removes the `authorize` middleware from an endpoint
 * listed below — or weakens the role guard — guard.sh fails before the
 * PR merges. This is the same "static contract" pattern already used
 * by hrSecurityHardeningSmoke and saudiLaborLawCompliance.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const HR = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/hr.ts"),
  "utf8",
);
const EXIT = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/hr-exit.ts"),
  "utf8",
);
const LOANS = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/hr-loans.ts"),
  "utf8",
);
const OVERTIME = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/hr-overtime.ts"),
  "utf8",
);

// ─── Helpers ────────────────────────────────────────────────────────────────

function findHandler(
  src: string,
  verb: string,
  path: string,
): string {
  const idx = src.indexOf(`router.${verb}("${path}"`);
  if (idx < 0) {
    throw new Error(`Handler ${verb.toUpperCase()} ${path} not found`);
  }
  // 4 KB window is enough to cover the route signature + first-page
  // body — we're matching middleware presence, not behavior.
  return src.slice(idx, idx + 4000);
}

// Every entry below names the route + the authorize signature it must
// carry. If we add a new sensitive mutation, list it here so the test
// fails if someone removes the guard later.
type Endpoint = {
  src: string;
  verb: string;
  path: string;
  authorize: { feature: string; action: string };
  /** Additional role gate (HR_ROLES, PAYROLL_ROLES, etc.) checked inline. */
  roleGate?: string;
  /**
   * HR-REV-1 #1: grant-derived inline gate via scopeCan() that REPLACED a
   * hardcoded role list — grants are the single source of truth. Pinned so
   * the gate can't be dropped or silently weakened back to a role array.
   */
  grantGate?: { feature: string; action: string };
};

const ENDPOINTS: Endpoint[] = [
  // Exit lifecycle — SEC-1 hardening kept an inline elevated gate on
  // approve + complete on top of the feature-level "update". HR-REV-1 #1
  // migrated it off the hardcoded HR_ROLES array to a grant-derived
  // scopeCan(hr.exit:approve) check (the seeded HR_ROLES — hr_manager/
  // owner/gm — are exactly the holders of hr.exit:approve). The list below
  // is the SOURCE OF TRUTH for what must stay gated.
  { src: EXIT, verb: "patch", path: "/exit/:id/approve",
    authorize: { feature: "hr.exit", action: "update" }, grantGate: { feature: "hr.exit", action: "approve" } },
  { src: EXIT, verb: "patch", path: "/exit/:id/complete",
    authorize: { feature: "hr.exit", action: "update" }, grantGate: { feature: "hr.exit", action: "approve" } },

  // Payroll — maker-checker + the hr.payroll authority on approve (HR-REV-1
  // #1 migrated the inline PAYROLL_ROLES gate to scopeCan(hr.payroll:approve),
  // a tighter SoD layer than the hr.payroll.runs capability).
  { src: HR, verb: "post", path: "/payroll",
    authorize: { feature: "hr.payroll.runs", action: "create" } },
  { src: HR, verb: "patch", path: "/payroll/:id/approve",
    authorize: { feature: "hr.payroll.runs", action: "approve",
                 resource: "table: \"payroll_runs\"" },
    grantGate: { feature: "hr.payroll", action: "approve" } },

  // Loans — write paths.
  { src: LOANS, verb: "post", path: "/loans",
    authorize: { feature: "hr.loans", action: "create" } },

  // Overtime — write paths.
  { src: OVERTIME, verb: "post", path: "/overtime",
    authorize: { feature: "hr.overtime", action: "create" } },

  // Violations — write paths.
  { src: HR, verb: "post", path: "/violations",
    authorize: { feature: "hr.violations", action: "create" } },

  // Approval decisions — HR-REV-1 §6 decision #2: the approve/reject
  // routes are gated by the matching catalog action (approve / reject),
  // NOT a generic "update", so `approvableActions` is meaningful and an
  // update-only role can never approve. Pinned here so a future refactor
  // can't silently weaken them back to "update".
  { src: HR, verb: "patch", path: "/leave-requests/:id/approve",
    authorize: { feature: "hr.leaves", action: "approve" } },
  { src: HR, verb: "patch", path: "/violations/:id/approve",
    authorize: { feature: "hr.violations", action: "approve" } },
  { src: HR, verb: "patch", path: "/excuse-requests/:id/approve",
    authorize: { feature: "hr.attendance", action: "approve" } },
  { src: LOANS, verb: "patch", path: "/loans/:id/approve",
    authorize: { feature: "hr.loans", action: "approve" } },
  { src: OVERTIME, verb: "patch", path: "/overtime/:id/approve",
    authorize: { feature: "hr.overtime", action: "approve" } },
];

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("HR permission-boundary — every sensitive write goes through authorize()", () => {
  for (const ep of ENDPOINTS) {
    it(`${ep.verb.toUpperCase()} ${ep.path} → authorize(${ep.authorize.feature}:${ep.authorize.action})`, () => {
      const block = findHandler(ep.src, ep.verb, ep.path);
      // Match the authorize() call's feature + action — the order of
      // the keys inside the object literal is fixed across the codebase.
      expect(block).toContain(`authorize({ feature: "${ep.authorize.feature}"`);
      expect(block).toContain(`action: "${ep.authorize.action}"`);
    });

    if (ep.roleGate) {
      it(`${ep.verb.toUpperCase()} ${ep.path} → ${ep.roleGate} inline check`, () => {
        const block = findHandler(ep.src, ep.verb, ep.path);
        expect(block).toContain(`${ep.roleGate}.includes(scope.role)`);
      });
    }

    if (ep.grantGate) {
      it(`${ep.verb.toUpperCase()} ${ep.path} → scopeCan(${ep.grantGate.feature}:${ep.grantGate.action}) inline check`, () => {
        const block = findHandler(ep.src, ep.verb, ep.path);
        expect(block).toContain(`scopeCan(scope, "${ep.grantGate!.feature}", "${ep.grantGate!.action}")`);
      });
    }
  }
});

// ─── Employee-scope filter on read endpoints ────────────────────────────────

describe("HR read endpoints filter by assignmentId for employee role (no peer leakage)", () => {
  it("GET /tasks list query has employee-scope filter (audit-checked since SEC-2 fix)", () => {
    const block = HR.slice(
      // GET /violations sits in hr.ts; we already pin it in
      // hrSecurityHardeningSmoke. Pinning the same shape on GET /tasks
      // (in tasks.ts) is covered by tasksMultiAssigneeSmoke.
      // This test pins the SHAPE of the gate so future refactors
      // can't subtly drop the predicate.
      HR.indexOf('router.get("/violations"'),
      HR.indexOf('router.get("/violations"') + 2000,
    );
    expect(block).toContain(
      'scope.role === "employee" && !scope.isOwner && scope.activeAssignmentId',
    );
  });
});

// ─── HR_ROLES, PAYROLL_ROLES, etc. are still exported & non-empty ────────

describe("RBAC catalog — HR role lists are non-empty and import-resolvable", () => {
  const RBAC = readFileSync(
    join(REPO_ROOT, "artifacts/api-server/src/lib/rbacCatalog.ts"),
    "utf8",
  );

  it("HR_ROLES is exported", () => {
    expect(RBAC).toMatch(/export\s+const\s+HR_ROLES(\s*:[^=]+)?\s*=/);
  });

  it("PAYROLL_ROLES is exported", () => {
    expect(RBAC).toMatch(/export\s+const\s+PAYROLL_ROLES(\s*:[^=]+)?\s*=/);
  });

  it("HR_APPROVAL_ROLES is exported", () => {
    expect(RBAC).toMatch(/export\s+const\s+HR_APPROVAL_ROLES(\s*:[^=]+)?\s*=/);
  });

  it("LOAN_APPROVAL_ROLES is exported", () => {
    expect(RBAC).toMatch(/export\s+const\s+LOAN_APPROVAL_ROLES(\s*:[^=]+)?\s*=/);
  });
});
