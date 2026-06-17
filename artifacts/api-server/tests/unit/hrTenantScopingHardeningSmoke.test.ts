/**
 * HR tenant-scoping hardening — leave-request validation queries that were
 * keyed on employeeId alone (no companyId), plus shift-assignments join and
 * excuse-request duplicate checks. Self-scoped so low blast radius, but a
 * multi-company employee could see cross-tenant counts. Defense-in-depth:
 * every read now carries companyId.
 *
 * Source-only; no database.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/hr.ts"),
  "utf8",
);

describe("HR leave-request validations are tenant-scoped", () => {
  it("annual-leave used SUM filters companyId", () => {
    expect(SRC).toMatch(
      /SELECT COALESCE\(SUM\(days\), 0\) AS used FROM hr_leave_requests\s+WHERE "companyId" = \$1/,
    );
  });

  it("overlap check filters companyId", () => {
    expect(SRC).toMatch(
      /SELECT id FROM hr_leave_requests\s+WHERE "companyId" = \$1 AND "employeeId" = \$2 AND status IN \('pending','approved'\)/,
    );
  });

  it("once-per-career check filters companyId", () => {
    expect(SRC).toMatch(
      /SELECT id FROM hr_leave_requests\s+WHERE "companyId" = \$1 AND "employeeId" = \$2 AND "leaveTypeId" = \$3 AND status = 'approved'/,
    );
  });
});

describe("HR shift-assignments + excuse checks are tenant-scoped", () => {
  it("shift-assignments list joins employee_assignments on companyId", () => {
    expect(SRC).toMatch(
      /JOIN employee_assignments ea ON ea\.id = esa\."assignmentId" AND ea\."companyId" = \$1/,
    );
  });

  it("excuse duplicate check (POST) filters companyId", () => {
    expect(SRC).toMatch(
      /SELECT id FROM hr_excuse_requests\s+WHERE "companyId" = \$1 AND "assignmentId" = \$2 AND "excuseDate" = \$3 AND status != 'rejected'/,
    );
  });

  it("approved-excuse lookup (attendance) filters companyId", () => {
    expect(SRC).toMatch(
      /SELECT id, "estimatedMinutes" FROM hr_excuse_requests\s+WHERE "companyId" = \$1 AND "assignmentId" = \$2 AND "excuseDate" = \$3/,
    );
  });
});
