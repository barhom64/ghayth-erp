/**
 * HR-REV-3 (#2222) — quick-activate smoke.
 *
 * POST /employees/quick-activate is a fast minimal employee creation that
 * lands the employee in a PENDING (inactive) state with an active
 * assignment + a distributed onboarding task plan, instead of the heavy
 * 46-field full-create.
 *
 * Source-only test — reads the route source with readFileSync and asserts
 * patterns with regex; NO database. The live behavior is covered by the
 * integration suite.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const EMPLOYEES_ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/employees.ts"),
  "utf8",
);

// Extract just the quick-activate handler so assertions don't accidentally
// match the heavy POST / create handler below it.
const QA_BLOCK =
  EMPLOYEES_ROUTE.match(
    /router\.post\("\/quick-activate"[\s\S]*?router\.post\("\/", authorize/,
  )?.[0] || "";

describe("HR-REV-3 (#2222) — quick-activate route registration", () => {
  it("registers POST /quick-activate gated on hr.employees:create", () => {
    expect(EMPLOYEES_ROUTE).toMatch(
      /router\.post\("\/quick-activate", authorize\(\{ feature: "hr\.employees", action: "create" \}\)/,
    );
  });
  it("the handler block was extracted", () => {
    expect(QA_BLOCK).not.toBe("");
  });
});

describe("HR-REV-3 (#2222) — pending (inactive) employee creation", () => {
  it("INSERTs the employee with status 'inactive'", () => {
    expect(QA_BLOCK).toMatch(/INSERT INTO employees[\s\S]*?VALUES[\s\S]*?'inactive'/);
  });
  it("does NOT create the employee as 'active'", () => {
    // Scope the check to the employees INSERT statement only (up to its
    // RETURNING), so it can't bleed into the employee_assignments INSERT
    // below — that one is legitimately 'active'.
    const empInsert =
      QA_BLOCK.match(/INSERT INTO employees[\s\S]*?RETURNING/)?.[0] || "";
    expect(empInsert).toMatch(/'inactive'/);
    expect(empInsert).not.toMatch(/'active'/);
  });
  it("creates the assignment in 'active' status (so activation flow finds it)", () => {
    expect(QA_BLOCK).toMatch(/INSERT INTO employee_assignments[\s\S]*?'active'/);
  });
  it("stamps activationStatus = 'pending_activation' on the hire (HR-REV-3 slice 4a)", () => {
    const empInsert = QA_BLOCK.match(/INSERT INTO employees[\s\S]*?RETURNING/)?.[0] || "";
    expect(empInsert).toMatch(/"activationStatus"/);
    expect(empInsert).toMatch(/'pending_activation'/);
  });
});

describe("HR-REV-3 (#2222) — onboarding plan + audit + numbering", () => {
  it("INSERTs into onboarding_tasks", () => {
    expect(QA_BLOCK).toMatch(/INSERT INTO onboarding_tasks/);
  });
  it("routes each onboarding task to a distributed ownerRole (HR-REV-3 slice 1)", () => {
    // Tasks are generated with an owning role + reason + mandatory + serviceType,
    // not flat title strings — so completion is distributed.
    expect(QA_BLOCK).toMatch(/INSERT INTO onboarding_tasks[\s\S]*?"ownerRole"[\s\S]*?reason[\s\S]*?mandatory[\s\S]*?"serviceType"/);
    expect(QA_BLOCK).toMatch(/buildActivationPlan\(resolvedCategory\)/);
    expect(EMPLOYEES_ROUTE).toMatch(/ownerRole:\s*"documents"/);
    expect(EMPLOYEES_ROUTE).toMatch(/ownerRole:\s*"department"/);
  });
  it("generates a per-category plan: driver ≠ accountant ≠ admin (HR-REV-4 slice)", () => {
    // The plan builder branches on the job_titles.category resolved from the
    // title, so a driver gets a vehicle/custody/GPS plan while an accountant
    // gets restricted financial access and no vehicle.
    expect(EMPLOYEES_ROUTE).toMatch(/function buildActivationPlan\(category: string \| null\)/);
    expect(EMPLOYEES_ROUTE).toMatch(/c\.includes\("driver"\)/);
    expect(EMPLOYEES_ROUTE).toMatch(/serviceType:\s*"vehicle"/);
    expect(EMPLOYEES_ROUTE).toMatch(/ownerRole:\s*"fleet"/);
    expect(EMPLOYEES_ROUTE).toMatch(/c\.includes\("account"\)/);
    // quick-activate resolves the category from job_titles to feed the plan.
    expect(QA_BLOCK).toMatch(/SELECT id, category FROM job_titles/);
  });
  it("calls createAuditLog", () => {
    expect(QA_BLOCK).toMatch(/createAuditLog\(/);
  });
  it("issues the employee number through the numbering service", () => {
    // Same numbering call token the full-create uses: issueNumber with
    // entityKey 'employee_code' against entityTable 'employees'.
    expect(QA_BLOCK).toMatch(/issueNumber\(/);
    expect(QA_BLOCK).toMatch(/entityKey: "employee_code"/);
    expect(QA_BLOCK).toMatch(/entityTable: "employees"/);
  });
});

describe("HR-REV-3 (#2222) — activation ready-gate (slice 4b)", () => {
  // PATCH /:id flips inactive→active; activation must be blocked until every
  // mandatory onboarding task is done, enforced server-side (not just in the UI).
  const PATCH_BLOCK =
    EMPLOYEES_ROUTE.match(
      /router\.patch\("\/:id"[\s\S]*?const employee = \{ id: before\.id/,
    )?.[0] || "";

  it("the PATCH /:id handler block was extracted", () => {
    expect(PATCH_BLOCK).not.toBe("");
  });
  it("gates activation only on the pending-activation statuses (not suspended re-activation)", () => {
    expect(PATCH_BLOCK).toMatch(/PENDING_ACTIVATION\s*=\s*\[\s*"inactive",\s*"pending",\s*"onboarding"\s*\]/);
    expect(PATCH_BLOCK).toMatch(/status === "active" && before\.status != null && PENDING_ACTIVATION\.includes\(before\.status\)/);
  });
  it("counts only incomplete MANDATORY onboarding tasks", () => {
    expect(PATCH_BLOCK).toMatch(/FROM onboarding_tasks[\s\S]*?mandatory IS NOT FALSE[\s\S]*?status NOT IN \('completed','skipped'\)/);
  });
  it("rejects activation with a ValidationError when any mandatory item remains", () => {
    expect(PATCH_BLOCK).toMatch(/if \(remaining > 0\)/);
    expect(PATCH_BLOCK).toMatch(/throw new ValidationError\(/);
    expect(PATCH_BLOCK).toMatch(/remainingMandatory: remaining/);
  });
});
