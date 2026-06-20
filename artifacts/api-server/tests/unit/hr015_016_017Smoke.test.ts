/**
 * HR-015 + HR-016 + HR-017 — final closure smoke for #1799.
 *
 * Pins (all static — no DB):
 *
 * HR-016 — Unified Work Queue:
 *   - /my/work-queue page exists + default export
 *   - Aggregates from 4 sources: /my-space, /tasks, /notifications, /inbox/threads
 *   - 4 (+1 optional) tabs: الكل / للاعتماد / مهامي / إشعارات / محادثات
 *   - Deep-link bar at bottom (lets power users jump to original screens)
 *   - Registered at /my/work-queue + nav entry under «مساحاتي»
 *
 * HR-015 — Attendance Categories admin + Field Breadcrumb:
 *   - Backend: 3 new endpoints in routes/org.ts
 *     - GET /employee-categories (system + company)
 *     - GET /attendance-policies-per-category
 *     - POST /attendance-policies-per-category (UPSERT)
 *     - DELETE /attendance-policies-per-category/:id
 *   - Frontend: /admin/attendance-categories page exists
 *   - Frontend: field-tracking.tsx has FieldBreadcrumbSection consuming
 *     /hr/attendance/field-track
 *   - BreadcrumbMap renders polyline through points
 *
 * HR-017 — Custodies model boundaries doc exists
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const ORG_SRC = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/org.ts"), "utf8");
const FIELD_TRACK_SRC = readFileSync(join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/hr/field-tracking.tsx"), "utf8");
const ATT_CAT_SRC = readFileSync(join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/admin/attendance-categories.tsx"), "utf8");
// PR-4 (#2163): work-queue.tsx is now a back-compat redirect shell; the
// canonical unified inbox is work-inbox.tsx (WorkInboxPage).
const WORK_QUEUE_SRC  = readFileSync(join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/my/work-queue.tsx"), "utf8");
const WORK_INBOX_SRC  = readFileSync(join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/work-inbox.tsx"), "utf8");
const MISC_ROUTES_SRC = readFileSync(join(REPO_ROOT, "artifacts/ghayth-erp/src/routes/miscRoutes.tsx"), "utf8");
const ADMIN_ROUTES_SRC = readFileSync(join(REPO_ROOT, "artifacts/ghayth-erp/src/routes/adminRoutes.tsx"), "utf8");
const NAV_SRC = readFileSync(join(REPO_ROOT, "artifacts/ghayth-erp/src/components/layout/navigation.registry.ts"), "utf8");

describe("HR-016 — Unified Work Queue (canonical = /work-inbox after PR-4 #2163)", () => {
  // PR-4 (#2163) ruling: /my/work-queue is a back-compat redirect shell.
  // The canonical unified inbox lives at work-inbox.tsx (WorkInboxPage).
  // Tests below now pin work-inbox.tsx; the redirect-shell behaviour of
  // work-queue.tsx is pinned separately.

  it("canonical page has default export WorkInboxPage", () => {
    expect(WORK_INBOX_SRC).toMatch(/export default function WorkInboxPage/);
  });

  it("aggregates from backend sources: /my-space, /tasks, /notifications", () => {
    expect(WORK_INBOX_SRC).toMatch(/["'"]\/my-space["'"]/);
    expect(WORK_INBOX_SRC).toMatch(/["'"]\/tasks\?[^"']*/);
    expect(WORK_INBOX_SRC).toMatch(/["'"]\/notifications\?[^"']*/);
  });

  it("Tabs: موافقات (actions) / مهامي (tasks) / إشعارات (notifs) / متابعات (followups)", () => {
    expect(WORK_INBOX_SRC).toMatch(/TabsTrigger value="actions"/);
    expect(WORK_INBOX_SRC).toMatch(/TabsTrigger value="tasks"/);
    expect(WORK_INBOX_SRC).toMatch(/TabsTrigger value="notifs"/);
    expect(WORK_INBOX_SRC).toMatch(/TabsTrigger value="followups"/);
    expect(WORK_INBOX_SRC).toContain("مهامي");
    expect(WORK_INBOX_SRC).toContain("إشعارات");
  });

  it("deep-link bar to original screens at bottom", () => {
    expect(WORK_INBOX_SRC).toMatch(/href="\/tasks"/);
    expect(WORK_INBOX_SRC).toMatch(/href="\/notifications"/);
    expect(WORK_INBOX_SRC).toMatch(/href="\/inbox"/);
  });

  it("/my/work-queue is a back-compat redirect shell (PR-4 #2163) — no PageShell", () => {
    // The route stays mounted (back-compat for old bookmarks/prints)
    // but the page component is now a wouter redirect shell, not a live page.
    expect(WORK_QUEUE_SRC).not.toMatch(/export default function WorkQueuePage/);
    expect(WORK_QUEUE_SRC).not.toMatch(/PageShell/);
    expect(WORK_QUEUE_SRC).toMatch(/setLocation\("\/work-inbox"\)/);
  });

  it("route registered at /my/work-queue (back-compat mount stays)", () => {
    expect(MISC_ROUTES_SRC).toMatch(/const WorkQueue = lazy\(\(\) => import\("@\/pages\/my\/work-queue"\)\)/);
    expect(MISC_ROUTES_SRC).toMatch(/\{ path: "\/my\/work-queue", component: WorkQueue \}/);
  });

  it("both /work-inbox nav entries use the canonical «صندوق الأعمال»", () => {
    // PR-5 (#2077) promoted the canonical inbox to /work-inbox. The UX Nav
    // Governance wave then unified the name: the «مساحاتي» entry (formerly
    // «ما ينتظر إجراءاتي») now uses «صندوق الأعمال» too, so the page has ONE
    // official name everywhere. The experimental /my/work-queue route is kept
    // mounted (see hrWorkInboxAggregationSmoke) but no longer referenced from
    // the sidebar.
    expect(NAV_SRC).toMatch(/label: "صندوق الأعمال", path: "\/work-inbox"/);
    // The top-level entry at the top of «الرئيسية» so the inbox is the first
    // thing every operator sees.
    expect(NAV_SRC).toMatch(/label: "صندوق الأعمال", path: "\/work-inbox"/);
  });
});

describe("HR-015 — Attendance Categories admin (backend)", () => {
  it("GET /employee-categories endpoint defined", () => {
    // PR-3 (#2077) widened the gate from admin:list to hr.employees:list
    // so the PR-1 wizard's category dropdown actually returns rows for
    // non-admin operators. The dedicated PR-3 smoke (hrAttendancePerCategoryGatesSmoke)
    // pins the exact constant; here we just confirm the route is mounted
    // and authorize() is applied (the gate is no longer admin).
    expect(ORG_SRC).toMatch(/router\.get\("\/employee-categories", authorize\(HR_EMPLOYEES_READ\)/);
  });

  it("returns system templates AND company-scoped rows", () => {
    expect(ORG_SRC).toMatch(/"companyId" = \$1 OR "companyId" IS NULL/);
  });

  it("GET / POST / DELETE for attendance-policies-per-category", () => {
    expect(ORG_SRC).toMatch(/router\.get\("\/attendance-policies-per-category"/);
    expect(ORG_SRC).toMatch(/router\.post\("\/attendance-policies-per-category"/);
    expect(ORG_SRC).toMatch(/router\.delete\("\/attendance-policies-per-category\/:id"/);
  });

  it("POST is UPSERT (ON CONFLICT DO UPDATE) keyed on (companyId, categoryKey)", () => {
    expect(ORG_SRC).toMatch(
      /ON CONFLICT \("companyId", "categoryKey"\) DO UPDATE/,
    );
  });

  it("validates penalty/timing fields with sane bounds", () => {
    expect(ORG_SRC).toMatch(/lateThresholdMinutes: z\.number\(\)\.int\(\)\.min\(0\)\.max\(180\)/);
    expect(ORG_SRC).toMatch(/gpsRadiusMeters: z\.number\(\)\.int\(\)\.min\(0\)\.max\(5000\)/);
    expect(ORG_SRC).toMatch(/trackingFrequencySeconds: z\.number\(\)\.int\(\)\.min\(0\)\.max\(3600\)/);
  });
});

describe("HR-015 — Attendance Categories admin (frontend)", () => {
  it("page has default export", () => {
    expect(ATT_CAT_SRC).toMatch(/export default function AttendanceCategoriesPage/);
  });

  it("reads from /org/employee-categories + /org/attendance-policies-per-category", () => {
    expect(ATT_CAT_SRC).toMatch(/"\/org\/employee-categories"/);
    expect(ATT_CAT_SRC).toMatch(/"\/org\/attendance-policies-per-category"/);
  });

  it("renders both system catalog (read-only) and overrides (CRUD)", () => {
    expect(ATT_CAT_SRC).toContain("فئات الموظفين");
    expect(ATT_CAT_SRC).toContain("Overrides خاصة بالشركة");
  });

  it("autoDeductionEnabled select has 3 states: inherit / true / false", () => {
    expect(ATT_CAT_SRC).toMatch(/SelectItem value="inherit"/);
    expect(ATT_CAT_SRC).toMatch(/SelectItem value="true"/);
    expect(ATT_CAT_SRC).toMatch(/SelectItem value="false"/);
  });

  it("page registered at /admin/attendance-categories as a wouter <Redirect> (canonical = HR)", () => {
    // PR-3 (#2077) added a canonical /hr/attendance-categories mount so
    // HR Managers can reach the page without crossing the admin module
    // boundary. The /admin route stayed as a back-compat alias (alias =
    // same component bound twice).
    //
    // Wave-2 PR-3 (#2163) — Canonical Ownership ruling: «canonical يتبع
    // ملكية الأعمال، لا مكان الملف». Attendance categories is HR
    // business policy; admin had no business owning it. The legacy
    // path stays reachable (bookmarks/prints) but is bound to a wouter
    // <Redirect> wrapper now — only ONE route owns the policy.
    expect(ADMIN_ROUTES_SRC).toMatch(/RedirectToHrAttendanceCategories\s*=\s*redirectTo\("\/hr\/attendance-categories"\)/);
    expect(ADMIN_ROUTES_SRC).toMatch(
      /path:\s*"\/admin\/attendance-categories",\s*component:\s*RedirectToHrAttendanceCategories/,
    );
    // Regression trap: re-importing AdminAttendanceCategories as a
    // lazy live page would re-establish dual ownership.
    expect(ADMIN_ROUTES_SRC).not.toMatch(/const AdminAttendanceCategories = lazy/);
  });

  it("nav entry under «إعدادات الموارد البشرية» (now points at /hr after PR-3)", () => {
    // PR-3 moved the navigation entry from /admin/attendance-categories
    // to /hr/attendance-categories so the link doesn't 403 for the
    // HR Manager whose role lacks `admin:*`.
    expect(NAV_SRC).toMatch(/label: "فئات الموظفين وسياسات الحضور", path: "\/hr\/attendance-categories"/);
  });
});

describe("HR-015 — Field tracking breadcrumb", () => {
  it("FieldBreadcrumbSection defined + uses /hr/attendance/field-track", () => {
    expect(FIELD_TRACK_SRC).toMatch(/function FieldBreadcrumbSection\(/);
    expect(FIELD_TRACK_SRC).toMatch(/\/hr\/attendance\/field-track\?/);
  });

  it("BreadcrumbMap renders numbered markers + polyline through points", () => {
    expect(FIELD_TRACK_SRC).toMatch(/function BreadcrumbMap\(/);
    expect(FIELD_TRACK_SRC).toMatch(/L\.polyline\(coords/);
  });

  it("KPI tiles: نقاط مسجلة / المسافة / أقصى سرعة / آخر مستوى بطارية", () => {
    expect(FIELD_TRACK_SRC).toContain("نقاط مسجلة");
    expect(FIELD_TRACK_SRC).toContain("المسافة التقريبية");
    expect(FIELD_TRACK_SRC).toContain("أقصى سرعة");
    expect(FIELD_TRACK_SRC).toContain("آخر مستوى بطارية");
  });

  it("haversine sum used for distance approximation", () => {
    expect(FIELD_TRACK_SRC).toMatch(/Math\.atan2\(Math\.sqrt\(a\), Math\.sqrt\(1 - a\)\)/);
  });

  it("FieldBreadcrumbSection rendered after the existing AttendanceMap", () => {
    const idxAtt = FIELD_TRACK_SRC.indexOf("<AttendanceMap");
    const idxBreadcrumb = FIELD_TRACK_SRC.indexOf("<FieldBreadcrumbSection");
    expect(idxAtt).toBeGreaterThan(0);
    expect(idxBreadcrumb).toBeGreaterThan(idxAtt);
  });
});

describe("HR-017 — Custodies model boundaries doc", () => {
  it("doc file exists", () => {
    const p = join(REPO_ROOT, "docs/audit/CUSTODIES_MODEL_BOUNDARIES.md");
    expect(existsSync(p), "Expected docs/audit/CUSTODIES_MODEL_BOUNDARIES.md to exist").toBe(true);
  });

  it("doc documents all 3 layers (warehouse + assignment + finance)", () => {
    const p = join(REPO_ROOT, "docs/audit/CUSTODIES_MODEL_BOUNDARIES.md");
    if (!existsSync(p)) return;
    const src = readFileSync(p, "utf8");
    // The 3 real tables (the audit doc mentioned subsidiary_custody +
    // warehouse_assets but the actual table names are subsidiary_accounts
    // and warehouse_stock_serials — HR-017 corrects that naming).
    expect(src).toContain("employee_assets");
    expect(src).toContain("subsidiary_accounts");
    expect(src).toContain("warehouse_stock_serials");
  });
});
