/**
 * تنبيه اقتراب سن التقاعد — يُفعّل حقل `dateOfBirth` الموجود على الموظف تلقائيًّا.
 *
 * نظام التقاعد السعودي: السن النظامي 60 سنة (قابل للضبط لكل شركة). المطلوب أن
 * «ينتبه النظام تلقائيًّا» قبل بلوغ الموظف سن التقاعد بمهلةٍ كافية ليُحضّر قسمُ
 * الموارد البشرية إجراءات نهاية الخدمة ومكافأتها. عتبات التنبيه: 180/90/30/7/0
 * يومًا قبل عيد الميلاد الذي يبلغ فيه السن النظامي.
 *
 * دالة نقية: بلا قاعدة بيانات وبلا وقت — المستدعي يمرّر asOfDate فتُثبِّت
 * الاختبارات اليوم. تُنسَّق تواريخ UTC من مكوّناتها (لا `toISOString().slice`)
 * تفاديًا لانزياح المنطقة الزمنية (حارس check:utc-time-drift).
 */

export const RETIREMENT_ALERT_THRESHOLDS_DAYS: readonly number[] = [180, 90, 30, 7, 0];
/** سن التقاعد النظامي السعودي الافتراضي (قابل للضبط لكل شركة عبر الإعدادات). */
export const DEFAULT_RETIREMENT_AGE = 60;

export interface RetirementWatch {
  employeeId: number;
  dateOfBirth: string; // YYYY-MM-DD
  /** تاريخ بلوغ سن التقاعد (عيد الميلاد رقم retirementAge) — YYYY-MM-DD */
  retirementDate: string;
  daysLeft: number;
}

const pad2 = (n: number): string => String(n).padStart(2, "0");

/**
 * أعِد الموظفين الذين يعبُرون اليومَ إحدى عتبات التنبيه قبل بلوغ سن التقاعد.
 * من تجاوز سن التقاعد (daysLeft سالب) يخرج من نطاق التنبيه الاستباقي.
 */
export function selectApproachingRetirement(opts: {
  asOfDate: string; // YYYY-MM-DD
  retirementAge?: number;
  thresholds?: readonly number[];
  employees: Array<{ employeeId: number; dateOfBirth: string | null | undefined }>;
}): RetirementWatch[] {
  const asOf = new Date(opts.asOfDate + "T00:00:00Z");
  if (Number.isNaN(asOf.getTime())) {
    throw new Error(`Retirement alerts: invalid asOfDate "${opts.asOfDate}"`);
  }
  const age = opts.retirementAge ?? DEFAULT_RETIREMENT_AGE;
  const thresholds = new Set(opts.thresholds ?? RETIREMENT_ALERT_THRESHOLDS_DAYS);

  const out: RetirementWatch[] = [];
  for (const emp of opts.employees) {
    if (!emp.dateOfBirth) continue;
    const dob = new Date(emp.dateOfBirth + "T00:00:00Z");
    if (Number.isNaN(dob.getTime())) continue;

    // عيد الميلاد الذي يبلغ فيه السن النظامي — بمكوّنات UTC (يتعامل مع 29 فبراير
    // بالتدحرج الطبيعي إلى مارس في السنوات غير الكبيسة، وهو فرقٌ يوم مقبول).
    const retire = new Date(Date.UTC(dob.getUTCFullYear() + age, dob.getUTCMonth(), dob.getUTCDate()));
    const daysLeft = Math.round((retire.getTime() - asOf.getTime()) / (24 * 60 * 60 * 1000));
    if (daysLeft < 0) continue;
    if (!thresholds.has(daysLeft)) continue;

    const retirementDate = `${retire.getUTCFullYear()}-${pad2(retire.getUTCMonth() + 1)}-${pad2(retire.getUTCDate())}`;
    out.push({ employeeId: emp.employeeId, dateOfBirth: emp.dateOfBirth, retirementDate, daysLeft });
  }
  return out;
}
