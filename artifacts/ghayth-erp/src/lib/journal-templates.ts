/**
 * قوالب القيود الجاهزة — ١٢ نمطًا شائعًا (إهلاك، إطفاء مقدم، استحقاقات، عمولات بنكية…).
 *
 * بيانات نقية مشتركة: مصدر الحقيقة الواحد للقوالب. تستعملها صفحة «قيد يومية»
 * (journal-create) كمنتقي «ابدأ من قالب» لتعبئة سريعة. كانت مكرّرة داخل
 * journal-quick-templates المُحوَّلة بـredirect إلى /finance/journal/create (البند ٢ / م٦:
 * توحيد إنشاء القيد المباشر في صفحة واحدة، مع إبقاء قيد المسودة/الاعتماد مستقلًّا).
 */

export type JournalTemplateLine = {
  /** تلميح اسم الحساب (مثلاً «حساب مصروف الإهلاك»). */
  label: string;
  side: "debit" | "credit";
  defaultAccountCode?: string;
};

export type JournalTemplateCategory = "أصول" | "خصوم" | "إيرادات" | "مصاريف" | "حقوق ملكية" | "أخرى";

export type JournalTemplate = {
  id: string;
  name: string;
  description: string;
  category: JournalTemplateCategory;
  defaultDescription: string;
  lines: [JournalTemplateLine, JournalTemplateLine];
};

export const JOURNAL_TEMPLATES: JournalTemplate[] = [
  {
    id: "depreciation", name: "إهلاك شهري",
    description: "تسجيل قسط استهلاك شهري لأصل ثابت", category: "مصاريف",
    defaultDescription: "إهلاك شهر",
    lines: [
      { label: "حساب مصروف الإهلاك", side: "debit", defaultAccountCode: "5300" },
      { label: "مجمع الإهلاك (مقابل أصل)", side: "credit", defaultAccountCode: "1610" },
    ],
  },
  {
    id: "prepaid-amort", name: "إطفاء مصروف مدفوع مقدماً",
    description: "إطفاء قسط من مصروف مدفوع مقدماً (مثلاً تأمين/إيجار)", category: "مصاريف",
    defaultDescription: "إطفاء قسط مدفوع مقدماً",
    lines: [
      { label: "حساب المصروف", side: "debit" },
      { label: "حساب المصاريف المدفوعة مقدماً", side: "credit", defaultAccountCode: "1190" },
    ],
  },
  {
    id: "accrued-expense", name: "مصروف مستحق",
    description: "تسجيل مصروف لم تصدر له فاتورة بعد (مثلاً كهرباء/ماء)", category: "مصاريف",
    defaultDescription: "مصروف مستحق",
    lines: [
      { label: "حساب المصروف", side: "debit" },
      { label: "حساب المصاريف المستحقة", side: "credit", defaultAccountCode: "2200" },
    ],
  },
  {
    id: "salary-accrual", name: "تخصيص رواتب شهر",
    description: "تخصيص رواتب الشهر قبل تنفيذ الدفع", category: "خصوم",
    defaultDescription: "تخصيص رواتب شهر",
    lines: [
      { label: "مصروف رواتب", side: "debit", defaultAccountCode: "5100" },
      { label: "رواتب مستحقة الدفع", side: "credit", defaultAccountCode: "2110" },
    ],
  },
  {
    id: "gosi-accrual", name: "تخصيص اشتراك التأمينات",
    description: "حصة المنشأة + الموظف من GOSI", category: "خصوم",
    defaultDescription: "اشتراك التأمينات الاجتماعية",
    lines: [
      { label: "مصروف اشتراكات التأمينات", side: "debit", defaultAccountCode: "5110" },
      { label: "GOSI مستحق", side: "credit", defaultAccountCode: "2120" },
    ],
  },
  {
    id: "vacation-provision", name: "مخصص إجازات",
    description: "تخصيص شهري لإجازات الموظفين المتراكمة", category: "خصوم",
    defaultDescription: "مخصص إجازات شهري",
    lines: [
      { label: "مصروف إجازات", side: "debit", defaultAccountCode: "5120" },
      { label: "مخصص إجازات", side: "credit", defaultAccountCode: "2130" },
    ],
  },
  {
    id: "bank-charges", name: "عمولات بنكية",
    description: "خصومات وعمولات على الحساب البنكي", category: "مصاريف",
    defaultDescription: "عمولات بنكية",
    lines: [
      { label: "مصروف عمولات بنكية", side: "debit", defaultAccountCode: "5400" },
      { label: "حساب البنك", side: "credit", defaultAccountCode: "1110" },
    ],
  },
  {
    id: "interest-income", name: "إيراد فوائد بنكية",
    description: "فائدة محصلة من البنك على حساب وديعة", category: "إيرادات",
    defaultDescription: "إيراد فوائد بنكية",
    lines: [
      { label: "حساب البنك", side: "debit", defaultAccountCode: "1110" },
      { label: "إيراد فوائد", side: "credit", defaultAccountCode: "4200" },
    ],
  },
  {
    id: "owner-drawing", name: "سحوبات شخصية مالك",
    description: "سحب نقدي للمالك من الشركة", category: "حقوق ملكية",
    defaultDescription: "سحوبات شخصية للمالك",
    lines: [
      { label: "سحوبات المالك", side: "debit", defaultAccountCode: "3200" },
      { label: "النقدية أو البنك", side: "credit", defaultAccountCode: "1110" },
    ],
  },
  {
    id: "initial-capital", name: "إيداع رأس مال",
    description: "إيداع رأس مال جديد من المالك", category: "حقوق ملكية",
    defaultDescription: "إيداع رأس مال",
    lines: [
      { label: "البنك", side: "debit", defaultAccountCode: "1110" },
      { label: "رأس المال", side: "credit", defaultAccountCode: "3100" },
    ],
  },
  {
    id: "reclassification", name: "إعادة تصنيف بين حسابين",
    description: "نقل رصيد من حساب لحساب آخر (تصحيح تصنيف)", category: "أخرى",
    defaultDescription: "إعادة تصنيف",
    lines: [
      { label: "الحساب المراد التحويل إليه", side: "debit" },
      { label: "الحساب المراد التحويل منه", side: "credit" },
    ],
  },
  {
    id: "write-off", name: "شطب دين/أصل",
    description: "شطب رصيد عميل غير قابل للتحصيل أو أصل تالف", category: "مصاريف",
    defaultDescription: "شطب رصيد",
    lines: [
      { label: "مصروف الشطب", side: "debit", defaultAccountCode: "5180" },
      { label: "الحساب المراد شطبه", side: "credit" },
    ],
  },
];
