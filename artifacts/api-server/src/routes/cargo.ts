// Cargo / freight module — #1354 transport audit.
//
// Adds the cargo_manifests + cargo_items entity pair so the fleet
// surface can carry road-freight shipments in addition to the
// pre-existing passenger-trip / umrah-transport surfaces. The two
// previous surfaces (fleet_trips, umrah_transport) only modelled
// "who/where/when"; they had no notion of WHAT was being moved
// beyond a pilgrim count.
//
// Endpoints (mounted at /api/cargo by routes/index.ts):
//
//   Manifests:
//   GET    /manifests                 — list (scoped, paginated)
//   GET    /manifests/:id             — detail + items
//   POST   /manifests                 — create
//   PATCH  /manifests/:id             — update (status transitions + fields)
//   DELETE /manifests/:id             — soft delete
//
//   Items:
//   POST   /manifests/:id/items       — add item
//   PATCH  /items/:id                 — update one item
//   DELETE /items/:id                 — soft delete one item
//
// All endpoints are RBAC-gated on fleet.cargo (added to
// featureCatalog.ts in the same PR). Tenant + branch scope come
// from req.scope (the standard authorize() middleware injection).

import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute, withTransaction, assertInsert } from "../lib/rawdb.js";
import { authorize } from "../lib/rbac/authorize.js";
import {
  handleRouteError,
  ValidationError,
  NotFoundError,
  ConflictError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { createAuditLog, emitEvent } from "../lib/businessHelpers.js";
import { sendMessage } from "../lib/messageSender.js";
import { fleetEngine } from "../lib/engines/index.js";
import { logger } from "../lib/logger.js";
import { assertDriverEligibility } from "../lib/fleet/driverEligibility.js";
import { assertVehicleCapacity } from "../lib/fleet/vehicleCapacity.js";
import { FREIGHT_EVENTS } from "../lib/fleet/freightEvents.js";

const router = Router();

// #1733 Foundation — full 15-state lifecycle bridges operations to finance.
//
//   draft → requested → approved → assigned_to_driver → driver_accepted →
//   trip_started → arrived_pickup → loaded → in_transit → arrived_delivery →
//   delivered → completed → ready_for_invoice → financially_closed
//
// The driver's reach ends at `delivered` (see /me/cargo/:id/advance).
// `completed` is the dispatcher's operational close. `ready_for_invoice`
// is the dispatcher's "this is good for finance" gate — until that
// transition fires, NO billing candidate is created and NO JE is posted
// (the #1733 Comment 0 directive). `financially_closed` is the terminal
// state the accountant's materialize action flips the row into.
const CARGO_STATUSES = [
  "draft",
  "requested",
  "approved",
  "assigned_to_driver",
  "driver_accepted",
  "trip_started",
  "arrived_pickup",
  "loaded",
  "in_transit",
  "arrived_delivery",
  "delivered",
  "completed",
  "ready_for_invoice",
  "financially_closed",
  "cancelled",
] as const;

const CARGO_TRANSITIONS: Record<typeof CARGO_STATUSES[number], string[]> = {
  draft:              ["requested", "cancelled"],
  requested:          ["approved", "cancelled"],
  approved:           ["assigned_to_driver", "cancelled"],
  assigned_to_driver: ["driver_accepted", "cancelled"],
  driver_accepted:    ["trip_started", "cancelled"],
  trip_started:       ["arrived_pickup", "cancelled"],
  arrived_pickup:     ["loaded", "cancelled"],
  loaded:             ["in_transit", "cancelled"],
  in_transit:         ["arrived_delivery", "cancelled"],
  arrived_delivery:   ["delivered"],
  delivered:          ["completed"],
  completed:          ["ready_for_invoice"],
  ready_for_invoice:  ["financially_closed"],
  financially_closed: [],
  cancelled:          [],
};

const TRANSPORT_SERVICE_TYPES = [
  "cargo_load",
  "passenger_umrah",
  "passenger_general",
  "equipment_rental",
  "internal_transfer",
  "other",
] as const;

const BILLING_STATUSES = [
  "not_billable",
  "ready_for_accounting",
  "under_review",
  "invoiced",
  "excluded",
] as const;

const createManifestBaseSchema = z.object({
  manifestNumber: z.string().min(1, "رقم البوليصة مطلوب").max(64),
  customerId: z.coerce.number().int().positive().optional().nullable(),
  customerName: z.string().max(255).optional().nullable(),
  customerPhone: z.string().max(64).optional().nullable(),
  fleetTripId: z.coerce.number().int().positive().optional().nullable(),
  fromLocation: z.string().max(255).optional().nullable(),
  toLocation: z.string().max(255).optional().nullable(),
  pickupDate: z.string().optional().nullable(),
  deliveryDate: z.string().optional().nullable(),
  vehicleId: z.coerce.number().int().positive().optional().nullable(),
  driverId: z.coerce.number().int().positive().optional().nullable(),
  freightRevenue: z.coerce.number().min(0).optional().nullable(),
  freightCost: z.coerce.number().min(0).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  // #1733 Foundation — required service classification. Defaults to
  // `cargo_load` for back-compat; passenger / rental / internal flows
  // must set this explicitly so the accountant can group and price.
  transportServiceType: z.enum(TRANSPORT_SERVICE_TYPES).optional(),
});

// #1812 Wave 0.2 — manifest CREATE must link a structured customer.
// The free-text customerName is allowed only as display metadata
// alongside a customerId; alone it's rejected.
const createManifestSchema = createManifestBaseSchema.refine(
  (b) => b.customerId != null,
  {
    message:
      "يجب اختيار العميل من السجل (CRM). اسم العميل النصّي وحده غير مقبول.",
    path: ["customerId"],
  },
);

const updateManifestSchema = createManifestBaseSchema.partial().extend({
  status: z.enum(CARGO_STATUSES).optional(),
  // #1733 Foundation — read-only finance badge; only the accountant
  // materialize / reject paths flip this to `invoiced` / `excluded`.
  // Operators can mark `not_billable` (internal transfer) before the
  // first `ready_for_invoice` transition fires.
  billingStatus: z.enum(BILLING_STATUSES).optional(),
  // #1733 — operator's documented reason for an assignment that fails
  // either Blocker #2's payload guard OR Phase 2's eligibility guard.
  // Without this, an over-capacity / unqualified-driver confirm is
  // rejected; with it, the row + reason are recorded in
  // vehicle_capacity_overrides / driver_eligibility_overrides.
  overrideReason: z.string().min(1).max(500).optional(),
});

const createItemSchema = z.object({
  description: z.string().min(1, "وصف الصنف مطلوب").max(255),
  quantity: z.coerce.number().int().min(1).default(1),
  unitOfMeasure: z.string().max(32).optional().nullable(),
  weight: z.coerce.number().min(0).optional().nullable(),
  declaredValue: z.coerce.number().min(0).optional().nullable(),
  dimensions: z.union([z.record(z.unknown()), z.null()]).optional(),
  isHazmat: z.boolean().optional(),
  hazmatClass: z.string().max(32).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

const updateItemSchema = createItemSchema.partial();

/**
 * Recompute manifest totals from cargo_items. Called on item
 * INSERT/UPDATE/DELETE so the manifest list page renders consistent
 * weights without re-aggregating per-row.
 */
async function recomputeManifestTotals(manifestId: number, companyId: number): Promise<void> {
  const [agg] = await rawQuery<{ totalWeight: number; totalDeclaredValue: number }>(
    `SELECT
       COALESCE(SUM(quantity * COALESCE(weight, 0)), 0)::numeric(12,2) AS "totalWeight",
       COALESCE(SUM(quantity * COALESCE("declaredValue", 0)), 0)::numeric(14,2) AS "totalDeclaredValue"
     FROM cargo_items
     WHERE "manifestId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
    [manifestId, companyId],
  );
  await rawExecute(
    `UPDATE cargo_manifests
        SET "totalWeight" = $1, "totalDeclaredValue" = $2, "updatedAt" = NOW()
      WHERE id = $3 AND "companyId" = $4`,
    [agg?.totalWeight ?? 0, agg?.totalDeclaredValue ?? 0, manifestId, companyId],
  );
}

// ── Manifests ─────────────────────────────────────────────────────────

router.get(
  "/manifests",
  authorize({ feature: "fleet.cargo", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const status = String(req.query.status ?? "");
      const customerId = req.query.customerId ? Number(req.query.customerId) : null;
      const conditions: string[] = [`m."companyId" = ANY($1::int[])`, `m."deletedAt" IS NULL`];
      const params: unknown[] = [scope.allowedCompanies];
      let p = 2;
      if (status) { conditions.push(`m.status = $${p++}`); params.push(status); }
      if (customerId) { conditions.push(`m."customerId" = $${p++}`); params.push(customerId); }

      const rows = await rawQuery(
        `SELECT m.*,
                c.name AS "linkedCustomerName",
                v."plateNumber" AS "vehiclePlate",
                d.name AS "driverName",
                t.id AS "linkedTripId"
           FROM cargo_manifests m
           LEFT JOIN clients c ON c.id = m."customerId" AND c."companyId" = m."companyId" AND c."deletedAt" IS NULL
           LEFT JOIN fleet_vehicles v ON v.id = m."vehicleId" AND v."companyId" = m."companyId" AND v."deletedAt" IS NULL
           LEFT JOIN fleet_drivers d ON d.id = m."driverId" AND d."companyId" = m."companyId" AND d."deletedAt" IS NULL
           LEFT JOIN fleet_trips t ON t.id = m."fleetTripId" AND t."companyId" = m."companyId" AND t."deletedAt" IS NULL
          WHERE ${conditions.join(" AND ")}
          ORDER BY m."createdAt" DESC LIMIT 500`,
        params,
      );
      res.json({ data: rows });
    } catch (err) {
      handleRouteError(err, res, "List cargo manifests error:");
    }
  },
);

router.get(
  "/manifests/:id",
  authorize({ feature: "fleet.cargo", action: "view" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const [manifest] = await rawQuery<Record<string, unknown>>(
        `SELECT m.*,
                c.name AS "linkedCustomerName",
                v."plateNumber" AS "vehiclePlate",
                d.name AS "driverName"
           FROM cargo_manifests m
           LEFT JOIN clients c ON c.id = m."customerId" AND c."companyId" = m."companyId" AND c."deletedAt" IS NULL
           LEFT JOIN fleet_vehicles v ON v.id = m."vehicleId" AND v."companyId" = m."companyId" AND v."deletedAt" IS NULL
           LEFT JOIN fleet_drivers d ON d.id = m."driverId" AND d."companyId" = m."companyId" AND d."deletedAt" IS NULL
          WHERE m.id = $1 AND m."companyId" = ANY($2::int[]) AND m."deletedAt" IS NULL`,
        [id, scope.allowedCompanies],
      );
      if (!manifest) throw new NotFoundError("بوليصة الشحن غير موجودة");

      const items = await rawQuery(
        `SELECT * FROM cargo_items
          WHERE "manifestId" = $1 AND "companyId" = ANY($2::int[]) AND "deletedAt" IS NULL
          ORDER BY id ASC`,
        [id, scope.allowedCompanies],
      );
      res.json({ data: { ...manifest, items } });
    } catch (err) {
      handleRouteError(err, res, "Get cargo manifest error:");
    }
  },
);

// #1733 Comment 6 — operational timeline endpoint. Returns the merged,
// chronologically-sorted event stream for one manifest: status
// transitions, driver actions, capacity / eligibility exceptions, and
// the billing handoff. Used by the cargo-detail SPA page to render the
// per-manifest timeline ("الإسناد → قبول السائق → بدء الرحلة → وصول للتحميل
// → تم التحميل → في الطريق → الوصول للتسليم → تم التسليم → الإغلاق
// التشغيلي → الملاحظات والمرفقات").
router.get(
  "/manifests/:id/timeline",
  authorize({ feature: "fleet.cargo", action: "view" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");

      // Guard: confirm the manifest belongs to a company the user can see.
      const [exists] = await rawQuery<{ id: number }>(
        `SELECT id FROM cargo_manifests
          WHERE id = $1 AND "companyId" = ANY($2::int[]) AND "deletedAt" IS NULL`,
        [id, scope.allowedCompanies],
      );
      if (!exists) throw new NotFoundError("بوليصة الشحن غير موجودة");

      // Merge three sources:
      //   • audit_logs (entity=cargo_manifests, entityId=id) — every PATCH
      //   • event_logs (action LIKE 'fleet.cargo.%' AND entityId=id) — status changes
      //   • billing_candidates events (action='finance.transport_billing.materialized') — accountant action
      const rows = await rawQuery<Record<string, unknown>>(
        `SELECT
           'audit' AS source, action, "userId", "createdAt",
           before::text AS before_json, after::text AS after_json,
           NULL::text AS details
         FROM audit_logs
         WHERE entity = 'cargo_manifests' AND "entityId" = $1 AND "companyId" = ANY($2::int[])
         UNION ALL
         SELECT
           'event' AS source, action, "userId", "createdAt",
           NULL AS before_json, NULL AS after_json, details
         FROM event_logs
         WHERE entity = 'cargo_manifests' AND "entityId" = $1 AND "companyId" = ANY($2::int[])
         UNION ALL
         SELECT
           'event' AS source, e.action, e."userId", e."createdAt",
           NULL AS before_json, NULL AS after_json, e.details
         FROM event_logs e
         WHERE e.entity = 'transport_billing_candidates'
           AND e."companyId" = ANY($2::int[])
           AND EXISTS (
             SELECT 1 FROM transport_billing_candidates tbc
              WHERE tbc.id = e."entityId"
                AND tbc."sourceType" = 'cargo_manifest'
                AND tbc."sourceId" = $1
           )
         ORDER BY "createdAt" ASC
         LIMIT 500`,
        [id, scope.allowedCompanies],
      );
      res.json({ data: rows });
    } catch (err) {
      handleRouteError(err, res, "Get cargo timeline error:");
    }
  },
);

router.post(
  "/manifests",
  authorize({ feature: "fleet.cargo", action: "create" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const b = zodParse(createManifestSchema.safeParse(req.body));

      // Defense-in-depth on cross-tenant FK shopping: confirm the
      // optional vehicle/driver/customer/trip all belong to the
      // caller's tenant before stamping the row.
      if (b.vehicleId) {
        const [v] = await rawQuery<{ id: number }>(
          `SELECT id FROM fleet_vehicles WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
          [b.vehicleId, scope.companyId],
        );
        if (!v) throw new ValidationError("المركبة غير موجودة في الأسطول");
      }
      if (b.driverId) {
        const [d] = await rawQuery<{ id: number }>(
          `SELECT id FROM fleet_drivers WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
          [b.driverId, scope.companyId],
        );
        if (!d) throw new ValidationError("السائق غير موجود في الأسطول");
      }
      if (b.customerId) {
        const [c] = await rawQuery<{ id: number }>(
          `SELECT id FROM clients WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
          [b.customerId, scope.companyId],
        );
        if (!c) throw new ValidationError("العميل غير موجود");
      }
      if (b.fleetTripId) {
        const [t] = await rawQuery<{ id: number }>(
          `SELECT id FROM fleet_trips WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
          [b.fleetTripId, scope.companyId],
        );
        if (!t) throw new ValidationError("الرحلة غير موجودة");
      }

      const { insertId } = await rawExecute(
        `INSERT INTO cargo_manifests
           ("companyId","branchId","manifestNumber",status,
            "customerId","customerName","customerPhone",
            "fleetTripId","fromLocation","toLocation",
            "pickupDate","deliveryDate","vehicleId","driverId",
            "freightRevenue","freightCost",notes,"createdBy")
         VALUES ($1,$2,$3,'draft',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [
          scope.companyId, scope.branchId,
          b.manifestNumber,
          b.customerId ?? null, b.customerName ?? null, b.customerPhone ?? null,
          b.fleetTripId ?? null, b.fromLocation ?? null, b.toLocation ?? null,
          b.pickupDate || null, b.deliveryDate || null,
          b.vehicleId ?? null, b.driverId ?? null,
          b.freightRevenue ?? 0, b.freightCost ?? 0,
          b.notes ?? null, scope.userId,
        ],
      );
      assertInsert(insertId, "cargo_manifests");

      createAuditLog({
        companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
        action: "create", entity: "cargo_manifests", entityId: insertId,
        after: { manifestNumber: b.manifestNumber, customerId: b.customerId, fleetTripId: b.fleetTripId },
      }).catch((e) => logger.error(e, "cargo background task failed"));
      emitEvent({
        companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
        action: "fleet.cargo.manifest.created", entity: "cargo_manifests", entityId: insertId,
        details: JSON.stringify({ manifestNumber: b.manifestNumber, fleetTripId: b.fleetTripId }),
      }).catch((e) => logger.error(e, "cargo background task failed"));

      // Mirror the fleet trips + umrah transport WhatsApp dispatch
      // path (#1354 — driver_assigned). A cargo manifest is the third
      // surface that assigns drivers; without this the driver
      // wouldn't know they had a freight pickup until they checked
      // the SPA. Best-effort: any send failure logs but doesn't
      // fail the create.
      if (b.driverId) {
        try {
          const [driverInfo] = await rawQuery<{ phone: string | null; name: string | null }>(
            `SELECT phone, name FROM fleet_drivers WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
            [b.driverId, scope.companyId],
          );
          if (driverInfo?.phone) {
            await sendMessage({
              channel: "whatsapp",
              recipient: driverInfo.phone,
              recipientName: driverInfo.name,
              body: `بوليصة شحن جديدة #${b.manifestNumber} مسندة إليك:\n${b.fromLocation || 'غير محدد'} → ${b.toLocation || 'غير محدد'}\n${b.pickupDate ? `التحميل: ${b.pickupDate}\n` : ''}الرجاء الاطلاع على تفاصيل البوليصة في النظام.`,
              companyId: scope.companyId,
              userId: scope.userId,
              relatedType: "cargo_manifests",
              relatedId: insertId,
              templateKey: "fleet.cargo.driver_assigned",
              eventAction: "fleet.cargo.driver_notified",
            });
          }
        } catch (sendErr) {
          logger.error({ err: sendErr, manifestId: insertId, driverId: b.driverId }, "[cargo] driver WhatsApp dispatch failed");
        }
      }

      const [row] = await rawQuery(
        `SELECT * FROM cargo_manifests WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [insertId, scope.companyId],
      );
      res.status(201).json({ data: row });
    } catch (err) {
      handleRouteError(err, res, "Create cargo manifest error:");
    }
  },
);

router.patch(
  "/manifests/:id",
  authorize({ feature: "fleet.cargo", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const b = zodParse(updateManifestSchema.safeParse(req.body ?? {}));

      const [existing] = await rawQuery<{
        status: typeof CARGO_STATUSES[number];
        vehicleId: number | null;
        driverId: number | null;
        totalWeight: string | number | null;
      }>(
        `SELECT status, "vehicleId", "driverId", "totalWeight" FROM cargo_manifests
          WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [id, scope.companyId],
      );
      if (!existing) throw new NotFoundError("بوليصة الشحن غير موجودة");

      // Status transition guard. Same machine as CARGO_TRANSITIONS
      // above; reject hops that aren't in the allowed-targets list.
      if (b.status && b.status !== existing.status) {
        const allowed = CARGO_TRANSITIONS[existing.status] ?? [];
        if (!allowed.includes(b.status)) {
          throw new ConflictError(`الانتقال من ${existing.status} إلى ${b.status} غير مسموح`);
        }
      }

      // #1733 — both guards fire on the dispatcher-approval moment or
      // on any driver / vehicle swap. The eligibility guard (Phase 2)
      // refuses an unqualified driver; the capacity guard (Blocker #2)
      // refuses an over-payload assignment. Both share `overrideReason`
      // — the operator's one documented reason covers whichever check
      // would have rejected the assignment.
      const movingToApproved = b.status === "approved" && existing.status !== "approved";
      const switchingDriver = b.driverId !== undefined && b.driverId !== existing.driverId;
      const switchingVehicle = b.vehicleId !== undefined && b.vehicleId !== existing.vehicleId;
      if (movingToApproved || switchingDriver || switchingVehicle) {
        const targetDriverId = b.driverId ?? existing.driverId;
        const targetVehicleId = b.vehicleId ?? existing.vehicleId;
        if (targetDriverId && targetVehicleId) {
          await assertDriverEligibility({
            companyId: scope.companyId,
            branchId: scope.branchId ?? null,
            userId: scope.userId,
            driverId: targetDriverId,
            vehicleId: targetVehicleId,
            sourceType: "cargo_manifest",
            sourceId: id,
            overrideReason: b.overrideReason ?? null,
          });
        }
        const totalWeight = Number(existing.totalWeight) || 0;
        if (targetVehicleId && totalWeight > 0) {
          await assertVehicleCapacity({
            companyId: scope.companyId,
            branchId: scope.branchId ?? null,
            userId: scope.userId,
            vehicleId: targetVehicleId,
            kind: "payload_kg",
            amount: totalWeight,
            sourceType: "cargo_manifest",
            sourceId: id,
            overrideReason: b.overrideReason ?? null,
          });
        }
      }

      const sets: string[] = [];
      const params: unknown[] = [];
      let p = 1;
      const setField = (col: string, val: unknown) => {
        sets.push(`"${col}" = $${p++}`);
        params.push(val);
      };
      for (const [col, val] of Object.entries(b)) {
        // `overrideReason` is a body-only signal for the eligibility +
        // capacity guards above — it doesn't map to a cargo_manifests column.
        if (col === "overrideReason") continue;
        if (val !== undefined) setField(col, val);
      }
      if (sets.length === 0) {
        res.json({ data: { id } });
        return;
      }
      sets.push(`"updatedAt" = NOW()`);
      params.push(id, scope.companyId);
      await rawExecute(
        `UPDATE cargo_manifests SET ${sets.join(", ")}
          WHERE id = $${p++} AND "companyId" = $${p++} AND "deletedAt" IS NULL`,
        params,
      );

      createAuditLog({
        companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
        action: "update", entity: "cargo_manifests", entityId: id,
        before: { status: existing.status }, after: b,
      }).catch((e) => logger.error(e, "cargo background task failed"));

      if (b.status && b.status !== existing.status) {
        emitEvent({
          companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
          action: "fleet.cargo.manifest.status_changed", entity: "cargo_manifests", entityId: id,
          details: JSON.stringify({ from: existing.status, to: b.status }),
        }).catch((e) => logger.error(e, "cargo background task failed"));
      }

      const [row] = await rawQuery<Record<string, unknown>>(
        `SELECT * FROM cargo_manifests WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [id, scope.companyId],
      );

      // #1733 Foundation — Transport NEVER posts JE; the handoff is the
      // dispatcher's `ready_for_invoice` action, not the driver's
      // "delivered" tap. Two artifacts are created at the gate:
      //
      //   1. transport_billing_candidate (#1750) — the operational packet
      //      the accountant reviews + materialises into a JE.
      //   2. transport_service_lines (this PR) — the per-line billable
      //      facts that flow into the merged customer invoice.
      //
      // Both are idempotent via their (companyId, sourceType, sourceId)
      // unique constraint; re-PATCH cannot duplicate. We also flip the
      // operational `billingStatus` badge so dispatcher / driver pages
      // render the correct read-only finance-state label.
      if (b.status === "ready_for_invoice" && existing.status !== "ready_for_invoice" && row) {
        try {
          await fleetEngine.createCargoBillingCandidate(
            { companyId: scope.companyId, branchId: scope.branchId ?? 0, createdBy: scope.userId },
            {
              id,
              manifestNumber: String(row.manifestNumber ?? id),
              freightRevenue: Number(row.freightRevenue) || 0,
              freightCost: Number(row.freightCost) || 0,
              customerId: (row.customerId as number | null) ?? null,
              vehicleId: (row.vehicleId as number | null) ?? null,
              driverId: (row.driverId as number | null) ?? null,
              fromLocation: (row.fromLocation as string | null) ?? null,
              toLocation: (row.toLocation as string | null) ?? null,
              totalWeight: Number(row.totalWeight) || 0,
              deliveryDate: (row.deliveryDate as string | null) ?? null,
              notes: (row.notes as string | null) ?? null,
            },
          );
        } catch (handoffErr) {
          logger.error({ err: handoffErr, manifestId: id }, "[cargo] billing candidate handoff failed");
        }
        try {
          await rawExecute(
            `INSERT INTO transport_service_lines (
               "companyId", "branchId", "customerId",
               "sourceType", "sourceId", "sourceRef",
               "serviceType", "serviceDate",
               "tripId", "manifestId",
               "vehicleId", "driverId",
               "routeFrom", "routeTo",
               quantity, "unitOfMeasure",
               "unitPrice", "lineTotal",
               "billingStatus", "createdBy"
             ) VALUES (
               $1, $2, $3,
               'cargo_manifest', $4, $5,
               $6, COALESCE($7::date, CURRENT_DATE),
               $8, $4,
               $9, $10,
               $11, $12,
               $13, 'kg',
               NULL, $14,
               'ready_for_accounting', $15
             )
             ON CONFLICT ("companyId", "sourceType", "sourceId") DO NOTHING`,
            [
              scope.companyId,
              scope.branchId ?? null,
              (row.customerId as number | null) ?? null,
              id,
              String(row.manifestNumber ?? id),
              (row.transportServiceType as string) ?? "cargo_load",
              (row.deliveryDate as string | null) ?? null,
              (row.fleetTripId as number | null) ?? null,
              (row.vehicleId as number | null) ?? null,
              (row.driverId as number | null) ?? null,
              (row.fromLocation as string | null) ?? null,
              (row.toLocation as string | null) ?? null,
              Number(row.totalWeight) || 0,
              Number(row.freightRevenue) || 0,
              scope.userId,
            ],
          );
        } catch (slErr) {
          logger.error({ err: slErr, manifestId: id }, "[cargo] service line creation failed");
        }
        // Flip the operational badge so the dispatcher / driver pages
        // see "ready_for_accounting" alongside the lifecycle state.
        await rawExecute(
          `UPDATE cargo_manifests SET "billingStatus" = 'ready_for_accounting', "updatedAt" = NOW()
            WHERE id = $1 AND "companyId" = $2 AND "billingStatus" = 'not_billable'`,
          [id, scope.companyId],
        );
        // #1733 Comment 0 — emit the named "ready for invoice" event so
        // listeners (audit indexer, future webhook subscribers, the
        // dispatch board) get a single canonical signal.
        emitEvent({
          companyId: scope.companyId,
          branchId: scope.branchId ?? null,
          userId: scope.userId,
          action: FREIGHT_EVENTS.ReadyForInvoice,
          entity: "cargo_manifests",
          entityId: id,
          details: JSON.stringify({ manifestId: id }),
        }).catch((e) => logger.error(e, "ready_for_invoice event failed"));
      }

      res.json({ data: row });
    } catch (err) {
      handleRouteError(err, res, "Update cargo manifest error:");
    }
  },
);

router.delete(
  "/manifests/:id",
  authorize({ feature: "fleet.cargo", action: "delete" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const { affectedRows } = await rawExecute(
        `UPDATE cargo_manifests SET "deletedAt" = NOW()
          WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [id, scope.companyId],
      );
      if (affectedRows === 0) throw new NotFoundError("بوليصة الشحن غير موجودة");
      createAuditLog({
        companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
        action: "delete", entity: "cargo_manifests", entityId: id,
      }).catch((e) => logger.error(e, "cargo background task failed"));
      res.json({ data: { id, deleted: true } });
    } catch (err) {
      handleRouteError(err, res, "Delete cargo manifest error:");
    }
  },
);

// ── Items ────────────────────────────────────────────────────────────

router.post(
  "/manifests/:id/items",
  authorize({ feature: "fleet.cargo", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const manifestId = parseId(req.params.id, "id");
      const b = zodParse(createItemSchema.safeParse(req.body));

      const [manifest] = await rawQuery<{ id: number; status: string }>(
        `SELECT id, status FROM cargo_manifests
          WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [manifestId, scope.companyId],
      );
      if (!manifest) throw new NotFoundError("بوليصة الشحن غير موجودة");
      if (manifest.status === "closed" || manifest.status === "cancelled") {
        throw new ConflictError(`لا يمكن إضافة أصناف على بوليصة بحالة ${manifest.status}`);
      }

      const insertId = await withTransaction(async () => {
        const { insertId: newId } = await rawExecute(
          `INSERT INTO cargo_items
             ("manifestId","companyId",description,quantity,"unitOfMeasure",
              weight,"declaredValue",dimensions,"isHazmat","hazmatClass",notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            manifestId, scope.companyId,
            b.description, b.quantity, b.unitOfMeasure ?? "piece",
            b.weight ?? 0, b.declaredValue ?? 0,
            b.dimensions ? JSON.stringify(b.dimensions) : null,
            b.isHazmat ?? false, b.hazmatClass ?? null,
            b.notes ?? null,
          ],
        );
        assertInsert(newId, "cargo_items");
        await recomputeManifestTotals(manifestId, scope.companyId);
        return newId;
      });

      const [row] = await rawQuery(
        `SELECT * FROM cargo_items WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [insertId, scope.companyId],
      );
      res.status(201).json({ data: row });
    } catch (err) {
      handleRouteError(err, res, "Create cargo item error:");
    }
  },
);

router.patch(
  "/items/:id",
  authorize({ feature: "fleet.cargo", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const b = zodParse(updateItemSchema.safeParse(req.body ?? {}));

      const [item] = await rawQuery<{ manifestId: number }>(
        `SELECT "manifestId" FROM cargo_items
          WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [id, scope.companyId],
      );
      if (!item) throw new NotFoundError("الصنف غير موجود");

      const sets: string[] = [];
      const params: unknown[] = [];
      let p = 1;
      for (const [col, val] of Object.entries(b)) {
        if (val === undefined) continue;
        if (col === "dimensions" && val) {
          sets.push(`dimensions = $${p++}`);
          params.push(JSON.stringify(val));
        } else {
          sets.push(`"${col}" = $${p++}`);
          params.push(val);
        }
      }
      if (sets.length === 0) {
        res.json({ data: { id } });
        return;
      }
      sets.push(`"updatedAt" = NOW()`);
      params.push(id, scope.companyId);
      await rawExecute(
        `UPDATE cargo_items SET ${sets.join(", ")}
          WHERE id = $${p++} AND "companyId" = $${p++} AND "deletedAt" IS NULL`,
        params,
      );

      await recomputeManifestTotals(item.manifestId, scope.companyId);
      const [row] = await rawQuery(
        `SELECT * FROM cargo_items WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [id, scope.companyId],
      );
      res.json({ data: row });
    } catch (err) {
      handleRouteError(err, res, "Update cargo item error:");
    }
  },
);

router.delete(
  "/items/:id",
  authorize({ feature: "fleet.cargo", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const [item] = await rawQuery<{ manifestId: number }>(
        `SELECT "manifestId" FROM cargo_items
          WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [id, scope.companyId],
      );
      if (!item) throw new NotFoundError("الصنف غير موجود");
      await rawExecute(
        `UPDATE cargo_items SET "deletedAt" = NOW()
          WHERE id=$1 AND "companyId"=$2`,
        [id, scope.companyId],
      );
      await recomputeManifestTotals(item.manifestId, scope.companyId);
      res.json({ data: { id, deleted: true } });
    } catch (err) {
      handleRouteError(err, res, "Delete cargo item error:");
    }
  },
);

export default router;
