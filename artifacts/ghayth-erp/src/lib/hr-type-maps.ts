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
  new:       { label: "جديد",         color: "bg-blue-100 text-status-info-foreground border-status-info-surface" },
  screening: { label: "فرز",          color: "bg-yellow-100 text-yellow-700 border-yellow-300" },
  interview: { label: "مقابلة",       color: "bg-purple-100 text-purple-700 border-purple-300" },
  offer:     { label: "عرض",          color: "bg-green-100 text-status-success-foreground border-status-success-surface" },
  hired:     { label: "تم التوظيف",   color: "bg-emerald-100 text-emerald-700 border-emerald-300" },
  rejected:  { label: "مرفوض",        color: "bg-red-100 text-status-error-foreground border-red-300" },
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
  driving_license: "رخصة قيادة",
  vehicle_registration: "رخصة سير",
  vehicle_insurance: "تأمين مركبة",
  vehicle_inspection: "فحص دوري",
  commercial_registration: "سجل تجاري",
  chamber_of_commerce: "غرفة تجارية",
  municipality_license: "رخصة بلدية",
};

export const DOCUMENT_COLORS: Record<string, string> = {
  work_permit: "border-status-info-surface text-status-info-foreground bg-status-info-surface",
  iqama: "border-purple-300 text-purple-700 bg-purple-50",
  passport: "border-status-success-surface text-status-success-foreground bg-status-success-surface",
  contract: "border-orange-300 text-orange-700 bg-orange-50",
  driving_license: "border-cyan-300 text-cyan-700 bg-cyan-50",
  vehicle_registration: "border-teal-300 text-teal-700 bg-teal-50",
  vehicle_insurance: "border-indigo-300 text-indigo-700 bg-indigo-50",
  vehicle_inspection: "border-slate-300 text-slate-700 bg-slate-50",
  commercial_registration: "border-rose-300 text-rose-700 bg-rose-50",
  chamber_of_commerce: "border-status-warning-surface text-status-warning-foreground bg-status-warning-surface",
  municipality_license: "border-lime-300 text-lime-700 bg-lime-50",
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

// ── حالات السلف ─────────────────────────────────────────────────────
export const LOAN_STATUS: Record<string, { label: string; color: string }> = {
  pending:   { label: "بانتظار الموافقة", color: "bg-amber-100 text-status-warning-foreground border-status-warning-surface" },
  active:    { label: "نشطة",             color: "bg-blue-100 text-status-info-foreground border-status-info-surface"    },
  completed: { label: "مكتملة",           color: "bg-green-100 text-status-success-foreground border-status-success-surface" },
  rejected:  { label: "مرفوضة",           color: "bg-red-100 text-status-error-foreground border-red-300"       },
};

// ── حالات أقساط السلف ──────────────────────────────────────────────
export const INSTALLMENT_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: "قادم",   color: "text-status-warning-foreground bg-status-warning-surface" },
  paid:    { label: "مدفوع",  color: "text-status-success-foreground bg-status-success-surface" },
  overdue: { label: "متأخر",  color: "text-status-error-foreground bg-status-error-surface"     },
};

// ── حالات طلبات نهاية الخدمة ────────────────────────────────────────
export const EXIT_REQUEST_STATUS: Record<string, { label: string; color: string }> = {
  pending:     { label: "بانتظار الموافقة", color: "bg-amber-100 text-status-warning-foreground border-status-warning-surface"  },
  approved:    { label: "معتمد",            color: "bg-blue-100 text-status-info-foreground border-status-info-surface"     },
  in_progress: { label: "جاري التنفيذ",     color: "bg-purple-100 text-purple-700 border-purple-300" },
  completed:   { label: "مكتمل",            color: "bg-green-100 text-status-success-foreground border-status-success-surface"  },
  rejected:    { label: "مرفوض",            color: "bg-red-100 text-status-error-foreground border-red-300"        },
  cancelled:   { label: "ملغي",             color: "bg-gray-100 text-muted-foreground border-border"     },
};

// ── حالات إخلاء الطرف ──────────────────────────────────────────────
export const CLEARANCE_STATUS: Record<string, { label: string; color: string }> = {
  pending:  { label: "معلق",  color: "text-status-warning-foreground bg-status-warning-surface" },
  cleared:  { label: "تم",    color: "text-status-success-foreground bg-status-success-surface" },
  rejected: { label: "مرفوض", color: "text-status-error-foreground bg-status-error-surface"     },
};

// ── حالات سلسلة الموافقات ──────────────────────────────────────────
export const APPROVAL_CHAIN_STATUS: Record<string, { label: string; color: string }> = {
  pending:   { label: "معلق",  color: "bg-yellow-100 text-yellow-700 border-yellow-300"  },
  approved:  { label: "موافق", color: "bg-green-100 text-status-success-foreground border-status-success-surface"     },
  rejected:  { label: "مرفوض", color: "bg-red-100 text-status-error-foreground border-red-300"           },
  escalated: { label: "تصعيد", color: "bg-purple-100 text-purple-700 border-purple-300"  },
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
  low:      { label: "بسيطة",  color: "bg-blue-100 text-status-info-foreground" },
  medium:   { label: "متوسطة", color: "bg-amber-100 text-status-warning-foreground" },
  high:     { label: "جسيمة",  color: "bg-red-100 text-status-error-foreground" },
  critical: { label: "حرج",    color: "bg-red-200 text-red-800" },
};

// ── مكونات الرواتب ──────────────────────────────────────────────────
export const SALARY_COMPONENT_TYPES: Record<string, string> = {
  fixed: "ثابت",
  percentage: "نسبة",
  variable: "متغير",
  formula: "معادلة",
};

export const SALARY_CATEGORIES: Record<string, string> = {
  allowance: "بدل",
  earning: "استحقاق",
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
  national: "bg-green-100 text-status-success-foreground",
  religious: "bg-purple-100 text-purple-700",
  custom: "bg-blue-100 text-status-info-foreground",
};

// ── مستويات العقوبات ────────────────────────────────────────────────
export const PENALTY_LEVELS: Record<number, { label: string; color: string; bg: string }> = {
  1: { label: "تنبيه شفهي",       color: "text-yellow-700", bg: "bg-yellow-50" },
  2: { label: "إنذار كتابي أول",  color: "text-orange-700", bg: "bg-orange-50" },
  3: { label: "إنذار كتابي ثاني", color: "text-status-error-foreground",    bg: "bg-status-error-surface" },
  4: { label: "خصم من الراتب",    color: "text-status-error-foreground",    bg: "bg-red-100" },
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

// ── معاملات ضرب الوقت الإضافي ──────────────────────────────────────
export const OVERTIME_MULTIPLIERS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "1.25", label: "×1.25 — أيام عادية (بعض القطاعات)" },
  { value: "1.50", label: "×1.50 — المعدل الافتراضي (نظام العمل)" },
  { value: "2.00", label: "×2.00 — أيام العطل والإجازات" },
];

// ── أنواع التدريب ──────────────────────────────────────────────────
export const TRAINING_TYPES: ReadonlyArray<{ value: string; label: string; icon: string; color: string }> = [
  { value: "workshop", label: "ورشة عمل", icon: "🔧", color: "bg-status-info-surface text-status-info-foreground border-status-info-surface" },
  { value: "course", label: "دورة تدريبية", icon: "📚", color: "bg-status-success-surface text-status-success-foreground border-status-success-surface" },
  { value: "seminar", label: "ندوة", icon: "🎤", color: "bg-purple-50 text-purple-700 border-purple-200" },
  { value: "online", label: "تدريب عن بعد", icon: "💻", color: "bg-cyan-50 text-cyan-700 border-cyan-200" },
  { value: "on_the_job", label: "تدريب على رأس العمل", icon: "🏢", color: "bg-orange-50 text-orange-700 border-orange-200" },
];

// ── تصنيفات التدريب ────────────────────────────────────────────────
export const TRAINING_CATEGORIES: ReadonlyArray<{ value: string; label: string }> = [
  { value: "technical", label: "تقني" },
  { value: "management", label: "إداري" },
  { value: "safety", label: "سلامة وصحة مهنية" },
  { value: "soft-skills", label: "مهارات شخصية" },
  { value: "compliance", label: "امتثال وتنظيم" },
  { value: "leadership", label: "قيادة وإدارة" },
];

// ── أنواع التوظيف ──────────────────────────────────────────────────
export const JOB_TYPES: ReadonlyArray<{ value: string; label: string; color: string }> = [
  { value: "full-time", label: "دوام كامل", color: "bg-status-success-surface text-status-success-foreground border-status-success-surface" },
  { value: "part-time", label: "دوام جزئي", color: "bg-status-info-surface text-status-info-foreground border-status-info-surface" },
  { value: "contract", label: "عقد مؤقت", color: "bg-orange-50 text-orange-700 border-orange-200" },
  { value: "internship", label: "تدريب تعاوني", color: "bg-purple-50 text-purple-700 border-purple-200" },
];

// ── مستويات الخبرة ─────────────────────────────────────────────────
export const EXPERIENCE_LEVELS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "entry", label: "مبتدئ (0-2 سنوات)" },
  { value: "mid", label: "متوسط (3-5 سنوات)" },
  { value: "senior", label: "خبير (6-10 سنوات)" },
  { value: "lead", label: "قيادي (+10 سنوات)" },
];

// ── المؤهلات العلمية ───────────────────────────────────────────────
export const EDUCATION_LEVELS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "high_school", label: "ثانوية" },
  { value: "diploma", label: "دبلوم" },
  { value: "bachelor", label: "بكالوريوس" },
  { value: "master", label: "ماجستير" },
  { value: "phd", label: "دكتوراه" },
];

// ── مصادر التقديم ──────────────────────────────────────────────────
export const APPLICANT_SOURCES: ReadonlyArray<{ value: string; label: string }> = [
  { value: "website", label: "الموقع الإلكتروني" },
  { value: "linkedin", label: "لينكد إن" },
  { value: "referral", label: "ترشيح داخلي" },
  { value: "agency", label: "وكالة توظيف" },
  { value: "job_fair", label: "معرض توظيف" },
  { value: "other", label: "أخرى" },
];

// ── حالات النقل ────────────────────────────────────────────────────
export const TRANSFER_STATUS: Record<string, { label: string; color: string }> = {
  pending:  { label: "بانتظار الموافقة", color: "bg-amber-100 text-status-warning-foreground border-status-warning-surface" },
  approved: { label: "معتمد",            color: "bg-green-100 text-status-success-foreground border-status-success-surface" },
  rejected: { label: "مرفوض",            color: "bg-red-100 text-status-error-foreground border-red-300" },
};

// ── حالات خطط التطوير الفردية ──────────────────────────────────────
export const IDP_STATUS: Record<string, { label: string; color: string }> = {
  planned:     { label: "مخطط",        color: "bg-blue-100 text-status-info-foreground border-status-info-surface" },
  in_progress: { label: "قيد التنفيذ", color: "bg-amber-100 text-status-warning-foreground border-status-warning-surface" },
  completed:   { label: "مكتمل",       color: "bg-green-100 text-status-success-foreground border-status-success-surface" },
  cancelled:   { label: "ملغي",        color: "bg-red-100 text-status-error-foreground border-red-300" },
};

// ── حالات الوقت الإضافي ────────────────────────────────────────────
export const OVERTIME_STATUS: Record<string, { label: string; color: string }> = {
  pending:  { label: "بانتظار الموافقة", color: "bg-amber-100 text-status-warning-foreground border-status-warning-surface" },
  approved: { label: "معتمد",            color: "bg-green-100 text-status-success-foreground border-status-success-surface" },
  rejected: { label: "مرفوض",            color: "bg-red-100 text-status-error-foreground border-red-300" },
  paid:     { label: "تم الصرف",         color: "bg-blue-100 text-status-info-foreground border-status-info-surface" },
};

// ── حالات محاضر المخالفات ───────────────────────────────────────────
export const VIOLATION_STATUS: Record<string, { label: string; color: string }> = {
  draft:                { label: "مسودة",            color: "bg-gray-100 text-gray-700 border-border" },
  pending_employee:     { label: "بانتظار الموظف",   color: "bg-amber-100 text-status-warning-foreground border-status-warning-surface" },
  pending_manager:      { label: "بانتظار المدير",   color: "bg-orange-100 text-orange-700 border-orange-300" },
  pending_hr_decision:  { label: "بانتظار HR",       color: "bg-blue-100 text-status-info-foreground border-status-info-surface" },
  approved:             { label: "مُنفَّذ",          color: "bg-green-100 text-status-success-foreground border-status-success-surface" },
  rejected:             { label: "مرفوض",            color: "bg-red-100 text-status-error-foreground border-red-300" },
  appealed:             { label: "استئناف",           color: "bg-purple-100 text-purple-700 border-purple-300" },
  cancelled:            { label: "ملغي",             color: "bg-gray-100 text-muted-foreground border-border" },
};

// ── أسماء الأشهر بالعربي ────────────────────────────────────────────
export const MONTHS_AR = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
] as const;
