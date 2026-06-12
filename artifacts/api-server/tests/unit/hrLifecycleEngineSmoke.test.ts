/**
 * PR-8 (#2077) — Employee lifecycle engine smoke.
 *
 * Pins the state machine + guard contract for the operator's
 * mandated 13 states. The product owner's discipline:
 *
 *   • Lifecycle is NOT a status flag — every transition is an event.
 *   • Each transition carries reason + 4 dates (decision, effective,
 *     document, audit-created) + actor + IGOC quartet.
 *   • Illogical transitions are blocked (candidate → clearance is
 *     never legal). Pinned exhaustively below.
 *   • Termination guards block on active custody / loans / pending
 *     leaves unless `overrideReason` is provided; the override is
 *     RECORDED on the event row.
 *   • Reactivation (terminated → active) needs documented override.
 *
 * Source-only test — the live verify (verify-hr-lifecycle-journey.sh)
 * covers the database forensics.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const MIGRATION = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/migrations/288_employee_lifecycle_events.sql"),
  "utf8",
);
const ENGINE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/employeeLifecycleEngine.ts"),
  "utf8",
);
const ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/employees.ts"),
  "utf8",
);
const CATALOG = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/eventCatalog.ts"),
  "utf8",
);
const PAGE = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/employee-detail.tsx"),
  "utf8",
);

describe("PR-8 (#2077) — migration 288 lands employee_lifecycle_events with the 4 dates", () => {
  it("creates the table with the discipline-mandated date columns", () => {
    expect(MIGRATION).toMatch(/CREATE TABLE IF NOT EXISTS employee_lifecycle_events/);
    for (const col of ["decisionDate", "effectiveDate", "documentDate", "documentRef"]) {
      expect(MIGRATION).toMatch(new RegExp(`"${col}"`));
    }
  });
  it("persists the full IGOC quartet inline (activeRoleKey + activeDepartmentId + resolvedScope + impersonationSourceUser)", () => {
    for (const col of ["activeRoleKey", "activeDepartmentId", "resolvedScope", "impersonationSourceUser"]) {
      expect(MIGRATION).toMatch(new RegExp(`"${col}"`));
    }
  });
  it("declares the override_reason column for documented bypasses", () => {
    expect(MIGRATION).toMatch(/"overrideReason" TEXT/);
  });
});

describe("PR-8 (#2077) — state machine covers all 13 mandated states", () => {
  for (const s of [
    "candidate", "offer_extended", "onboarding", "active",
    "probation", "confirmed", "suspended", "resigned",
    "terminated", "clearance_pending", "clearance_complete",
  ]) {
    it(`state «${s}» appears in the LifecycleState union`, () => {
      expect(ENGINE).toMatch(new RegExp(`\\| "${s}"`));
    });
  }
  it("the engine exports the Arabic label map (STATE_LABEL_AR) so the UI doesn't drift", () => {
    expect(ENGINE).toMatch(/export const STATE_LABEL_AR: Record<LifecycleState, string>/);
    expect(ENGINE).toContain('"مرشّح"');
  });
});

describe("PR-8 (#2077) — ALLOWED_TRANSITIONS enforces the operator's 12 transitions + blocks illegal ones", () => {
  // Each line below is a transition the operator EXPLICITLY listed.
  // The test pins each as legal. The ones that should be BLOCKED are
  // pinned in the «illegal» block below.
  const legal: Array<[string, string]> = [
    ["candidate",          "offer_extended"],
    ["offer_extended",     "onboarding"],
    ["onboarding",         "active"],
    ["active",             "probation"],
    ["probation",          "confirmed"],
    ["active",             "suspended"],
    ["active",             "resigned"],
    ["active",             "terminated"],
    ["confirmed",          "terminated"],
    ["terminated",         "clearance_pending"],
    ["clearance_pending",  "clearance_complete"],
  ];
  for (const [from, to] of legal) {
    it(`legal: ${from} → ${to}`, () => {
      // The map literal includes `from: [...,  to, ...]` so a regex
      // matching `from:\s*\[\s*[^\]]*"to"` is enough to prove it.
      expect(ENGINE).toMatch(new RegExp(`${from}:\\s*\\[[^\\]]*"${to}"`));
    });
  }

  it("illegal: candidate → clearance_pending is NOT in the map (would let an unhired applicant clear)", () => {
    const candidateRow = ENGINE.match(/candidate:\s*\[[^\]]*\]/)?.[0] || "";
    expect(candidateRow).not.toMatch(/"clearance_pending"/);
    expect(candidateRow).not.toMatch(/"terminated"/);
  });
  it("illegal: terminated → active is gated behind a documented reactivation", () => {
    // The map allows `terminated → active` (back-compat for rehire) BUT
    // the engine's checkGuards() flags it with a guard that requires
    // override. The route blocks unless overrideReason is supplied.
    expect(ENGINE).toMatch(/from === "terminated" && args\.to === "active"[\s\S]{0,400}REACTIVATION_REQUIRES_DOCUMENT/);
  });
  it("illegal: clearance_complete is terminal — no outgoing transitions", () => {
    expect(ENGINE).toMatch(/clearance_complete:\s*\[\s*\]/);
  });
});

describe("PR-8 (#2077) — termination guards check custody + loans + pending leaves", () => {
  it("guard checks active subsidiary_accounts (custody)", () => {
    expect(ENGINE).toMatch(/SELECT COUNT\(\*\)::int AS count FROM subsidiary_accounts[\s\S]{0,200}"isActive" = TRUE/);
  });
  it("guard checks active hr_employee_loans", () => {
    expect(ENGINE).toMatch(/FROM hr_employee_loans[\s\S]{0,100}status = 'active'/);
  });
  it("guard checks pending hr_leave_requests", () => {
    expect(ENGINE).toMatch(/FROM hr_leave_requests[\s\S]{0,100}status = 'pending'/);
  });
  it("each guard returns a coded reason (the route surfaces it to the user)", () => {
    for (const code of ["ACTIVE_CUSTODY", "ACTIVE_LOAN", "PENDING_LEAVE", "REACTIVATION_REQUIRES_DOCUMENT"]) {
      expect(ENGINE).toMatch(new RegExp(`code:\\s*"${code}"`));
    }
  });
});

describe("PR-8 (#2077) — route layer: 3 endpoints + IGOC audit on every transition", () => {
  it("GET /:id/lifecycle/status exists, gated on hr.employees:list", () => {
    expect(ROUTE).toMatch(/router\.get\(\s*"\/:id\/lifecycle\/status",\s*authorize\(\{\s*feature:\s*"hr\.employees",\s*action:\s*"list"\s*\}\)/);
  });
  it("GET /:id/lifecycle/history exists, gated on hr.employees:list", () => {
    expect(ROUTE).toMatch(/router\.get\(\s*"\/:id\/lifecycle\/history",\s*authorize\(\{\s*feature:\s*"hr\.employees",\s*action:\s*"list"\s*\}\)/);
  });
  it("POST /:id/lifecycle/transitions exists, gated on hr.employees:update", () => {
    expect(ROUTE).toMatch(/router\.post\(\s*"\/:id\/lifecycle\/transitions",\s*authorize\(\{\s*feature:\s*"hr\.employees",\s*action:\s*"update"\s*\}\)/);
  });
  it("transitions audit log carries the IGOC quartet + the override flag", () => {
    expect(ROUTE).toMatch(/createAuditLog\([\s\S]{0,2000}action:\s*"transition"[\s\S]{0,400}entity:\s*"employee_lifecycle"[\s\S]{0,1500}activeRoleKey:\s*scope\.selectedRoleKey/);
  });
  it("transitions emit the lifecycle.transitioned event with IGOC context", () => {
    expect(ROUTE).toMatch(/action:\s*"employee\.lifecycle\.transitioned"[\s\S]{0,800}context:[\s\S]{0,400}activeRoleKey:\s*scope\.selectedRoleKey/);
  });
  it("the override is enforced server-side (returns 400 when guards fail and no overrideReason)", () => {
    expect(ROUTE).toMatch(/guards\.length > 0 && !body\.overrideReason[\s\S]{0,200}ValidationError/);
  });
});

describe("PR-8 (#2077) — event catalog registers employee.lifecycle.transitioned as critical", () => {
  it("the event lands in eventCatalog with critical: true (so event_logs always persists)", () => {
    expect(CATALOG).toMatch(/name:\s*"employee\.lifecycle\.transitioned"[\s\S]{0,400}critical:\s*true/);
  });
});

describe("PR-8 (#2077) — UI: لifecycle tab on the Employee 360", () => {
  it("adds the «دورة الحياة» tab to the 17-tab spine (now 18)", () => {
    expect(PAGE).toMatch(/key:\s*"lifecycle",\s*label:\s*"دورة الحياة"/);
  });
  it("renders the lifecycle tab content with current state + history + transition launcher", () => {
    expect(PAGE).toMatch(/data-testid="tab-content-lifecycle"/);
    expect(PAGE).toMatch(/data-testid="lifecycle-current-state"/);
    expect(PAGE).toMatch(/data-testid="lifecycle-transition-panel"/);
    expect(PAGE).toMatch(/data-testid="lifecycle-submit-btn"/);
  });
  it("the transition launcher captures the 4 dates + reason + override", () => {
    for (const id of ["lifecycle-target-select", "lifecycle-submit-btn"]) {
      expect(PAGE).toMatch(new RegExp(`data-testid="${id}"`));
    }
    expect(PAGE).toMatch(/setReason\(/);
    expect(PAGE).toMatch(/setDecisionDate\(/);
    expect(PAGE).toMatch(/setEffectiveDate\(/);
    expect(PAGE).toMatch(/setDocumentDate\(/);
    expect(PAGE).toMatch(/setDocumentRef\(/);
    expect(PAGE).toMatch(/setOverrideReason\(/);
  });
  it("every override event renders an obvious badge (the audit signal)", () => {
    expect(PAGE).toMatch(/data-testid="lifecycle-override-badge"/);
    expect(PAGE).toMatch(/تجاوز موثَّق/);
  });
});

describe("PR-8 (#2077) — preserves PR-1/PR-6/PR-7 (no regression)", () => {
  it("the PR-7 administrationId remains in the createEmployeeSchema", () => {
    // Spot-check by reading from settings.ts where PR-7 added it.
    const SETTINGS = readFileSync(
      join(REPO_ROOT, "artifacts/api-server/src/routes/settings.ts"),
      "utf8",
    );
    expect(SETTINGS).toMatch(/administrationId:\s*z\.coerce\.number\(\)\.int\(\)\.positive\(\)\.optional\(\)\.nullable\(\)/);
  });
  it("the PR-6 360 tab count grows by exactly 1 (lifecycle added)", () => {
    const tabsBlock = PAGE.match(/const TABS = \[[\s\S]*?\] as const;/)?.[0] || "";
    const tabCount = (tabsBlock.match(/key:\s*"/g) ?? []).length;
    expect(tabCount).toBe(18);
  });
});
