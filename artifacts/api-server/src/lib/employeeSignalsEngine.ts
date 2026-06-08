/**
 * employeeSignalsEngine — Risk / Promotion / Burnout (#1799 §G).
 *
 * Sits on top of the Scoring Engine (`employee_scores`) merged in
 * #1831. The Scoring Engine answers «ما درجة الموظف؟»; the signals
 * engines answer «من يحتاج تدخل المدير؟».
 *
 * Three engines, all consuming the same composite + dimension scores:
 *
 *   Risk Engine
 *     - composite < 50  (تراجع عام)
 *     - disciplineScore < 50  (مخالفات/تأخر متراكم)
 *     - productivityScore < 40  (تراجع الإنجاز)
 *     - trend = -1 over 2+ consecutive periods (انحدار مستمر)
 *
 *   Promotion Engine
 *     - composite >= 85
 *     - disciplineScore >= 90
 *     - productivityScore >= 80
 *     - qualityScore >= 80
 *     - trend = +1 over 2+ periods (نمو مستمر)
 *
 *   Burnout Engine
 *     - sustained high productivity + dropping discipline (إرهاق)
 *     - composite drop ≥ 15 points vs previous period (انخفاض مفاجئ)
 *     - high overtime + zero leaves in window
 *
 * Per #1799 §G the signals are *recommendations* for the manager —
 * they do NOT take decisions. Writes go to `employee_signals`
 * (migration 273). Idempotent via UNIQUE on
 * (assignmentId, signalType, scope, periodKey).
 */
import { rawQuery } from "./rawdb.js";
import { logger } from "./logger.js";
import type { ScoreScope } from "./employeeScoringEngine.js";

export type SignalSeverity = "low" | "medium" | "high" | "critical";
export type SignalType = "risk" | "promotion" | "burnout";

export interface DetectedSignal {
  signalType: SignalType;
  severity: SignalSeverity;
  title: string;
  reasons: string[];
}

interface ScoreSnapshot {
  compositeScore: number;
  disciplineScore: number;
  activityScore: number;
  productivityScore: number;
  qualityScore: number;
  managerScore: number;
  developmentScore: number;
  trend: number;
}

/**
 * Detect all signals for one (assignment × scope × periodKey) by
 * reading the current score row + the most recent prior row to
 * compute deltas. Returns the list of signals that fired — caller
 * persists them.
 */
export async function detectSignals(args: {
  assignmentId: number;
  scope: ScoreScope;
  periodKey: string;
}): Promise<DetectedSignal[]> {
  // Current period score.
  const [current] = await rawQuery<ScoreSnapshot>(
    `SELECT "compositeScore", "disciplineScore", "activityScore",
            "productivityScore", "qualityScore", "managerScore",
            "developmentScore", trend
       FROM employee_scores
      WHERE "assignmentId" = $1 AND scope = $2 AND "periodKey" = $3`,
    [args.assignmentId, args.scope, args.periodKey],
  ).catch((e) => { logger.error(e, "signals: current score load failed"); return []; });

  if (!current) return [];

  // Previous period score (for delta computation).
  const [previous] = await rawQuery<ScoreSnapshot>(
    `SELECT "compositeScore", "disciplineScore", "productivityScore", trend
       FROM employee_scores
      WHERE "assignmentId" = $1 AND scope = $2 AND "periodKey" < $3
      ORDER BY "periodKey" DESC LIMIT 1`,
    [args.assignmentId, args.scope, args.periodKey],
  ).catch(() => []);

  const composite = Number(current.compositeScore);
  const discipline = Number(current.disciplineScore);
  const productivity = Number(current.productivityScore);
  const quality = Number(current.qualityScore);
  const prevComposite = previous ? Number(previous.compositeScore) : null;
  const prevTrend = previous ? Number(previous.trend) : 0;
  const trend = Number(current.trend);

  const out: DetectedSignal[] = [];

  // ── Risk Engine ──
  const riskReasons: string[] = [];
  if (composite < 50) riskReasons.push(`الدرجة الكلية ${composite.toFixed(1)} أقل من 50`);
  if (discipline < 50) riskReasons.push(`الانضباط منخفض (${discipline.toFixed(1)})`);
  if (productivity < 40) riskReasons.push(`الإنتاجية منخفضة (${productivity.toFixed(1)})`);
  if (trend === -1 && prevTrend === -1) riskReasons.push("تراجع لفترتين متتاليتين");
  if (riskReasons.length > 0) {
    const sev: SignalSeverity = riskReasons.length >= 3
      ? "critical"
      : riskReasons.length === 2
        ? "high"
        : composite < 40 ? "high" : "medium";
    out.push({
      signalType: "risk",
      severity: sev,
      title: "موظف يحتاج متابعة",
      reasons: riskReasons,
    });
  }

  // ── Promotion Engine ──
  const promoReasons: string[] = [];
  if (composite >= 85) promoReasons.push(`أداء متميز (${composite.toFixed(1)})`);
  if (discipline >= 90) promoReasons.push(`انضباط عالٍ (${discipline.toFixed(1)})`);
  if (productivity >= 80) promoReasons.push(`إنتاجية عالية (${productivity.toFixed(1)})`);
  if (quality >= 80) promoReasons.push(`جودة عمل عالية (${quality.toFixed(1)})`);
  if (trend === 1 && prevTrend === 1) promoReasons.push("نمو متواصل لفترتين");
  if (promoReasons.length >= 3) {
    const sev: SignalSeverity = composite >= 90 && promoReasons.length >= 4 ? "high" : "medium";
    out.push({
      signalType: "promotion",
      severity: sev,
      title: "مرشّح للترقية أو المكافأة",
      reasons: promoReasons,
    });
  }

  // ── Burnout Engine ──
  const burnoutReasons: string[] = [];
  // Sustained high productivity + dropping discipline = إرهاق.
  if (productivity >= 70 && discipline < 65) {
    burnoutReasons.push(`إنتاجية عالية (${productivity.toFixed(1)}) مع تراجع انضباط (${discipline.toFixed(1)})`);
  }
  // Sudden composite drop ≥ 15 points.
  if (prevComposite != null && prevComposite - composite >= 15) {
    burnoutReasons.push(`انخفاض مفاجئ ${(prevComposite - composite).toFixed(1)} نقطة من الفترة السابقة`);
  }
  // High overtime + zero leaves in window — read from raw counters.
  // We approximate by checking attendance overtime in the period.
  const [otRow] = await rawQuery<{ totalOvertime: number; leaves: number }>(
    `WITH ot AS (
       SELECT COALESCE(SUM("overtimeMinutes"), 0)::int AS m
         FROM attendance
        WHERE "assignmentId" = $1
          AND "deletedAt" IS NULL
          AND date BETWEEN $2 AND $3
     ), l AS (
       SELECT COUNT(*)::int AS c
         FROM hr_leave_requests
        WHERE "employeeId" IN (
                SELECT "employeeId" FROM employee_assignments WHERE id = $1
              )
          AND status = 'approved'
          AND "startDate"::date BETWEEN $2 AND $3
          AND "deletedAt" IS NULL
     )
     SELECT ot.m AS "totalOvertime", l.c AS leaves FROM ot, l`,
    [args.assignmentId, periodRangeStart(args.scope, args.periodKey), periodRangeEnd(args.scope, args.periodKey)],
  ).catch(() => [{ totalOvertime: 0, leaves: 0 }]);
  const totalOvertime = Number(otRow?.totalOvertime ?? 0);
  const leaves = Number(otRow?.leaves ?? 0);
  if (totalOvertime >= 1200 && leaves === 0) {
    burnoutReasons.push(`${(totalOvertime / 60).toFixed(1)} ساعة وقت إضافي بدون إجازات في الفترة`);
  }

  if (burnoutReasons.length > 0) {
    const sev: SignalSeverity = burnoutReasons.length >= 2 ? "high" : "medium";
    out.push({
      signalType: "burnout",
      severity: sev,
      title: "احتمال إرهاق وظيفي",
      reasons: burnoutReasons,
    });
  }

  return out;
}

/**
 * Persist detected signals into employee_signals (UPSERT). Caller
 * provides company + employee context so the row joins back to HR
 * dashboards efficiently.
 */
export async function persistSignals(args: {
  companyId: number;
  branchId: number | null;
  assignmentId: number;
  employeeId: number;
  scope: ScoreScope;
  periodKey: string;
  compositeScore: number;
  signals: DetectedSignal[];
}): Promise<void> {
  for (const s of args.signals) {
    await rawQuery(
      `INSERT INTO employee_signals
        ("companyId","branchId","assignmentId","employeeId","signalType",severity,
         scope,"periodKey",title,reasons,"compositeScore","createdAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,now())
       ON CONFLICT ("assignmentId","signalType",scope,"periodKey") DO UPDATE
          SET severity = EXCLUDED.severity,
              reasons = EXCLUDED.reasons,
              title = EXCLUDED.title,
              "compositeScore" = EXCLUDED."compositeScore",
              -- Reset acknowledgement only when severity escalates.
              "acknowledgedAt" = CASE
                WHEN employee_signals.severity = 'low' AND EXCLUDED.severity != 'low' THEN NULL
                WHEN employee_signals.severity = 'medium' AND EXCLUDED.severity IN ('high', 'critical') THEN NULL
                WHEN employee_signals.severity = 'high' AND EXCLUDED.severity = 'critical' THEN NULL
                ELSE employee_signals."acknowledgedAt"
              END`,
      [
        args.companyId, args.branchId, args.assignmentId, args.employeeId,
        s.signalType, s.severity, args.scope, args.periodKey,
        s.title, JSON.stringify(s.reasons), args.compositeScore,
      ],
    );
  }
}

// ── Local period helpers (avoid circular import with scoring engine) ──
function periodRangeStart(scope: ScoreScope, periodKey: string): string {
  if (scope === "monthly") {
    const [y, m] = periodKey.split("-");
    return `${y}-${m}-01`;
  }
  if (scope === "quarterly") {
    const [y, q] = periodKey.split("-Q");
    const startMonth = (Number(q) - 1) * 3 + 1;
    return `${y}-${String(startMonth).padStart(2, "0")}-01`;
  }
  // weekly — Monday of the ISO week
  const [yearStr, weekStr] = periodKey.split("-W");
  const year = Number(yearStr);
  const week = Number(weekStr);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1);
  const start = new Date(week1Monday);
  start.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  return start.toISOString().slice(0, 10);
}

function periodRangeEnd(scope: ScoreScope, periodKey: string): string {
  if (scope === "monthly") {
    const [y, m] = periodKey.split("-");
    const end = new Date(Date.UTC(Number(y), Number(m), 0));
    return end.toISOString().slice(0, 10);
  }
  if (scope === "quarterly") {
    const [y, q] = periodKey.split("-Q");
    const lastMonth = Number(q) * 3;
    const end = new Date(Date.UTC(Number(y), lastMonth, 0));
    return end.toISOString().slice(0, 10);
  }
  const start = new Date(periodRangeStart(scope, periodKey));
  start.setUTCDate(start.getUTCDate() + 6);
  return start.toISOString().slice(0, 10);
}
