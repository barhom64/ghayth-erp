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
import { logger } from "../lib/logger.js";

const router = Router();

const CARGO_STATUSES = ["draft", "confirmed", "loading", "in_transit", "delivered", "closed", "cancelled"] as const;

// Lifecycle: who can transition from where. Mirrors the fleet/umrah
// state machines for consistency (see fleet.ts:330 for the driver
// example). The dispatcher can cancel from any non-terminal state;
// otherwise transitions are strictly forward.
const CARGO_TRANSITIONS: Record<typeof CARGO_STATUSES[number], string[]> = {
  draft:      ["confirmed", "cancelled"],
  confirmed:  ["loading", "cancelled"],
  loading:    ["in_transit", "cancelled"],
  in_transit: ["delivered", "cancelled"],
  delivered:  ["closed"],
  closed:     [],
  cancelled:  [],
};

const createManifestSchema = z.object({
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
});

const updateManifestSchema = createManifestSchema.partial().extend({
  status: z.enum(CARGO_STATUSES).optional(),
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

      const [existing] = await rawQuery<{ status: typeof CARGO_STATUSES[number] }>(
        `SELECT status FROM cargo_manifests
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

      const sets: string[] = [];
      const params: unknown[] = [];
      let p = 1;
      const setField = (col: string, val: unknown) => {
        sets.push(`"${col}" = $${p++}`);
        params.push(val);
      };
      for (const [col, val] of Object.entries(b)) {
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

      const [row] = await rawQuery(
        `SELECT * FROM cargo_manifests WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [id, scope.companyId],
      );
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
