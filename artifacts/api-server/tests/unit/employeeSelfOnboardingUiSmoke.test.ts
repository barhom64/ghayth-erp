/**
 * الاستكمال الذاتي للموظف — الدفعة ج (الواجهة) smoke.
 *
 * يثبّت ربط الواجهة:
 *   1. صفحة عامة /onboarding تقرأ الرمز وتنادي مسار العام GET/POST.
 *   2. المسار العام مُسجَّل في App (بلا حماية تسجيل دخول).
 *   3. صفحة مراجعة HR تنادي approve/reject وتُسجَّل في المسارات + التنقّل.
 *   4. مودال التفعيل السريع يرسل البريد ويعرض رابط الاستكمال.
 *
 * اختبار مصدري (بلا قاعدة بيانات).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const read = (p: string) => readFileSync(join(REPO_ROOT, p), "utf8");
const FE = "artifacts/ghayth-erp/src";
const PUBLIC_PAGE = read(`${FE}/pages/onboarding-self.tsx`);
const APP = read(`${FE}/App.tsx`);
const REVIEW = read(`${FE}/pages/hr/self-onboarding-review.tsx`);
const HR_ROUTES = read(`${FE}/routes/hrRoutes.tsx`);
const NAV = read(`${FE}/components/layout/navigation.registry.ts`);
const MODAL = read(`${FE}/pages/hr/employee-activation.tsx`);

describe("الدفعة ج — الصفحة العامة", () => {
  it("تقرأ الرمز من الـURL وتنادي مسار العام", () => {
    expect(PUBLIC_PAGE).toMatch(/URLSearchParams\(window\.location\.search\)\.get\("token"\)/);
    expect(PUBLIC_PAGE).toMatch(/\/api\/public\/onboarding\/\$\{encodeURIComponent\(token\)\}/);
  });
  it("ترسل البيانات عبر POST", () => {
    expect(PUBLIC_PAGE).toMatch(/method:\s*"POST"/);
  });
  it("لا تطلب حقول صاحب الشركة (لا راتب/منصب/فرع كمدخلات)", () => {
    expect(PUBLIC_PAGE).not.toMatch(/key:\s*"salary"|key:\s*"positionId"|key:\s*"branchId"/);
    expect(PUBLIC_PAGE).toMatch(/key:\s*"nationalId"/);
    expect(PUBLIC_PAGE).toMatch(/key:\s*"iban"/);
  });
  it("مُسجَّلة كمسار عام في App (خارج الحماية)", () => {
    expect(APP).toMatch(/const OnboardingSelf = lazy\(\(\) => import\("@\/pages\/onboarding-self"\)\)/);
    expect(APP).toMatch(/<Route path="\/onboarding">/);
  });
});

describe("الدفعة ج — صفحة المراجعة", () => {
  it("تجلب قائمة الطلبات وتنادي approve/reject", () => {
    expect(REVIEW).toMatch(/useApiQuery<any>\(\["employee-self-submissions"\], "\/employees\/self-submissions"\)/);
    expect(REVIEW).toMatch(/\/employees\/\$\{b\.id\}\/approve-self-data/);
    expect(REVIEW).toMatch(/\/employees\/\$\{b\.id\}\/reject-self-data/);
  });
  it("محميّة بصلاحية hr:update عبر GuardedButton", () => {
    expect(REVIEW).toMatch(/perm="hr:update"/);
  });
  it("مُسجَّلة في مسارات HR + التنقّل", () => {
    expect(HR_ROUTES).toMatch(/path: "\/hr\/self-onboarding-review", component: SelfOnboardingReview/);
    expect(NAV).toMatch(/path: "\/hr\/self-onboarding-review"/);
  });
});

describe("الدفعة ج — مودال التفعيل السريع", () => {
  it("يرسل البريد", () => {
    expect(MODAL).toMatch(/if \(quickForm\.email\.trim\(\)\) body\.email = quickForm\.email\.trim\(\)/);
  });
  it("يعرض رابط الاستكمال العائد من الخلفية", () => {
    expect(MODAL).toMatch(/res\?\.onboardingLink/);
    expect(MODAL).toMatch(/setQuickLink/);
  });
});
