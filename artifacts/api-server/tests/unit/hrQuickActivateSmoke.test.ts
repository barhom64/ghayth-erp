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
});

describe("HR-REV-3 (#2222) — onboarding plan + audit + numbering", () => {
  it("INSERTs into onboarding_tasks", () => {
    expect(QA_BLOCK).toMatch(/INSERT INTO onboarding_tasks/);
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
