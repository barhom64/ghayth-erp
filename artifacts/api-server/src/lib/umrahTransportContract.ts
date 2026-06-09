// ─────────────────────────────────────────────────────────────────────────────
// Umrah ↔ Transport Service Contract — §7 of #1870
//
// The Charter says: umrah is the LEADER path; transport is a SERVICE path.
// Umrah requests transport; the fleet engine fulfils. Umrah does NOT
// duplicate transport logic or write trip/vehicle/driver state itself.
//
// The seam already exists in the schema:
//   - `transport_bookings` is the unified service-request layer for ALL
//     sources (cargo, contracts, projects, AND umrah groups). It carries
//     `umrahGroupId` as a back-link + `bookingSource = 'umrah_group'`
//     + `transportServiceType = 'passenger_umrah'`.
//   - The fleet engine listens to bookings; future fulfilment work will
//     attach vehicleId / driverId / actualCost as the trip progresses.
//
// This module is the umrah-side API for that seam. Two functions:
//
//   1. createTransportRequestFromUmrah(scope, input) — INSERTs a
//      transport_bookings row for a specific group + emits the §10
//      catalog event `umrah.transport.requested`. The fleet engine
//      receives the event + decides whether/when to assign resources.
//
//   2. listTransportRequestsForGroup(scope, groupId) — read-side
//      helper so the group detail page can show "this group has 3
//      requested legs; 1 is fulfilled, 2 are still submitted".
//
// Both return the exact shape #1870 §7 spec'd:
//
//   { transportRequestId, tripId, vehicleId, driverId,
//     status, estimatedCost, actualCost }
//
// `tripId` / `vehicleId` / `driverId` / `actualCost` are null until
// the fleet engine assigns them — they show the operator that the
// request landed but isn't yet a confirmed trip.
// ─────────────────────────────────────────────────────────────────────────────
import { rawQuery, withTransaction } from "./rawdb.js";
import { emitEvent, createAuditLog } from "./businessHelpers.js";
import { NotFoundError, ValidationError } from "./errorHandler.js";
import { logger } from "./logger.js";

export interface TransportContractScope {
  companyId: number;
  branchId?: number | null;
  userId: number;
}

export interface CreateTransportRequestInput {
  groupId: number;
  seasonId?: number | null;
  pilgrimsCount?: number | null;
  dateTime?: string | null;
  fromLocation: string;
  toLocation: string;
  /**
   * Optional route type — when omitted, the booking lands as 'custom'.
   * The fleet engine uses this to suggest vehicle types + estimated
   * duration without a route-planner round-trip.
   */
  routeType?: "airport_to_makkah" | "makkah_to_madinah" | "madinah_to_airport" | "makkah_local" | "madinah_local" | "ziyarah" | "custom" | null;
  /**
   * Vehicle-type hint. Persisted to notes for now — the fleet engine
   * doesn't have a dedicated column yet. Future schema work can lift
   * it out, but the operator's intent is captured today.
   */
  requiredVehicleType?: string | null;
  flightNumber?: string | null;
  notes?: string | null;
}

export interface TransportRequestResult {
  transportRequestId: number;
  /**
   * The fleet trip id, once the fleet engine fulfils the booking.
   * Null until then — operator sees "request submitted" but the
   * group detail page is honest that no driver/vehicle is bound yet.
   */
  tripId: number | null;
  vehicleId: number | null;
  driverId: number | null;
  status: string;
  estimatedCost: number | null;
  actualCost: number | null;
  /**
   * Echoes back to the caller for logging — the catalog name the
   * eventBus fired, so a Tracer can correlate the umrah action to
   * fleet listeners.
   */
  emittedEvent: "umrah.transport.requested";
}

/**
 * Umrah-side entry to the Service Contract. Always idempotency-free —
 * a real "request another trip for the same group" creates another
 * transport_bookings row. The wizard-style 3-leg materializer in
 * `routes/transport-integration.ts` keeps its own idempotency on
 * (umrahGroupId, routeType) because there the assumption is "auto-fill
 * the standard 3 legs"; THIS helper is for ad-hoc requests.
 */
export async function createTransportRequestFromUmrah(
  scope: TransportContractScope,
  input: CreateTransportRequestInput,
): Promise<TransportRequestResult> {
  if (!input.groupId) {
    throw new ValidationError("معرّف المجموعة مطلوب", { field: "groupId" });
  }
  if (!input.fromLocation?.trim() || !input.toLocation?.trim()) {
    throw new ValidationError("نقطة الانطلاق والوجهة مطلوبتان", { field: "fromLocation" });
  }

  // Verify the group belongs to the tenant + isn't soft-deleted. Cheap
  // single-row lookup; without it the booking row would land but
  // reference an invalid groupId.
  const [group] = await rawQuery<{
    id: number;
    nuskGroupNumber: string | null;
    mutamerCount: number | null;
    seasonId: number | null;
  }>(
    `SELECT id, "nuskGroupNumber", "mutamerCount", "seasonId"
       FROM umrah_groups
      WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
    [input.groupId, scope.companyId],
  );
  if (!group) throw new NotFoundError("مجموعة العمرة غير موجودة");

  const routeType = input.routeType ?? "custom";
  const bookingNumber = `UMR-${group.nuskGroupNumber ?? group.id}-${routeType.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12)}-${Date.now().toString(36)}`;
  // Persist the vehicle-type hint inside notes until the fleet
  // engine grows a dedicated column. Format is grep-friendly so a
  // future migration can backfill the dedicated column.
  const composedNotes = [
    input.notes?.trim(),
    input.requiredVehicleType ? `[نوع المركبة: ${input.requiredVehicleType}]` : null,
  ].filter(Boolean).join("\n");

  const created = await withTransaction(async (client) => {
    const ins = await client.query<{ id: number; status: string }>(
      `INSERT INTO transport_bookings
         ("companyId", "branchId", "bookingNumber", "bookingSource",
          "transportServiceType",
          "umrahGroupId",
          "fromLocationText", "toLocationText", "routeType",
          "passengerCount",
          "requestedPickupDate",
          "flightNumber",
          notes,
          "createdBy", status)
       VALUES ($1, $2, $3, 'umrah_group',
               'passenger_umrah',
               $4,
               $5, $6, $7,
               $8,
               $9,
               $10,
               $11,
               $12, 'submitted')
       RETURNING id, status`,
      [
        scope.companyId, scope.branchId ?? null,
        bookingNumber,
        input.groupId,
        input.fromLocation.trim(), input.toLocation.trim(), routeType,
        input.pilgrimsCount ?? group.mutamerCount ?? null,
        // requestedPickupDate accepts a YYYY-MM-DD string or null.
        // The dateTime input is permissive (operator can pass an
        // ISO timestamp); we take only the date portion.
        input.dateTime ? input.dateTime.slice(0, 10) : null,
        input.flightNumber ?? null,
        composedNotes || null,
        scope.userId,
      ],
    );
    return ins.rows[0];
  });

  // Best-effort audit + event. §10 catalog declares this event with
  // `consumers: ["fleetEngine", "operationsDashboard"]`; the fleet
  // engine listens to decide when/how to fulfil.
  createAuditLog({
    companyId: scope.companyId, branchId: scope.branchId ?? undefined, userId: scope.userId,
    action: "create", entity: "transport_bookings",
    entityId: created.id,
    after: { umrahGroupId: input.groupId, routeType, bookingNumber },
  }).catch((e) => logger.error(e, "[umrahTransportContract] audit failed"));

  emitEvent({
    companyId: scope.companyId, branchId: scope.branchId ?? undefined, userId: scope.userId,
    action: "umrah.transport.requested",
    entity: "transport_bookings",
    entityId: created.id,
    after: {
      groupId: input.groupId,
      routeType,
      fromLocation: input.fromLocation,
      toLocation: input.toLocation,
      pilgrimsCount: input.pilgrimsCount ?? group.mutamerCount ?? null,
    },
  }).catch((e) => logger.error(e, "[umrahTransportContract] event emit failed"));

  return {
    transportRequestId: created.id,
    tripId: null,
    vehicleId: null,
    driverId: null,
    status: created.status,
    // Estimated cost is the fleet engine's responsibility — left null
    // here so the FE can render "في انتظار التسعير" rather than
    // claiming 0 SAR (which would mislead the operator).
    estimatedCost: null,
    actualCost: null,
    emittedEvent: "umrah.transport.requested",
  };
}

/**
 * Read-side helper for the group-detail page + the operational
 * calendar (#1870 §4). Returns one row per transport_booking tied
 * to the group, in the §7-spec shape so the FE can render them
 * with the same component as a freshly-created request.
 */
export async function listTransportRequestsForGroup(
  scope: TransportContractScope,
  groupId: number,
): Promise<TransportRequestResult[]> {
  // Group ownership check first — saves leaking another tenant's
  // booking list via a guessed groupId.
  const [group] = await rawQuery<{ id: number }>(
    `SELECT id FROM umrah_groups
      WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
    [groupId, scope.companyId],
  );
  if (!group) throw new NotFoundError("مجموعة العمرة غير موجودة");

  // Fleet doesn't yet write back vehicleId/driverId/actualCost on
  // transport_bookings — those land on the eventual fleet_trips row
  // (out of scope for this PR). We surface what we have today + the
  // status; the spec shape's null branches tell the FE "not yet
  // fulfilled".
  const rows = await rawQuery<{
    id: number;
    status: string;
    routeType: string | null;
    fromLocationText: string | null;
    toLocationText: string | null;
    requestedPickupDate: string | null;
    passengerCount: number | null;
    bookingNumber: string;
  }>(
    `SELECT id, status, "routeType", "fromLocationText", "toLocationText",
            "requestedPickupDate", "passengerCount", "bookingNumber"
       FROM transport_bookings
      WHERE "umrahGroupId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL
      ORDER BY "requestedPickupDate" NULLS LAST, id`,
    [groupId, scope.companyId],
  );

  return rows.map((r) => ({
    transportRequestId: r.id,
    tripId: null,
    vehicleId: null,
    driverId: null,
    status: r.status,
    estimatedCost: null,
    actualCost: null,
    emittedEvent: "umrah.transport.requested" as const,
  }));
}
