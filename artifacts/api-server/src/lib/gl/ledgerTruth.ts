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
  // الكود الأساس قبل لاحقة الحساب الفرعي (5510-0001 → 5510) حتى تُصنَّف الأوراق الفرعية مثل أصلها.
  const c = String(code).trim().split("-")[0];
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

// ── عقد البُعد: قواعد الإنفاذ التدريجي (#2233) ────────────────────────────────
//
// مفصولة عن heuristic القياس: القياس عريض (كل الأصناف)، أما **الإنفاذ** فيبدأ
// ضيّقًا وآمنًا ويتوسّع صنفًا صنفًا (ratchet) فور التحقق/إصلاح مسار الإدخال.
//   • enforce → يُرفَض الترحيل إن غاب البُعد.
//   • warn    → يُسجَّل تحذير فقط (بلا رفض) — لا تعطيل إنتاج.
// **الإنفاذ الشامل (اعتماد عام، 2026-06-19):** كل الأصناف المُبعّدة على enforce —
// كل ترحيل محاسبي يحمل بُعده التحليلي (مركبة/عقار/مشروع/مورد/عميل) وإلا يُرفض.
// قرار دفتر صريح من المالك يتجاوز تدرّج الـ ratchet؛ أي قيد قائم على حساب مُبعّد
// بلا بُعده يُرفض حتى يُربط. الأثر مقبول صراحةً — انظر
// plans/dimension-enforcement-2026-06-19.md. عمود البُعد المطلوب في DIMENSION_COLUMN.
export type DimensionEnforcementMode = "enforce" | "warn";

export interface DimensionEnforcementRule {
  /** يُطبَّق على الكود الأساس (قبل لاحقة الحساب الفرعي). */
  test: (baseCode: string) => boolean;
  dimension: ExpectedDimension;
  label: string;
  mode: DimensionEnforcementMode;
}

// تُفحص بالترتيب؛ أول قاعدة مطابقة تفوز (فالأخصّ قبل الأعمّ).
export const DIMENSION_ENFORCEMENT_RULES: DimensionEnforcementRule[] = [
  { test: (c) => /^55\d{2}$/.test(c) || c === "5710", dimension: "vehicle", label: "مركبة", mode: "enforce" },
  { test: (c) => /^56\d{2}$/.test(c), dimension: "property", label: "عقار", mode: "enforce" },
  { test: (c) => c === "5130" || c === "4140", dimension: "project", label: "مشروع", mode: "enforce" },
  { test: (c) => /^211[1-3]$/.test(c), dimension: "vendor", label: "مورد", mode: "enforce" },
  { test: (c) => /^113[1-3]$/.test(c), dimension: "client", label: "عميل", mode: "enforce" },
];

/** يعيد قاعدة الإنفاذ المطابقة لكود الحساب (على الأساس)، أو null. دالة نقية. */
export function classifyEnforcement(code: string | null | undefined): DimensionEnforcementRule | null {
  if (!code) return null;
  const base = String(code).trim().split("-")[0];
  return DIMENSION_ENFORCEMENT_RULES.find((r) => r.test(base)) ?? null;
}
