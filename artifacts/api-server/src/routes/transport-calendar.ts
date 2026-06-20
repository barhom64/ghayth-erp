// ─────────────────────────────────────────────────────────────────────────────
// transport-calendar.ts — TR-022 Unified Transport Calendar
//
// Mirrors the umrah operational calendar (umrah-entities.ts GET
// /calendar/events) for the fleet/transport domain. One monthly/yearly
// grid that aggregates the transport pipeline's date-bearing entities
// into toggleable layers, each returning a per-day { date, c, sampleIds }
// roll-up so the SPA renders with one round-trip per window.
//
// Five layers (all company-scoped, soft-delete aware where the column
// exists). Every date column verified against migrations/schema:
//   • booking      transport_bookings.requestedPickupDate
//   • dispatch     transport_dispatch_orders.scheduledStartAt
//   • maintenance  fleet_vehicles expiry columns
//   • rental       fleet_rental_contracts.startDate/endDate
//   • cargo        cargo_manifests.pickupDate/deliveryDate
//
// Response shape is identical to umrah: { data, layers, window }.
// RBAC: fleet.dispatch:list — the cross-cutting transport-ops gate.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from "express";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { rawQuery } from "../lib/rawdb.js";
import { authorize } from "../lib/rbac/authorize.js";
import { handleRouteError, ValidationError } from "../lib/errorHandler.js";

export const transportCalendarRouter = Router();
transportCalendarRouter.use(authMiddleware);

export type TransportCalendarLayer =
  | "booking"
  | "dispatch"
  | "maintenance"
  | "rental"
  | "cargo";

export const CALENDAR_LAYER_META: Record<TransportCalendarLayer, {
  label: string;
  color: "green" | "yellow" | "red" | "gray" | "blue" | "purple";
  entityType: string;
}> = {
  // requestedPickupDate of every active booking. Cancelled / rejected
  // suppressed so dead requests don't compete for day-cell space.
  booking:     { label: "حجوزات النقل",      color: "blue",   entityType: "transport_bookings" },
  // scheduledStartAt of committed dispatch orders. Declined / cancelled
  // excluded — mirrors the dispatch-board exclusion.
  dispatch:    { label: "أوامر التشغيل",      color: "purple", entityType: "transport_dispatch_orders" },
  // Vehicle compliance expiries — registration / inspection / insurance /
  // next service. One event per upcoming expiry in the window.
  maintenance: { label: "استحقاقات المركبات", color: "yellow", entityType: "fleet_vehicles" },
  // Rental contract start + end. Two sub-events per contract.
  rental:      { label: "عقود التأجير",       color: "green",  entityType: "fleet_rental_contracts" },
  // Cargo manifest pickup + delivery.
  cargo:       { label: "شحنات البضائع",      color: "gray",   entityType: "cargo_manifests" },
};

const ALL_LAYERS = Object.keys(CALENDAR_LAYER_META) as TransportCalendarLayer[];

transportCalendarRouter.get(
  "/transport/calendar/events",
  authorize({ feature: "fleet.dispatch", action: "list" }),
  async (req, res): Promise<void> => {
    try {
      const scope = req.scope!;
      const fromStr = String(req.query.from ?? "");
      const toStr = String(req.query.to ?? "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fromStr) || !/^\d{4}-\d{2}-\d{2}$/.test(toStr)) {
        throw new ValidationError("from/to تاريخ بالشكل YYYY-MM-DD مطلوب");
      }
      if (fromStr > toStr) {
        throw new ValidationError("from يجب أن يكون قبل to");
      }
      // Same 366-day cap as the umrah calendar so the yearly view can
      // fetch a whole year in one round-trip; per-day COUNT + ARRAY_AGG
      // probes stay cheap across 5 layers.
      const fromDate = new Date(fromStr + "T00:00:00Z");
      const toDate = new Date(toStr + "T00:00:00Z");
      const days = Math.floor((toDate.getTime() - fromDate.getTime()) / 86400000);
      if (days > 366) {
        throw new ValidationError("نافذة التقويم محدودة بـ 366 يوماً", { field: "to" });
      }

      // Layer whitelist — operator passes `layers=booking,dispatch` to
      // scope the response to the toggles they have on.
      const layersParam = String(req.query.layers ?? "").trim();
      const requestedLayers: TransportCalendarLayer[] = layersParam
        ? layersParam.split(",")
          .map((s) => s.trim())
          .filter((s): s is TransportCalendarLayer => (ALL_LAYERS as string[]).includes(s))
        : ALL_LAYERS;
      if (requestedLayers.length === 0) {
        res.json({ data: [], layers: CALENDAR_LAYER_META, window: { from: fromStr, to: toStr } });
        return;
      }

      // Per-layer SQL. Each query returns { date, c, sampleIds } per day
      // within the window. maintenance / rental / cargo UNION their date
      // columns so one entity surfaces on each of its relevant dates;
      // the outer GROUP BY date re-aggregates to the same row shape.
      type Row = { date: string; c: string; sampleIds: number[] };
      const params: unknown[] = [scope.companyId, fromStr, toStr];

      const runs: Record<TransportCalendarLayer, Promise<Row[]> | null> = {
        booking: null, dispatch: null, maintenance: null, rental: null, cargo: null,
      };

      if (requestedLayers.includes("booking")) {
        runs.booking = rawQuery<Row>(
          `SELECT b."requestedPickupDate"::text AS date,
                  COUNT(*)::text AS c,
                  (ARRAY_AGG(b.id ORDER BY b.id))[1:10] AS "sampleIds"
             FROM transport_bookings b
            WHERE b."companyId" = $1
              AND b."requestedPickupDate" BETWEEN $2::date AND $3::date
              AND b.status NOT IN ('cancelled', 'rejected')
              AND b."deletedAt" IS NULL
            GROUP BY b."requestedPickupDate"`,
          params,
        );
      }

      if (requestedLayers.includes("dispatch")) {
        // transport_dispatch_orders has NO deletedAt column — lifecycle is
        // driven by status. Exclude declined/cancelled to mirror the
        // dispatch-board exclusion.
        runs.dispatch = rawQuery<Row>(
          `SELECT o."scheduledStartAt"::date::text AS date,
                  COUNT(*)::text AS c,
                  (ARRAY_AGG(o.id ORDER BY o.id))[1:10] AS "sampleIds"
             FROM transport_dispatch_orders o
            WHERE o."companyId" = $1
              AND o."scheduledStartAt"::date BETWEEN $2::date AND $3::date
              AND o.status NOT IN ('declined', 'cancelled')
            GROUP BY o."scheduledStartAt"::date`,
          params,
        );
      }

      if (requestedLayers.includes("maintenance")) {
        // One event per upcoming vehicle compliance expiry in the window.
        // UNION the four date columns so a vehicle with both registration
        // and inspection due in-window surfaces on both days.
        runs.maintenance = rawQuery<Row>(
          `SELECT date, COUNT(*)::text AS c,
                  (ARRAY_AGG(id ORDER BY id))[1:10] AS "sampleIds"
             FROM (
               SELECT v.id, v."registrationExpiry"::text AS date
                 FROM fleet_vehicles v
                WHERE v."companyId" = $1 AND v."deletedAt" IS NULL
                  AND v."registrationExpiry" BETWEEN $2::date AND $3::date
               UNION ALL
               SELECT v.id, v."inspectionExpiry"::text AS date
                 FROM fleet_vehicles v
                WHERE v."companyId" = $1 AND v."deletedAt" IS NULL
                  AND v."inspectionExpiry" BETWEEN $2::date AND $3::date
               UNION ALL
               SELECT v.id, v."insuranceExpiry"::text AS date
                 FROM fleet_vehicles v
                WHERE v."companyId" = $1 AND v."deletedAt" IS NULL
                  AND v."insuranceExpiry" BETWEEN $2::date AND $3::date
               UNION ALL
               SELECT v.id, v."nextServiceDate"::text AS date
                 FROM fleet_vehicles v
                WHERE v."companyId" = $1 AND v."deletedAt" IS NULL
                  AND v."nextServiceDate" BETWEEN $2::date AND $3::date
             ) ex
            GROUP BY date`,
          params,
        );
      }

      if (requestedLayers.includes("rental")) {
        // Contract start + end both surface. Cancelled contracts excluded
        // — they're not operationally live.
        runs.rental = rawQuery<Row>(
          `SELECT date, COUNT(*)::text AS c,
                  (ARRAY_AGG(id ORDER BY id))[1:10] AS "sampleIds"
             FROM (
               SELECT rc.id, rc."startDate"::text AS date
                 FROM fleet_rental_contracts rc
                WHERE rc."companyId" = $1 AND rc."deletedAt" IS NULL
                  AND rc.status <> 'cancelled'
                  AND rc."startDate" BETWEEN $2::date AND $3::date
               UNION ALL
               SELECT rc.id, rc."endDate"::text AS date
                 FROM fleet_rental_contracts rc
                WHERE rc."companyId" = $1 AND rc."deletedAt" IS NULL
                  AND rc.status <> 'cancelled'
                  AND rc."endDate" IS NOT NULL
                  AND rc."endDate" BETWEEN $2::date AND $3::date
             ) rcd
            GROUP BY date`,
          params,
        );
      }

      if (requestedLayers.includes("cargo")) {
        // Manifest pickup + delivery. Cancelled excluded.
        runs.cargo = rawQuery<Row>(
          `SELECT date, COUNT(*)::text AS c,
                  (ARRAY_AGG(id ORDER BY id))[1:10] AS "sampleIds"
             FROM (
               SELECT m.id, m."pickupDate"::text AS date
                 FROM cargo_manifests m
                WHERE m."companyId" = $1 AND m."deletedAt" IS NULL
                  AND m.status <> 'cancelled'
                  AND m."pickupDate" BETWEEN $2::date AND $3::date
               UNION ALL
               SELECT m.id, m."deliveryDate"::text AS date
                 FROM cargo_manifests m
                WHERE m."companyId" = $1 AND m."deletedAt" IS NULL
                  AND m.status <> 'cancelled'
                  AND m."deliveryDate" IS NOT NULL
                  AND m."deliveryDate" BETWEEN $2::date AND $3::date
             ) cm
            GROUP BY date`,
          params,
        );
      }

      // Parallel awaits — each layer is an independent aggregate.
      const settled = await Promise.all(
        ALL_LAYERS.map(async (layer) => {
          const p = runs[layer];
          if (!p) return null;
          const rows = await p;
          return { layer, rows };
        }),
      );

      const events: Array<{
        date: string;
        layer: TransportCalendarLayer;
        count: number;
        color: string;
        label: string;
        entityType: string;
        sampleIds: number[];
      }> = [];
      for (const result of settled) {
        if (!result) continue;
        const meta = CALENDAR_LAYER_META[result.layer];
        for (const r of result.rows) {
          events.push({
            date: r.date,
            layer: result.layer,
            count: Number(r.c),
            color: meta.color,
            label: meta.label,
            entityType: meta.entityType,
            sampleIds: r.sampleIds ?? [],
          });
        }
      }

      res.json({
        data: events,
        layers: CALENDAR_LAYER_META,
        window: { from: fromStr, to: toStr },
      });
    } catch (err) {
      handleRouteError(err, res, "Transport calendar events");
    }
  },
);
