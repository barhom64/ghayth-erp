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
const BOARD = read(`${FE}/pages/hr/activation-board.tsx`);
const API = "artifacts/api-server/src";
const PUBLIC_ROUTE = read(`${API}/routes/publicData.ts`);
const OBJSTORE = read(`${API}/lib/objectStorage.ts`);
const APP_TS = read(`${API}/app.ts`);
const STORAGE_ROUTE = read(`${API}/routes/storage.ts`);

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

describe("الدفعة هـ — إعادة إرسال الرابط من لوحة التفعيل", () => {
  it("لوحة التفعيل تنادي resend-onboarding-link", () => {
    expect(BOARD).toMatch(/\/employees\/\$\{b\.id\}\/resend-onboarding-link/);
  });
  it("الزر يظهر لحالات الاستكمال الذاتي فقط ومحميّ بـ hr:update", () => {
    expect(BOARD).toMatch(/e\.activationStatus === "self_invited" \|\| e\.activationStatus === "self_submitted"/);
    expect(BOARD).toMatch(/resendMut\.mutate\(\{ id: e\.id \}\)/);
  });
});

describe("الدفعة و — عدّاد الطلبات بانتظار المراجعة", () => {
  it("لوحة التفعيل تعرض KPI لعدد المُرسِلين (self_submitted)", () => {
    expect(BOARD).toMatch(/بانتظار استكمال البيانات/);
    expect(BOARD).toMatch(/pending\.filter\(\(e: any\) => e\.activationStatus === "self_submitted"\)\.length/);
  });
  it("صفحة المراجعة تُظهر العدد في الترويسة", () => {
    expect(REVIEW).toMatch(/\$\{rows\.length\} طلب بانتظار المراجعة/);
  });
});

describe("الدفعة ز — رفع وثائق الاستكمال (نموذج خادمي base64)", () => {
  it("نقطة الرفع العامة محميّة بالرمز وتتحقق من النوع والحجم خادميًا", () => {
    expect(PUBLIC_ROUTE).toMatch(/router\.post\("\/onboarding\/:token\/document"/);
    expect(PUBLIC_ROUTE).toMatch(/verifyOnboardingToken/);
    expect(PUBLIC_ROUTE).toMatch(/ALLOWED_DOC_MIME = \["image\/jpeg", "image\/png", "image\/webp", "application\/pdf"\]/);
    expect(PUBLIC_ROUTE).toMatch(/MAX_DOC_BYTES = 5 \* 1024 \* 1024/);
    expect(PUBLIC_ROUTE).toMatch(/buffer\.length > MAX_DOC_BYTES/);
    expect(PUBLIC_ROUTE).toMatch(/objectStorage\.uploadBytes\(buffer, body\.mimeType\)/);
    expect(PUBLIC_ROUTE).toMatch(/employee\.self_onboarding_document_uploaded/);
  });
  it("الرفع خادمي (لا رابط موقّع يُسلَّم لِحامل الرمز)", () => {
    expect(OBJSTORE).toMatch(/async uploadBytes\(buffer: Buffer, contentType: string\): Promise<string>/);
    expect(OBJSTORE).toMatch(/await file\.save\(buffer, \{ contentType, resumable: false \}\)/);
    expect(PUBLIC_ROUTE).not.toMatch(/getObjectEntityUploadURL/);
  });
  it("App يرفع حد الجسم لمسار الرفع فقط (base64 ≤ 8mb)", () => {
    expect(APP_TS).toMatch(/app\.use\("\/api\/public\/onboarding", express\.json\(\{ limit: "8mb" \}\)\)/);
  });
  it("مسار عرض الكائن المُصادَق يسمح بمرفقات الاستكمال ضمن نطاق الشركة", () => {
    expect(STORAGE_ROUTE).toMatch(/"selfSubmittedData"\)::text LIKE/);
    expect(STORAGE_ROUTE).toMatch(/onboardingRef\.length === 0/);
  });
  it("الصفحة العامة ترفع base64 وتُرفق المخرجات في الإرسال", () => {
    expect(PUBLIC_PAGE).toMatch(/\/document/);
    expect(PUBLIC_PAGE).toMatch(/readAsDataURL/);
    expect(PUBLIC_PAGE).toMatch(/JSON\.stringify\(\{ \.\.\.form, attachments \}\)/);
    expect(PUBLIC_PAGE).toMatch(/MAX_DOC_BYTES = 5 \* 1024 \* 1024/);
  });
  it("صفحة المراجعة تعرض المرفقات وتفتحها عبر مسار مُصادَق", () => {
    expect(REVIEW).toMatch(/viewAttachment/);
    expect(REVIEW).toMatch(/\/api\/storage\/objects\//);
    expect(REVIEW).toMatch(/nativeAuthHeaders/);
    expect(REVIEW).toMatch(/submitted\.attachments/);
  });
});
