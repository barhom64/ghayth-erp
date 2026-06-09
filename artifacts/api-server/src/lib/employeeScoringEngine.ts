/**
 * employeeScoringEngine — composite employee score (#1799 priority #10).
 *
 * Computes a 0-100 composite score from 6 weighted dimensions:
 *
 *   Discipline   20% — late/absence/early-leave counts (employee_violations + attendance)
 *   Activity     15% — login + audit-log activity (audit_logs)
 *   Productivity 35% — tasks closed + per-module counters (project_tasks)
 *   Quality      15% — re-opened tasks + rejected approvals (audit_logs)
 *   Manager      10% — `hr_performance_evaluations.overallRating` average
 *   Development   5% — completed trainings (training_enrollments)
 *
 * The weights are the #1799 §F.10 defaults and can be overridden per
 * category via the optional `weights` argument. The engine writes one
 * row per (assignmentId, scope, periodKey) into `employee_scores`
 * (migration 272) — re-running for the same period upserts via the
 * UNIQUE constraint so the cron is idempotent.
 *
 * Each dimension caps at 100. The composite is the weighted average.
 * Rationale strings are stored alongside the numbers so HR can answer
 * «لماذا 65؟» without reverse-engineering the math.
 *
 * #1799 §A.9 binding: every counter comes from an EXISTING table —
 * the only new schema this engine touches is `employee_scores` itself.
 */
import { rawQuery } from "./rawdb.js";
import { logger } from "./logger.js";

export type ScoreScope = "weekly" | "monthly" | "quarterly";

export interface DimensionWeights {
  discipline: number;
  activity: number;
  productivity: number;
  quality: number;
  manager: number;
  development: number;
}

export const DEFAULT_WEIGHTS: DimensionWeights = {
  discipline: 0.20,
  activity: 0.15,
  productivity: 0.35,
  quality: 0.15,
  manager: 0.10,
  development: 0.05,
};

export interface ScoreBreakdown {
  composite: number;
  discipline: number;
  activity: number;
  productivity: number;
  quality: number;
  manager: number;
  development: number;
  rationale: Record<string, string>;
  rawCounters: Record<string, number>;
}

interface PeriodRange {
  startDate: string;
  endDate: string;
}

/**
 * Convert a (scope, periodKey) pair into [start, end] dates suitable
 * for SQL `BETWEEN start AND end` filters. The end date is the LAST
 * day of the period (inclusive); callers using `<` should adjust.
 *
 * - weekly: ISO-week YYYY-WW → Monday..Sunday
 * - monthly: YYYY-MM → first..last day of month
 * - quarterly: YYYY-Qn → first day of Q's first month..last day of last month
 */
export function periodRange(scope: ScoreScope, periodKey: string): PeriodRange {
  if (scope === "weekly") {
    // ISO week → Monday of week
    const [yearStr, weekStr] = periodKey.split("-W");
    const year = Number(yearStr);
    const week = Number(weekStr);
    // ISO 8601: week 1 is the week containing Jan 4th.
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const jan4Day = jan4.getUTCDay() || 7; // 1..7 (Mon..Sun)
    const week1Monday = new Date(jan4);
    week1Monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1);
    const start = new Date(week1Monday);
    start.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
    return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
  }
  if (scope === "monthly") {
    // YYYY-MM
    const [yearStr, monthStr] = periodKey.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr);
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 0));
    return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
  }
  // quarterly: YYYY-Qn
  const [yearStr, qStr] = periodKey.split("-Q");
  const year = Number(yearStr);
  const q = Number(qStr);
  const startMonth = (q - 1) * 3;
  const start = new Date(Date.UTC(year, startMonth, 1));
  const end = new Date(Date.UTC(year, startMonth + 3, 0));
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}

/**
 * Convenience: return the current week/month/quarter key for "now".
 * Cron jobs typically score the previous completed period, so they
 * call this then walk back one unit (see `previousPeriodKey`).
 */
export function currentPeriodKey(scope: ScoreScope, now: Date = new Date()): string {
  if (scope === "monthly") {
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  if (scope === "quarterly") {
    const q = Math.floor(now.getUTCMonth() / 3) + 1;
    return `${now.getUTCFullYear()}-Q${q}`;
  }
  // weekly — ISO week
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

const clamp = (n: number): number => Math.max(0, Math.min(100, n));

/**
 * Compute and persist the score for one assignment × scope × period.
 *
 * Returns the breakdown the engine just wrote. Re-running for the
 * same triple is idempotent (ON CONFLICT DO UPDATE).
 */
// HR-020 — read company-scoped weight overrides from
// `scoring_weights_per_company`. Falls back to DEFAULT_WEIGHTS when no
// row exists for the (companyId, categoryKey) pair. Per-category override
// (categoryKey != NULL) wins over company-wide default (categoryKey IS NULL).
export async function resolveCompanyWeights(
  companyId: number,
  categoryKey?: string | null,
): Promise<DimensionWeights> {
  const rows = await rawQuery<{
    categoryKey: string | null;
    disciplineWeight: number; activityWeight: number; productivityWeight: number;
    qualityWeight: number; managerWeight: number; developmentWeight: number;
  }>(
    `SELECT "categoryKey", "disciplineWeight", "activityWeight", "productivityWeight",
            "qualityWeight", "managerWeight", "developmentWeight"
       FROM scoring_weights_per_company
      WHERE "companyId" = $1 AND ("categoryKey" = $2 OR "categoryKey" IS NULL)
      ORDER BY "categoryKey" NULLS LAST LIMIT 1`,
    [companyId, categoryKey ?? null],
  ).catch(() => [] as any[]);
  if (rows.length === 0) return DEFAULT_WEIGHTS;
  const r = rows[0];
  return {
    discipline: Number(r.disciplineWeight),
    activity: Number(r.activityWeight),
    productivity: Number(r.productivityWeight),
    quality: Number(r.qualityWeight),
    manager: Number(r.managerWeight),
    development: Number(r.developmentWeight),
  };
}

export async function scoreEmployee(args: {
  companyId: number;
  assignmentId: number;
  employeeId: number;
  branchId?: number | null;
  scope: ScoreScope;
  periodKey: string;
  weights?: Partial<DimensionWeights>;
}): Promise<ScoreBreakdown> {
  // If caller didn't pass explicit weights, pull from per-company table.
  // Pass-through of the explicit weights is preserved for callers that
  // already resolved them (e.g. test fixtures, ad-hoc rescore).
  let effective = args.weights;
  if (!effective) {
    const [asn] = await rawQuery<{ categoryKey: string | null }>(
      `SELECT "categoryKey" FROM employee_assignments WHERE id = $1`,
      [args.assignmentId],
    ).catch(() => [] as any[]);
    effective = await resolveCompanyWeights(args.companyId, asn?.categoryKey);
  }
  const weights: DimensionWeights = { ...DEFAULT_WEIGHTS, ...effective };
  const range = periodRange(args.scope, args.periodKey);

  // ── Discipline (20%) ──
  // Count violations + late/absent attendance rows in the period.
  // Each violation drops the dimension score; 0 violations = 100.
  const [discRow] = await rawQuery<{ violations: number; lateDays: number }>(
    `WITH v AS (
       SELECT COUNT(*)::int AS c FROM employee_violations
        WHERE "assignmentId" = $1 AND "deletedAt" IS NULL
          AND "createdAt"::date BETWEEN $2 AND $3
     ), l AS (
       SELECT COUNT(*)::int AS c FROM attendance
        WHERE "assignmentId" = $1
          AND "deletedAt" IS NULL
          AND date BETWEEN $2 AND $3
          AND "lateMinutes" > 0
     )
     SELECT v.c AS violations, l.c AS "lateDays" FROM v, l`,
    [args.assignmentId, range.startDate, range.endDate],
  ).catch((e) => { logger.error(e, "scoring: discipline failed"); return [{ violations: 0, lateDays: 0 }]; });
  const violations = Number(discRow?.violations ?? 0);
  const lateDays = Number(discRow?.lateDays ?? 0);
  // Start at 100, lose 10 per violation, 2 per late day, floor at 0.
  const discipline = clamp(100 - violations * 10 - lateDays * 2);

  // ── Activity (15%) ──
  // Count audit_log rows attributed to this user in the period. The
  // join is via users.employeeId so we don't need scope.userId here.
  const [actRow] = await rawQuery<{ activities: number }>(
    `SELECT COUNT(*)::int AS activities
       FROM audit_logs al
       JOIN users u ON u.id = al."userId"
      WHERE u."employeeId" = $1
        AND al."createdAt"::date BETWEEN $2 AND $3`,
    [args.employeeId, range.startDate, range.endDate],
  ).catch((e) => { logger.error(e, "scoring: activity failed"); return [{ activities: 0 }]; });
  const activities = Number(actRow?.activities ?? 0);
  // 100 activities/period = full score. Linear ramp, capped at 100.
  const activity = clamp(activities);

  // ── Productivity (35%) ──
  // Tasks completed in the period (status = 'done'). The dominant
  // dimension by weight — productivity is the central scoring lever.
  const [prodRow] = await rawQuery<{ done: number; opened: number }>(
    `WITH d AS (
       SELECT COUNT(*)::int AS c FROM project_tasks
        WHERE "assigneeId" = $1
          AND status = 'done'
          AND "completedAt"::date BETWEEN $2 AND $3
          AND "deletedAt" IS NULL
     ), o AS (
       SELECT COUNT(*)::int AS c FROM project_tasks
        WHERE "assigneeId" = $1
          AND "createdAt"::date BETWEEN $2 AND $3
          AND "deletedAt" IS NULL
     )
     SELECT d.c AS done, o.c AS opened FROM d, o`,
    [args.employeeId, range.startDate, range.endDate],
  ).catch((e) => { logger.error(e, "scoring: productivity failed"); return [{ done: 0, opened: 0 }]; });
  const done = Number(prodRow?.done ?? 0);
  const opened = Number(prodRow?.opened ?? 0);
  // 20 done tasks/period = full score. Linear ramp.
  const productivity = clamp(done * 5);

  // ── Quality (15%) ──
  // Approximation: tasks that were closed then re-opened in the same
  // period. The signal here is "had to redo work". Real implementation
  // can wire to a re-open audit; this MVP uses the absence of churn.
  // Start at 100, lose 5 per reopen-like signal (we approximate by
  // counting tasks that bounce status back to in-progress).
  const [qualityRow] = await rawQuery<{ rejected: number }>(
    `SELECT COUNT(*)::int AS rejected
       FROM audit_logs al
       JOIN users u ON u.id = al."userId"
      WHERE u."employeeId" = $1
        AND al.action IN ('reject', 'reopen', 'returned')
        AND al."createdAt"::date BETWEEN $2 AND $3`,
    [args.employeeId, range.startDate, range.endDate],
  ).catch((e) => { logger.error(e, "scoring: quality failed"); return [{ rejected: 0 }]; });
  const rejected = Number(qualityRow?.rejected ?? 0);
  const quality = clamp(100 - rejected * 5);

  // ── Manager (10%) ──
  // Average overallScore from performance_reviews in the window.
  // The column is NUMERIC(3,1) so ratings are 0..10; multiply by 10
  // to fit the 0-100 scale.
  const [mgrRow] = await rawQuery<{ avg: string | number | null }>(
    `SELECT AVG(COALESCE("overallScore", 0))::numeric AS avg
       FROM performance_reviews
      WHERE "employeeId" = $1
        AND "deletedAt" IS NULL
        AND "reviewDate"::date BETWEEN $2 AND $3`,
    [args.employeeId, range.startDate, range.endDate],
  ).catch((e) => { logger.error(e, "scoring: manager failed"); return [{ avg: null }]; });
  const ratingAvg = Number(mgrRow?.avg ?? 0);
  // Null/no review in period = 60 (neutral) — so absence doesn't
  // crater the score; HR can layer custom logic later.
  const manager = ratingAvg > 0 ? clamp(ratingAvg * 10) : 60;

  // ── Development (5%) ──
  // Completed training enrollments. 5 completed = full score.
  const [devRow] = await rawQuery<{ completed: number }>(
    `SELECT COUNT(*)::int AS completed
       FROM training_enrollments
      WHERE "employeeId" = $1
        AND status = 'completed'
        AND "completedAt"::date BETWEEN $2 AND $3
        AND "deletedAt" IS NULL`,
    [args.employeeId, range.startDate, range.endDate],
  ).catch((e) => { logger.error(e, "scoring: development failed"); return [{ completed: 0 }]; });
  const completed = Number(devRow?.completed ?? 0);
  const development = clamp(completed * 20);

  // ── Composite ──
  const composite = Math.round(
    (discipline * weights.discipline +
      activity * weights.activity +
      productivity * weights.productivity +
      quality * weights.quality +
      manager * weights.manager +
      development * weights.development) * 100
  ) / 100;

  // ── Rationale (Arabic, human-readable) ──
  const rationale: Record<string, string> = {
    discipline: `${violations} مخالفة × 10 ، ${lateDays} يوم تأخر × 2 = ${discipline}/100`,
    activity: `${activities} حركة في الفترة = ${activity}/100`,
    productivity: `${done} مهمة منجزة (من أصل ${opened} مفتوحة) = ${productivity}/100`,
    quality: `${rejected} رفض/إعادة فتح × 5 = ${quality}/100`,
    manager: ratingAvg > 0 ? `متوسط تقييم المدير ${ratingAvg.toFixed(2)}/10 = ${manager}/100` : "لا تقييم في الفترة (محايد 60)",
    development: `${completed} دورة مكتملة × 20 = ${development}/100`,
  };

  // ── Compute trend vs previous period of same scope ──
  const [prevRow] = await rawQuery<{ score: string | number | null }>(
    `SELECT "compositeScore" AS score
       FROM employee_scores
      WHERE "assignmentId" = $1 AND scope = $2 AND "periodKey" < $3
      ORDER BY "periodKey" DESC LIMIT 1`,
    [args.assignmentId, args.scope, args.periodKey],
  ).catch(() => [{ score: null }]);
  const prev = prevRow?.score == null ? null : Number(prevRow.score);
  const trend = prev == null ? 0 : composite > prev + 1 ? 1 : composite < prev - 1 ? -1 : 0;

  const rawCounters = { violations, lateDays, activities, done, opened, rejected, ratingAvg, completed };

  // ── Upsert ──
  await rawQuery(
    `INSERT INTO employee_scores
      ("companyId","branchId","assignmentId","employeeId",scope,"periodKey",
       "compositeScore",trend,
       "disciplineScore","activityScore","productivityScore","qualityScore","managerScore","developmentScore",
       rationale,"weightsUsed","rawCounters","computedAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16::jsonb,$17::jsonb,now())
     ON CONFLICT ("assignmentId", scope, "periodKey") DO UPDATE
        SET "compositeScore" = EXCLUDED."compositeScore",
            trend = EXCLUDED.trend,
            "disciplineScore" = EXCLUDED."disciplineScore",
            "activityScore" = EXCLUDED."activityScore",
            "productivityScore" = EXCLUDED."productivityScore",
            "qualityScore" = EXCLUDED."qualityScore",
            "managerScore" = EXCLUDED."managerScore",
            "developmentScore" = EXCLUDED."developmentScore",
            rationale = EXCLUDED.rationale,
            "weightsUsed" = EXCLUDED."weightsUsed",
            "rawCounters" = EXCLUDED."rawCounters",
            "computedAt" = EXCLUDED."computedAt"`,
    [
      args.companyId, args.branchId ?? null, args.assignmentId, args.employeeId,
      args.scope, args.periodKey,
      composite, trend,
      discipline, activity, productivity, quality, manager, development,
      JSON.stringify(rationale), JSON.stringify(weights), JSON.stringify(rawCounters),
    ],
  );

  return {
    composite,
    discipline, activity, productivity, quality, manager, development,
    rationale, rawCounters,
  };
}
