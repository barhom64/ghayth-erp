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
const ALLOCATION_LIB = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/accountingAllocation.ts"),
  "utf8",
);
const HR_ENGINE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/engines/hrEngine.ts"),
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
  it("يستبعد تعيينات منح الوصول (isAccessGrant) من الـbackfill", () => {
    expect(MIGRATION).toMatch(/COALESCE\(ea\."isAccessGrant", FALSE\) = FALSE/);
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
  it("بذرة الفرع الرئيسي المفردة تترك costCenterId خارج الإدراج (يُشتق وقت الترحيل)", () => {
    // المسار الافتراضي (else if targetBranchId) — يسرد الأعمدة بلا costCenterId.
    const block = EMPLOYEES_ROUTE.match(/\} else if \(targetBranchId\) \{[\s\S]{0,360}/)?.[0] || "";
    expect(block).toMatch(/INSERT INTO employee_branch_allocations/);
    expect(block).not.toMatch(/"costCenterId"/);
  });
});

describe("الدفعة 2 — seam المالية: استراتيجية from_branch + deriveBranchCostCenter", () => {
  it("resolveCostCenter يدعم from_branch عبر cost_centers(linkedEntityType='branch')", () => {
    expect(ALLOCATION_LIB).toMatch(/case "from_branch":\s*entityType = "branch";\s*entityId = dims\.branchId;/);
  });
  it("الأبعاد تشمل branchId", () => {
    expect(ALLOCATION_LIB).toMatch(/branchId\?:\s*number \| null;/);
    expect(ALLOCATION_LIB).toMatch(/branchId: dims\?\.branchId \?\? null/);
  });
  it("deriveBranchCostCenter مُصدَّر ويستعمل from_branch", () => {
    expect(ALLOCATION_LIB).toMatch(/export async function deriveBranchCostCenter\([\s\S]{0,200}"from_branch"/);
  });
});

describe("الدفعة 2 — محرّك الرواتب يستمّ مركز التكلفة (بُعد فقط)", () => {
  it("يستورد deriveBranchCostCenter من seam المالية", () => {
    expect(HR_ENGINE).toMatch(/import \{ deriveBranchCostCenter \} from "\.\.\/accountingAllocation\.js"/);
  });
  it("الاستمام مشروط بـ breakdown موثوق (لا يمسّ المبالغ)", () => {
    expect(HR_ENGINE).toMatch(/if \(payroll\.breakdown && payroll\.breakdown\.length > 0 && breakdownTrusted\)[\s\S]{0,1200}employee_branch_allocations/);
  });
  it("فرع breakdown هو المصدر الموثوق لكل موظف", () => {
    expect(HR_ENGINE).toMatch(/for \(const e of payroll\.breakdown\) empBranch\.set\(e\.employeeId, e\.branchId \?\? null\)/);
  });
  it("المسار الأحادي: التجاوز مُقيّد بمطابقة فرع الرواتب (يحمي من صفوف منح الوصول) ثم الاشتقاق", () => {
    expect(HR_ENGINE).toMatch(/allocs\.find\(\(a\) => a\.costCenterId != null && a\.branchId === branchId\)/);
    expect(HR_ENGINE).toMatch(/override \?\? \(await ccForBranch\(branchId\)\)/);
  });
  it("المسار المتعدد: يُقسَّم عند >1 تخصيص بمجموع نِسَب = 100", () => {
    expect(HR_ENGINE).toMatch(/allocs\.length > 1 && sumPct === 100/);
  });
  it("بواقي التقريب على آخر حصة (التوازن محفوظ)", () => {
    expect(HR_ENGINE).toMatch(/i === targets\.length - 1 \? roundTo2\(amount - running\)/);
  });
  it("السطور الجماعية (بلا employeeId) لا تتأثر بالتقسيم", () => {
    expect(HR_ENGINE).toMatch(/if \(l\.employeeId == null\) return \[l\]/);
  });
  it("القيد يُبنى من السطور المُوزَّعة (postedDebit/Deduction)", () => {
    expect(HR_ENGINE).toMatch(/postedDebitLines = debitLines\.flatMap\(splitLine\)/);
    expect(HR_ENGINE).toMatch(/postedDeductionLines = deductionLines\.flatMap\(splitLine\)/);
    expect(HR_ENGINE).toMatch(/\.\.\.postedDebitLines,[\s\S]{0,400}\.\.\.postedDeductionLines,/);
  });
});
