// gl/ledgerTruth.ts
//
// FIN-INTEGRITY-CONTRACT (#2246) — **المرحلة أ: القياس فقط (read-only).**
//
// تصنيف مبدئي (heuristic) لـ«البُعد المطلوب» لكل حساب، يُستخدم فقط لقياس حجم
// تسريب الأبعاد في دفتر الأستاذ القائم — **لا إنفاذ، لا منع، لا تعديل قيود.**
// المصدر: نطاقات شجرة الحسابات في البذرة (companyBootstrap.ts):
//   55xx / 5710  → مركبة   (وقود/صيانة/تأمين/استمارة/إيجار/مخالفات + إهلاك مركبة)
//   56xx         → عقار     (صيانة مبانٍ/أمن/إدارة/بلدية)
//   5130 / 4140  → مشروع    (تكلفة/إيراد مشروع)
//   2111–2113    → مورد     (ذمم موردون/مقاولون/شيكات صادرة)
//   1131–1133    → عميل     (عملاء/مستأجرون/عملاء مشاريع)
//
// ⚠️ مبدئي ومخصّص للقياس. العقد الرسمي (`requiredDimension` لكل غرض حساب،
// مع الإنفاذ بنمط ratchet في `financePostingPolicy`) يُرسَّم في #2233.
// إن عُدِّلت قواعد التصنيف هنا، يجب مزامنة الـCASE المرآة في
// finance-reports.ts (تقرير /reports/ledger-truth) — تمامًا كما يتزامن
// `classifyAccountUsage` مع SQL في migration 259.

export type ExpectedDimension =
  | "vehicle"
  | "property"
  | "project"
  | "vendor"
  | "client";

/** عمود البُعد المقابل على journal_lines لكل صنف. */
export const DIMENSION_COLUMN: Record<ExpectedDimension, string> = {
  vehicle: "vehicleId",
  property: "propertyId",
  project: "projectId",
  vendor: "vendorId",
  client: "clientId",
};

export const EXPECTED_DIMENSION_LABELS_AR: Record<ExpectedDimension, string> = {
  vehicle: "مركبة",
  property: "عقار",
  project: "مشروع",
  vendor: "مورد",
  client: "عميل",
};

/**
 * يعيد البُعد المطلوب لحساب حسب كوده، أو null إن لم يكن الحساب من فئة
 * مُبعّدة (عام/نقد/بنك/ضريبة/حقوق ملكية… لا كائن تكلفة له).
 * دالة نقية بلا I/O — قابلة للاختبار وحدةً.
 */
export function expectedDimensionForAccount(code: string | null | undefined): ExpectedDimension | null {
  if (!code) return null;
  const c = String(code).trim();
  // مركبة: مصروفات الأسطول 5500–5599 + إهلاك المركبة 5710
  if (/^55\d{2}$/.test(c) || c === "5710") return "vehicle";
  // عقار: مصروفات العقار 5600–5699
  if (/^56\d{2}$/.test(c)) return "property";
  // مشروع: تكلفة/إيراد المشروع
  if (c === "5130" || c === "4140") return "project";
  // مورد: ذمم الموردين/المقاولين/الشيكات الصادرة
  if (/^211[1-3]$/.test(c)) return "vendor";
  // عميل: العملاء/المستأجرون/عملاء المشاريع
  if (/^113[1-3]$/.test(c)) return "client";
  return null;
}
