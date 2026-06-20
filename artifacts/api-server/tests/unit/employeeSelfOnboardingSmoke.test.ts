/**
 * الاستكمال الذاتي للموظف — الدفعة أ (الخلفية) smoke.
 *
 * يثبّت سلسلة الالتقاط الذاتي:
 *   1. migration 393: جدول الرموز + أعمدة المرحلة المؤقتة (selfSubmittedData).
 *   2. lib: إصدار رمز مرتبط بالموظف (يُبطِل السابق)، تحقق بلا استهلاك، وسم used.
 *   3. quick-activate: عند توفّر البريد يُصدِر رابطًا ويرسله ويضبط الحالة.
 *   4. مسار عام GET/POST /onboarding/:token (قراءة ملخص المالك + حفظ مؤقت).
 *
 * اختبار مصدري (بلا قاعدة بيانات).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const read = (p: string) => readFileSync(join(REPO_ROOT, p), "utf8");
const MIGRATION = read("artifacts/api-server/src/migrations/393_employee_self_onboarding.sql");
const LIB = read("artifacts/api-server/src/lib/employeeOnboarding.ts");
const EMPLOYEES = read("artifacts/api-server/src/routes/employees.ts");
const PUBLIC = read("artifacts/api-server/src/routes/publicData.ts");

describe("الدفعة أ — migration 393", () => {
  it("ينشئ جدول employee_onboarding_tokens مرتبطًا بالموظف", () => {
    expect(MIGRATION).toMatch(/CREATE TABLE IF NOT EXISTS employee_onboarding_tokens/);
    expect(MIGRATION).toMatch(/"employeeId"\s+INTEGER NOT NULL REFERENCES employees\(id\)/);
    expect(MIGRATION).toMatch(/"tokenHash"\s+VARCHAR\(64\) NOT NULL/);
    expect(MIGRATION).toMatch(/CHECK \(status IN \('pending','used','revoked'\)\)/);
  });
  it("يضيف عمودَي المرحلة المؤقتة على employees", () => {
    expect(MIGRATION).toMatch(/ADD COLUMN IF NOT EXISTS "selfSubmittedData" JSONB/);
    expect(MIGRATION).toMatch(/ADD COLUMN IF NOT EXISTS "selfSubmittedAt" TIMESTAMPTZ/);
  });
  it("تفرّد hash الرمز", () => {
    expect(MIGRATION).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_eot_token_hash/);
  });
});

describe("الدفعة أ — lib إصدار/تحقق الرمز", () => {
  it("issueOnboardingToken يُبطِل المعلّق السابق ثم يُدرج جديدًا", () => {
    expect(LIB).toMatch(/export async function issueOnboardingToken/);
    expect(LIB).toMatch(/UPDATE employee_onboarding_tokens SET status = 'revoked'[\s\S]{0,120}status = 'pending'/);
    expect(LIB).toMatch(/INSERT INTO employee_onboarding_tokens[\s\S]{0,200}'pending'/);
  });
  it("يرمي PublicBaseUrlMissingError إن لم يُضبط الرابط العام", () => {
    expect(LIB).toMatch(/if \(!base\) throw new PublicBaseUrlMissingError\(\)/);
  });
  it("verifyOnboardingToken يتحقق بلا استهلاك (pending/غير منتهٍ)", () => {
    expect(LIB).toMatch(/export async function verifyOnboardingToken/);
    expect(LIB).toMatch(/status = 'pending' AND "expiresAt" > NOW\(\)/);
  });
  it("markOnboardingTokenUsed يَسِم used", () => {
    expect(LIB).toMatch(/SET status = 'used', "usedAt" = NOW\(\)/);
  });
  it("الرمز عشوائي 32 بايت ومُجزّأ بـ hashAuthToken", () => {
    expect(LIB).toMatch(/randomBytes\(32\)\.toString\("hex"\)/);
    expect(LIB).toMatch(/hashAuthToken\(rawToken\)/);
  });
});

describe("الدفعة أ — quick-activate يُصدِر الرابط", () => {
  it("المخطط يقبل email", () => {
    expect(EMPLOYEES).toMatch(/email:\s*z\.string\(\)\.email\(\)\.optional\(\)\.nullable\(\)/);
  });
  it("يضبط activationStatus self_invited عند توفّر البريد", () => {
    expect(EMPLOYEES).toMatch(/email \? 'self_invited' : 'pending_activation'/);
  });
  it("يُصدِر الرمز ويرسل الرابط بالبريد (وفشل الإرسال لا يُفشِل الإنشاء)", () => {
    expect(EMPLOYEES).toMatch(/issueOnboardingToken\(\{ companyId: scope\.companyId, employeeId: empId/);
    expect(EMPLOYEES).toMatch(/templateKey: "employee\.self_onboarding"/);
    expect(EMPLOYEES).toMatch(/onboardingLink,/);
  });
});

describe("الدفعة أ — المسار العام", () => {
  it("GET /onboarding/:token يعرض ملخص المالك للقراءة فقط", () => {
    expect(PUBLIC).toMatch(/router\.get\("\/onboarding\/:token", publicLimiter/);
    expect(PUBLIC).toMatch(/ownerSet:\s*\{[\s\S]{0,200}jobTitle/);
  });
  it("POST يحفظ في المرحلة المؤقتة ويضبط الحالة self_submitted", () => {
    expect(PUBLIC).toMatch(/router\.post\("\/onboarding\/:token", publicLimiter/);
    expect(PUBLIC).toMatch(/SET "selfSubmittedData" = \$1::jsonb[\s\S]{0,120}"activationStatus" = 'self_submitted'/);
    expect(PUBLIC).toMatch(/markOnboardingTokenUsed\(verified\.tokenId\)/);
  });
  it("مخطط الاستكمال لا يقبل حقول المالك (لا منصب/راتب/فرع/مدير)", () => {
    const block = PUBLIC.match(/const selfOnboardingSchema = z\.object\(\{[\s\S]{0,2000}\}\);/)?.[0] || "";
    expect(block).not.toMatch(/salary|positionId|branchId|managerId|role:/);
    expect(block).toMatch(/nationalId/);
    expect(block).toMatch(/iban/);
  });
  it("الرمز غير الصالح يردّ 410", () => {
    expect(PUBLIC).toMatch(/res\.status\(410\)/);
  });
  it("يُشعِر مسؤولي الموارد البشرية (hr_manager) داخليًا عند الإرسال", () => {
    expect(PUBLIC).toMatch(/sendNotification\(\{/);
    expect(PUBLIC).toMatch(/targetRole:\s*"hr_manager"/);
    expect(PUBLIC).toMatch(/actionUrl:\s*"\/hr\/self-onboarding-review"/);
    expect(PUBLIC).toMatch(/channels:\s*\["in_app"\]/);
  });
});

describe("الدفعة ب — مراجعة واعتماد البيانات", () => {
  it("GET /self-submissions يسرد المُرسِلين بانتظار المراجعة", () => {
    expect(EMPLOYEES).toMatch(/router\.get\("\/self-submissions", authorize/);
    expect(EMPLOYEES).toMatch(/e\."activationStatus" = 'self_submitted'/);
  });
  it("/self-submissions مُعرَّف قبل /:id (لا تظليل)", () => {
    expect(EMPLOYEES.indexOf('router.get("/self-submissions"')).toBeLessThan(EMPLOYEES.indexOf('router.get("/:id"'));
  });
  it("approve يطبّق الحقول الشخصية ويفرّغ المرحلة ويتقدّم للمراجعة", () => {
    expect(EMPLOYEES).toMatch(/router\.post\("\/:id\/approve-self-data", authorize/);
    expect(EMPLOYEES).toMatch(/"selfSubmittedData" = NULL,[\s\S]{0,80}"activationStatus" = 'ready_for_hr_review'/);
  });
  it("approve لا يلمس حقول صاحب الشركة (لا منصب/راتب/فرع)", () => {
    const block = EMPLOYEES.match(/approve-self-data[\s\S]*?UPDATE employees SET[\s\S]*?WHERE id = \$21/)?.[0] || "";
    expect(block).not.toMatch(/salary|positionId|"branchId"|"managerId"/);
    expect(block).toMatch(/"nationalId" = COALESCE/);
    expect(block).toMatch(/iban = COALESCE/);
  });
  it("reject يفرّغ المرحلة ويعيد الموظف لحالة الدعوة", () => {
    expect(EMPLOYEES).toMatch(/router\.post\("\/:id\/reject-self-data", authorize/);
    expect(EMPLOYEES).toMatch(/"selfSubmittedData" = NULL, "activationStatus" = 'self_invited'/);
  });
  it("approve/reject محميّان بصلاحية تعديل الموظفين", () => {
    expect(EMPLOYEES).toMatch(/approve-self-data", authorize\(\{ feature: "hr\.employees", action: "update"/);
    expect(EMPLOYEES).toMatch(/reject-self-data", authorize\(\{ feature: "hr\.employees", action: "update"/);
  });
});
