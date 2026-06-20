/**
 * محرّك اشتقاق مراكز التكلفة — الدفعة 1 (النموذج) smoke.
 *
 * يثبّت أن علاقة الموظف ↔ الفرع تُمثَّل كـ«تخصيصات» (employee_branch_allocations):
 *   1. الهجرة 392 تُنشئ الجدول بالأعمدة المفتاحية + قيد النسبة + التفرّد.
 *   2. الهجرة تُجري backfill لتعيين أساسي لكل تعيين نشط له فرع (idempotent).
 *   3. معالج إنشاء الموظف يبذر تخصيص الفرع الرئيسي (100%، isPrimary) مع
 *      ترك costCenterId فارغًا (يُشتق وقت الترحيل — الدفعة 2).
 *
 * اختبار مصدري (بلا قاعدة بيانات) على نمط بقية اختبارات البنية.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const MIGRATION = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/migrations/392_employee_branch_allocations.sql"),
  "utf8",
);
const EMPLOYEES_ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/employees.ts"),
  "utf8",
);

describe("الدفعة 1 — migration 392 ينشئ جدول التخصيصات", () => {
  it("CREATE TABLE employee_branch_allocations", () => {
    expect(MIGRATION).toMatch(/CREATE TABLE IF NOT EXISTS employee_branch_allocations/);
  });
  it("الأعمدة المفتاحية موجودة (assignmentId / branchId / costCenterId / capacity / allocationPercent / isPrimary)", () => {
    expect(MIGRATION).toMatch(/"assignmentId"\s+INTEGER NOT NULL REFERENCES employee_assignments\(id\)/);
    expect(MIGRATION).toMatch(/"branchId"\s+INTEGER NOT NULL REFERENCES branches\(id\)/);
    expect(MIGRATION).toMatch(/"costCenterId"\s+INTEGER REFERENCES cost_centers\(id\)/);
    expect(MIGRATION).toMatch(/capacity\s+VARCHAR\(80\)/);
    expect(MIGRATION).toMatch(/"allocationPercent"\s+NUMERIC\(5,2\) NOT NULL DEFAULT 100\.00/);
    expect(MIGRATION).toMatch(/"isPrimary"\s+BOOLEAN NOT NULL DEFAULT FALSE/);
  });
  it("قيد النسبة بين 0 و 100", () => {
    expect(MIGRATION).toMatch(/CHECK \("allocationPercent" > 0 AND "allocationPercent" <= 100\)/);
  });
  it("تخصيص أساسي فعّال واحد لكل تعيين (unique partial index)", () => {
    expect(MIGRATION).toMatch(/CREATE UNIQUE INDEX[\s\S]*?ON employee_branch_allocations \("assignmentId"\)[\s\S]*?WHERE "isPrimary" = TRUE AND "endDate" IS NULL/);
  });
});

describe("الدفعة 1 — backfill idempotent للتعيينات النشطة", () => {
  it("INSERT ... SELECT من employee_assignments النشطة فقط", () => {
    expect(MIGRATION).toMatch(/INSERT INTO employee_branch_allocations[\s\S]*?SELECT[\s\S]*?FROM employee_assignments ea[\s\S]*?ea\.status = 'active'/);
  });
  it("يتجاهل التعيينات بلا فرع", () => {
    expect(MIGRATION).toMatch(/ea\."branchId" IS NOT NULL/);
  });
  it("idempotent عبر NOT EXISTS + ON CONFLICT DO NOTHING", () => {
    expect(MIGRATION).toMatch(/NOT EXISTS \([\s\S]*?FROM employee_branch_allocations eba/);
    expect(MIGRATION).toMatch(/ON CONFLICT \("assignmentId", "branchId", "startDate"\) DO NOTHING/);
  });
});

describe("الدفعة 1 — بذرة الفرع الرئيسي عند إنشاء الموظف", () => {
  // نطاق: داخل معالج POST / (transaction) بعد إدراج التعيين.
  it("يُدرج تخصيص الفرع الرئيسي (100%، isPrimary) مشروطًا بوجود الفرع", () => {
    expect(EMPLOYEES_ROUTE).toMatch(/if \(targetBranchId\)[\s\S]{0,400}INSERT INTO employee_branch_allocations/);
    expect(EMPLOYEES_ROUTE).toMatch(/INSERT INTO employee_branch_allocations[\s\S]{0,300}100\.00,TRUE/);
  });
  it("يترك costCenterId خارج الإدراج (يُشتق وقت الترحيل — الدفعة 2)", () => {
    // الإدراج يسرد الأعمدة بلا costCenterId.
    const block = EMPLOYEES_ROUTE.match(/INSERT INTO employee_branch_allocations[\s\S]{0,260}/)?.[0] || "";
    expect(block).not.toMatch(/"costCenterId"/);
  });
});
