// ─────────────────────────────────────────────────────────────────────────────
// Umrah Settings Policies Catalog — §8 Phase 2 of #1870
//
// The Charter lists 11 settings categories. Today the umrah settings
// page exposes only 3 (NUSK supplier link + product mapping + overstay
// penalty). The other 8 either don't have UI yet or live scattered
// across deeper screens.
//
// This catalog declares all 11 + their field schemas. The values
// persist via the existing `settings` table (key pattern
// `umrah.<category_id>.<field_key>`). The FE renders one expandable
// card per category with the declared fields + a save button per
// category — so adding a new policy is a one-file change.
//
// Phase 2 (this PR): the catalog + an endpoint pair (GET catalog
// with current values, PUT per-category save). Each field has a
// type the FE knows how to render (number / boolean / select /
// text). Full forms for the policies that need real UI (visa rule
// matrix, commission slabs) are still follow-up scope.
// ─────────────────────────────────────────────────────────────────────────────

export type PolicyFieldType = "number" | "boolean" | "text" | "select";

export type PolicyStatus = "configured" | "default" | "missing";

export interface PolicyField {
  /** Persistence sub-key (full key = `umrah.<categoryId>.<key>`). */
  key: string;
  label: string;
  type: PolicyFieldType;
  /** Optional select options for type='select'. */
  options?: Array<{ value: string; label: string }>;
  /** Default value the FE shows when the operator hasn't set anything. */
  defaultValue?: number | boolean | string | null;
  /** One-line description rendered as a helper hint under the field. */
  hint?: string;
}

export interface PolicyCategory {
  id: string;
  title: string;
  description: string;
  /** Lucide icon name — FE maps to the actual component. */
  icon: string;
  fields: PolicyField[];
}

export const UMRAH_POLICY_CATEGORIES: PolicyCategory[] = [
  {
    id: "season",
    title: "سياسة الموسم",
    description: "افتراضيات افتتاح/إغلاق المواسم + مدة البرنامج الافتراضية.",
    icon: "Calendar",
    fields: [
      { key: "defaultProgramDays", label: "مدة البرنامج الافتراضية (يوم)", type: "number", defaultValue: 14 },
      { key: "autoClosePastSeasons", label: "إغلاق المواسم السابقة تلقائياً", type: "boolean", defaultValue: false },
      { key: "requireSeasonForImport", label: "إلزام اختيار موسم لكل استيراد", type: "boolean", defaultValue: true },
    ],
  },
  {
    id: "visa",
    title: "قواعد التأشيرة",
    description: "تنبيه قرب الانتهاء + سياسة عدم وصول حامل التأشيرة.",
    icon: "FileText",
    fields: [
      { key: "expiryWarningDays", label: "تنبيه قبل انتهاء التأشيرة بـ (يوم)", type: "number", defaultValue: 7 },
      { key: "blockOverstayAfterExpiry", label: "تحويل الحالة لـ overstayed عند انتهاء التأشيرة", type: "boolean", defaultValue: true },
      { key: "allowNoVisaImport", label: "السماح بمعتمر بدون رقم تأشيرة في الاستيراد", type: "boolean", defaultValue: true, hint: "بعض مزودي الملفات يصدرون الـ Excel قبل طباعة التأشيرة." },
    ],
  },
  {
    id: "overstay_grace",
    title: "مهلة التخلف",
    description: "كم يوماً قبل تحويل المعتمر من 'متأخر' إلى 'مخالف'.",
    icon: "Clock",
    fields: [
      { key: "graceDays", label: "مهلة قبل اعتبار المعتمر مخالف (يوم)", type: "number", defaultValue: 3 },
      { key: "dailyPenalty", label: "غرامة التأخر اليومية الافتراضية", type: "number", defaultValue: 100, hint: "مرتبطة مباشرة بمفتاح umrah.overstay_daily_penalty الذي يقرأه محرك الغرامات." },
      { key: "tierDays", label: "عتبة الشريحة الثانية (يوم)", type: "number", defaultValue: 14 },
      { key: "tierAmount", label: "غرامة الشريحة الثانية", type: "number", defaultValue: 5000 },
    ],
  },
  {
    id: "violations",
    title: "سياسة المخالفات",
    description: "متى تُسجَّل المخالفة تلقائياً + تأثيرها على العمولة.",
    icon: "AlertTriangle",
    fields: [
      { key: "autoCreateOnAbscond", label: "إنشاء مخالفة تلقائياً عند رصد هروب", type: "boolean", defaultValue: true },
      { key: "blockCommissionOnOpenViolation", label: "تجميد عمولة الوكيل عند وجود مخالفة مفتوحة", type: "boolean", defaultValue: true },
      { key: "violationGracePeriodDays", label: "مهلة الاعتراض (يوم)", type: "number", defaultValue: 14 },
    ],
  },
  {
    id: "import",
    title: "سياسة الاستيراد",
    description: "ضوابط ملفات Excel + التحقق + المعدل الأقصى للصفوف.",
    icon: "Upload",
    fields: [
      { key: "maxRowsPerFile", label: "الحد الأقصى للصفوف في الملف", type: "number", defaultValue: 5000 },
      { key: "requireNuskNumber", label: "إلزام رقم المعتمر (نسك) لكل صف", type: "boolean", defaultValue: true },
      { key: "rejectOnDuplicatePassport", label: "رفض الصفوف المكررة (نفس الجواز)", type: "boolean", defaultValue: false, hint: "افتراضياً يُحدَّث المعتمر القائم بدلاً من الرفض." },
    ],
  },
  {
    id: "auto_link",
    title: "سياسة الربط التلقائي",
    description: "متى ينشئ النظام وكيل/مجموعة جديدة تلقائياً + إصابات الربط الضبابي.",
    icon: "Link",
    fields: [
      { key: "autoCreateMissingAgents", label: "إنشاء وكيل جديد تلقائياً إذا لم يُعرف في الاستيراد", type: "boolean", defaultValue: true },
      { key: "autoCreateMissingGroups", label: "إنشاء مجموعة جديدة تلقائياً إذا لم تُعرف", type: "boolean", defaultValue: true },
      { key: "fuzzyMatchMinConfidence", label: "الحد الأدنى لثقة المطابقة الضبابية (0–1)", type: "number", defaultValue: 0.6 },
      // U-11 — سياسة ربط الوكيل الفرعي بالعميل المالي.
      // الافتراضي operational_until_linked: الوكيل الفرعي المستورد يبقى
      // كياناً تشغيلياً ولا يصبح عميلاً مالياً إلا بربط صريح من المُشغّل.
      // القيم الثلاث الأخرى مُعرَّفة في الـcatalog لكن لها مستويات تفعيل
      // مختلفة: sub_agent_client_required = نفس الـgate الحالي + رسالة
      // مخصَّصة؛ operator_confirmed_on_import = سلوك الافتراضي + يبقى
      // اقتراح الـimport-wizard متروكاً لـPR لاحق؛ main_agent_client =
      // معطَّل engine-side حتى تُضاف umrah_agents.clientId عبر migration
      // مُؤذَنة. كل ذلك موثَّق في U-11_agent_client_linkage_audit.md.
      {
        key: "clientLinkagePolicy",
        label: "سياسة ربط الوكيل الفرعي بالعميل المالي",
        type: "select",
        defaultValue: "operational_until_linked",
        options: [
          { value: "operational_until_linked", label: "تشغيلي حتى الربط الصريح (افتراضي وآمن)" },
          { value: "sub_agent_client_required", label: "الوكيل الفرعي عميل مستقل (بربط صريح)" },
          { value: "main_agent_client", label: "الوكيل الرئيسي هو العميل (تحتاج migration إضافية)" },
          { value: "operator_confirmed_on_import", label: "اقتراح ربط أثناء الاستيراد بتأكيد المُشغّل" },
        ],
        hint: "افتراضي عند الإنشاء: الوكيل الفرعي تشغيلي فقط. لا فاتورة، لا ذمم، حتى يربطه المُشغّل صراحةً عبر PUT /umrah/sub-agents/:id/link.",
      },
    ],
  },
  {
    id: "pricing",
    title: "سياسة التسعير",
    description: "اقتراح آخر سعر مستخدم + تجميد الباقات المنتهية.",
    icon: "Tag",
    fields: [
      { key: "suggestLastPriceByAgent", label: "اقتراح آخر سعر مستخدم لنفس الوكيل/الموسم", type: "boolean", defaultValue: true },
      { key: "freezePricesAfterInvoice", label: "تجميد سعر الباقة بعد إصدار أول فاتورة", type: "boolean", defaultValue: false },
    ],
  },
  {
    id: "commission",
    title: "سياسة العمولة",
    description: "حد الاعتماد التلقائي + سياسة الاسترداد عند الإلغاء.",
    icon: "Percent",
    fields: [
      { key: "maxAutoApprovalAmount", label: "الحد الأقصى للاعتماد التلقائي (SAR)", type: "number", defaultValue: 0, hint: "أي عمولة تتجاوز هذا الرقم تحتاج اعتماداً يدوياً." },
      { key: "clawbackOnCancellation", label: "استرداد العمولة عند إلغاء حجز الوكيل", type: "boolean", defaultValue: true },
      { key: "clawbackOnRefund", label: "استرداد العمولة عند استرداد الفاتورة", type: "boolean", defaultValue: true },
    ],
  },
  {
    id: "financial",
    title: "سياسة الترحيل المالي",
    description: "متى ترحَّل القيود المالية تلقائياً + سلوك الفشل.",
    icon: "DollarSign",
    fields: [
      { key: "autoPostNuskAp", label: "ترحيل قيد ذمم نسك تلقائياً عند إنشاء الفاتورة", type: "boolean", defaultValue: true, hint: "يُسلِّم لـ postNuskJournalEntries في #1867." },
      { key: "autoPostSalesRevenue", label: "ترحيل قيد إيراد المبيعات تلقائياً", type: "boolean", defaultValue: true },
      { key: "blockOnAccountMappingMissing", label: "رفض الترحيل إذا كانت تخصيصات الحسابات ناقصة", type: "boolean", defaultValue: true, hint: "بدله: تسجيل تحذير + ترك الفاتورة بدون قيد للمعالجة اليدوية." },
      // U-02b / M2 of #2080 — preparatory flag for the legacy umrah_transport
      // path containment. DECLARATIVE ONLY at this stage: no route, engine,
      // or UI reads this flag in M2. Subsequent stages (M3+) wire it into
      // POST/PATCH on /transport behind a separate owner authorisation; see
      // docs/governance/umrah-inventory-organization-repair/findings/
      // U-02b_transition_plan.md for the full migration ladder.
      { key: "legacyTransportWritesDisabled", label: "إيقاف الكتابة على المسار القديم لنقل العمرة (umrah_transport)", type: "boolean", defaultValue: false, hint: "M2 من U-02b — مفتاح مُعَدّ مسبقاً للاستخدام في مراحل لاحقة. قيمته الحالية لا أثر سلوكي لها." },
    ],
  },
  {
    id: "calendar",
    title: "سياسة التقويم",
    description: "الطبقات المفعَّلة افتراضياً + نافذة العرض.",
    icon: "CalendarDays",
    fields: [
      { key: "defaultEnabledLayers", label: "الطبقات المفعَّلة افتراضياً", type: "select", defaultValue: "all", options: [
        { value: "all", label: "كل الطبقات" },
        { value: "operations_only", label: "تشغيلية فقط (وصول/مغادرة/نقل)" },
        { value: "finance_only", label: "مالية فقط (فواتير نسك)" },
      ] },
      { key: "maxWindowDays", label: "أقصى نافذة عرض (يوم)", type: "number", defaultValue: 90 },
    ],
  },
  {
    id: "notifications",
    title: "سياسة التنبيهات",
    description: "متى يطلق النظام التنبيهات الداخلية + لمن.",
    icon: "Bell",
    fields: [
      { key: "notifyVisaExpiring", label: "تنبيه قرب انتهاء التأشيرة", type: "boolean", defaultValue: true },
      { key: "notifyDepartureTomorrow", label: "تنبيه مغادرة الغد", type: "boolean", defaultValue: true },
      { key: "notifyOverstay", label: "تنبيه التخلف", type: "boolean", defaultValue: true },
      { key: "notifyImportUnlinked", label: "تنبيه ظهور صفوف غير مربوطة بعد الاستيراد", type: "boolean", defaultValue: true },
    ],
  },
];

export const ALL_POLICY_IDS = UMRAH_POLICY_CATEGORIES.map((c) => c.id);
