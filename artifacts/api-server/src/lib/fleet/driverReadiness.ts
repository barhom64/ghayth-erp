/**
 * Driver Readiness — PE-03 (#2079).
 *
 * Closes REST-01 (driving caps) + REST-02 (approved leave overlap)
 * from `docs/transport-audit/20_planning_engine_audit.md` §5.
 *
 * Owner's mandate (2026-06-11):
 *   «أي سائق في إجازة، أو متجاوز سقف القيادة، أو لا يملك راحة
 *    كافية، لا يدخل الترشيح إلا وفق استثناء موثق إن كان النظام
 *    يسمح بذلك لاحقًا.»
 *
 * Until this module:
 *   • driver point-to-point rest was already enforced via
 *     `assignDriverRest.ts` (since #1812). That's hours BETWEEN
 *     dispatches — necessary but not sufficient.
 *   • approved leaves on `hr_leave_requests` were invisible to the
 *     engine. A driver scheduled to be off Wednesday could still be
 *     suggested for Wednesday's run.
 *   • aggregate driving time (per-day, per-week) was never bounded.
 *     A driver could rack up 14h in a day across separate dispatches.
 *
 * This module produces the verdict shape (`{ blocked, reason }`) so
 * the engine consumer is structurally identical to the vehicle gate
 * (`vehicleReadiness.ts`). The reasons are Arabic-direct, ready to
 * surface in any future suggest-diagnostics surface.
 */

export interface LeaveOverlap {
  employeeId: number;
  /** YYYY-MM-DD as stored in hr_leave_requests. */
  startDate: string;
  endDate: string;
  leaveType: string | null;
}

export interface DriverDrivingMinutes {
  /** Minutes already dispatched in the trailing 24 hours. */
  daily: number;
  /** Minutes already dispatched in the trailing 7 days. */
  weekly: number;
}

export interface DrivingCaps {
  dailyMinutes: number;
  weeklyMinutes: number;
}

export interface ReadinessVerdict {
  blocked: boolean;
  /** Arabic, ready for engine `blockers` strings. Null when allowed. */
  reason: string | null;
}

/**
 * Hard gate: is this driver on approved leave during the booking window?
 *
 * The engine pre-builds a Map<employeeId, LeaveOverlap> from a single
 * SELECT so the check stays O(1) per driver. NULL employeeId (driver
 * not linked to an HR row yet) bypasses the check — a legacy driver
 * isn't blocked just because they have no employee mapping.
 */
export function checkDriverLeave(
  employeeId: number | null,
  leaveMap: Map<number, LeaveOverlap>,
): ReadinessVerdict {
  if (employeeId == null) return { blocked: false, reason: null };
  const hit = leaveMap.get(employeeId);
  if (!hit) return { blocked: false, reason: null };
  const typeText = hit.leaveType ?? "إجازة معتمدة";
  return {
    blocked: true,
    reason: `السائق على ${typeText} من ${hit.startDate} إلى ${hit.endDate}`,
  };
}

/**
 * Hard gate: does this driver's accumulated driving time + the new
 * trip's duration exceed the company's daily or weekly cap?
 *
 *   newTripMinutes — the planned scheduledEnd - scheduledStart of
 *                    this booking.  We add it to the trailing windows
 *                    so the dispatcher can't sneak past the cap by
 *                    chaining short trips.
 *
 * Daily cap is checked first because it's the tighter window and the
 * one a dispatcher reading "the driver is over their daily limit"
 * can act on most easily.
 */
export function checkDriverDrivingCaps(
  current: DriverDrivingMinutes | null,
  newTripMinutes: number,
  caps: DrivingCaps,
): ReadinessVerdict {
  const daily = (current?.daily ?? 0) + newTripMinutes;
  if (daily > caps.dailyMinutes) {
    return {
      blocked: true,
      reason:
        `تجاوز السقف اليومي للقيادة — ${minutesToHours(daily)} مع الرحلة الجديدة` +
        ` يتجاوز ${minutesToHours(caps.dailyMinutes)} المسموحة`,
    };
  }
  const weekly = (current?.weekly ?? 0) + newTripMinutes;
  if (weekly > caps.weeklyMinutes) {
    return {
      blocked: true,
      reason:
        `تجاوز السقف الأسبوعي للقيادة — ${minutesToHours(weekly)} مع الرحلة الجديدة` +
        ` يتجاوز ${minutesToHours(caps.weeklyMinutes)} المسموحة`,
    };
  }
  return { blocked: false, reason: null };
}

function minutesToHours(m: number): string {
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (r === 0) return `${h} ساعة`;
  return `${h}س ${r}د`;
}
