/**
 * RBAC-REV-STD — حارس تسريب «ظاهر+403» في قائمة الصفحات الفرعية.
 *
 * علّتان عالجهما الإصلاح:
 *   1) الموظف الاستاندر (منح ذاتية فقط: hr.employees.self / hr.attendance.checkin)
 *      كان يرى قائمة الموارد البشرية الإدارية كاملة.
 *   2) الأدوار ضيّقة المنح (مسؤول الحضور = hr.attendance فقط) كانت ترى كل
 *      صفحات HR (الرواتب/المخالفات…) ثم يردّها الباك 403.
 *
 * البوابة الآن دقيقة على مستوى الصفحة الفرعية (subKey) ومشتقّة من المنح:
 *   شاملة (* / hr / hr.*) ⇒ الكل · محدّدة (hr.attendance) ⇒ صفحتها فقط ·
 *   ذاتية ⇒ لا صفحة إدارية. هذا الحارس يثبت ذلك ويمنع رجوع fallback الوحدة.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { hasGrantForSubPage } from "@/contexts/app-context";

const SELF_ONLY = [
  "hr.employees.self:view",
  "hr.attendance.checkin:create",
  "hr.leaves.my:view",
  "requests.leave:create",
  "documents.personal:view",
];

describe("RBAC sub-page grant gate — hasGrantForSubPage", () => {
  it("standard employee (self-only HR grants) sees NO HR management sub-page", () => {
    for (const sub of ["employees", "payroll", "attendance", "violations", "leaves"]) {
      expect(hasGrantForSubPage(SELF_ONLY, "hr", sub)).toBe(false);
    }
  });

  it("narrow role (hr.attendance only) sees attendance — NOT payroll/violations", () => {
    const attendanceOfficer = ["hr.attendance:view", "hr.attendance:approve"];
    expect(hasGrantForSubPage(attendanceOfficer, "hr", "attendance")).toBe(true);
    expect(hasGrantForSubPage(attendanceOfficer, "hr", "payroll")).toBe(false);
    expect(hasGrantForSubPage(attendanceOfficer, "hr", "violations")).toBe(false);
  });

  it("payroll officer (hr.payroll + hr.attendance) sees exactly those", () => {
    const po = ["hr.payroll:view", "hr.payroll.wps:create", "hr.attendance:view"];
    expect(hasGrantForSubPage(po, "hr", "payroll")).toBe(true);
    expect(hasGrantForSubPage(po, "hr", "attendance")).toBe(true);
    expect(hasGrantForSubPage(po, "hr", "employees")).toBe(false);
  });

  it("broad grants (hr.* / hr / *) see every HR sub-page", () => {
    for (const broad of [["hr.*:view"], ["hr:view"], ["*:view"], ["*"]]) {
      expect(hasGrantForSubPage(broad, "hr", "payroll")).toBe(true);
      expect(hasGrantForSubPage(broad, "hr", "violations")).toBe(true);
    }
  });

  it("does not leak across modules", () => {
    expect(hasGrantForSubPage(["finance.invoices:list"], "hr", "payroll")).toBe(false);
    expect(hasGrantForSubPage(["hr.payroll:view"], "finance", "invoices")).toBe(false);
  });

  it("empty / unrelated grants ⇒ deny", () => {
    expect(hasGrantForSubPage([], "hr", "employees")).toBe(false);
    expect(hasGrantForSubPage(["requests.leave:create"], "hr", "employees")).toBe(false);
  });
});

describe("RBAC sub-page leak guard — source does not regress", () => {
  const SRC = readFileSync(
    join(import.meta.dirname!, "../contexts/app-context.tsx"),
    "utf8",
  );

  it("canAccessSubPage gates on the per-subKey grant check, not module presence", () => {
    const fn = SRC.slice(
      SRC.indexOf("const canAccessSubPage"),
      SRC.indexOf("const canAccessSubPage") + 1000,
    );
    expect(fn).toMatch(/hasGrantForSubPage\(rawPermissions, module, subKey\)/);
    expect(fn).not.toMatch(/return allowedModules\.includes\(module/);
  });
});
