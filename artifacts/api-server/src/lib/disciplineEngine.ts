// ============================================================================
// disciplineEngine.ts
// محرك لائحة الانضباط — يحوّل بيانات واقعة (تأخر/غياب/مغادرة مبكرة/…)
// إلى مادة من لائحة hr_discipline_regulation ثم إلى جزاء ماليّ فعليّ.
//
// مصمم ليكون:
//   - idempotent: لا يُنشئ جزاءً مكرراً عند إعادة التنفيذ على نفس الواقعة
//   - صحيح البيانات: يحتسب الأجر اليومي بدقة، ويحمي من القيم السالبة/NaN
//   - ذو مرجع قانوني: يعيد مرجع المادة والجزاء النصّي الأصلي للعرض
//
// HR-013: يكتب لجدول `hr_inquiry_memos` (إنشاء/تصعيد المذكّرات) فقط؛ سجلّ
// الحادث في `employee_violations` يبقى ملك autoViolationEngine، والربط
// بين المرحلتين عبر employee_violations."inquiryMemoId" (FK في هجرة 195).
// ============================================================================

import { rawQuery, rawExecute } from "./rawdb.js";
import { currentYear, roundTo2 } from "./businessHelpers.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type IncidentType =
  | "late"          // تأخر عن الحضور
  | "early_leave"   // مغادرة مبكرة
  | "absence"       // غياب
  | "behavior"      // سلوك
  | "organization"  // تنظيم
  | "gps_out_of_range"
  | "custom";

export interface RegulationRow {
  id: number;
  section: string;
  articleNumber: number;
  title: string;
  penalty1: string | null;
  penalty2: string | null;
  penalty3: string | null;
  penalty4: string | null;
  extraDeduction: string | null;
  severity: string;
  isTermination: boolean;
  legalReference: string | null;
}

export interface PenaltyResolution {
  regulation: RegulationRow;
  occurrenceCount: number;          // 1..4+
  penaltyLabel: string;              // النص الحرفي من اللائحة
  baseDeductionAmount: number;       // الخصم الأساسي من العقوبة
  extraDeductionAmount: number;      // الحسم الإضافي (دقائق التأخر، أجر الغياب…)
  totalDeductionAmount: number;      // المجموع
  isTermination: boolean;
  terminationType?: "with_benefits" | "without_benefits";
  warningOnly: boolean;              // إنذار كتابي فقط
  // human-readable reasoning (يُسجَّل على المحضر)
  reason: string;
}

export interface IncidentInput {
  companyId: number;
  assignmentId: number;
  employeeId: number;
  dailyWage: number;                  // الأجر اليومي
  incidentType: IncidentType;
  incidentDate: string;               // YYYY-MM-DD
  // كل الحقول التالية اختيارية؛ تعتمد على نوع الواقعة
  durationMinutes?: number;           // للتأخر/المغادرة المبكرة
  absenceDays?: number;               // عدد أيام الغياب المتصل
  disruptsOthers?: boolean;           // هل عطّل عمال آخرين؟
  customRegulationId?: number;        // استخدام مادة معينة (للسلوك/التنظيم)
}

// ─────────────────────────────────────────────────────────────────────────────
// Article lookup
// ─────────────────────────────────────────────────────────────────────────────

async function getRegulationByArticle(
  companyId: number,
  section: string,
  articleNumber: number
): Promise<RegulationRow | null> {
  const [row] = await rawQuery<RegulationRow>(
    `SELECT id, section, "articleNumber", title,
            penalty1, penalty2, penalty3, penalty4,
            "extraDeduction", severity, "isTermination", "legalReference"
     FROM hr_discipline_regulation
     WHERE "companyId" = $1 AND section = $2 AND "articleNumber" = $3
       AND "isActive" = TRUE AND "deletedAt" IS NULL
     LIMIT 1`,
    [companyId, section, articleNumber]
  );
  return row ?? null;
}

/**
 * يختار المادة المناسبة للواقعة بناءً على نوعها ومدّتها.
 * يعيد null إذا لم تنطبق أي مادة (مثلاً: تأخر صفر دقائق)
 */
export async function resolveArticle(
  input: IncidentInput
): Promise<RegulationRow | null> {
  const { companyId, incidentType, durationMinutes, absenceDays, disruptsOthers } = input;

  // مرجع خارجي صريح
  if (input.customRegulationId) {
    const [row] = await rawQuery<RegulationRow>(
      `SELECT id, section, "articleNumber", title,
              penalty1, penalty2, penalty3, penalty4,
              "extraDeduction", severity, "isTermination", "legalReference"
       FROM hr_discipline_regulation
       WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [input.customRegulationId, companyId]
    );
    return row ?? null;
  }

  if (incidentType === "late") {
    const mins = Math.max(0, Math.floor(durationMinutes ?? 0));
    if (mins <= 0) return null;
    const disrupts = !!disruptsOthers;

    // 0-15 دقيقة
    if (mins <= 15) return getRegulationByArticle(companyId, "work_time", disrupts ? 2 : 1);
    // 16-30 دقيقة
    if (mins <= 30) return getRegulationByArticle(companyId, "work_time", disrupts ? 4 : 3);
    // 31-60 دقيقة
    if (mins <= 60) return getRegulationByArticle(companyId, "work_time", disrupts ? 6 : 5);
    // أكثر من ساعة
    return getRegulationByArticle(companyId, "work_time", 7);
  }

  if (incidentType === "early_leave") {
    const mins = Math.max(0, Math.floor(durationMinutes ?? 0));
    if (mins <= 0) return null;
    if (mins <= 15) return getRegulationByArticle(companyId, "work_time", 8);
    return getRegulationByArticle(companyId, "work_time", 9);
  }

  if (incidentType === "absence") {
    const days = Math.max(0, Math.floor(absenceDays ?? 1));
    if (days <= 0) return null;
    if (days === 1) return getRegulationByArticle(companyId, "work_time", 11);
    if (days <= 6) return getRegulationByArticle(companyId, "work_time", 12);
    if (days <= 10) return getRegulationByArticle(companyId, "work_time", 13);
    if (days <= 14) return getRegulationByArticle(companyId, "work_time", 14);
    return getRegulationByArticle(companyId, "work_time", 15);
  }

  // gps_out_of_range / behavior / organization / custom → مواد مخصّصة (تُختار يدوياً عادة)
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Occurrence counter — تحصي تكرار نفس مادة اللائحة على نفس التعيين خلال السنة العقدية
// ─────────────────────────────────────────────────────────────────────────────

export async function countPriorOccurrences(params: {
  companyId: number;
  assignmentId: number;
  regulationId: number;
  windowDays?: number;    // افتراضي: 365 يوم (السنة العقدية)
}): Promise<number> {
  const windowDays = params.windowDays ?? 365;
  const [row] = await rawQuery<{ cnt: string }>(
    `SELECT COUNT(*)::int AS cnt
       FROM hr_inquiry_memos
      WHERE "companyId" = $1
        AND "assignmentId" = $2
        AND "regulationId" = $3
        AND status = 'approved'
        AND "deletedAt" IS NULL
        AND "incidentDate" >= (CURRENT_DATE - ($4 || ' days')::interval)::date`,
    [params.companyId, params.assignmentId, params.regulationId, windowDays]
  );
  return Number(row?.cnt ?? 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Penalty text → amount resolution
// ─────────────────────────────────────────────────────────────────────────────

const DAY_TOKENS: Record<string, number> = {
  "يوم": 1, "يوماً": 1, "يوما": 1,
  "يومان": 2, "يومين": 2,
  "ثلاثة أيام": 3, "٣ أيام": 3, "3 أيام": 3,
  "أربعة أيام": 4, "٤ أيام": 4, "4 أيام": 4,
  "خمسة أيام": 5, "٥ أيام": 5, "5 أيام": 5,
};

// Match longer tokens before shorter ones so that "يومان" is not swallowed
// by "يوم" (which is a substring of "يومان" / "يومين"). Without this ordering
// every 2-day penalty collapses to 1 day.
const DAY_TOKENS_SORTED: Array<[string, number]> = Object.entries(DAY_TOKENS).sort(
  (a, b) => b[0].length - a[0].length,
);

/**
 * يحوّل نص الجزاء إلى {amount, warningOnly, termination} بناءً على الأجر اليومي.
 *   "5%"                      → 5% من اليوم
 *   "يوم"                     → أجر يوم كامل
 *   "يومان"                   → أجر يومين
 *   "ثلاثة أيام"              → 3 أيام
 *   "إنذار كتابي"             → 0 مع warningOnly=true
 *   "فصل مع المكافأة"        → 0 مع termination_with
 *   "فصل بدون مكافأة …"     → 0 مع termination_without
 *   "الحرمان من الترقيات …" → 0 (عقوبة إدارية غير مالية)
 */
export function parsePenaltyLabel(
  label: string | null | undefined,
  dailyWage: number
): { amount: number; warningOnly: boolean; termination: null | "with_benefits" | "without_benefits" } {
  if (!label || label.trim() === "" || label.trim() === "-") {
    return { amount: 0, warningOnly: false, termination: null };
  }
  const t = label.trim();
  const safeWage = Number.isFinite(dailyWage) && dailyWage > 0 ? dailyWage : 0;

  // إنذار كتابي / شفهي
  if (/إنذار/.test(t)) {
    return { amount: 0, warningOnly: true, termination: null };
  }
  // الفصل
  if (/فصل/.test(t)) {
    if (/بدون مكافأة|دون مكافأة/.test(t)) {
      return { amount: 0, warningOnly: false, termination: "without_benefits" };
    }
    return { amount: 0, warningOnly: false, termination: "with_benefits" };
  }
  // الحرمان من الترقيات (عقوبة إدارية، لا خصم مالي)
  if (/حرمان من الترقيات|حرمان من العلاوات/.test(t)) {
    return { amount: 0, warningOnly: false, termination: null };
  }
  // نسبة مئوية من الأجر اليومي
  const pctMatch = t.match(/(\d{1,3})\s*%/);
  if (pctMatch) {
    const pct = Math.min(100, Math.max(0, Number(pctMatch[1])));
    return { amount: roundTo2((safeWage * pct) / 100), warningOnly: false, termination: null };
  }
  // أيام مذكورة (longest token first — see DAY_TOKENS_SORTED comment)
  for (const [tok, days] of DAY_TOKENS_SORTED) {
    if (t.includes(tok)) {
      return { amount: roundTo2(safeWage * days), warningOnly: false, termination: null };
    }
  }
  // unknown — نعتبرها عقوبة إدارية غير مالية لتجنب خصم خاطئ
  return { amount: 0, warningOnly: false, termination: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolve the full penalty for an incident (no DB writes)
// ─────────────────────────────────────────────────────────────────────────────

export async function resolvePenalty(
  input: IncidentInput
): Promise<PenaltyResolution | null> {
  const reg = await resolveArticle(input);
  if (!reg) return null;

  const prior = await countPriorOccurrences({
    companyId: input.companyId,
    assignmentId: input.assignmentId,
    regulationId: reg.id,
  });
  const occurrenceCount = Math.min(4, prior + 1);

  const penaltyText =
    occurrenceCount === 1 ? reg.penalty1 :
    occurrenceCount === 2 ? reg.penalty2 :
    occurrenceCount === 3 ? reg.penalty3 :
    reg.penalty4;

  const dailyWage = Number.isFinite(input.dailyWage) && input.dailyWage > 0 ? input.dailyWage : 0;
  const parsed = parsePenaltyLabel(penaltyText, dailyWage);

  // الحسم الإضافي (أجر دقائق التأخر / أجر مدة الغياب)
  let extraDeductionAmount = 0;
  if (reg.extraDeduction && dailyWage > 0) {
    if (input.incidentType === "late" && input.durationMinutes) {
      const minuteRate = dailyWage / 480; // 8 ساعات
      extraDeductionAmount = roundTo2(minuteRate * input.durationMinutes);
    } else if (input.incidentType === "early_leave" && input.durationMinutes) {
      const minuteRate = dailyWage / 480;
      extraDeductionAmount = roundTo2(minuteRate * input.durationMinutes);
    } else if (input.incidentType === "absence" && input.absenceDays) {
      extraDeductionAmount = roundTo2(dailyWage * input.absenceDays);
    }
  }

  // حماية من القيم السالبة/NaN
  const baseDeductionAmount = Number.isFinite(parsed.amount) && parsed.amount > 0 ? parsed.amount : 0;
  extraDeductionAmount = Number.isFinite(extraDeductionAmount) && extraDeductionAmount > 0 ? extraDeductionAmount : 0;

  const isTermination = reg.isTermination || parsed.termination !== null;

  return {
    regulation: reg,
    occurrenceCount,
    penaltyLabel: penaltyText ?? "",
    baseDeductionAmount,
    extraDeductionAmount,
    totalDeductionAmount: roundTo2(baseDeductionAmount + extraDeductionAmount),
    isTermination,
    terminationType: parsed.termination ?? undefined,
    warningOnly: parsed.warningOnly,
    reason: `مادة ${reg.section}#${reg.articleNumber} — التكرار رقم ${occurrenceCount}`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: getDailyWage(assignmentId) — احتساب الأجر اليومي بدقة
// يعتمد أولاً على contracts النشطة ثم على employee_assignments.salary
// ─────────────────────────────────────────────────────────────────────────────

export async function getDailyWage(assignmentId: number): Promise<number> {
  const [row] = await rawQuery<{ salary: string | null }>(
    `SELECT salary FROM employee_assignments WHERE id = $1`,
    [assignmentId]
  );
  const monthly = Number(row?.salary ?? 0);
  if (!Number.isFinite(monthly) || monthly <= 0) return 0;
  // الأجر اليومي = الراتب الشهري / 30 (القاعدة المعتمدة في هذا النظام)
  return roundTo2(monthly / 30);
}

// ─────────────────────────────────────────────────────────────────────────────
// Memo number generator — رقم محضر متسلسل آمن لكل شركة
// ─────────────────────────────────────────────────────────────────────────────

export async function generateMemoNumber(companyId: number): Promise<string> {
  const year = currentYear();
  const [row] = await rawQuery<{ cnt: string }>(
    `SELECT COUNT(*)::int AS cnt
       FROM hr_inquiry_memos
      WHERE "companyId" = $1
        AND EXTRACT(YEAR FROM "createdAt") = $2`,
    [companyId, year]
  );
  const seq = Number(row?.cnt ?? 0) + 1;
  return `MEMO-${year}-${String(seq).padStart(5, "0")}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Idempotent memo creator — لا يُنشئ محضراً جديداً إذا كان موجوداً لنفس الواقعة
// ─────────────────────────────────────────────────────────────────────────────

export async function ensureInquiryMemoForViolation(params: {
  companyId: number;
  branchId: number | null;
  assignmentId: number;
  employeeId: number;
  violationId: number | null;
  incidentType: IncidentType;
  incidentDate: string;
  incidentDurationMinutes?: number;
  absenceDays?: number;
  incidentDescription: string;
  regulationId?: number;
  source?: "manual" | "auto" | "manager" | "hr";
  createdBy?: number | null;
}): Promise<{ memoId: number; created: boolean }> {
  // فحص idempotency
  if (params.violationId) {
    const [existing] = await rawQuery<{ id: number }>(
      `SELECT id FROM hr_inquiry_memos
        WHERE "companyId" = $1 AND "violationId" = $2 AND "deletedAt" IS NULL
        LIMIT 1`,
      [params.companyId, params.violationId]
    );
    if (existing) return { memoId: existing.id, created: false };
  }

  const memoNumber = await generateMemoNumber(params.companyId);

  // RD11-01 — the SELECT above is a best-effort cache, not a true
  // idempotency lock; two concurrent callers (e.g. dailyDeductionCheck
  // running back-to-back, or a manual disciplinary action overlapping
  // the cron) both see "no existing memo" and both INSERT. The schema
  // side adds a partial unique index `uq_hr_inquiry_memos_violation`
  // on (companyId, violationId) WHERE deletedAt IS NULL AND
  // violationId IS NOT NULL (migration 199); this catch handles the
  // race by re-fetching the row the other caller won the race for.
  let insertId: number;
  try {
    const inserted = await rawExecute(
      `INSERT INTO hr_inquiry_memos (
         "companyId","branchId","memoNumber","assignmentId","employeeId",
         "regulationId","violationId","incidentType","incidentDate",
         "incidentDurationMinutes","incidentDescription", source, status, "createdBy"
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pending_employee',$13)
       RETURNING id`,
      [
        params.companyId,
        params.branchId,
        memoNumber,
        params.assignmentId,
        params.employeeId,
        params.regulationId ?? null,
        params.violationId ?? null,
        params.incidentType,
        params.incidentDate,
        params.incidentDurationMinutes ?? null,
        params.incidentDescription,
        params.source ?? "auto",
        params.createdBy ?? null,
      ]
    );
    insertId = inserted.insertId;
  } catch (e) {
    const code = (e as { code?: string } | null)?.code;
    const constraint = (e as { constraint?: string } | null)?.constraint;
    if (params.violationId && code === "23505" && (constraint === "uq_hr_inquiry_memos_violation" || !constraint)) {
      const [winner] = await rawQuery<{ id: number }>(
        `SELECT id FROM hr_inquiry_memos
          WHERE "companyId" = $1 AND "violationId" = $2 AND "deletedAt" IS NULL
          LIMIT 1`,
        [params.companyId, params.violationId]
      );
      if (winner) return { memoId: winner.id, created: false };
    }
    throw e;
  }

  // ربط المحضر بالمخالفة (إن وُجدت)
  if (params.violationId) {
    await rawExecute(
      `UPDATE employee_violations
          SET "inquiryMemoId" = $1, status = 'pending_inquiry'
        WHERE id = $2 AND "companyId" = $3`,
      [insertId, params.violationId, params.companyId]
    );
  }

  // timeline
  await rawExecute(
    `INSERT INTO hr_inquiry_memo_events ("memoId","companyId","actorRole",action,payload,note)
     VALUES ($1,$2,'system','created',$3::jsonb,$4)`,
    [
      insertId,
      params.companyId,
      JSON.stringify({
        source: params.source ?? "auto",
        incidentType: params.incidentType,
        incidentDate: params.incidentDate,
        durationMinutes: params.incidentDurationMinutes,
      }),
      "تم إنشاء المحضر تلقائياً بناءً على الواقعة",
    ]
  );

  return { memoId: insertId, created: true };
}
