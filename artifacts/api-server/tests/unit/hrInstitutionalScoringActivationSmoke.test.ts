/**
 * PR-4 (#2077) — institutional scoring activation smoke.
 *
 * The engine (lib/employeeScoringEngine.ts) and the cron schedule
 * (lib/cronScheduler.ts weeklyEmployeeScoring + monthlyEmployeeScoring)
 * already exist — they were landed for #1799 §F.10. What PR-4 adds is
 * the operational SURFACE the HR Manager needs:
 *
 *   1. Backend gate flip on /org/scoring-weights + /org/scoring-ranking
 *      from admin:* → hr.employees:* (same pattern PR-3 applied to
 *      /org/attendance-policies-per-category).
 *   2. Two new HR-side routes on /employees/:id/scoring/* — recompute
 *      (POST) + history (GET) — both gated on hr.employees:list/update.
 *   3. Audit log of the recompute carries the IGOC quartet
 *      (activeRoleKey + activeDepartmentId + resolvedScope +
 *      impersonationSourceUser).
 *   4. Frontend route /hr/employees/:id/score mounts the new detail
 *      page, and /hr/scoring-weights mirrors the existing /admin page.
 *   5. Employee detail page links to the new score detail page.
 *   6. Navigation entry «أوزان التقييم» points at /hr/scoring-weights.
 *
 * Source-only test — the live journey (verify-hr-institutional-scoring-
 * journey.sh) covers the database forensics.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const ORG_ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/org.ts"),
  "utf8",
);
const EMPLOYEES_ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/employees.ts"),
  "utf8",
);
const HR_ROUTES = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/routes/hrRoutes.tsx"),
  "utf8",
);
const SCORING_WEIGHTS_PAGE = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/admin/scoring-weights.tsx"),
  "utf8",
);
const SCORE_DETAIL_PAGE = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/hr/employee-score.tsx"),
  "utf8",
);
const EMPLOYEE_DETAIL_PAGE = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/employee-detail.tsx"),
  "utf8",
);
const NAV_REGISTRY = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/components/layout/navigation.registry.ts"),
  "utf8",
);

describe("PR-4 (#2077) — backend gates open the scoring surface to HR", () => {
  it("GET /org/scoring-weights uses hr.employees:list", () => {
    expect(ORG_ROUTE).toMatch(/router\.get\("\/scoring-weights", authorize\(\{ feature: "hr\.employees", action: "list" \}\)/);
  });
  it("POST /org/scoring-weights uses hr.employees:update", () => {
    expect(ORG_ROUTE).toMatch(/router\.post\("\/scoring-weights", authorize\(\{ feature: "hr\.employees", action: "update" \}\)/);
  });
  it("DELETE /org/scoring-weights/:id uses hr.employees:update", () => {
    expect(ORG_ROUTE).toMatch(/router\.delete\("\/scoring-weights\/:id", authorize\(\{ feature: "hr\.employees", action: "update" \}\)/);
  });
  it("GET /org/scoring-ranking uses hr.employees:list", () => {
    expect(ORG_ROUTE).toMatch(/router\.get\("\/scoring-ranking", authorize\(\{ feature: "hr\.employees", action: "list" \}\)/);
  });
  it("the four scoring endpoints no longer use the old ADMIN/ADMIN_WRITE constants", () => {
    const sliceMatch = ORG_ROUTE.match(/router\.get\("\/scoring-weights"[\s\S]*?router\.get\("\/scoring-ranking"[^)]+\)/);
    expect(sliceMatch).not.toBeNull();
    const slice = sliceMatch![0];
    expect(slice).not.toMatch(/authorize\(ADMIN\)/);
    expect(slice).not.toMatch(/authorize\(ADMIN_WRITE\)/);
  });
});

describe("PR-4 (#2077) — recompute route reuses the existing engine (no new engine)", () => {
  it("imports scoreEmployee + currentPeriodKey from lib/employeeScoringEngine", () => {
    expect(EMPLOYEES_ROUTE).toMatch(/import \{[\s\S]{0,400}scoreEmployee[\s\S]{0,200}currentPeriodKey[\s\S]{0,200}\} from "\.\.\/lib\/employeeScoringEngine\.js"/);
  });
  it("POST /:id/scoring/recompute exists, gated on hr.employees:update", () => {
    expect(EMPLOYEES_ROUTE).toMatch(/router\.post\(\s*"\/:id\/scoring\/recompute",\s*authorize\(\{ feature: "hr\.employees", action: "update" \}\)/);
  });
  it("recompute calls scoreEmployee (does NOT roll a parallel scorer)", () => {
    expect(EMPLOYEES_ROUTE).toMatch(/scoreEmployee\(\{[\s\S]{0,300}companyId:\s*scope\.companyId[\s\S]{0,200}assignmentId:\s*emp\.assignmentId[\s\S]{0,200}scope:\s*s,[\s\S]{0,100}periodKey/);
  });
  it("recompute defaults to all three scopes (weekly + monthly + quarterly)", () => {
    expect(EMPLOYEES_ROUTE).toMatch(/\["weekly",\s*"monthly",\s*"quarterly"\]/);
  });
});

describe("PR-4 (#2077) — recompute is auditable + emits an event with IGOC context", () => {
  it("emits employee.scored event with the recompute trigger", () => {
    expect(EMPLOYEES_ROUTE).toMatch(/emitEvent\([\s\S]{0,1500}action:\s*"employee\.scored"[\s\S]{0,500}trigger:\s*"manual_recompute"/);
  });
  it("event details.context carries the IGOC quartet", () => {
    // The recompute block must include a context with the IGOC fields
    // (companyId/branchId/userId/activeRoleKey). We pin scope.selectedRoleKey
    // specifically because that's the lever PR-1 introduced and PR-4 must
    // not drop.
    expect(EMPLOYEES_ROUTE).toMatch(/scoring\/recompute[\s\S]{0,5000}context:\s*\{[\s\S]{0,400}activeRoleKey:\s*scope\.selectedRoleKey/);
  });
  it("audit log carries the IGOC quartet on the recompute action", () => {
    expect(EMPLOYEES_ROUTE).toMatch(/createAuditLog\([\s\S]{0,1500}action:\s*"recompute"[\s\S]{0,300}entity:\s*"employee_scores"/);
    expect(EMPLOYEES_ROUTE).toMatch(/createAuditLog\([\s\S]{0,2500}action:\s*"recompute"[\s\S]{0,800}activeRoleKey:\s*scope\.selectedRoleKey\s*\?\?\s*null[\s\S]{0,300}resolvedScope:\s*scope\.resolvedScope/);
  });
});

describe("PR-4 (#2077) — history route reads stored scores with rationale", () => {
  it("GET /:id/scoring/history exists, gated on hr.employees:list", () => {
    expect(EMPLOYEES_ROUTE).toMatch(/router\.get\(\s*"\/:id\/scoring\/history",\s*authorize\(\{ feature: "hr\.employees", action: "list" \}\)/);
  });
  it("history SELECTs the rationale + weightsUsed + rawCounters JSONB columns", () => {
    expect(EMPLOYEES_ROUTE).toMatch(/SELECT scope,[\s\S]{0,300}rationale,\s*"weightsUsed",\s*"rawCounters"/);
  });
});

describe("PR-4 (#2077) — frontend routes mount the new + mirrored pages", () => {
  it("hrRoutes lazy-imports EmployeeScore (new page)", () => {
    expect(HR_ROUTES).toMatch(/const EmployeeScore = lazy\(\(\) => import\("@\/pages\/hr\/employee-score"\)\)/);
  });
  it("hrRoutes lazy-imports ScoringWeightsHr (same component as the admin page)", () => {
    expect(HR_ROUTES).toMatch(/const ScoringWeightsHr = lazy\(\(\) => import\("@\/pages\/admin\/scoring-weights"\)\)/);
  });
  it("hrRoutes exposes /hr/employees/:id/score", () => {
    expect(HR_ROUTES).toMatch(/\{\s*path:\s*"\/hr\/employees\/:id\/score",\s*component:\s*EmployeeScore/);
  });
  it("hrRoutes exposes /hr/scoring-weights", () => {
    expect(HR_ROUTES).toMatch(/\{\s*path:\s*"\/hr\/scoring-weights",\s*component:\s*ScoringWeightsHr/);
  });
});

describe("PR-4 (#2077) — UI changes match the new backend gates", () => {
  it("scoring-weights PERM_WRITE moved from admin:update to hr.employees:update", () => {
    expect(SCORING_WEIGHTS_PAGE).toMatch(/const PERM_WRITE = "hr\.employees:update"/);
  });
  it("scoring-weights breadcrumb is path-aware (HR vs Admin lane)", () => {
    expect(SCORING_WEIGHTS_PAGE).toMatch(/onHrRoute = location\.startsWith\("\/hr\/"\)/);
  });
  it("score detail page renders the rationale verbatim from the engine", () => {
    // The page reads `latest.rationale[d.key]` and shows it as a
    // muted paragraph — proof that «يظهر سبب الدرجة» (reviewer's
    // requirement #5) is wired to the engine's actual output.
    expect(SCORE_DETAIL_PAGE).toMatch(/latest\.rationale\?\.\[d\.key\]/);
  });
  it("score detail page shows raw counters (the «من أين جاءت الأرقام؟» panel)", () => {
    expect(SCORE_DETAIL_PAGE).toMatch(/latest\.rawCounters/);
    expect(SCORE_DETAIL_PAGE).toMatch(/العدّادات الخام/);
  });
  it("score detail page exposes «إعادة الحساب الآن» behind hr.employees:update", () => {
    expect(SCORE_DETAIL_PAGE).toMatch(/GuardedButton perm="hr\.employees:update"/);
    expect(SCORE_DETAIL_PAGE).toMatch(/إعادة الحساب الآن/);
  });
  it("employee detail page links to the new score detail page", () => {
    expect(EMPLOYEE_DETAIL_PAGE).toMatch(/href=\{`\/hr\/employees\/\$\{employeeId\}\/score`\}/);
    expect(EMPLOYEE_DETAIL_PAGE).toMatch(/تفصيل كامل/);
  });
});

describe("PR-4 (#2077) — navigation registry points scoring entry at /hr", () => {
  it("the «أوزان التقييم وترتيب الأداء» entry uses /hr/scoring-weights", () => {
    expect(NAV_REGISTRY).toMatch(/label:\s*"أوزان التقييم وترتيب الأداء",\s*path:\s*"\/hr\/scoring-weights"/);
  });
  it("the nav subKey on that entry is «performance» (so it lights up under the performance submenu)", () => {
    expect(NAV_REGISTRY).toMatch(/path:\s*"\/hr\/scoring-weights"[\s\S]{0,200}subKey:\s*"performance"/);
  });
});
