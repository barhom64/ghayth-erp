/**
 * HR-REV-2 (ADR-HR-02) — الهيكل التنظيمي الموحّد.
 *
 * `org-tree` هو الصفحة القانونية الوحيدة للهيكل. المسارات القديمة
 * `/hr/organization` و `/hr/organization/structure` تبقى قابلة للوصول
 * (لا 404 للروابط/الإشارات المرجعية القديمة) لكن **تُعيد التوجيه** إلى
 * `org-tree` بدل أن تخدم صفحتين مكرّرتين — نفس نمط `redirectTo` المعتمَد
 * في المستودع (shifts/violations/الأصداف المتقدمة).
 *
 * تثبيت شكل السجلّ (لا render): يضمن أن المسارين يُعاد توجيههما، وأن
 * `org-tree` ما زال مُسجَّلًا.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const HR_ROUTES = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/routes/hrRoutes.tsx"), "utf8");

describe("HR-REV-2: org cluster redirects to the canonical org-tree", () => {
  it("/hr/organization → redirectTo(/hr/org-tree)", () => {
    expect(HR_ROUTES).toContain(
      '{ path: "/hr/organization", component: redirectTo("/hr/org-tree")',
    );
  });

  it("/hr/organization/structure → redirectTo(/hr/org-tree)", () => {
    expect(HR_ROUTES).toContain(
      '{ path: "/hr/organization/structure", component: redirectTo("/hr/org-tree")',
    );
  });

  it("canonical org-tree route still registered", () => {
    expect(HR_ROUTES).toContain('path: "/hr/org-tree"');
  });

  it("no live (non-redirect) component is wired to the old organization paths", () => {
    // الصفحتان المكرّرتان لم تعودا مكوّنًا حيًّا في الراوتر.
    expect(HR_ROUTES).not.toMatch(/path:\s*"\/hr\/organization",\s*component:\s*Organization\b/);
    expect(HR_ROUTES).not.toMatch(/path:\s*"\/hr\/organization\/structure",\s*component:\s*OrganizationStructure\b/);
  });
});
