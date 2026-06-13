/**
 * fieldTrackingService — shared logic for field-ping eligibility +
 * ingestion (#2077 PR-9).
 *
 * Extracted from routes/hr.ts so the SAME logic serves two mounts:
 *   • /hr/attendance/field-ping[…]  — the original (module-gated) path,
 *     kept for the HR-side tooling + back-compat.
 *   • /my/field/…                   — the SELF-SERVICE path the mobile
 *     companion uses. hr.attendance.checkin is selfService:true in the
 *     feature catalog, so authorize() passes for every employee; what
 *     blocked field workers was the requireModule("hr") MOUNT gate on
 *     /hr/* — plain employees don't carry the hr module. Field check-in
 *     is self-service by doctrine (like my-space), hence the second
 *     mount without the module gate.
 *
 * The category policy stays the single authority: office/manager/
 * executive categories (trackingFrequencySeconds=0) are rejected at
 * BOTH mounts. Access scope ≠ field membership.
 */
import { z } from "zod";
import { rawQuery } from "./rawdb.js";
import { logger } from "./logger.js";
import { resolveAttendancePolicy } from "./attendancePolicyEngine.js";

export const fieldPingSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  accuracy: z.coerce.number().nonnegative().optional(),
  speed: z.coerce.number().nullable().optional(),
  heading: z.coerce.number().min(0).max(360).nullable().optional(),
  altitude: z.coerce.number().nullable().optional(),
  battery: z.coerce.number().int().min(0).max(100).nullable().optional(),
  deviceId: z.string().max(120).optional(),
  source: z.enum(["mobile", "web", "device", "manual"]).optional(),
  taskId: z.coerce.number().int().positive().optional(),
  tripId: z.coerce.number().int().positive().optional(),
  visitId: z.coerce.number().int().positive().optional(),
  capturedAt: z.string().optional(),
});
export type FieldPingBody = z.infer<typeof fieldPingSchema>;

export interface FieldScope {
  companyId: number;
  branchId: number | null;
  userId: number;
  activeAssignmentId: number | null;
  selectedRoleKey?: string | null;
}

export async function getFieldEligibility(scope: FieldScope): Promise<{
  eligible: boolean; reason: string | null;
  trackingFrequencySeconds: number; categoryKey: string | null;
}> {
  if (!scope.activeAssignmentId) {
    return { eligible: false, reason: "no_active_assignment", trackingFrequencySeconds: 0, categoryKey: null };
  }
  const policy = await resolveAttendancePolicy({
    companyId: scope.companyId,
    assignmentId: scope.activeAssignmentId,
  }).catch(() => null);
  const freq = policy?.trackingFrequencySeconds ?? 0;
  return {
    eligible: freq > 0,
    reason: freq > 0 ? null : "category_not_tracked",
    trackingFrequencySeconds: freq,
    categoryKey: policy?.categoryKey ?? null,
  };
}

export type RecordPingResult =
  | { kind: "no_assignment" }
  | { kind: "forbidden"; categoryKey: string | null; freq: number }
  | { kind: "throttled"; freq: number }
  | { kind: "duplicate"; freq: number }
  | { kind: "accepted"; id: number; freq: number };

export async function recordFieldPing(scope: FieldScope, b: FieldPingBody): Promise<RecordPingResult> {
  if (!scope.activeAssignmentId) return { kind: "no_assignment" };

  const policy = await resolveAttendancePolicy({
    companyId: scope.companyId,
    assignmentId: scope.activeAssignmentId,
  }).catch((e) => { logger.error(e, "field-ping policy resolution failed"); return null; });

  const freq = policy?.trackingFrequencySeconds ?? 0;
  if (freq <= 0) {
    return { kind: "forbidden", categoryKey: policy?.categoryKey ?? null, freq };
  }

  const capturedAt = b.capturedAt ? new Date(b.capturedAt) : new Date();

  // Dedupe BEFORE throttle: an offline-queue replay re-sends a point
  // that is ALREADY stored. Its capturedAt equals the stored one, so
  // the throttle comparison would see gap=0 and mislabel it
  // "throttled" — the client would keep it queued forever. An exact
  // (assignmentId, capturedAt) hit is a duplicate, full stop.
  const [exact] = await rawQuery<{ id: number }>(
    `SELECT id FROM field_tracking_points
      WHERE "assignmentId" = $1 AND "capturedAt" = $2 LIMIT 1`,
    [scope.activeAssignmentId, capturedAt.toISOString()],
  );
  if (exact) return { kind: "duplicate", freq };

  const [last] = await rawQuery<{ capturedAt: string }>(
    `SELECT "capturedAt" FROM field_tracking_points
      WHERE "assignmentId" = $1
      ORDER BY "capturedAt" DESC LIMIT 1`,
    [scope.activeAssignmentId],
  );
  if (last) {
    const gapSeconds = (capturedAt.getTime() - new Date(last.capturedAt).getTime()) / 1000;
    if (gapSeconds >= 0 && gapSeconds < freq * 0.8) {
      return { kind: "throttled", freq };
    }
  }

  const [assignment] = await rawQuery<{ employeeId: number; branchId: number | null }>(
    `SELECT "employeeId", "branchId" FROM employee_assignments WHERE id = $1 AND "companyId" = $2`,
    [scope.activeAssignmentId, scope.companyId],
  );

  // Context columns stamped SERVER-side (unspoofable). ON CONFLICT on
  // (assignmentId, capturedAt) makes offline-queue replay idempotent.
  const [row] = await rawQuery<{ id: number }>(
    `INSERT INTO field_tracking_points
      ("companyId","branchId","assignmentId","employeeId","userId","activeRoleKey","categoryKey",lat,lng,accuracy,speed,heading,altitude,battery,"deviceId",source,"taskId","tripId","visitId","capturedAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
     ON CONFLICT ("assignmentId", "capturedAt") DO NOTHING
     RETURNING id`,
    [
      scope.companyId, assignment?.branchId ?? scope.branchId, scope.activeAssignmentId,
      assignment?.employeeId ?? null,
      scope.userId, scope.selectedRoleKey ?? null, policy?.categoryKey ?? null,
      b.lat, b.lng, b.accuracy ?? null, b.speed ?? null, b.heading ?? null, b.altitude ?? null,
      b.battery ?? null, b.deviceId ?? null, b.source ?? "mobile",
      b.taskId ?? null, b.tripId ?? null, b.visitId ?? null, capturedAt.toISOString(),
    ],
  );
  if (!row) return { kind: "duplicate", freq };
  return { kind: "accepted", id: row.id, freq };
}
