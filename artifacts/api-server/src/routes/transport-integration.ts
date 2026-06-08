/**
 * Transport Integration Bridges (#1812 governing comment).
 *
 * The user's mandate: "النقل ليس جزيرة. يستقبل البيانات من النظام،
 * ينفذ خدمة النقل، ثم يرسل الأثر المناسب بعد اكتمال التشغيل."
 *
 * The current state pre-#1812: transport_bookings already carries the
 * FK columns to link sources (customerId, contractId, umrahGroupId,
 * projectId, waqfId), but every booking is still typed manually
 * by the operator from scratch. This router closes the loop:
 *
 *   GET  /transport/integration/linked-sources    — what's connected
 *        in the system right now but doesn't have transport bookings
 *        yet. The operator's "what needs my attention" view.
 *
 *   POST /transport/integration/from-umrah-group/:groupId  — given
 *        an umrah group, auto-materialize the standard 3-leg
 *        transport program (airport→Makkah, Makkah→Madinah,
 *        Madinah→airport). Idempotent on (umrahGroupId, routeType)
 *        so re-running it doesn't duplicate.
 *
 *   GET  /transport/integration/calendar.ics      — iCalendar feed
 *        of confirmed/scheduled bookings so the central calendar
 *        (or any external client supporting ics) can subscribe.
 *
 * All endpoints sit behind fleet.bookings authorize() — the same
 * surface that owns booking-create.
 */

import { Router } from "express";
import { z } from "zod";

import {
  handleRouteError, NotFoundError, parseId, zodParse,
} from "../lib/errorHandler.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { createAuditLog, emitEvent, todayISO } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";
import { rawQuery, rawExecute, withTransaction, assertInsert } from "../lib/rawdb.js";

export const transportIntegrationRouter = Router();
transportIntegrationRouter.use(authMiddleware);

// ─── Linked sources view ─────────────────────────────────────────────

transportIntegrationRouter.get(
  "/transport/integration/linked-sources",
  authorize({ feature: "fleet.bookings", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const { fromDate, toDate, sourceType } = req.query as Record<string, string | undefined>;
      const from = fromDate || todayISO();
      const to = toDate || from;

      const want = (k: string) => !sourceType || sourceType === "all" || sourceType === k;

      // 1) Umrah groups — show groups whose season window overlaps the
      //    chosen date range AND have at least one mutamer + transport
      //    needs (proxied by mutamerCount > 0), and currently have no
      //    transport_booking linking back via umrahGroupId.
      const umrahGroups = want("umrah_group") ? await rawQuery<{
        id: number;
        nuskGroupNumber: string;
        name: string | null;
        mutamerCount: number;
        programDuration: number | null;
        seasonStartDate: string | null;
        seasonEndDate: string | null;
        existingBookings: number;
      }>(
        `SELECT g.id, g."nuskGroupNumber", g.name,
                COALESCE(g."mutamerCount", 0)::int AS "mutamerCount",
                g."programDuration",
                s."startDate" AS "seasonStartDate",
                s."endDate"   AS "seasonEndDate",
                (
                  SELECT COUNT(*)::int FROM transport_bookings b
                   WHERE b."companyId" = g."companyId"
                     AND b."umrahGroupId" = g.id
                     AND b."deletedAt" IS NULL
                ) AS "existingBookings"
           FROM umrah_groups g
                LEFT JOIN umrah_seasons s ON s.id = g."seasonId" AND s."companyId" = g."companyId"
          WHERE g."companyId" = $1
            AND g."deletedAt" IS NULL
            AND COALESCE(g."mutamerCount", 0) > 0
            AND (
              s.id IS NULL OR (
                s."startDate" <= $3::date AND s."endDate" >= $2::date
              )
            )
          ORDER BY s."startDate" ASC NULLS LAST, g.id DESC
          LIMIT 200`,
        [scope.companyId, from, to],
      ) : [];

      // 2) Fleet rental contracts — active contracts in the window.
      //    The same idempotency proxy: contracts without a transport
      //    booking linking back via contractId are "open".
      const rentalContracts = want("fleet_rental_contract") ? await rawQuery<{
        id: number;
        contractNumber: string;
        customerId: number | null;
        customerName: string | null;
        startDate: string | null;
        endDate: string | null;
        existingBookings: number;
      }>(
        `SELECT c.id, c."contractNumber",
                c."customerId",
                cl.name AS "customerName",
                c."startDate", c."endDate",
                (
                  SELECT COUNT(*)::int FROM transport_bookings b
                   WHERE b."companyId" = c."companyId"
                     AND b."contractId" = c.id
                     AND b."deletedAt" IS NULL
                ) AS "existingBookings"
           FROM fleet_rental_contracts c
                LEFT JOIN clients cl ON cl.id = c."customerId" AND cl."companyId" = c."companyId"
          WHERE c."companyId" = $1
            AND c."deletedAt" IS NULL
            AND c.status IN ('active', 'pending')
            AND c."startDate" <= $3::date
            AND (c."endDate" IS NULL OR c."endDate" >= $2::date)
          ORDER BY c."startDate" ASC NULLS LAST, c.id DESC
          LIMIT 200`,
        [scope.companyId, from, to],
      ).catch(() => []) : [];
      // Best-effort: the catch covers older deployments without
      // fleet_rental_contracts. The contract surface is honest-
      // optional — present only if the rental contracts module ships.

      res.json(maskFields(req, {
        data: {
          fromDate: from,
          toDate: to,
          umrahGroups,
          rentalContracts,
          counts: {
            umrahGroupsTotal: umrahGroups.length,
            umrahGroupsNeedTransport: umrahGroups.filter((g) => g.existingBookings === 0).length,
            rentalContractsTotal: rentalContracts.length,
            rentalContractsNeedTransport: rentalContracts.filter((c) => c.existingBookings === 0).length,
          },
        },
      }));
    } catch (err) {
      handleRouteError(err, res, "Linked sources error:");
    }
  },
);

// ─── Materialize bookings from an Umrah group ────────────────────────
// The standard umrah 3-leg pattern. Each leg is a separate booking so
// the dispatcher can assign vehicles per leg (the trip can span weeks
// and reach Madinah by a different bus).

const UMRAH_LEGS = [
  { routeType: "airport_to_makkah", from: "المطار", to: "مكة المكرمة", label: "وصول → مكة" },
  { routeType: "makkah_to_madinah", from: "مكة المكرمة", to: "المدينة المنورة", label: "مكة → المدينة" },
  { routeType: "madinah_to_airport", from: "المدينة المنورة", to: "المطار", label: "المدينة → المطار" },
] as const;

const materializeUmrahSchema = z.object({
  /** When provided, only create the listed legs (subset of the 3).
   *  Useful for re-materializing after a partial creation. */
  legs: z.array(z.enum([
    "airport_to_makkah", "makkah_to_madinah", "madinah_to_airport",
  ])).optional(),
});

transportIntegrationRouter.post(
  "/transport/integration/from-umrah-group/:groupId",
  authorize({ feature: "fleet.bookings", action: "create" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const groupId = parseId(req.params.groupId, "groupId");
      const b = zodParse(materializeUmrahSchema.safeParse(req.body ?? {}));

      const result = await withTransaction(async (tx) => {
        // Load the umrah group + season window.
        const groupRes = await tx.query<{
          id: number; nuskGroupNumber: string;
          name: string | null; mutamerCount: number | null;
          programDuration: number | null;
          seasonStartDate: string | null;
          seasonEndDate: string | null;
        }>(
          `SELECT g.id, g."nuskGroupNumber", g.name,
                  g."mutamerCount", g."programDuration",
                  s."startDate" AS "seasonStartDate",
                  s."endDate"   AS "seasonEndDate"
             FROM umrah_groups g
                  LEFT JOIN umrah_seasons s ON s.id = g."seasonId" AND s."companyId" = g."companyId"
            WHERE g.id = $1 AND g."companyId" = $2 AND g."deletedAt" IS NULL`,
          [groupId, scope.companyId],
        );
        const group = groupRes.rows[0];
        if (!group) throw new NotFoundError("مجموعة العمرة غير موجودة");

        // Existing bookings — to keep idempotency on (umrahGroupId, routeType).
        const existingRes = await tx.query<{ routeType: string | null }>(
          `SELECT "routeType" FROM transport_bookings
            WHERE "umrahGroupId" = $1 AND "companyId" = $2
              AND "deletedAt" IS NULL`,
          [groupId, scope.companyId],
        );
        const haveRoutes = new Set(
          existingRes.rows.map((r) => r.routeType).filter(Boolean) as string[],
        );

        const wantedLegs = b.legs && b.legs.length > 0
          ? UMRAH_LEGS.filter((l) => b.legs!.includes(l.routeType))
          : UMRAH_LEGS;

        const created: Array<{ id: number; routeType: string; bookingNumber: string }> = [];
        const skipped: string[] = [];

        for (const leg of wantedLegs) {
          if (haveRoutes.has(leg.routeType)) {
            skipped.push(leg.routeType);
            continue;
          }
          const bookingNumber = `UMR-${group.nuskGroupNumber}-${leg.routeType.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12)}`;
          const insRes = await tx.query<{ id: number }>(
            `INSERT INTO transport_bookings
               ("companyId", "branchId", "bookingNumber", "bookingSource",
                "transportServiceType",
                "umrahGroupId",
                "fromLocationText", "toLocationText", "routeType",
                "passengerCount",
                "requestedPickupDate",
                "createdBy", status)
             VALUES ($1, $2, $3, 'umrah_group',
                     'passenger_umrah',
                     $4,
                     $5, $6, $7,
                     $8,
                     $9,
                     $10, 'submitted')
             RETURNING id`,
            [
              scope.companyId, scope.branchId ?? null, bookingNumber,
              groupId,
              leg.from, leg.to, leg.routeType,
              group.mutamerCount ?? null,
              // Heuristic: arrival leg starts at season start, mid-leg
              // around start+3, return leg at season end. Operator
              // adjusts after materialization.
              leg.routeType === "airport_to_makkah" ? group.seasonStartDate :
              leg.routeType === "madinah_to_airport" ? group.seasonEndDate :
              null,
              scope.userId,
            ],
          );
          const id = insRes.rows[0]!.id;
          created.push({ id, routeType: leg.routeType, bookingNumber });
        }

        return { groupId, created, skipped };
      });

      // Audit + event (best-effort, outside tx).
      createAuditLog({
        companyId: scope.companyId, branchId: scope.branchId ?? undefined, userId: scope.userId,
        action: "create", entity: "transport_bookings",
        entityId: result.created[0]?.id ?? 0,
        after: { umrahGroupId: groupId, createdLegs: result.created.length, skippedLegs: result.skipped },
      }).catch((e) => logger.error(e, "umrah materialize audit failed"));
      emitEvent({
        companyId: scope.companyId, branchId: scope.branchId ?? null, userId: scope.userId,
        action: "fleet.transport.materialized_from_umrah",
        entity: "transport_bookings",
        entityId: result.created[0]?.id ?? 0,
        details: JSON.stringify(result),
      }).catch((e) => logger.error(e, "umrah materialize event failed"));

      res.status(201).json({ data: result });
    } catch (err) {
      handleRouteError(err, res, "Materialize umrah bookings error:");
    }
  },
);

// ─── iCalendar feed ──────────────────────────────────────────────────
// Returns a text/calendar payload that any calendar client
// (Google Calendar, Outlook, Apple Calendar) can subscribe to. Surfaces
// confirmed transport activity in the central organizational calendar.

function icsEscape(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function icsDate(iso: string | null | Date | undefined): string {
  if (!iso) return "";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

transportIntegrationRouter.get(
  "/transport/integration/calendar.ics",
  authorize({ feature: "fleet.bookings", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const { fromDate, toDate } = req.query as Record<string, string | undefined>;
      const from = fromDate || todayISO();
      const to = toDate || new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);

      const rows = await rawQuery<{
        id: number; bookingNumber: string;
        transportServiceType: string;
        customerName: string | null;
        fromLocationText: string | null;
        toLocationText: string | null;
        scheduledStart: string | null;
        scheduledEnd: string | null;
        requestedPickupDate: string | null;
        status: string;
      }>(
        `SELECT b.id, b."bookingNumber", b."transportServiceType",
                COALESCE(b."customerName", cl.name) AS "customerName",
                b."fromLocationText", b."toLocationText",
                (
                  SELECT MIN(d."scheduledStartAt") FROM transport_dispatch_orders d
                         JOIN transport_booking_lines l ON l.id = d."bookingLineId"
                   WHERE l."bookingId" = b.id
                     AND d.status NOT IN ('declined', 'cancelled')
                ) AS "scheduledStart",
                (
                  SELECT MAX(d."scheduledEndAt") FROM transport_dispatch_orders d
                         JOIN transport_booking_lines l ON l.id = d."bookingLineId"
                   WHERE l."bookingId" = b.id
                     AND d.status NOT IN ('declined', 'cancelled')
                ) AS "scheduledEnd",
                b."requestedPickupDate"::text AS "requestedPickupDate",
                b.status
           FROM transport_bookings b
                LEFT JOIN clients cl ON cl.id = b."customerId" AND cl."companyId" = b."companyId"
          WHERE b."companyId" = $1
            AND b."deletedAt" IS NULL
            AND b.status IN ('approved', 'scheduled', 'dispatched', 'in_progress')
            AND COALESCE(b."requestedPickupDate"::date,
                         CURRENT_DATE) BETWEEN $2::date AND $3::date
          ORDER BY b."requestedPickupDate" ASC NULLS LAST
          LIMIT 500`,
        [scope.companyId, from, to],
      );

      const ICS: string[] = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Ghayth ERP//Transport//AR",
        "CALSCALE:GREGORIAN",
        "X-WR-CALNAME:حجوزات النقل — غيث",
      ];
      for (const r of rows) {
        const dtStart = r.scheduledStart ?? (r.requestedPickupDate ? `${r.requestedPickupDate}T08:00:00Z` : null);
        const dtEnd   = r.scheduledEnd   ?? (r.requestedPickupDate ? `${r.requestedPickupDate}T10:00:00Z` : null);
        if (!dtStart) continue;
        const summary = `حجز #${r.bookingNumber} — ${r.customerName ?? r.transportServiceType}`;
        const description = [
          r.fromLocationText ? `من: ${r.fromLocationText}` : "",
          r.toLocationText ? `إلى: ${r.toLocationText}` : "",
          `الحالة: ${r.status}`,
        ].filter(Boolean).join("\n");
        ICS.push("BEGIN:VEVENT");
        ICS.push(`UID:transport-booking-${r.id}@ghayth-erp`);
        ICS.push(`DTSTAMP:${icsDate(new Date())}`);
        ICS.push(`DTSTART:${icsDate(dtStart)}`);
        if (dtEnd) ICS.push(`DTEND:${icsDate(dtEnd)}`);
        ICS.push(`SUMMARY:${icsEscape(summary)}`);
        ICS.push(`DESCRIPTION:${icsEscape(description)}`);
        ICS.push("END:VEVENT");
      }
      ICS.push("END:VCALENDAR");

      res.setHeader("Content-Type", "text/calendar; charset=utf-8");
      res.setHeader("Content-Disposition", "inline; filename=\"transport-bookings.ics\"");
      res.send(ICS.join("\r\n"));
    } catch (err) {
      handleRouteError(err, res, "Calendar feed error:");
    }
  },
);

export default transportIntegrationRouter;
