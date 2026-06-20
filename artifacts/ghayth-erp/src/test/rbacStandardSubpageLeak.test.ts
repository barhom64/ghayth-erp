/**
 * RBAC-REV-STD — حارس تسريب «ظاهر+403» للمستخدم الاستاندر.
 *
 * العلّة: الموظف الاستاندر يملك منحة ذاتية فقط (hr.employees.self /
 * hr.attendance.checkin)، فكانت وحدة «hr» تظهر في allowedModules، وكان
 * canAccessSubPage يسقط إلى «الوحدة مسموحة ⇒ كل الصفحات الفرعية تظهر»،
 * فيرى الموظف قائمة الموارد البشرية الإدارية كاملة (ثم يردّه الباك 403).
 *
 * هذا الحارس يثبت أن البوابة تعتمد منحة إدارية فعلية (غير ذاتية) لا مجرد
 * ظهور الوحدة: منحة ذاتية ⇒ تُمنع الصفحات الإدارية؛ منحة إدارية ⇒ تُسمح.
 * كما يمنع رجوع الـfallback القديم (allowedModules.includes) في الكود.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { hasManagementGrantInModule } from "@/contexts/app-context";

describe("RBAC standard sub-page leak guard — hasManagementGrantInModule", () => {
  it("denies a standard employee holding ONLY self-scoped HR grants", () => {
    const standard = [
      "hr.employees.self:view",
      "hr.attendance.checkin:create",
      "hr.leaves.my:view",
      "requests.leave:create",
      "documents.personal:view",
    ];
    expect(hasManagementGrantInModule(standard, "hr")).toBe(false);
  });

  it("allows a role with a real non-self HR management grant", () => {
    expect(hasManagementGrantInModule(["hr.employees:list"], "hr")).toBe(true);
    expect(hasManagementGrantInModule(["hr.payroll:view"], "hr")).toBe(true);
    expect(hasManagementGrantInModule(["hr:*"], "hr")).toBe(true);
    expect(hasManagementGrantInModule(["hr:view"], "hr")).toBe(true);
  });

  it("owner wildcard passes for any module", () => {
    expect(hasManagementGrantInModule(["*"], "hr")).toBe(true);
    expect(hasManagementGrantInModule(["*"], "finance")).toBe(true);
  });

  it("does not leak across modules (a finance grant is not HR management)", () => {
    expect(hasManagementGrantInModule(["finance.invoices:list"], "hr")).toBe(false);
  });

  it("empty / no relevant grants ⇒ deny", () => {
    expect(hasManagementGrantInModule([], "hr")).toBe(false);
    expect(hasManagementGrantInModule(["requests.leave:create"], "hr")).toBe(false);
  });
});

describe("RBAC standard sub-page leak guard — source does not regress", () => {
  const SRC = readFileSync(
    join(import.meta.dirname!, "../contexts/app-context.tsx"),
    "utf8",
  );

  it("canAccessSubPage no longer blanket-allows via allowedModules in the fallback", () => {
    // The unmapped-role fallback MUST gate on a real management grant, not on
    // mere module presence (which a self-scoped grant inflates). We assert the
    // management check is the fallback used inside canAccessSubPage.
    const fn = SRC.slice(
      SRC.indexOf("const canAccessSubPage"),
      SRC.indexOf("const canAccessSubPage") + 900,
    );
    expect(fn).toMatch(/hasManagementGrantInModule\(rawPermissions, module\)/);
    expect(fn).not.toMatch(/return allowedModules\.includes\(module/);
  });
});
