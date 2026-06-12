/**
 * Umrah familiarity scoring — PE-06 (#2079).
 *
 * Owner's mandate (file 20 §3, owner-confirmed 2026-06-11):
 *   «سائق متمرّس على فوج بعينه يُكافأ في المحرّك» — but ONLY for
 *   passenger_umrah bookings, ONLY as a scoring axis (never a
 *   blocker), and WITHOUT creating new columns or letting umrah
 *   bleed beyond this narrow surface.
 *
 * Closes UMR-01 + UMR-04 from docs/transport-audit/20 §3. The
 * conditional UMR-03 hard guard (CHECK-PE-01: «داخل برنامج الفوج»)
 * is intentionally DEFERRED — umrah_groups carries `programDuration`
 * but no concrete programStartsAt / programEndsAt, and the owner
 * explicitly forbade adding columns in PE-06.
 *
 * The history probe runs ONCE per suggest call (single SQL),
 * irrespective of how many drivers the engine ranks.
 */

export type UmrahFamiliarityHistory = Map<
  number, // driverId
  { groupTrips: number; customerTrips: number }
>;

const TRIGGER_GROUP_TRIPS    = 3;  // ≥3 trips on the same umrah group → strong bonus
const STRONG_BONUS_GROUP     = 15;
const TRIGGER_CUSTOMER_TRIPS = 3;
const STRONG_BONUS_CUSTOMER  = 12;
const ANY_HISTORY_BONUS      = 8;  // ≥1 trip on either axis → light bonus

/**
 * Pure scorer over the pre-loaded history map.
 *
 * Returns:
 *   • bonus  — points to ADD to the final score (capped externally).
 *             0 when the trip is not passenger_umrah, when neither
 *             umrahGroupId nor customerId is present on the booking,
 *             or when the driver has no relevant history.
 *   • reason — Arabic one-liner the engine can push onto `reasons`
 *             when bonus > 0. null otherwise.
 */
export function scoreUmrahFamiliarity(args: {
  transportServiceType: string;
  driverId: number;
  umrahGroupId: number | null;
  customerId: number | null;
  history: UmrahFamiliarityHistory;
}): { bonus: number; reason: string | null } {
  if (args.transportServiceType !== "passenger_umrah") {
    return { bonus: 0, reason: null };
  }
  if (args.umrahGroupId == null && args.customerId == null) {
    return { bonus: 0, reason: null };
  }
  const h = args.history.get(args.driverId);
  if (!h) return { bonus: 0, reason: null };

  // Group history wins over customer history when both are present —
  // the group is the operational match the dispatcher cares about
  // («السائق المتمرّس على فوج الأردن»). Customer history is the
  // fallback for when a booking lacks umrahGroupId but routes to the
  // same agency.
  if (args.umrahGroupId != null && h.groupTrips >= TRIGGER_GROUP_TRIPS) {
    return {
      bonus: STRONG_BONUS_GROUP,
      reason: `هذا السائق خدم الفوج ${h.groupTrips} مرات سابقًا`,
    };
  }
  if (args.customerId != null && h.customerTrips >= TRIGGER_CUSTOMER_TRIPS) {
    return {
      bonus: STRONG_BONUS_CUSTOMER,
      reason: `هذا السائق خدم نفس العميل ${h.customerTrips} مرات سابقًا`,
    };
  }
  if (h.groupTrips > 0 || h.customerTrips > 0) {
    const n = Math.max(h.groupTrips, h.customerTrips);
    return {
      bonus: ANY_HISTORY_BONUS,
      reason: `هذا السائق خدم الفوج/العميل ${n} مرة سابقًا`,
    };
  }
  return { bonus: 0, reason: null };
}
