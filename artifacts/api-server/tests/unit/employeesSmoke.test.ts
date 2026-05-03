import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/employees.ts"),
  "utf8",
);

/** Grab a fixed-length section starting at the first occurrence of marker. */
function section(marker: string, len = 5000): string {
  const idx = SRC.indexOf(marker);
  return idx === -1 ? "" : SRC.slice(idx, idx + len);
}

/** Grab the full handler body from a router registration to the next one. */
function fullHandler(marker: string): string {
  const idx = SRC.indexOf(marker);
  if (idx === -1) return "";
  const next = SRC.indexOf("\nrouter.", idx + marker.length);
  return next === -1 ? SRC.slice(idx) : SRC.slice(idx, next);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

describe("Employees — endpoint registration", () => {
  it("registers all CRUD endpoints for employees", () => {
    expect(SRC).toContain('router.get("/",');
    expect(SRC).toContain('router.post("/",');
    expect(SRC).toContain('router.get("/:id",');
    expect(SRC).toContain('router.patch("/:id",');
    expect(SRC).toContain('router.delete("/:id",');
  });

  it("registers onboarding-tasks, job-titles, documents, and obligations/seed endpoints", () => {
    expect(SRC).toContain('router.get("/onboarding-tasks",');
    expect(SRC).toContain('router.patch("/onboarding-tasks/:id",');
    expect(SRC).toContain('router.get("/job-titles",');
    expect(SRC).toContain('router.get("/documents",');
    expect(SRC).toContain('router.post("/obligations/seed",');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PERMISSIONS
// ═══════════════════════════════════════════════════════════════════════════════

describe("Employees — permissions", () => {
  it("relies on global authMiddleware from index.ts", () => {
    expect(SRC).not.toContain("router.use(authMiddleware)");
  });

  it("GET / and GET /:id require hr:read", () => {
    const listLine = section('router.get("/",', 200);
    expect(listLine).toContain('requirePermission("hr:read")');
    const detailLine = section('router.get("/:id",', 200);
    expect(detailLine).toContain('requirePermission("hr:read")');
  });

  it("POST / requires hr:create", () => {
    const line = section('router.post("/",', 200);
    expect(line).toContain('requirePermission("hr:create")');
  });

  it("PATCH /:id and PATCH /onboarding-tasks/:id require hr:update", () => {
    const patchLine = section('router.patch("/:id",', 200);
    expect(patchLine).toContain('requirePermission("hr:update")');
    const obLine = section('router.patch("/onboarding-tasks/:id",', 200);
    expect(obLine).toContain('requirePermission("hr:update")');
  });

  it("DELETE /:id requires hr:delete", () => {
    const line = section('router.delete("/:id",', 200);
    expect(line).toContain('requirePermission("hr:delete")');
  });

  it("POST /obligations/seed requires hr:update", () => {
    const line = section('router.post("/obligations/seed",', 200);
    expect(line).toContain('requirePermission("hr:update")');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// COMPANY-ID SCOPING
// ═══════════════════════════════════════════════════════════════════════════════

describe("Employees — companyId scoping", () => {
  it("GET / list uses buildScopedWhere with companyColumn on ea and enforces branch scope", () => {
    const s = section('router.get("/",', 4000);
    expect(s).toContain("buildScopedWhere");
    expect(s).toContain('companyColumn: \'ea."companyId"\'');
    expect(s).toContain("enforceBranchScope: true");
  });

  it("POST / create derives effectiveCompanyId from scope.allowedCompanies", () => {
    const s = fullHandler('router.post("/",');
    expect(s).toContain("effectiveCompanyId");
    expect(s).toContain("scope.companyId");
    expect(s).toContain("scope.allowedCompanies");
  });

  it("GET /:id scopes by ea.companyId = $2 with scope.companyId", () => {
    const s = section('router.get("/:id",', 4000);
    expect(s).toContain('ea."companyId" = $2');
    expect(s).toContain("scope.companyId");
  });

  it("PATCH /:id and DELETE /:id scope queries by companyId", () => {
    const patch = fullHandler('router.patch("/:id",');
    expect(patch).toContain('ea."companyId" = $2');
    const del = fullHandler('router.delete("/:id",');
    expect(del).toContain('ea."companyId" = $2');
  });

  it("GET /onboarding-tasks, /job-titles, and /documents scope by companyId", () => {
    const ob = section('router.get("/onboarding-tasks",', 3000);
    expect(ob).toContain('"companyId" = $1');
    const jt = section('router.get("/job-titles",', 3000);
    expect(jt).toContain('"companyId" = $1');
    const docs = section('router.get("/documents",', 3000);
    expect(docs).toContain('"companyId" = $1');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PARAMETERIZED SQL
// ═══════════════════════════════════════════════════════════════════════════════

describe("Employees — parameterized SQL", () => {
  it("GET / list uses dollar-param placeholders for LIMIT and OFFSET", () => {
    const s = section('router.get("/",', 5000);
    expect(s).toMatch(/LIMIT \$\$\{limitIdx\}/);
    expect(s).toMatch(/OFFSET \$\$\{offsetIdx\}/);
  });

  it("POST / employee and assignment inserts use positional params with RETURNING id", () => {
    const emp = section("INSERT INTO employees", 3000);
    expect(emp).toContain("$1");
    expect(emp).toContain("RETURNING id");
    const assign = section("INSERT INTO employee_assignments", 3000);
    expect(assign).toContain("$1");
    expect(assign).toContain("RETURNING id");
  });

  it("PATCH /:id builds dynamic SET clauses with $N parameterization", () => {
    const s = fullHandler('router.patch("/:id",');
    expect(s).toContain("empFields.push(`name = $${empVals.length}`");
    expect(s).toContain("empFields.push(`email = $${empVals.length}`");
  });

  it("DELETE /:id uses parameterized queries inside withTransaction", () => {
    const s = fullHandler('router.delete("/:id",');
    expect(s).toContain("$1");
    expect(s).toContain("$2");
    expect(s).toContain("withTransaction");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

describe("Employees — validation", () => {
  it("createEmployeeSchema requires name, phone, nationalId, nationality as non-empty strings", () => {
    const s = section("const createEmployeeSchema", 3000);
    expect(s).toContain("name: z.string().min(1)");
    expect(s).toContain("phone: z.string().min(1)");
    expect(s).toContain("nationalId: z.string().min(1)");
    expect(s).toContain("nationality: z.string().min(1)");
  });

  it("createEmployeeSchema validates email format and coerces salary to number", () => {
    const s = section("const createEmployeeSchema", 3000);
    expect(s).toContain("email: z.string().email()");
    expect(s).toContain("salary: z.coerce.number()");
  });

  it("POST / validates body with safeParse and throws ValidationError on failure", () => {
    const s = section('router.post("/",', 3000);
    expect(s).toContain("createEmployeeSchema.safeParse(req.body)");
    expect(s).toContain("zodParse");
  });

  it("POST / rejects salary <= 0 with field-tagged error", () => {
    const s = fullHandler('router.post("/",');
    expect(s).toContain("salaryNum <= 0");
    expect(s).toContain('field: "salary"');
    expect(s).toContain("salaryNum > 1_000_000");
  });

  it("POST / validates department existence and managerId via DB lookups", () => {
    const s = fullHandler('router.post("/",');
    expect(s).toContain("SELECT id FROM departments WHERE name = $1");
    expect(s).toContain('field: "department"');
    expect(s).toContain('SELECT id FROM employees WHERE id = $1 AND "deletedAt" IS NULL');
    expect(s).toContain('field: "managerId"');
  });

  it("POST / checks for duplicate email and nationalId with ConflictError", () => {
    const s = fullHandler('router.post("/",');
    expect(s).toContain("SELECT id FROM employees WHERE email = $1");
    expect(s).toContain('SELECT id FROM employees WHERE "nationalId" = $1');
    expect(s).toContain("ConflictError");
  });

  it("PATCH /:id validates body with patchEmployeeSchema.safeParse", () => {
    const s = section('router.patch("/:id",', 3000);
    expect(s).toContain("patchEmployeeSchema.safeParse");
    expect(s).toContain("zodParse");
  });

  it("PATCH /:id pre-checks email and nationalId uniqueness excluding self (id <> $2)", () => {
    const s = fullHandler('router.patch("/:id",');
    expect(s).toContain("id <> $2");
    expect(s).toContain('field: "email"');
    expect(s).toContain('WHERE "nationalId" = $1 AND id <> $2');
    expect(s).toContain('field: "nationalId"');
  });

  it("PATCH /:id pre-checks departmentId existence against company", () => {
    const s = fullHandler('router.patch("/:id",');
    expect(s).toContain("SELECT id FROM departments WHERE id = $1");
    expect(s).toContain('field: "departmentId"');
  });

  it("patchOnboardingTaskSchema requires status with min(1)", () => {
    const s = section("const patchOnboardingTaskSchema", 500);
    expect(s).toContain("status: z.string().min(1)");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SOFT DELETE
// ═══════════════════════════════════════════════════════════════════════════════

describe("Employees — soft delete", () => {
  it("GET / and GET /:id filter out soft-deleted rows via deletedAt IS NULL", () => {
    const list = section('router.get("/",', 5000);
    expect(list).toContain('"deletedAt" IS NULL');
    const detail = section('router.get("/:id",', 4000);
    expect(detail).toContain('"deletedAt" IS NULL');
  });

  it("DELETE /:id terminates employee and assignment status instead of hard-deleting", () => {
    const s = fullHandler('router.delete("/:id",');
    expect(s).toContain("status = 'terminated'");
    expect(s).toContain("UPDATE employee_assignments SET status = 'terminated'");
    expect(s).not.toContain("DELETE FROM employees");
  });

  it("DELETE /:id cancels pending leave requests and their approval stages", () => {
    const s = fullHandler('router.delete("/:id",');
    expect(s).toContain("UPDATE hr_leave_requests");
    expect(s).toContain("UPDATE leave_approval_stages");
    expect(s).toContain("SET status = 'cancelled'");
  });

  it("DELETE /:id deactivates contracts and cancels open tasks and approvals", () => {
    const s = fullHandler('router.delete("/:id",');
    expect(s).toContain("UPDATE employee_contracts");
    expect(s).toContain("UPDATE tasks");
    expect(s).toContain("UPDATE approval_requests");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PAGINATION
// ═══════════════════════════════════════════════════════════════════════════════

describe("Employees — pagination", () => {
  it("GET / defaults page to 1 and limit to 20", () => {
    const s = section('router.get("/",', 3000);
    expect(s).toContain('page = "1"');
    expect(s).toContain('limit: lim = "20"');
  });

  it("GET / calculates offset using Math.max and returns total/page/pageSize", () => {
    const s = section('router.get("/",', 5000);
    expect(s).toContain("Math.max(Number(page) || 1, 1) - 1");
    expect(s).toContain("total:");
    expect(s).toContain("page:");
    expect(s).toContain("pageSize:");
  });

  it("GET / runs a separate COUNT query for total", () => {
    const s = section('router.get("/",', 5000);
    expect(s).toContain("SELECT COUNT(*) AS total");
  });

  it("GET / supports search across name, email, and empNumber columns", () => {
    const s = section('router.get("/",', 3000);
    expect(s).toContain("searchColumns");
    expect(s).toContain("e.name");
    expect(s).toContain("e.email");
    expect(s).toContain('e."empNumber"');
  });

  it("GET / restricts employee-role users to their own record", () => {
    const s = section('router.get("/",', 4000);
    expect(s).toContain('scope.role === "employee"');
    expect(s).toContain("scope.employeeId");
  });

  it("GET / orders results by employee name ascending", () => {
    const s = section('router.get("/",', 5000);
    expect(s).toContain("ORDER BY e.name ASC");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AUDIT, EVENTS, OBLIGATIONS, ONBOARDING
// ═══════════════════════════════════════════════════════════════════════════════

describe("Employees — audit, events, and obligations", () => {
  it("POST / emits employee.created event and writes audit log", () => {
    const s = fullHandler('router.post("/",');
    expect(s).toContain('"employee.created"');
    expect(s).toContain("emitEvent");
    expect(s).toContain("createAuditLog");
    expect(s).toContain('action: "create"');
  });

  it("PATCH /:id emits employee.updated with before/after and builds changedFields diff", () => {
    const s = fullHandler('router.patch("/:id",');
    expect(s).toContain('"employee.updated"');
    expect(s).toContain("changedFields");
    expect(s).toContain("from:");
    expect(s).toContain("to:");
  });

  it("DELETE /:id emits employee.terminated event", () => {
    const s = fullHandler('router.delete("/:id",');
    expect(s).toContain('"employee.terminated"');
    expect(s).toContain("emitEvent");
  });

  it("POST / and PATCH /:id register expiry obligations for documents", () => {
    const post = fullHandler('router.post("/",');
    expect(post).toContain("registerEmployeeExpiryObligations");
    const patch = fullHandler('router.patch("/:id",');
    expect(patch).toContain("registerEmployeeExpiryObligations");
  });

  it("registerEmployeeExpiryObligations covers iqama, passport, work_permit, visa with dedupeKey", () => {
    const s = section("async function registerEmployeeExpiryObligations", 3000);
    expect(s).toContain('"iqama"');
    expect(s).toContain('"passport"');
    expect(s).toContain('"work_permit"');
    expect(s).toContain('"visa"');
    expect(s).toContain("dedupeKey:");
  });

  it("POST / auto-generates EMP-YYYY-NNN employee number from sequence", () => {
    const s = fullHandler('router.post("/",');
    expect(s).toContain("employee_number_seq");
    expect(s).toContain("EMP-");
    expect(s).toContain("padStart(3");
  });

  it("POST / creates 4 onboarding tasks for the new employee", () => {
    const s = fullHandler('router.post("/",');
    expect(s).toContain("INSERT INTO onboarding_tasks");
    expect(s).toContain("onboardingTasksCreated: 4");
  });

  it("POST / auto-creates user account with temp password when email is provided", () => {
    const s = fullHandler('router.post("/",');
    expect(s).toContain("INSERT INTO users");
    expect(s).toContain("hashPassword");
    expect(s).toContain("tempPassword");
  });

  it("POST / copies active salary components to the new employee", () => {
    const s = fullHandler('router.post("/",');
    expect(s).toContain("INSERT INTO employee_salary_components");
    expect(s).toContain("salary_components");
  });

  it("PATCH /:id records salary changes in salary_history table", () => {
    const s = fullHandler('router.patch("/:id",');
    expect(s).toContain("INSERT INTO salary_history");
    expect(s).toContain("oldSalary");
    expect(s).toContain("newSalary");
  });

  it("POST /obligations/seed scans active employees and registers expiry obligations", () => {
    const s = fullHandler('router.post("/obligations/seed",');
    expect(s).toContain("registerEmployeeExpiryObligations");
    expect(s).toContain("scannedEmployees");
    expect(s).toContain("employeesProcessed");
  });
});
