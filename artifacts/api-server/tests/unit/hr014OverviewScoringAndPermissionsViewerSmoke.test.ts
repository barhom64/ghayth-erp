/**
 * HR-014 smoke — Employee 360 overview enrichment + Effective Permissions
 * viewer (#1799 priority #10 + priority #3 / RBAC-004).
 *
 * Pins (without DB):
 *   - GET /employees/:id Promise.all destructures latestScore + activeSignals
 *   - Both queries scoped on assignmentId AND companyId
 *   - latestScore query reads monthly scope ordered by periodKey DESC
 *   - activeSignals filters acknowledgedAt IS NULL + last 90 days +
 *     severity-ordered (critical → low)
 *   - Response payload includes latestScore + activeSignals fields
 *   - Frontend extracts both from employee object
 *   - PerformanceWidget component present + empty state copy + 6 dimension grid
 *   - Effective Permissions page (/admin/effective-permissions) registered +
 *     consumes /admin/users/:id/effective-permissions endpoint
 *   - Nav entry under "إعدادات الموارد البشرية"
 *   - employee 360 roles tab deep-links to /admin/effective-permissions?userId=N
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const ROUTE_SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/employees.ts"),
  "utf8",
);
const PAGE_SRC = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/employee-detail.tsx"),
  "utf8",
);
const VIEWER_SRC = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/admin/effective-permissions.tsx"),
  "utf8",
);
const ADMIN_ROUTES_SRC = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/routes/adminRoutes.tsx"),
  "utf8",
);
const NAV_SRC = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/components/layout/navigation.registry.ts"),
  "utf8",
);

describe("HR-014 — backend: overview enrichment Promise.all", () => {
  it("destructures latestScore + activeSignals alongside the existing tabs", () => {
    expect(ROUTE_SRC).toMatch(
      /const \[tasks, attendance, leaves, trainings, payroll, violations, loans, overtime, userAccount, roles, contract, custodies, position, latestScore, activeSignals\] = await Promise\.all/,
    );
  });

  it("latestScore query reads monthly scope from employee_scores ordered DESC", () => {
    expect(ROUTE_SRC).toMatch(
      /FROM employee_scores[\s\S]*?scope = 'monthly'[\s\S]*?ORDER BY "periodKey" DESC LIMIT 1/,
    );
  });

  it("activeSignals query filters acknowledgedAt IS NULL + last 90 days", () => {
    expect(ROUTE_SRC).toMatch(
      /FROM employee_signals[\s\S]*?"acknowledgedAt" IS NULL[\s\S]*?CURRENT_DATE - INTERVAL '90 days'/,
    );
  });

  it("activeSignals sorts critical → high → medium → low", () => {
    expect(ROUTE_SRC).toMatch(
      /CASE severity[\s\S]*?'critical' THEN 0 WHEN 'high' THEN 1[\s\S]*?'medium' THEN 2 WHEN 'low' THEN 3/,
    );
  });

  it("response payload exposes latestScore + activeSignals", () => {
    expect(ROUTE_SRC).toMatch(/latestScore: Array\.isArray\(latestScore\)/);
    expect(ROUTE_SRC).toMatch(/activeSignals: activeSignals \?\? \[\]/);
  });

  it("both queries are companyId-scoped (no cross-tenant leak)", () => {
    // Both new queries reference $2 = scope.companyId in their WHERE clause.
    const latestSection = ROUTE_SRC.slice(
      ROUTE_SRC.indexOf("FROM employee_scores"),
      ROUTE_SRC.indexOf("FROM employee_signals"),
    );
    expect(latestSection).toMatch(/"companyId" = \$2/);
    const signalsSection = ROUTE_SRC.slice(ROUTE_SRC.indexOf("FROM employee_signals"));
    expect(signalsSection).toMatch(/"companyId" = \$2/);
  });
});

describe("HR-014 — frontend: overview widget", () => {
  it("extracts latestScore + activeSignals from employee object", () => {
    expect(PAGE_SRC).toMatch(/const latestScore: any = employee\?\.latestScore \?\? null/);
    expect(PAGE_SRC).toMatch(/const activeSignals: any\[\] = employee\?\.activeSignals \|\| \[\]/);
  });

  it("PerformanceWidget component defined", () => {
    expect(PAGE_SRC).toMatch(/function PerformanceWidget\(/);
  });

  it("PerformanceWidget rendered in overview tab", () => {
    // PR-4 (#2077) added an `employeeId` prop so the widget can link
    // to the new score detail page; the latestScore + activeSignals
    // props are still passed (just before the `employeeId`).
    expect(PAGE_SRC).toMatch(/<PerformanceWidget\s+employeeId=\{[^}]+\}\s+latestScore=\{latestScore\}\s+activeSignals=\{activeSignals\}/);
  });

  it("widget has empty state explaining the cron schedule", () => {
    expect(PAGE_SRC).toMatch(/لا يوجد سجل تقييم بعد/);
    expect(PAGE_SRC).toMatch(/كل اثنين 03:00.*أول كل شهر 04:00/s);
  });

  it("widget renders the six §F.10 dimensions with their weights", () => {
    for (const dim of ["disciplineScore", "activityScore", "productivityScore",
                       "qualityScore", "managerScore", "developmentScore"]) {
      expect(PAGE_SRC).toContain(dim);
    }
    expect(PAGE_SRC).toContain("انضباط (20%)");
    expect(PAGE_SRC).toContain("نشاط (15%)");
    expect(PAGE_SRC).toContain("إنتاجية (35%)");
  });

  it("widget colour-codes by severity (critical → red surface, high → amber)", () => {
    expect(PAGE_SRC).toMatch(/sig\.severity === "critical"[\s\S]*?status-error-surface/);
    expect(PAGE_SRC).toMatch(/sig\.severity === "high"[\s\S]*?amber/);
  });

  it("widget surfaces trend arrow (TrendingUp / TrendingDown / Minus)", () => {
    expect(PAGE_SRC).toMatch(/TrendingUp, TrendingDown, Minus/);
  });
});

describe("HR-014 — Effective Permissions viewer page", () => {
  it("default export defined", () => {
    expect(VIEWER_SRC).toMatch(/export default function EffectivePermissionsPage/);
  });

  it("consumes the existing backend endpoint", () => {
    expect(VIEWER_SRC).toMatch(/\/admin\/users\/\$\{userId\}\/effective-permissions/);
  });

  it("supports userId query parameter for deep linking", () => {
    expect(VIEWER_SRC).toMatch(/new URLSearchParams\(search\)\.get\("userId"\)/);
    expect(VIEWER_SRC).toMatch(/navigate\([\s\S]*?effective-permissions\?userId=/);
  });

  it("groups permissions by feature module (prefix before first dot)", () => {
    expect(VIEWER_SRC).toMatch(/p\.feature\.split\("\."\)\[0\]/);
  });

  it("surfaces overrides separately with deny-wins styling", () => {
    expect(VIEWER_SRC).toMatch(/data\.overrides\.length > 0/);
    expect(VIEWER_SRC).toMatch(/o\.type === "deny" \? "destructive"/);
  });

  it("Arabic-translates common actions + scopes (not just shows raw keys)", () => {
    expect(VIEWER_SRC).toContain("الذات فقط");
    expect(VIEWER_SRC).toContain("الشركة كاملة");
    expect(VIEWER_SRC).toContain("اعتماد");
  });
});

describe("HR-014 — wiring (routes + nav + employee-detail deep link)", () => {
  it("EffectivePermissions registered at /admin/effective-permissions", () => {
    expect(ADMIN_ROUTES_SRC).toMatch(
      /const AdminEffectivePermissions = lazy\(\(\) => import\("@\/pages\/admin\/effective-permissions"\)\)/,
    );
    expect(ADMIN_ROUTES_SRC).toMatch(
      /\{ path: "\/admin\/effective-permissions", component: AdminEffectivePermissions \}/,
    );
  });

  it("nav entry under «إعدادات الموارد البشرية»", () => {
    expect(NAV_SRC).toMatch(
      /label: "الصلاحيات الفعلية للمستخدم", path: "\/admin\/effective-permissions"/,
    );
  });

  it("employee-detail roles tab deep-links to the viewer with the actual userId", () => {
    expect(PAGE_SRC).toMatch(
      /href=\{`\/admin\/effective-permissions\?userId=\$\{userAccount\.id\}`/,
    );
  });
});
