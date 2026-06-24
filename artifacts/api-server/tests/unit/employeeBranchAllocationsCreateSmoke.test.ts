/**
 * محرّك اشتقاق مراكز التكلفة — الدفعة 3 (واجهة الاختيار + استقبال التوزيع).
 *
 * يثبّت أن المُعيِّن يستطيع اختيار «توزيع متعدد الفروع» وقت الإنشاء:
 *   1. createEmployeeSchema يقبل مصفوفة branchAllocations (فرع/صفة/نسبة/مركز).
 *   2. المعالج يتحقق قبل المعاملة: مجموع 100%، لا فرع مكرّر، ملكية الفرع/المركز.
 *   3. المعالج يُدرج صفًا لكل فرع مع تعيين الأساسي، وإلا يبذر الفرع الرئيسي.
 *   4. ورقة الإنشاء تعرض الخيار (مطفأ افتراضيًا) وترسل branchAllocations.
 *
 * اختبار مصدري (بلا قاعدة بيانات).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const EMPLOYEES_ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/employees.ts"),
  "utf8",
);
const CREATE_PAGE = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/create/employee-create-form.tsx"),
  "utf8",
);

describe("الدفعة 3 — المخطط يقبل branchAllocations", () => {
  it("createEmployeeSchema يعرّف مصفوفة branchAllocations", () => {
    expect(EMPLOYEES_ROUTE).toMatch(/branchAllocations:\s*z\.array\(z\.object\(\{/);
  });
  it("كل عنصر: branchId + capacity + allocationPercent + costCenterId اختياري", () => {
    const block = EMPLOYEES_ROUTE.match(/branchAllocations:\s*z\.array\(z\.object\(\{[\s\S]{0,400}\}\)\)/)?.[0] || "";
    expect(block).toMatch(/branchId:\s*z\.coerce\.number\(\)\.int\(\)\.positive\(\)/);
    expect(block).toMatch(/allocationPercent:\s*z\.coerce\.number\(\)\.positive\(\)\.max\(100\)/);
    expect(block).toMatch(/capacity:\s*z\.string\(\)/);
    expect(block).toMatch(/costCenterId:\s*z\.coerce\.number\(\)\.int\(\)\.positive\(\)\.optional\(\)/);
  });
});

describe("الدفعة 3 — تحقق التوزيع قبل المعاملة", () => {
  it("يرفض مجموع نِسَب ≠ 100% بـ ValidationError", () => {
    expect(EMPLOYEES_ROUTE).toMatch(/if \(sumPct !== 100\)[\s\S]{0,200}ValidationError[\s\S]{0,200}field:\s*"branchAllocations"/);
  });
  it("يرفض تكرار الفرع", () => {
    expect(EMPLOYEES_ROUTE).toMatch(/new Set\(branchIds\)\.size !== branchIds\.length[\s\S]{0,200}ValidationError/);
  });
  it("يتحقق من ملكية الفروع للشركة", () => {
    expect(EMPLOYEES_ROUTE).toMatch(/SELECT id FROM branches WHERE id = ANY\(\$1::int\[\]\) AND "companyId" = \$2/);
  });
  it("يتحقق من ملكية مراكز التكلفة عند تحديدها", () => {
    expect(EMPLOYEES_ROUTE).toMatch(/SELECT id FROM cost_centers WHERE id = ANY\(\$1::int\[\]\) AND "companyId" = \$2 AND "deletedAt" IS NULL/);
  });
});

describe("الدفعة 3 — الإدراج المتعدد مع تعيين الأساسي", () => {
  it("يحدّد الفرع الأساسي (الرئيسي إن كان ضمن التوزيع وإلا الأول)", () => {
    expect(EMPLOYEES_ROUTE).toMatch(/normalizedAllocations\.some\(\(a\) => a\.branchId === targetBranchId\)[\s\S]{0,120}targetBranchId[\s\S]{0,120}normalizedAllocations\[0\]\.branchId/);
  });
  it("يُدرج صفًا لكل تخصيص مع costCenterId و isPrimary", () => {
    expect(EMPLOYEES_ROUTE).toMatch(/for \(const a of normalizedAllocations\)[\s\S]{0,300}INSERT INTO employee_branch_allocations[\s\S]{0,260}"costCenterId","isPrimary"/);
    expect(EMPLOYEES_ROUTE).toMatch(/a\.branchId === primaryBranchId/);
  });
  it("يبقي بذرة الفرع الرئيسي المفردة حين لا توزيع", () => {
    expect(EMPLOYEES_ROUTE).toMatch(/\} else if \(targetBranchId\) \{[\s\S]{0,260}100\.00,TRUE/);
  });
});

describe("الدفعة 3 — واجهة الإنشاء", () => {
  it("حالة multiBranch + branchAllocs (مطفأة افتراضيًا)", () => {
    expect(CREATE_PAGE).toMatch(/const \[multiBranch, setMultiBranch\] = useState\(false\)/);
    expect(CREATE_PAGE).toMatch(/const \[branchAllocs, setBranchAllocs\] = useState</);
  });
  it("يعرض خانة تفعيل التوزيع المتعدد", () => {
    expect(CREATE_PAGE).toMatch(/توزيع الموظف على عدة فروع/);
  });
  it("يتحقق من مجموع 100% قبل الإرسال", () => {
    expect(CREATE_PAGE).toMatch(/Math\.round\(allocPctTotal \* 100\) \/ 100 !== 100/);
  });
  it("يرسل branchAllocations عند تفعيل الوضع المتعدد فقط", () => {
    expect(CREATE_PAGE).toMatch(/multiBranch && branchAllocs\.some\(\(a\) => a\.branchId\)[\s\S]{0,300}branchAllocations:/);
  });
  it("يعيد ضبط الحالة عند «إضافة موظف آخر»", () => {
    expect(CREATE_PAGE).toMatch(/setMultiBranch\(false\);[\s\S]{0,40}setBranchAllocs\(\[\]\)/);
  });
});
