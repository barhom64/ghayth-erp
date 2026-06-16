/**
 * HR-REV-8 (#2222) — recruitment→employee conversion smoke.
 *
 * POST /hr/recruitment/applications/:id/hire closes the gap between
 * accepting a candidate and creating the employee record. Source-only;
 * no database.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/recruitment.ts"),
  "utf8",
);

const HIRE_BLOCK =
  SRC.match(
    /router\.post\("\/applications\/:id\/hire"[\s\S]*?router\.delete\("\/applications\/:id"/,
  )?.[0] || "";

describe("HR-REV-8 — hire endpoint registration", () => {
  it("registers POST /applications/:id/hire gated on hr.recruitment:update", () => {
    expect(SRC).toMatch(
      /router\.post\("\/applications\/:id\/hire", authorize\(\{ feature: "hr\.recruitment", action: "update" \}\)/,
    );
  });
  it("the handler block was extracted", () => {
    expect(HIRE_BLOCK).not.toBe("");
  });
});

describe("HR-REV-8 — conversion guards", () => {
  it("rejects already-hired applications", () => {
    expect(HIRE_BLOCK).toMatch(/app\.status === "hired"/);
    expect(HIRE_BLOCK).toMatch(/محوَّل إلى موظف مسبقًا/);
  });
  it("rejects rejected/withdrawn applicants", () => {
    expect(HIRE_BLOCK).toMatch(/status === "rejected" \|\| app\.status === "withdrawn"/);
  });
});

describe("HR-REV-8 — employee creation", () => {
  it("wraps the multi-table writes in withTransaction (tx-coverage)", () => {
    expect(HIRE_BLOCK).toMatch(/await withTransaction\(async \(\) =>/);
  });
  it("issues empNumber via the numbering center (numbering-coverage)", () => {
    expect(HIRE_BLOCK).toMatch(/issueNumber\(\{[\s\S]*?entityKey: "employee_code"/);
    expect(HIRE_BLOCK).toMatch(/"empNumber"/);
    expect(HIRE_BLOCK).toMatch(/UPDATE numbering_assignments SET "entityId"/);
  });
  it("inserts employee with status 'inactive'", () => {
    expect(HIRE_BLOCK).toMatch(/INSERT INTO employees[\s\S]*?'inactive'/);
  });
  it("inserts an active assignment", () => {
    expect(HIRE_BLOCK).toMatch(/INSERT INTO employee_assignments[\s\S]*?'active'/);
  });
  it("marks the application as hired", () => {
    expect(HIRE_BLOCK).toMatch(/UPDATE job_applications SET status = 'hired'/);
  });
  it("calls createAuditLog on hire", () => {
    expect(HIRE_BLOCK).toMatch(/createAuditLog\(/);
  });
  it("emits recruitment.application.hired event", () => {
    expect(HIRE_BLOCK).toMatch(/recruitment\.application\.hired/);
  });
  it("returns 201 with employeeId and guidance message", () => {
    expect(HIRE_BLOCK).toMatch(/res\.status\(201\)/);
    expect(HIRE_BLOCK).toMatch(/employeeId: empId/);
    expect(HIRE_BLOCK).toMatch(/لوحة قيد التفعيل/);
  });
});
