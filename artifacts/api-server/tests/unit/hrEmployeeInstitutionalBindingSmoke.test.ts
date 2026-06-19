/**
 * PR-1 (#2077) — Employee creation institutional binding smoke.
 *
 * Pins the contract between the wizard and the backend so a future PR
 * can't silently drop a mandatory binding (and so the wizard's «الموظف
 * ككيان تشغيلي مؤسسي» promise stays defensible).
 *
 * The doctrine from #2077 says: «نعدل معالج إنشاء الموظف فقط» — we don't
 * build a new creation engine. The existing 11-effect transaction is
 * extended with three bridge inserts (team / project / committee) and
 * two assignment columns (positionId / categoryKey). This test pins:
 *
 *   1. Schema accepts the six new fields (5 mandatory + 1 optional).
 *   2. Route handler rejects the five mandatories with a typed
 *      ValidationError (field-tagged) unless the company is bootstrap.
 *   3. The transaction writes positionId + categoryKey on the
 *      assignment row.
 *   4. The transaction calls INSERT on each of the three bridge
 *      tables (team_memberships / project_assignments /
 *      committee_memberships).
 *   5. The wizard form carries selects for each of the six fields.
 *   6. The 4 new entity-select components exist and target the
 *      correct backend endpoint.
 *
 * Source-only test (no DB), matching the project convention for
 * structural pins (see hrWave1ScaffoldSmoke for the pattern).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const EMPLOYEES_ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/employees.ts"),
  "utf8",
);
const EMPLOYEES_CREATE_PAGE = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/create/employee-create-form.tsx"),
  "utf8",
);
const ENTITY_SELECTS = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/components/shared/entity-selects.tsx"),
  "utf8",
);

describe("PR-1 (#2077) — createEmployeeSchema accepts the 6 institutional fields", () => {
  // Each field is added as `.optional().nullable()` in zod so the
  // bootstrap case (first employee in a company) still validates. The
  // route handler enforces mandatoriness for non-bootstrap callers.
  it("positionId on schema (int / positive / optional)", () => {
    expect(EMPLOYEES_ROUTE).toMatch(/positionId:\s*z\.coerce\.number\(\)\.int\(\)\.positive\(\)\.optional\(\)\.nullable\(\)/);
  });
  it("categoryKey on schema (string / max 40 / optional)", () => {
    expect(EMPLOYEES_ROUTE).toMatch(/categoryKey:\s*z\.string\(\)\.trim\(\)\.min\(1\)\.max\(40\)\.optional\(\)\.nullable\(\)/);
  });
  it("teamId on schema", () => {
    expect(EMPLOYEES_ROUTE).toMatch(/teamId:\s*z\.coerce\.number\(\)\.int\(\)\.positive\(\)\.optional\(\)\.nullable\(\)/);
  });
  it("projectId on schema", () => {
    expect(EMPLOYEES_ROUTE).toMatch(/projectId:\s*z\.coerce\.number\(\)\.int\(\)\.positive\(\)\.optional\(\)\.nullable\(\)/);
  });
  it("costCenterId on schema", () => {
    expect(EMPLOYEES_ROUTE).toMatch(/costCenterId:\s*z\.coerce\.number\(\)\.int\(\)\.positive\(\)\.optional\(\)\.nullable\(\)/);
  });
  it("committeeId on schema", () => {
    expect(EMPLOYEES_ROUTE).toMatch(/committeeId:\s*z\.coerce\.number\(\)\.int\(\)\.positive\(\)\.optional\(\)\.nullable\(\)/);
  });
});

describe("PR-1 (#2077) — route rejects the 5 mandatories with field-tagged errors", () => {
  // The handler derives `isBootstrapEmployee` from the active-employee
  // count and skips mandatoriness only when the company is empty. The
  // ValidationError throws below are how the frontend's
  // useFieldErrors.setApiError highlights the exact input.
  it("bootstrap detection counts active employee_assignments", () => {
    expect(EMPLOYEES_ROUTE).toMatch(/isBootstrapEmployee\s*=\s*Number\(activeEmpCount[^)]*\)\s*===\s*0/);
  });
  it("rejects missing positionId with field=positionId", () => {
    expect(EMPLOYEES_ROUTE).toMatch(/if\s*\(!positionId\)[\s\S]{0,200}field:\s*"positionId"/);
  });
  it("rejects missing categoryKey with field=categoryKey", () => {
    expect(EMPLOYEES_ROUTE).toMatch(/if\s*\(!categoryKey\)[\s\S]{0,200}field:\s*"categoryKey"/);
  });
  it("rejects missing teamId with field=teamId", () => {
    expect(EMPLOYEES_ROUTE).toMatch(/if\s*\(!teamId\)[\s\S]{0,200}field:\s*"teamId"/);
  });
  it("rejects missing projectId with field=projectId", () => {
    expect(EMPLOYEES_ROUTE).toMatch(/if\s*\(!projectId\)[\s\S]{0,200}field:\s*"projectId"/);
  });
  it("rejects missing costCenterId with field=costCenterId", () => {
    expect(EMPLOYEES_ROUTE).toMatch(/if\s*\(!costCenterId\)[\s\S]{0,200}field:\s*"costCenterId"/);
  });
  it("rejects missing managerId with field=managerId (was previously soft-optional)", () => {
    expect(EMPLOYEES_ROUTE).toMatch(/if\s*\(!managerId\)[\s\S]{0,200}field:\s*"managerId"/);
  });
});

describe("PR-1 (#2077) — route validates each id belongs to the company", () => {
  it("position lookup gated on companyId-or-system + isActive", () => {
    expect(EMPLOYEES_ROUTE).toMatch(/SELECT id FROM positions[\s\S]{0,200}"companyId" = \$2 OR "companyId" IS NULL[\s\S]{0,80}"isActive" = TRUE/);
  });
  it("employee_categories lookup gated on companyId-or-system + isActive", () => {
    expect(EMPLOYEES_ROUTE).toMatch(/SELECT "categoryKey" FROM employee_categories[\s\S]{0,200}"companyId" = \$2 OR "companyId" IS NULL[\s\S]{0,80}"isActive" = TRUE/);
  });
  it("teams lookup gated on company + isActive", () => {
    expect(EMPLOYEES_ROUTE).toMatch(/SELECT id FROM teams WHERE id = \$1 AND "companyId" = \$2 AND "isActive" = TRUE/);
  });
  it("projects lookup gated on company + not deleted", () => {
    expect(EMPLOYEES_ROUTE).toMatch(/SELECT id FROM projects WHERE id = \$1 AND "companyId" = \$2 AND "deletedAt" IS NULL/);
  });
  it("cost_centers lookup gated on company", () => {
    expect(EMPLOYEES_ROUTE).toMatch(/SELECT id FROM cost_centers WHERE id = \$1 AND "companyId" = \$2/);
  });
  it("committees lookup gated on company + isActive", () => {
    expect(EMPLOYEES_ROUTE).toMatch(/SELECT id FROM committees WHERE id = \$1 AND "companyId" = \$2 AND "isActive" = TRUE/);
  });
});

describe("PR-1 (#2077) — assignment row carries positionId + categoryKey", () => {
  it("INSERT into employee_assignments now lists positionId and categoryKey", () => {
    expect(EMPLOYEES_ROUTE).toMatch(/INSERT INTO employee_assignments[\s\S]{0,400}"positionId"[\s\S]{0,40}"categoryKey"/);
  });
  it("placeholders extended to $11/$12 for position + category (was $10 = managerId only)", () => {
    expect(EMPLOYEES_ROUTE).toMatch(/VALUES \(\$1,\$2,\$3,\$4,\$5,\$6,\$7,\$8,\$9,true,'active',\$10,\$11,\$12\)/);
  });
});

describe("PR-1 (#2077) — three bridge inserts inside the transaction", () => {
  it("INSERT into employee_team_memberships", () => {
    expect(EMPLOYEES_ROUTE).toMatch(/INSERT INTO employee_team_memberships[\s\S]{0,200}"assignmentId","teamId"/);
  });
  it("INSERT into employee_project_assignments carries costCenterId", () => {
    expect(EMPLOYEES_ROUTE).toMatch(/INSERT INTO employee_project_assignments[\s\S]{0,300}"costCenterId"/);
  });
  it("INSERT into employee_committee_memberships (optional, gated on committeeId)", () => {
    expect(EMPLOYEES_ROUTE).toMatch(/if \(committeeId\)[\s\S]{0,300}INSERT INTO employee_committee_memberships/);
  });
});

describe("PR-1 (#2077) — audit + event log carry the new bindings", () => {
  // The audit row stores `after.{positionId,categoryKey,teamId,…}` so
  // a forensic question ("when did employee 42 join project 17?") is
  // answerable from audit_logs alone, without joining the bridge
  // tables (which may be soft-ended).
  it("audit log after.payload includes positionId", () => {
    expect(EMPLOYEES_ROUTE).toMatch(/createAuditLog\([\s\S]{0,2000}after:\s*\{[\s\S]{0,800}positionId/);
  });
  it("event log payload includes the institutional binding ids", () => {
    expect(EMPLOYEES_ROUTE).toMatch(/emitEvent\([\s\S]{0,2000}details:[\s\S]{0,1500}positionId[\s\S]{0,100}categoryKey[\s\S]{0,100}teamId/);
  });
  it("response body surfaces institutional binding so the UI can render «الموظف مرتبط بـ …»", () => {
    expect(EMPLOYEES_ROUTE).toMatch(/institutional:\s*\{[\s\S]{0,400}positionId[\s\S]{0,80}categoryKey[\s\S]{0,80}teamId/);
  });
});

describe("PR-1 (#2077) — audit + event carry IGOC actor context (review concern #5)", () => {
  // The reviewer required that audit AND event record:
  //   الشركة (companyId), الفرع (branchId), الدور النشط (activeRoleKey),
  //   المستخدم (userId), and the chosen institutional fields.
  // companyId / branchId / userId / activeRoleKey are the four IGOC
  // context fields the audit_logs schema already provides (migration
  // 284). emitEvent has no branchId column → we mirror them inside
  // details.context. Pinning structural presence so a future PR can't
  // silently drop one.
  it("createAuditLog passes activeRoleKey from scope.selectedRoleKey", () => {
    expect(EMPLOYEES_ROUTE).toMatch(/createAuditLog\([\s\S]{0,1500}activeRoleKey:\s*scope\.selectedRoleKey\s*\?\?\s*null/);
  });
  it("createAuditLog passes activeDepartmentId from scope", () => {
    expect(EMPLOYEES_ROUTE).toMatch(/createAuditLog\([\s\S]{0,1500}activeDepartmentId:\s*scope\.activeDepartmentId\s*\?\?\s*null/);
  });
  it("createAuditLog passes resolvedScope from scope", () => {
    expect(EMPLOYEES_ROUTE).toMatch(/createAuditLog\([\s\S]{0,1500}resolvedScope:\s*scope\.resolvedScope\s*\?\?\s*null/);
  });
  it("createAuditLog passes impersonationSourceUser from scope", () => {
    expect(EMPLOYEES_ROUTE).toMatch(/createAuditLog\([\s\S]{0,1500}impersonationSourceUser:\s*scope\.impersonationSourceUser\s*\?\?\s*null/);
  });
  it("emitEvent receives branchId so the event-bus payload carries the branch", () => {
    expect(EMPLOYEES_ROUTE).toMatch(/emitEvent\([\s\S]{0,1500}branchId:\s*scope\.branchId\s*\?\?\s*undefined/);
  });
  it("event_logs.details.context mirrors the IGOC quartet for downstream listeners", () => {
    expect(EMPLOYEES_ROUTE).toMatch(/context:\s*\{[\s\S]{0,500}companyId:\s*scope\.companyId[\s\S]{0,200}branchId:[\s\S]{0,200}activeRoleKey:\s*scope\.selectedRoleKey/);
  });
});

describe("PR-1 (#2077) — bootstrap carve-out is auditable + monotonic (review concern #2)", () => {
  // The reviewer asked: «Bootstrap carve-out لا يتحول إلى ثغرة دائمة».
  // Carve-out is monotonic because it keys off active assignment count
  // — once activeEmpCount>0, mandatoriness is enforced FOREVER. To make
  // the path detectable in the audit trail (in case anyone tries to
  // re-open it by deleting all employees), the route emits a WARN log
  // when the carve-out fires, with the actor's userId + activeRoleKey.
  it("bootstrap carve-out fires a structured WARN log with actor context", () => {
    expect(EMPLOYEES_ROUTE).toMatch(/if\s*\(isBootstrapEmployee\)\s*\{[\s\S]{0,400}logger\.warn[\s\S]{0,500}activeRoleKey:\s*scope\.selectedRoleKey/);
  });
  it("warn message explicitly states the carve-out can only run once per company", () => {
    expect(EMPLOYEES_ROUTE).toMatch(/bootstrap carve-out fired[\s\S]{0,300}can only run once per company/);
  });
});

describe("PR-1 (#2077) — committeeId optional design is documented (review concern #3)", () => {
  // The reviewer asked for the WHY of «committeeId اختياري». The
  // schema doc-block names the three constraints:
  //   (a) committees are cross-department + time-bounded ad-hoc,
  //   (b) NOT a baseline binding every employee needs at hire,
  //   (c) joining is a later membership transaction.
  it("schema doc-block names the three constraints", () => {
    expect(EMPLOYEES_ROUTE).toMatch(/CROSS-DEPARTMENT and\s*\/\/\s*TIME-BOUNDED/);
    expect(EMPLOYEES_ROUTE).toMatch(/NOT a baseline binding every employee needs at\s*\/\/\s*hire time/);
    expect(EMPLOYEES_ROUTE).toMatch(/later membership[\s\S]{0,80}PATCH \/org\/committee-memberships/);
  });
});

describe("PR-1 (#2077) — wizard form binds the 6 fields + adds a step", () => {
  it("imports the 6 new entity-select components", () => {
    expect(EMPLOYEES_CREATE_PAGE).toMatch(/import \{[\s\S]{0,200}PositionSelect[\s\S]{0,200}TeamSelect[\s\S]{0,200}CommitteeSelect[\s\S]{0,200}EmployeeCategorySelect[\s\S]{0,200}ProjectSelect[\s\S]{0,200}CostCenterMasterSelect[\s\S]{0,200}\} from "@\/components\/shared\/entity-selects"/);
  });
  it("WIZARD_STEPS contains the institutional step", () => {
    expect(EMPLOYEES_CREATE_PAGE).toMatch(/key:\s*"institutional"[\s\S]{0,400}label:\s*"الربط المؤسسي"/);
  });
  it("institutional step isComplete predicate covers all 5 mandatories + manager", () => {
    expect(EMPLOYEES_CREATE_PAGE).toMatch(/f\.positionId && f\.categoryKey && f\.teamId && f\.projectId && f\.costCenterId && f\.managerId/);
  });
  it("validate() rejects each mandatory with an Arabic message", () => {
    expect(EMPLOYEES_CREATE_PAGE).toMatch(/managerId:\s*form\.managerId\s*\?\s*null\s*:/);
    expect(EMPLOYEES_CREATE_PAGE).toMatch(/positionId:\s*form\.positionId\s*\?\s*null\s*:/);
    expect(EMPLOYEES_CREATE_PAGE).toMatch(/categoryKey:\s*form\.categoryKey\s*\?\s*null\s*:/);
    expect(EMPLOYEES_CREATE_PAGE).toMatch(/teamId:\s*form\.teamId\s*\?\s*null\s*:/);
    expect(EMPLOYEES_CREATE_PAGE).toMatch(/projectId:\s*form\.projectId\s*\?\s*null\s*:/);
    expect(EMPLOYEES_CREATE_PAGE).toMatch(/costCenterId:\s*form\.costCenterId\s*\?\s*null\s*:/);
  });
  it("POST payload forwards the 6 institutional fields", () => {
    expect(EMPLOYEES_CREATE_PAGE).toMatch(/positionId:\s*form\.positionId\s*\?\s*Number\(form\.positionId\)\s*:\s*undefined/);
    expect(EMPLOYEES_CREATE_PAGE).toMatch(/categoryKey:\s*form\.categoryKey\s*\|\|\s*undefined/);
    expect(EMPLOYEES_CREATE_PAGE).toMatch(/teamId:\s*form\.teamId\s*\?\s*Number\(form\.teamId\)\s*:\s*undefined/);
    expect(EMPLOYEES_CREATE_PAGE).toMatch(/projectId:\s*form\.projectId\s*\?\s*Number\(form\.projectId\)\s*:\s*undefined/);
    expect(EMPLOYEES_CREATE_PAGE).toMatch(/costCenterId:\s*form\.costCenterId\s*\?\s*Number\(form\.costCenterId\)\s*:\s*undefined/);
    expect(EMPLOYEES_CREATE_PAGE).toMatch(/committeeId:\s*form\.committeeId\s*\?\s*Number\(form\.committeeId\)\s*:\s*undefined/);
  });
  it("form draft + reset cover the 6 new fields", () => {
    // Once in useAutoDraft defaults, once in the «إضافة موظف آخر» reset.
    const occurrences = (EMPLOYEES_CREATE_PAGE.match(/positionId:\s*""/g) || []).length;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });
});

describe("PR-1 (#2077) — entity-selects: 4 new master pickers exist", () => {
  it("PositionSelect targets /org/positions", () => {
    expect(ENTITY_SELECTS).toMatch(/export const PositionSelect = buildEntitySelect\(\{[\s\S]{0,300}endpoint:\s*"\/org\/positions"/);
  });
  it("TeamSelect targets /org/teams", () => {
    expect(ENTITY_SELECTS).toMatch(/export const TeamSelect = buildEntitySelect\(\{[\s\S]{0,300}endpoint:\s*"\/org\/teams"/);
  });
  it("CommitteeSelect targets /org/committees", () => {
    expect(ENTITY_SELECTS).toMatch(/export const CommitteeSelect = buildEntitySelect\(\{[\s\S]{0,300}endpoint:\s*"\/org\/committees"/);
  });
  it("EmployeeCategorySelect targets /org/employee-categories and emits categoryKey (not id)", () => {
    expect(ENTITY_SELECTS).toMatch(/export const EmployeeCategorySelect = buildEntitySelect\(\{[\s\S]{0,500}endpoint:\s*"\/org\/employee-categories"[\s\S]{0,400}getValueField:\s*"categoryKey"/);
  });
});
