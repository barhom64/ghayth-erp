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
 * TRACKING ELIGIBILITY CONTRACT (independent decoupling):
 *   GPS-tracking eligibility derives EXCLUSIVELY from an explicit, active,
 *   per-employee row in `employee_tracking_policies`. It is NOT inferred
 *   from role=driver, NOR from the attendance categoryKey. An office
 *   employee with a policy is trackable; a driver WITHOUT a policy is not.
 *   Active = trackingEnabled AND inside the optional [startsAt,endsAt]
 *   window AND deletedAt IS NULL — so disabling/deleting the policy stops
 *   ingestion immediately. categoryKey is retained ONLY as a descriptive
 *   stamp on each stored point, never as a gate.
 */
import { z } from "zod";
import { rawQuery } from "./rawdb.js";
import { logger } from "./logger.js";

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

export type TrackingMode = "work_hours" | "task" | "trip" | "live" | "checkin_only";

export interface ActiveTrackingPolicy {
  id: number;
  employeeId: number;
  trackingMode: TrackingMode;
  reason: string | null;
  approvedBy: number | null;
  allowedViewerRoles: string[];
}

/**
 * Ping cadence (seconds) for a granted tracking MODE. Frequency is an
 * operational detail of the POLICY the company explicitly granted — NOT a
 * category/role attribute. `checkin_only` ingests no continuous pings
 * (freq 0) but is still an eligible, audited policy.
 */
export function frequencyForMode(mode: TrackingMode | string | null | undefined): number {
  switch (mode) {
    case "live":
      return 15;
    case "trip":
      return 30;
    case "task":
      return 60;
    case "work_hours":
      return 120;
    case "checkin_only":
      return 0;
    default:
      return 0;
  }
}

/**
 * The SINGLE authority for GPS-tracking eligibility: an explicit, active,
 * per-employee policy. Returns null when no active policy exists (→ the
 * employee is NOT trackable, regardless of role/category). Reads filter
 * `deletedAt IS NULL` (ghost-rows guard) and the active time-window so a
 * disabled/expired/deleted policy is immediately ineligible.
 */
export async function getActiveTrackingPolicy(
  companyId: number,
  employeeId: number,
): Promise<ActiveTrackingPolicy | null> {
  const [p] = await rawQuery<{
    id: number;
    employeeId: number;
    trackingMode: string;
    reason: string | null;
    approvedBy: number | null;
    allowedViewerRoles: unknown;
  }>(
    `SELECT id, "employeeId", "trackingMode", reason, "approvedBy", "allowedViewerRoles"
       FROM employee_tracking_policies
      WHERE "companyId" = $1
        AND "employeeId" = $2
        AND "deletedAt" IS NULL
        AND "trackingEnabled" = TRUE
        AND ("startsAt" IS NULL OR "startsAt" <= NOW())
        AND ("endsAt" IS NULL OR "endsAt" >= NOW())
      ORDER BY id DESC
      LIMIT 1`,
    [companyId, employeeId],
  );
  if (!p) return null;
  return {
    id: p.id,
    employeeId: p.employeeId,
    trackingMode: ((p.trackingMode as TrackingMode) ?? "work_hours"),
    reason: p.reason ?? null,
    approvedBy: p.approvedBy ?? null,
    allowedViewerRoles: Array.isArray(p.allowedViewerRoles)
      ? (p.allowedViewerRoles as string[])
      : [],
  };
}

async function resolveAssignmentMeta(
  companyId: number,
  assignmentId: number,
): Promise<{ employeeId: number | null; branchId: number | null; categoryKey: string | null } | null> {
  const [a] = await rawQuery<{ employeeId: number | null; branchId: number | null; categoryKey: string | null }>(
    `SELECT "employeeId", "branchId", "categoryKey"
       FROM employee_assignments
      WHERE id = $1 AND "companyId" = $2`,
    [assignmentId, companyId],
  );
  return a ?? null;
}

export async function getFieldEligibility(scope: FieldScope): Promise<{
  eligible: boolean;
  reason: string | null;
  trackingFrequencySeconds: number;
  categoryKey: string | null;
  trackingMode: TrackingMode | null;
}> {
  if (!scope.activeAssignmentId) {
    return { eligible: false, reason: "no_active_assignment", trackingFrequencySeconds: 0, categoryKey: null, trackingMode: null };
  }
  // A thrown resolution (DB fault, bad assignment) must NOT collapse into
  // "no_tracking_policy": that would make a real backend error
  // indistinguishable from "this employee has no tracking policy". Surface
  // a distinct `policy_error` so the client/ops can tell the two apart.
  let assignment: Awaited<ReturnType<typeof resolveAssignmentMeta>>;
  let policy: ActiveTrackingPolicy | null;
  try {
    assignment = await resolveAssignmentMeta(scope.companyId, scope.activeAssignmentId);
    if (!assignment?.employeeId) {
      return { eligible: false, reason: "no_active_assignment", trackingFrequencySeconds: 0, categoryKey: null, trackingMode: null };
    }
    policy = await getActiveTrackingPolicy(scope.companyId, assignment.employeeId);
  } catch (e) {
    logger.error(e, "field-eligibility policy resolution failed");
    return { eligible: false, reason: "policy_error", trackingFrequencySeconds: 0, categoryKey: null, trackingMode: null };
  }
  if (!policy) {
    // No explicit active tracking policy → ineligible. role=driver /
    // categoryKey=driver does NOT, by itself, make an employee trackable.
    return {
      eligible: false,
      reason: "no_tracking_policy",
      trackingFrequencySeconds: 0,
      categoryKey: assignment.categoryKey ?? null,
      trackingMode: null,
    };
  }
  return {
    eligible: true,
    reason: null,
    trackingFrequencySeconds: frequencyForMode(policy.trackingMode),
    categoryKey: assignment.categoryKey ?? null,
    trackingMode: policy.trackingMode,
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

  const assignment = await resolveAssignmentMeta(scope.companyId, scope.activeAssignmentId).catch((e) => {
    logger.error(e, "field-ping assignment resolution failed");
    return null;
  });
  if (!assignment?.employeeId) return { kind: "no_assignment" };

  // GATE: an explicit active tracking policy is the ONLY thing that opens
  // ingestion. No active policy (never granted, disabled, expired, or
  // deleted) → forbidden = immediate stop.
  const policy = await getActiveTrackingPolicy(scope.companyId, assignment.employeeId).catch((e) => {
    logger.error(e, "field-ping policy resolution failed");
    return null;
  });
  if (!policy) {
    return { kind: "forbidden", categoryKey: assignment.categoryKey ?? null, freq: 0 };
  }

  const freq = frequencyForMode(policy.trackingMode);
  const capturedAt = b.capturedAt ? new Date(b.capturedAt) : new Date();

  // Dedupe BEFORE throttle: an offline-queue replay re-sends a point that
  // is ALREADY stored. Its capturedAt equals the stored one, so the
  // throttle comparison would see gap=0 and mislabel it "throttled" — the
  // client would keep it queued forever. An exact (assignmentId,
  // capturedAt) hit is a duplicate, full stop.
  const [exact] = await rawQuery<{ id: number }>(
    `SELECT id FROM field_tracking_points
      WHERE "assignmentId" = $1 AND "capturedAt" = $2 LIMIT 1`,
    [scope.activeAssignmentId, capturedAt.toISOString()],
  );
  if (exact) return { kind: "duplicate", freq };

  // `checkin_only` (freq 0) stores discrete points with no cadence
  // throttle; continuous modes throttle to ~80% of their cadence.
  if (freq > 0) {
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
  }

  // Context columns stamped SERVER-side (unspoofable). ON CONFLICT on
  // (assignmentId, capturedAt) makes offline-queue replay idempotent.
  const [row] = await rawQuery<{ id: number }>(
    `INSERT INTO field_tracking_points
      ("companyId","branchId","assignmentId","employeeId","userId","activeRoleKey","categoryKey",lat,lng,accuracy,speed,heading,altitude,battery,"deviceId",source,"taskId","tripId","visitId","capturedAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
     ON CONFLICT ("assignmentId", "capturedAt") DO NOTHING
     RETURNING id`,
    [
      scope.companyId, assignment.branchId ?? scope.branchId, scope.activeAssignmentId,
      assignment.employeeId,
      scope.userId, scope.selectedRoleKey ?? null, assignment.categoryKey ?? null,
      b.lat, b.lng, b.accuracy ?? null, b.speed ?? null, b.heading ?? null, b.altitude ?? null,
      b.battery ?? null, b.deviceId ?? null, b.source ?? "mobile",
      b.taskId ?? null, b.tripId ?? null, b.visitId ?? null, capturedAt.toISOString(),
    ],
  );
  if (!row) return { kind: "duplicate", freq };
  return { kind: "accepted", id: row.id, freq };
}
