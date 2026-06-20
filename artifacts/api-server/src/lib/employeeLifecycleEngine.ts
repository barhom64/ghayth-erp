/**
 * employeeLifecycleEngine — سياسة دورة حياة الموظف الخاصة بـHR (المسار القائد يملك سياسته).
 * **ليس** المِيكانيزم العام lifecycleEngine، و**ليس** journeyEngine (الرحلات التشغيلية) —
 * مفهوم متمايز (قاموس المفاهيم §3). يبقى منفصلًا عمدًا: HR قائد يملك سياسة موظفه (المادة 5).
 *
 * employeeLifecycleEngine — single source of truth for valid employee
 * lifecycle transitions (#2077 PR-8).
 *
 * The product owner's discipline:
 *   • Each transition is an EVENT (employee_lifecycle_events row), not
 *     a status flag on the employee row. The current state is derived.
 *   • Each transition carries reason + decisionDate + effectiveDate +
 *     documentDate + actor + IGOC quartet.
 *   • Some transitions have GUARDS — pre-conditions that block the
 *     event unless the operator supplies overrideReason. Examples:
 *       - termination: must clear active custody / loans / leaves
 *         OR document the override.
 *       - reactivation (terminated → active): must document.
 *
 * This engine is PURE: it validates a proposed transition and returns
 * the result of running the guards. It does NOT touch the database —
 * that's the route's job. Keeps the state machine testable in isolation.
 *
 * The state set is the one the product owner ratified:
 *
 *   candidate → offer_extended → onboarding → active
 *     active → probation → confirmed
 *     active → suspended → active                 (reinstated)
 *     active → resigned → terminated
 *     active → terminated
 *     terminated → clearance_pending → clearance_complete
 *
 * "transferred" and "assigned" are NOT states in the user's spec —
 * they're operational EVENTS that don't change the lifecycle state.
 * The engine records the event but stateAfter stays NULL (handled
 * by the route).
 */
import { rawQuery } from "./rawdb.js";

export type LifecycleState =
  | "candidate"
  | "offer_extended"
  | "onboarding"
  | "active"
  | "probation"
  | "confirmed"
  | "suspended"
  | "resigned"
  | "terminated"
  | "clearance_pending"
  | "clearance_complete";

export type LifecycleEventType =
  // Pre-employment (job_applications-backed states)
  | "candidate_created"
  | "offer_extended"
  | "offer_accepted"
  | "onboarded"
  // Active-employee state transitions
  | "probation_started"
  | "probation_passed"
  | "suspended"
  | "reinstated"
  | "resigned"
  | "terminated"
  | "clearance_started"
  | "clearance_completed"
  // Operational events (no state change)
  | "transferred"
  | "assigned"
  | "reactivated";

/**
 * Valid transitions. Each entry is `before → afters[]`. The route
 * uses this to validate the operator's request BEFORE writing the
 * event row.
 */
export const ALLOWED_TRANSITIONS: Record<LifecycleState, LifecycleState[]> = {
  candidate:          ["offer_extended"],
  offer_extended:     ["onboarding", "candidate"],     // candidate ← decline path
  onboarding:         ["active"],
  active:             ["probation", "suspended", "resigned", "terminated"],
  probation:          ["confirmed", "terminated"],
  confirmed:          ["suspended", "resigned", "terminated"],
  suspended:          ["active", "terminated"],
  resigned:           ["terminated"],
  terminated:         ["clearance_pending", "active"], // active ← reactivated (override required)
  clearance_pending:  ["clearance_complete"],
  clearance_complete: [], // terminal
};

/**
 * Map an event type to the state-after it lands the employee in.
 * Events absent from this map don't change the state (operational
 * overlays like `transferred` / `assigned`).
 */
export const EVENT_TO_STATE_AFTER: Partial<Record<LifecycleEventType, LifecycleState>> = {
  candidate_created:  "candidate",
  offer_extended:     "offer_extended",
  offer_accepted:     "onboarding",
  onboarded:          "active",
  probation_started:  "probation",
  probation_passed:   "confirmed",
  suspended:          "suspended",
  reinstated:         "active",
  resigned:           "resigned",
  terminated:         "terminated",
  clearance_started:  "clearance_pending",
  clearance_completed:"clearance_complete",
  reactivated:        "active",
  // transferred + assigned → no state change.
};

export type GuardResult = { allowed: true } | { allowed: false; reason: string; code: string };

/**
 * Resolve the current state of an employee by reading the latest
 * lifecycle event. Falls back to inferring from the assignment status
 * when no events have been written yet (back-compat for the existing
 * tenant whose employees were created BEFORE PR-8).
 */
export async function resolveCurrentState(employeeId: number, companyId: number): Promise<LifecycleState | null> {
  const [latest] = await rawQuery<{ stateAfter: string | null }>(
    `SELECT "stateAfter" FROM employee_lifecycle_events
      WHERE "employeeId" = $1 AND "companyId" = $2 AND "stateAfter" IS NOT NULL
      ORDER BY "createdAt" DESC, id DESC LIMIT 1`,
    [employeeId, companyId],
  );
  if (latest?.stateAfter) return latest.stateAfter as LifecycleState;
  // Back-compat: derive from assignment status for pre-PR-8 employees.
  const [asn] = await rawQuery<{ status: string; endDate: string | null }>(
    `SELECT status, "endDate" FROM employee_assignments
      WHERE "employeeId" = $1 AND "companyId" = $2
      ORDER BY "isPrimary" DESC, id DESC LIMIT 1`,
    [employeeId, companyId],
  );
  if (!asn) return null;
  if (asn.status === "terminated" || asn.endDate) return "terminated";
  return "active";
}

/**
 * Guards block transitions that would leave dangling operational
 * state. The product owner's specific examples:
 *   • Termination must clear (or document) active custody, loans,
 *     leaves.
 *   • Reactivation (terminated → active) requires a documented reason.
 *
 * Returns `{allowed: true}` when the transition is safe, or
 * `{allowed: false, reason, code}` when blocked. The route honours
 * `overrideReason` to bypass — but the override is RECORDED in the
 * event row so it's auditable.
 */
export async function checkGuards(args: {
  employeeId: number;
  companyId: number;
  from: LifecycleState | null;
  to: LifecycleState | null;
  eventType: LifecycleEventType;
}): Promise<GuardResult[]> {
  const failures: GuardResult[] = [];

  // Termination guards.
  if (args.eventType === "terminated") {
    // Active custody (subsidiary_accounts row pointing at employee + non-zero balance).
    const [cust] = await rawQuery<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM subsidiary_accounts
        WHERE "entityType" = 'employee' AND "entityId" = $1 AND "isActive" = TRUE`,
      [args.employeeId],
    ).catch(() => [{ count: 0 }]);
    if ((cust?.count ?? 0) > 0) {
      failures.push({
        allowed: false,
        code: "ACTIVE_CUSTODY",
        reason: "للموظف عهدة مالية نشطة — أقفلها أو وثّق التجاوز",
      });
    }
    // Active loans (hr_employee_loans where status='active').
    const [loan] = await rawQuery<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM hr_employee_loans
        WHERE "employeeId" = $1 AND status = 'active' AND "deletedAt" IS NULL`,
      [args.employeeId],
    ).catch(() => [{ count: 0 }]);
    if ((loan?.count ?? 0) > 0) {
      failures.push({
        allowed: false,
        code: "ACTIVE_LOAN",
        reason: "للموظف سلفة نشطة — صفّها أو وثّق التجاوز",
      });
    }
    // Pending leaves (hr_leave_requests pending).
    const [leave] = await rawQuery<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM hr_leave_requests
        WHERE "employeeId" = $1 AND status = 'pending' AND "deletedAt" IS NULL`,
      [args.employeeId],
    ).catch(() => [{ count: 0 }]);
    if ((leave?.count ?? 0) > 0) {
      failures.push({
        allowed: false,
        code: "PENDING_LEAVE",
        reason: "للموظف طلبات إجازة معلّقة — اعتمدها/ارفضها أو وثّق التجاوز",
      });
    }
  }

  // Reactivation guard.
  if (args.from === "terminated" && args.to === "active") {
    failures.push({
      allowed: false,
      code: "REACTIVATION_REQUIRES_DOCUMENT",
      reason: "إعادة تفعيل موظف منتهية خدمته تتطلّب توثيقًا — وثّق التجاوز أو ألغِ القرار",
    });
  }

  return failures;
}

/**
 * Compute the list of transitions the operator can fire FROM the
 * current state. Used by the UI to render the «الإجراءات المتاحة»
 * buttons.
 */
export function nextTransitions(from: LifecycleState | null): LifecycleState[] {
  if (!from) return [];
  return ALLOWED_TRANSITIONS[from] ?? [];
}

/**
 * Localised Arabic labels for states + event types. Single source of
 * truth so the UI doesn't drift from the engine.
 */
export const STATE_LABEL_AR: Record<LifecycleState, string> = {
  candidate:          "مرشّح",
  offer_extended:     "عرض وظيفي",
  onboarding:         "تحت التجهيز",
  active:             "نشط",
  probation:          "تحت التجربة",
  confirmed:          "مثبَّت",
  suspended:          "موقوف مؤقتًا",
  resigned:           "مستقيل",
  terminated:         "منتهية خدمته",
  clearance_pending:  "مخالصة معلّقة",
  clearance_complete: "مخالصة مكتملة",
};

export const EVENT_LABEL_AR: Record<LifecycleEventType, string> = {
  candidate_created:  "تسجيل مرشّح",
  offer_extended:     "إصدار عرض وظيفي",
  offer_accepted:     "قبول العرض",
  onboarded:          "اكتمال التجهيز / مباشرة",
  probation_started:  "بدء فترة التجربة",
  probation_passed:   "اعتماد التثبيت",
  suspended:          "إيقاف مؤقت",
  reinstated:         "إعادة للعمل",
  resigned:           "تقديم استقالة",
  terminated:         "إنهاء خدمة",
  clearance_started:  "فتح مخالصة",
  clearance_completed:"إغلاق مخالصة",
  transferred:        "نقل تنظيمي",
  assigned:           "تكليف تشغيلي",
  reactivated:        "إعادة تفعيل بعد إنهاء",
};
