/**
 * attendancePolicyEngine — per-category attendance policy resolution
 * (#1799 priority #6).
 *
 * The legacy `attendance_policies` table is UNIQUE per company, so a
 * single late-threshold + penalty matrix applies to everyone (worker
 * AND driver AND manager AND executive). HR Operating Foundation
 * required the policy to differ by employee category — see
 * docs/HR_OPERATING_FOUNDATION_TASK.md §A.3 + §C.
 *
 * Migration 270 added `employee_categories` (catalog) and
 * `attendance_policies_per_category` (override per company × category).
 * This engine resolves the effective policy for a given employee in
 * three layers (most specific wins):
 *
 *   1. company × category row in `attendance_policies_per_category`
 *      (an HR officer's explicit override)
 *   2. system row in `employee_categories` for category defaults
 *      (`exemptFromAutoDeduction`, `trackingFrequencySeconds`)
 *   3. company-wide row in `attendance_policies` (legacy fallback —
 *      late threshold, GPS radius, penalty matrix)
 *
 * Callers (`POST /hr/check-in`, `autoViolationEngine.runAutoDetection`)
 * use the resolved policy to decide whether to write a deduction, fire
 * a violation, or skip the row entirely (managers/executives).
 *
 * Backward-compatible: if no category override exists AND the employee
 * has no `categoryKey` set on their assignment, the engine returns the
 * exact policy a legacy single-row `attendance_policies` lookup would
 * have returned. Existing behavior is preserved by default.
 */
import { rawQuery } from "./rawdb.js";

export interface ResolvedAttendancePolicy {
  /** Employee category key resolved for this assignment. Null when the
   *  employee has no category set AND no system fallback matches. */
  categoryKey: string | null;
  /** Human-readable Arabic label for the category, e.g. "مدير قسم". */
  categoryLabel: string | null;
  /** Late threshold in minutes — minutes past shift start at which
   *  the attendance row is flagged as "late". Falls back to company
   *  default (15 min in `attendance_policies`). */
  lateThresholdMinutes: number;
  /** Grace period in minutes — additional buffer before the late
   *  threshold even triggers logging. Default 0. */
  gracePeriodMinutes: number;
  /** GPS radius enforcement (meters). Falls back to company default
   *  (500m). When `requireGps = false`, this value is informational
   *  only and check-in won't fail on out-of-range. */
  gpsRadiusMeters: number;
  /** When FALSE, the check-in route MUST NOT create an
   *  `attendance_deductions` row for this employee even if they're
   *  late, and the auto-violation cron MUST skip them. This is the
   *  critical switch that protects managers and executives. */
  autoDeductionEnabled: boolean;
  /** When FALSE, check-in is accepted without lat/lng. Drivers and
   *  field employees stay TRUE. Office staff and managers can flip
   *  to FALSE so a forgotten device doesn't lock them out. */
  requireGps: boolean;
  /** Allowed source values for check-in. Empty array = any source. */
  allowedSources: string[];
  /** GPS tracking frequency in seconds. 0 = no live tracking. Used by
   *  the (future) field-tracking ingestion endpoint to decide how
   *  often to accept location pings. */
  trackingFrequencySeconds: number;
  /** Penalty matrix (5 levels) — Saudi Arabia discipline ladder.
   *  Falls back to the company default if no per-category override. */
  penaltyLevels: [number, number, number, number, number];
}

interface RawCategoryRow {
  categoryKey: string;
  labelAr: string | null;
  exemptFromAutoDeduction: boolean;
  trackingFrequencySeconds: number;
}

interface RawOverrideRow {
  lateThresholdMinutes: number | null;
  gracePeriodMinutes: number | null;
  gpsRadiusMeters: number | null;
  autoDeductionEnabled: boolean | null;
  requireGps: boolean | null;
  allowedSources: string[] | null;
  trackingFrequencySeconds: number | null;
  penaltyLevel1: string | number | null;
  penaltyLevel2: string | number | null;
  penaltyLevel3: string | number | null;
  penaltyLevel4: string | number | null;
  penaltyLevel5: string | number | null;
}

interface RawCompanyDefaultRow {
  lateThresholdMinutes: number | null;
  gpsRadiusMeters: number | null;
  penaltyLevel1: string | number | null;
  penaltyLevel2: string | number | null;
  penaltyLevel3: string | number | null;
  penaltyLevel4: string | number | null;
  penaltyLevel5: string | number | null;
}

/**
 * Resolve the effective attendance policy for one (employee × company).
 *
 * The call shape lets the auto-violation cron batch this across many
 * employees by running a single SELECT per company × category pair
 * instead of one per employee (see `resolveBatch` below).
 */
export async function resolveAttendancePolicy(args: {
  companyId: number;
  assignmentId: number;
}): Promise<ResolvedAttendancePolicy> {
  // 1) Get the categoryKey for this assignment. Falls back to NULL
  //    when the assignment is uncategorized (legacy data).
  const [assignmentRow] = await rawQuery<{ categoryKey: string | null }>(
    `SELECT "categoryKey" FROM employee_assignments WHERE id = $1`,
    [args.assignmentId],
  );
  const categoryKey = assignmentRow?.categoryKey ?? null;

  return resolveForCategory({ companyId: args.companyId, categoryKey });
}

/**
 * Same as `resolveAttendancePolicy` but skips the assignment lookup
 * when the caller already knows the category. Useful for batch jobs.
 */
export async function resolveForCategory(args: {
  companyId: number;
  categoryKey: string | null;
}): Promise<ResolvedAttendancePolicy> {
  const { companyId, categoryKey } = args;

  // 2) Load the system category row (for label, exempt flag, tracking
  //    frequency). If categoryKey is NULL, this returns nothing and we
  //    use the absolute defaults at the end of the function.
  const [systemCategory] = categoryKey
    ? await rawQuery<RawCategoryRow>(
        `SELECT "categoryKey", "labelAr", "exemptFromAutoDeduction", "trackingFrequencySeconds"
           FROM employee_categories
          WHERE "categoryKey" = $1
            AND ("companyId" IS NULL OR "companyId" = $2)
            AND "isActive" = TRUE
          ORDER BY "companyId" NULLS LAST
          LIMIT 1`,
        [categoryKey, companyId],
      )
    : [];

  // 3) Load the per-category override (most specific layer).
  const [override] = categoryKey
    ? await rawQuery<RawOverrideRow>(
        `SELECT "lateThresholdMinutes", "gracePeriodMinutes", "gpsRadiusMeters",
                "autoDeductionEnabled", "requireGps", "allowedSources",
                "trackingFrequencySeconds",
                "penaltyLevel1", "penaltyLevel2", "penaltyLevel3", "penaltyLevel4", "penaltyLevel5"
           FROM attendance_policies_per_category
          WHERE "companyId" = $1 AND "categoryKey" = $2
          LIMIT 1`,
        [companyId, categoryKey],
      )
    : [];

  // 4) Load the company-wide default (legacy fallback).
  const [companyDefault] = await rawQuery<RawCompanyDefaultRow>(
    `SELECT "lateThresholdMinutes", "gpsRadiusMeters",
            "penaltyLevel1", "penaltyLevel2", "penaltyLevel3", "penaltyLevel4", "penaltyLevel5"
       FROM attendance_policies
      WHERE "companyId" = $1
      LIMIT 1`,
    [companyId],
  );

  // 5) Compose the resolved policy, applying the precedence rule:
  //    override → system category → company default → absolute default.
  const num = (v: string | number | null | undefined, fallback: number): number =>
    v == null ? fallback : Number(v);

  const penaltyLevels: [number, number, number, number, number] = [
    num(override?.penaltyLevel1 ?? companyDefault?.penaltyLevel1, 0),
    num(override?.penaltyLevel2 ?? companyDefault?.penaltyLevel2, 50),
    num(override?.penaltyLevel3 ?? companyDefault?.penaltyLevel3, 100),
    num(override?.penaltyLevel4 ?? companyDefault?.penaltyLevel4, 200),
    num(override?.penaltyLevel5 ?? companyDefault?.penaltyLevel5, 500),
  ];

  return {
    categoryKey,
    categoryLabel: systemCategory?.labelAr ?? null,
    lateThresholdMinutes: override?.lateThresholdMinutes ?? companyDefault?.lateThresholdMinutes ?? 15,
    gracePeriodMinutes: override?.gracePeriodMinutes ?? 0,
    gpsRadiusMeters: override?.gpsRadiusMeters ?? companyDefault?.gpsRadiusMeters ?? 500,
    // The exempt-flag precedence: explicit override > system category > FALSE (legacy).
    // Note that a system category with `exemptFromAutoDeduction = TRUE` will exempt
    // the employee even without a per-company override row, which is exactly what
    // we want for managers and executives out of the box.
    autoDeductionEnabled:
      override?.autoDeductionEnabled ?? !(systemCategory?.exemptFromAutoDeduction ?? false),
    requireGps: override?.requireGps ?? true,
    allowedSources: override?.allowedSources ?? [],
    trackingFrequencySeconds:
      override?.trackingFrequencySeconds ?? systemCategory?.trackingFrequencySeconds ?? 0,
    penaltyLevels,
  };
}

/**
 * Convenience: for a batch of (assignmentId, companyId) pairs return
 * the resolved policies indexed by assignmentId. Used by
 * `autoViolationEngine` so the nightly run doesn't fire one query per
 * employee.
 *
 * This implementation issues one query to fetch the categoryKey for
 * every assignment, then one resolveForCategory call per unique
 * (companyId, categoryKey) pair.
 */
export async function resolveBatch(
  pairs: { assignmentId: number; companyId: number }[],
): Promise<Map<number, ResolvedAttendancePolicy>> {
  if (pairs.length === 0) return new Map();

  const assignmentIds = pairs.map((p) => p.assignmentId);
  const rows = await rawQuery<{ id: number; categoryKey: string | null }>(
    `SELECT id, "categoryKey" FROM employee_assignments WHERE id = ANY($1)`,
    [assignmentIds],
  );
  const categoryByAssignment = new Map<number, string | null>();
  for (const r of rows) categoryByAssignment.set(Number(r.id), r.categoryKey);

  // Memoize per unique (companyId, categoryKey) since many assignments
  // will share the same category in a typical batch.
  const memo = new Map<string, Promise<ResolvedAttendancePolicy>>();
  const result = new Map<number, ResolvedAttendancePolicy>();

  for (const p of pairs) {
    const categoryKey = categoryByAssignment.get(p.assignmentId) ?? null;
    const key = `${p.companyId}:${categoryKey ?? ""}`;
    if (!memo.has(key)) {
      memo.set(key, resolveForCategory({ companyId: p.companyId, categoryKey }));
    }
    result.set(p.assignmentId, await memo.get(key)!);
  }

  return result;
}
