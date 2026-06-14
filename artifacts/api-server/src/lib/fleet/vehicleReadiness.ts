/**
 * Vehicle Readiness — PE-02 (#2079).
 *
 * Closes CONF-01 (maintenance overlap) + CONF-05 (document expiry)
 * from `docs/transport-audit/20_planning_engine_audit.md` §7.
 *
 * Owner's mandate (2026-06-11):
 *   «أي مركبة عليها صيانة مانعة أو ترخيص/فحص/تأمين منتهي يجب أن
 *    تُقصى أو تُعلّم بسبب واضح قبل وصولها للمشغّل.»
 *
 * Until this module the assignment engine consulted neither
 * `fleet_maintenance` (scheduled / in-progress workorders) nor the
 * three expiry columns already on `fleet_vehicles`:
 *   • registrationExpiry  — استمارة المركبة
 *   • insuranceExpiry     — وثيقة التأمين
 *   • nextInspectionDate  — موعد الفحص الدوري التالي
 *
 * The Gate-PE-1 (VCM) helper already runs a per-vehicle eligibility
 * verdict before scoring; this module is intentionally the same
 * shape (`{ blocked, reason }`) so the engine can call both in the
 * same loop and produce a single ejection per vehicle.
 *
 * The reasons are Arabic-direct, designed to surface verbatim on
 * the dispatcher's screen so the operator knows EXACTLY which paper
 * is overdue.
 */

export interface VehicleReadinessRow {
  id: number;
  // node-postgres default-parses DATE columns to JS Date objects;
  // accept either shape so the readiness helper works whether the
  // caller has cast to text or left the raw row through.
  registrationExpiry: string | Date | null;
  insuranceExpiry: string | Date | null;
  nextInspectionDate: string | Date | null;
}

export interface ReadinessVerdict {
  blocked: boolean;
  /** Arabic, ready for engine `blockers` strings. Null when allowed. */
  reason: string | null;
}

/**
 * The booking window's END is the cut-off. If a document expires
 * BEFORE the booking ends, the trip would run partially uncovered
 * — block it. (A trip that finishes on the same day the document
 * expires is still legal; the check uses strict `<`.)
 */
function ymd(value: string | Date | null): string | null {
  if (!value) return null;
  // node-postgres default-parses DATE columns to JS Date objects in
  // local time; for our YYYY-MM-DD comparison we want UTC so the
  // string still slices cleanly. TIMESTAMPTZ inputs already come as
  // full ISO strings — the first 10 chars are still the calendar
  // date the column was stored under (no clock component).
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value.slice(0, 10);
}

export function checkVehicleDocumentReadiness(
  row: VehicleReadinessRow,
  scheduledEndAt: string,
): ReadinessVerdict {
  const endYmd = ymd(scheduledEndAt);
  if (!endYmd) return { blocked: false, reason: null };

  const reg = ymd(row.registrationExpiry);
  if (reg && reg < endYmd) {
    return {
      blocked: true,
      reason: `استمارة المركبة منتهية الصلاحية (انتهت في ${reg})`,
    };
  }
  const ins = ymd(row.insuranceExpiry);
  if (ins && ins < endYmd) {
    return {
      blocked: true,
      reason: `وثيقة التأمين منتهية الصلاحية (انتهت في ${ins})`,
    };
  }
  const insp = ymd(row.nextInspectionDate);
  if (insp && insp < endYmd) {
    return {
      blocked: true,
      reason: `الفحص الدوري متأخّر (موعد التجديد ${insp})`,
    };
  }
  return { blocked: false, reason: null };
}

/**
 * Pure data shape for the "maintenance window overlap" query result.
 *
 * The engine runs the SQL once for the booking window and hands the
 * resulting Set<vehicleId> back to the readiness gate. Keeping the
 * shape here lets the test file pin both the SQL and the consumer
 * symmetrically.
 */
export interface MaintenanceBlock {
  vehicleId: number;
  maintenanceType: string | null;
  serviceDate: string | null;
  nextServiceDate: string | null;
  status: string | null;
}

/**
 * Format a Maintenance block hit as an Arabic blocker reason.
 * Pure function — separate from the SQL so unit-tests don't need
 * a live DB to lock the wording.
 */
export function maintenanceBlockReason(hit: MaintenanceBlock): string {
  const dateText = hit.serviceDate ? ymd(hit.serviceDate) : "غير محدّد";
  const typeText = hit.maintenanceType ?? "صيانة";
  return `صيانة مجدولة (${typeText}) في ${dateText} تتعارض مع نافذة الرحلة`;
}
