import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * البند ٤ — «الكيان يقود التجربة» (ملحق أ): عقد اكتمال شامل عبر المسارات.
 *
 * البند ٤ يقوم على مبدأين (توجيه إبراهيم):
 *   (١) **التوجيه يقرّر الحساب** (costBearer / مَن يتحمّل): تكلفة الكيان تُرحَّل حسب
 *       الجهة المتحمّلة لا لحساب ثابت.
 *   (٢) **حساب خاص لكل كيان**: كل واقعة كيان تُرحَّل ببُعد الكيان، فيستبدل enricher
 *       الأبعاد الحساب الأب بالحساب الفرعي للكيان (مُفعَّل افتراضًا — #3062).
 *
 * هذا الاختبار **عقدٌ ثابت** يثبّت أن وقائع الكيانات في **كل مسار** تُرحَّل عبر مسار
 * الترحيل المعتمد **حاملةً بُعد كيانها** (المُمكِّن للمبدأ ٢)، وأن التوجيه (المبدأ ١)
 * مبنيّ في الخدمة المشتركة. يقرأ المصدر نصًّا (لا قاعدة بيانات) — حارسٌ ضد ارتداد
 * معماريّ يفصل واقعةَ كيانٍ عن بُعدها فتفقد حسابها الخاص بصمت.
 *
 * منطق التفريع/الاستبدال نفسه مُغطّى بـassertion في اختبارات مخصّصة (م٥،
 * creditFuelVendorApAssertion، costBearerPartyLinkAssertion، subsidiary* …)؛ هذا
 * العقد يضمن **شمول التغطية عبر المسارات** (مصفوفة الشرائح ١…٧+) في مكان واحد.
 */
const SRC = join(import.meta.dirname!, "../../src");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

const FLEET = read("lib/engines/fleetEngine.ts");
const PROPS = read("lib/engines/propertiesEngine.ts");
const HR = read("lib/engines/hrEngine.ts");
const UMRAH = read("lib/engines/umrahEngine.ts");
const LEGAL = read("lib/engines/legalEngine.ts");
const DOCSVC = read("lib/financeDocumentService.ts");
const ENRICH = read("lib/journalLineDimensionalEnricher.ts");

describe("البند ٤ — مصفوفة اكتمال وقائع الكيانات (الشرائح ١…٧+)", () => {
  it("شريحة ١-٣ الأسطول — وقائع المركبة تُرحَّل ببُعد vehicleId عبر مسار معتمد", () => {
    for (const m of ["postFuelExpenseGL", "postMaintenanceGL", "postAccidentGL", "postInsuranceGL"]) {
      expect(FLEET).toContain(m);
    }
    expect(FLEET).toMatch(/vehicleId:/); // بُعد المركبة على السطور
    // المبدأ (١) — صيانة/حادث المركبة تحترم costBearer (قائمة مستردّ تشمل الضمان ج-٦).
    expect(FLEET).toMatch(/\["insurance", "warranty", "customer", "tenant", "third_party"\]/);
    // تأمين المركبة يفتح جدول الإطفاء عبر المُساعد المشترك (ج-٧) لا INSERT مباشر.
    expect(FLEET).toMatch(/openPrepaidSchedule\(/);
    expect(FLEET).not.toMatch(/INSERT INTO prepaid_amortization_schedules/);
  });

  it("شريحة ٤-٥ العقار — إيجار/صيانة تُرحَّل ببُعد propertyId + توجيه مَن يتحمّل (مالك/مستأجر)", () => {
    for (const m of ["postRentRevenueGL", "postMaintenanceExpenseGL", "postMaintenanceOwnerBillingGL"]) {
      expect(PROPS).toContain(m);
    }
    expect(PROPS).toMatch(/propertyId:/); // بُعد العقار
    // توجيه مَن يتحمّل صيانة العقار: مملوكٌ لنا → مصروف؛ نُديره لطرفٍ → ذمة المالك.
    expect(PROPS).toMatch(/property_maintenance_expense/);
    expect(PROPS).toMatch(/property_owner_receivable/);
  });

  it("شريحة ٦ الموظف — سلفة/راتب تُرحَّل ببُعد employeeId (سلفة = ذمة على الموظف)", () => {
    for (const m of ["postLoanDisbursementGL", "postPayrollGL"]) {
      expect(HR).toContain(m);
    }
    expect(HR).toMatch(/employeeId:/); // بُعد الموظف
    expect(HR).toMatch(/employee_loan_receivable/); // السلفة ذمة على الموظف (المبدأ ١)
  });

  it("شريحة ٧+ العمرة — وكيل/موسم/نقل تُرحَّل بأبعاد umrahAgentId/umrahSeasonId", () => {
    for (const m of ["postAgentInvoiceGL", "postTransportExpenseGL", "postPenaltyGL"]) {
      expect(UMRAH).toContain(m);
    }
    expect(UMRAH).toMatch(/umrahAgentId:/);
    expect(UMRAH).toMatch(/umrahSeasonId/);
  });

  it("شريحة ٧+ القضية القانونية — استرداد التكلفة عبر ذمة القضية (legal_receivable)", () => {
    expect(LEGAL).toMatch(/financialEngine\.postJournalEntry\(/);
    expect(LEGAL).toMatch(/legal_receivable/); // الاسترداد: مدين ذمة القضية، ثم إغلاقها عند التحصيل
  });

  it("المبدأ (١) التوجيه يقرّر الحساب — مبنيّ في الخدمة المشتركة (م٥ + ج-١ + ج-٤)", () => {
    expect(DOCSVC).toMatch(/async function resolveCostBearerAccounts\(/); // مصروف → ذمة الطرف
    expect(DOCSVC).toMatch(/export function resolveObligationParty\(/);    // ج-١ ربط الطرف المحدّد
    expect(DOCSVC).toMatch(/cashAccountDims/);                              // ج-٤ ذمة المورّد على ساق المال
  });

  it("المبدأ (٢) حساب خاص لكل كيان — الاستبدال يشمل الأبعاد الستة ومُفعَّل افتراضًا", () => {
    // التغطية: موظف/عميل/مورّد/سائق/مركبة/عقار — كل بُعدٍ له حساب فرعي يُستبدَل تلقائيًّا.
    for (const ent of ["employeeId", "clientId", "vendorId", "driverId", "vehicleId", "propertyId"]) {
      expect(ENRICH).toContain(ent);
    }
    expect(ENRICH).toMatch(/SUBSTITUTION_ENTITY_ORDER/);
    // مُفعَّل افتراضًا (#3062): يُعطَّل فقط بإيقاف صريح 'false'/'0'.
    expect(ENRICH).toMatch(/raw === "false" \|\| raw === "0"/);
  });
});
