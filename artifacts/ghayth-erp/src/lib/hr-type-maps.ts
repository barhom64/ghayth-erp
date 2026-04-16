/**
 * Centralized Arabic label maps for the HR module.
 * Single source of truth — import from here instead of defining inline.
 */

// ── أنواع المخالفات / الوقائع ──────────────────────────────────────
export const INCIDENT_LABELS: Record<string, string> = {
  late: "تأخر",
  early_leave: "مغادرة مبكرة",
  absence: "غياب",
  behavior: "سلوك",
  organization: "تنظيم",
  gps_out_of_range: "خروج عن النطاق",
  custom: "مخصّص",
};

// ── مراحل التوظيف ───────────────────────────────────────────────────
export const RECRUITMENT_STAGES: Record<string, { label: string; color: string }> = {
  new:       { label: "جديد",         color: "bg-blue-100 text-blue-700 border-blue-300" },
  screening: { label: "فرز",          color: "bg-yellow-100 text-yellow-700 border-yellow-300" },
  interview: { label: "مقابلة",       color: "bg-purple-100 text-purple-700 border-purple-300" },
  offer:     { label: "عرض",          color: "bg-green-100 text-green-700 border-green-300" },
  hired:     { label: "تم التوظيف",   color: "bg-emerald-100 text-emerald-700 border-emerald-300" },
  rejected:  { label: "مرفوض",        color: "bg-red-100 text-red-700 border-red-300" },
};

// ── أنواع الإجازات ──────────────────────────────────────────────────
export const LEAVE_TYPES: Record<string, string> = {
  annual: "سنوية",
  sick: "مرضية",
  personal: "شخصية",
  unpaid: "بدون راتب",
  maternity: "أمومة",
  paternity: "أبوة",
  emergency: "طارئة",
};

// ── أدوار الموافقة ──────────────────────────────────────────────────
export const APPROVAL_ROLES: Record<string, string> = {
  manager: "المدير المباشر",
  branch_manager: "مدير الفرع",
  hr: "الموارد البشرية",
  hr_manager: "مدير الموارد البشرية",
  general_manager: "المدير العام",
  finance_manager: "المدير المالي",
  owner: "المالك",
  director: "المدير العام",
  finance: "المالية",
};

// ── أنواع الخطابات الرسمية ──────────────────────────────────────────
export const LETTER_TYPES: Record<string, string> = {
  general: "عام",
  employment_certificate: "شهادة عمل",
  salary_certificate: "شهادة راتب",
  experience_letter: "شهادة خبرة",
  warning_letter: "خطاب إنذار",
  termination_letter: "خطاب إنهاء خدمة",
};

// ── أنواع الوثائق ───────────────────────────────────────────────────
export const DOCUMENT_TYPES: Record<string, string> = {
  work_permit: "تصريح عمل",
  iqama: "إقامة",
  passport: "جواز سفر",
  contract: "عقد عمل",
};

export const DOCUMENT_COLORS: Record<string, string> = {
  work_permit: "border-blue-300 text-blue-700 bg-blue-50",
  iqama: "border-purple-300 text-purple-700 bg-purple-50",
  passport: "border-green-300 text-green-700 bg-green-50",
  contract: "border-orange-300 text-orange-700 bg-orange-50",
};

// ── أسباب نهاية الخدمة / الدوران ────────────────────────────────────
export const EXIT_TYPES: Record<string, string> = {
  resignation: "استقالة",
  termination: "فصل",
  end_of_service: "إنهاء خدمة",
  contract_end: "انتهاء عقد",
  retirement: "تقاعد",
  mutual: "اتفاق متبادل",
  unknown: "غير محدد",
};

// ── أنواع إنهاء الخدمة (لحساب المكافأة وفق نظام العمل السعودي) ──────
export const TERMINATION_TYPES: Record<string, string> = {
  end_of_service: "إنهاء خدمة من قبل صاحب العمل",
  resignation: "استقالة",
  contract_end: "انتهاء العقد",
  retirement: "تقاعد",
  termination: "فصل تأديبي",
};

// ── أنواع السلف ─────────────────────────────────────────────────────
export const LOAN_TYPES: Record<string, string> = {
  salary_advance: "سلفة راتب",
  personal: "سلفة شخصية",
  emergency: "سلفة طارئة",
  housing: "سكن",
  vehicle: "مركبة",
  education: "تعليمية",
};

// ── مستويات الخطورة ─────────────────────────────────────────────────
export const SEVERITY_LEVELS: Record<string, { label: string; color: string }> = {
  low:      { label: "بسيطة",  color: "bg-blue-100 text-blue-700" },
  medium:   { label: "متوسطة", color: "bg-amber-100 text-amber-700" },
  high:     { label: "جسيمة",  color: "bg-red-100 text-red-700" },
  critical: { label: "حرج",    color: "bg-red-200 text-red-800" },
};

// ── مكونات الرواتب ──────────────────────────────────────────────────
export const SALARY_COMPONENT_TYPES: Record<string, string> = {
  fixed: "ثابت",
  percentage: "نسبة",
  variable: "متغير",
};

export const SALARY_CATEGORIES: Record<string, string> = {
  allowance: "بدل",
  deduction: "خصم",
  benefit: "مزايا",
};

// ── أنواع العطل ─────────────────────────────────────────────────────
export const HOLIDAY_TYPES: Record<string, string> = {
  national: "وطنية",
  religious: "دينية",
  custom: "خاصة بالشركة",
};

export const HOLIDAY_COLORS: Record<string, string> = {
  national: "bg-green-100 text-green-700",
  religious: "bg-purple-100 text-purple-700",
  custom: "bg-blue-100 text-blue-700",
};

// ── مستويات العقوبات ────────────────────────────────────────────────
export const PENALTY_LEVELS: Record<number, { label: string; color: string; bg: string }> = {
  1: { label: "تنبيه شفهي",       color: "text-yellow-700", bg: "bg-yellow-50" },
  2: { label: "إنذار كتابي أول",  color: "text-orange-700", bg: "bg-orange-50" },
  3: { label: "إنذار كتابي ثاني", color: "text-red-600",    bg: "bg-red-50" },
  4: { label: "خصم من الراتب",    color: "text-red-700",    bg: "bg-red-100" },
  5: { label: "إيقاف مؤقت",       color: "text-red-800",    bg: "bg-red-200" },
};

// ── إجراءات محاضر التحقيق ───────────────────────────────────────────
export const MEMO_ACTION_LABELS: Record<string, string> = {
  created: "إنشاء المحضر",
  justified: "تقديم التبرير",
  manager_recommended: "توصية المدير",
  gm_decided: "قرار المدير العام",
  penalty_applied: "تطبيق الجزاء",
  cancelled: "إلغاء المحضر",
  escalated: "تصعيد",
};

// ── أسماء الأشهر بالعربي ────────────────────────────────────────────
export const MONTHS_AR = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
] as const;
