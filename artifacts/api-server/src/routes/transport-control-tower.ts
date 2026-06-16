/**
 * Transport Control Tower (#1812 follow-up — fleet operating system).
 *
 * The user's evaluation explicitly called this out:
 *   "Control Tower — هذه بالنسبة لي أهم شاشة ناقصة.
 *    لوحة كبيرة فيها: مركبات متاحة / مشغولة / صيانة /
 *    سائقون متاحون / في راحة / رحلات اليوم / متأخرة / حرجة /
 *    وتكون مركز تشغيل حقيقي."
 *
 * Single endpoint returning the entire fleet state in one round-trip
 * so the SPA renders the dashboard without coordinating multiple calls:
 *
 *   GET /transport/control-tower[?date=YYYY-MM-DD]
 *
 * Response shape (all counts are cheap COUNT(*) FILTER queries against
 * existing indexes — no new schema needed):
 *
 *   {
 *     date: string,
 *     vehicles: {
 *       total, available, inUse, maintenance, offDuty, suspended,
 *       utilizationRate, // (inUse / (available + inUse)) * 100
 *     },
 *     drivers: {
 *       total, active, onDuty, onRest, onLeave, suspended,
 *       availabilityRate,
 *     },
 *     dispatches: {
 *       todayTotal, pending, notified, accepted, executing, completed, cancelled,
 *       lateCount,     // accepted/executing past scheduledStartAt + threshold
 *       criticalCount, // unassigned + within 2h of pickup window
 *     },
 *     bookings: {
 *       todayDraft, todayApproved, todayScheduled, todayCompleted,
 *       unassignedTodayCount, // approved/scheduled with no dispatch order yet
 *     },
 *     alerts: Array<{ severity, kind, message, entityType?, entityId? }>,
 *   }
 *
 * Gating: fleet.dispatch:list (operator-only — drivers don't see this).
 */

import { Router } from "express";

import { handleRouteError } from "../lib/errorHandler.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { authorize } from "../lib/rbac/authorize.js";
import { logger } from "../lib/logger.js";
import { rawQuery } from "../lib/rawdb.js";
import { todayISO } from "../lib/businessHelpers.js";

export const transportControlTowerRouter = Router();
transportControlTowerRouter.use(authMiddleware);

interface VehicleCounts {
  total: number; available: number; inUse: number;
  maintenance: number; offDuty: number; suspended: number;
}

interface DriverCounts {
  total: number; active: number; onDuty: number;
  onRest: number; onLeave: number; suspended: number;
}

interface DispatchCounts {
  todayTotal: number; pending: number; notified: number;
  accepted: number; executing: number; completed: number; cancelled: number;
  lateCount: number; criticalCount: number;
}

interface BookingCounts {
  todayDraft: number; todayApproved: number;
  todayScheduled: number; todayCompleted: number;
  unassignedTodayCount: number;
}

interface ControlTowerAlert {
  severity: "info" | "warn" | "critical";
  kind: string;
  message: string;
  entityType?: string;
  entityId?: number;
}

interface ControlTowerSnapshot {
  date: string;
  vehicles: VehicleCounts & { utilizationRate: number };
  drivers: DriverCounts & { availabilityRate: number };
  dispatches: DispatchCounts;
  bookings: BookingCounts;
  alerts: ControlTowerAlert[];
}

transportControlTowerRouter.get(
  "/transport/control-tower",
  authorize({ feature: "fleet.dispatch", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const date = (req.query.date as string | undefined) ?? todayISO();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.status(400).json({ error: "date يجب أن يكون بصيغة YYYY-MM-DD" });
        return;
      }

      // ── Vehicles snapshot ─────────────────────────────────────────
      // Active rows only. COUNT FILTER lets us get all status buckets
      // in a single query — the planner uses the partial company index.
      const [vRow] = await rawQuery<{
        total: string; available: string; in_use: string;
        maintenance: string; off_duty: string; suspended: string;
      }>(
        `SELECT
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE status = 'available')   AS available,
           COUNT(*) FILTER (WHERE status = 'in_use')      AS in_use,
           COUNT(*) FILTER (WHERE status = 'maintenance') AS maintenance,
           COUNT(*) FILTER (WHERE status = 'off_duty')    AS off_duty,
           COUNT(*) FILTER (WHERE status = 'suspended')   AS suspended
         FROM fleet_vehicles
         WHERE "companyId" = $1 AND "deletedAt" IS NULL`,
        [scope.companyId],
      );
      const vehicles = {
        total: Number(vRow?.total ?? 0),
        available: Number(vRow?.available ?? 0),
        inUse: Number(vRow?.in_use ?? 0),
        maintenance: Number(vRow?.maintenance ?? 0),
        offDuty: Number(vRow?.off_duty ?? 0),
        suspended: Number(vRow?.suspended ?? 0),
      };
      const dispatchableTotal = vehicles.available + vehicles.inUse;
      const utilizationRate = dispatchableTotal === 0
        ? 0
        : Math.round((vehicles.inUse / dispatchableTotal) * 100);

      // ── Drivers snapshot ──────────────────────────────────────────
      const [dRow] = await rawQuery<{
        total: string; active: string; on_duty: string;
        on_rest: string; on_leave: string; suspended: string;
      }>(
        `SELECT
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE COALESCE(status, 'active') = 'active')    AS active,
           COUNT(*) FILTER (WHERE status = 'on_duty')                       AS on_duty,
           COUNT(*) FILTER (WHERE status = 'on_rest' OR status = 'on_trip') AS on_rest,
           COUNT(*) FILTER (WHERE status = 'on_leave' OR status = 'off_duty') AS on_leave,
           COUNT(*) FILTER (WHERE status = 'suspended')                     AS suspended
         FROM fleet_drivers
         WHERE "companyId" = $1 AND "deletedAt" IS NULL`,
        [scope.companyId],
      );
      const drivers = {
        total: Number(dRow?.total ?? 0),
        active: Number(dRow?.active ?? 0),
        onDuty: Number(dRow?.on_duty ?? 0),
        onRest: Number(dRow?.on_rest ?? 0),
        onLeave: Number(dRow?.on_leave ?? 0),
        suspended: Number(dRow?.suspended ?? 0),
      };
      // "Available" = active + not currently on rest/leave/suspended.
      const availableDrivers = Math.max(0, drivers.active - drivers.onRest - drivers.onLeave);
      const availabilityRate = drivers.active === 0
        ? 0
        : Math.round((availableDrivers / drivers.active) * 100);

      // ── Dispatches for the day ────────────────────────────────────
      // Late threshold: accepted/executing dispatches whose
      // scheduledStartAt is older than NOW() + 15 minutes (so a fresh
      // accept isn't flagged).
      const [tRow] = await rawQuery<{
        total: string; pending: string; notified: string;
        accepted: string; executing: string; completed: string; cancelled: string;
        late: string; critical: string;
      }>(
        `SELECT
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE status = 'pending')   AS pending,
           COUNT(*) FILTER (WHERE status = 'notified')  AS notified,
           COUNT(*) FILTER (WHERE status = 'accepted')  AS accepted,
           COUNT(*) FILTER (WHERE status = 'executing') AS executing,
           COUNT(*) FILTER (WHERE status = 'completed') AS completed,
           COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
           COUNT(*) FILTER (
             WHERE status IN ('accepted', 'executing')
               AND "scheduledStartAt" < NOW() - INTERVAL '15 minutes'
               AND "startedAt" IS NULL
           ) AS late,
           COUNT(*) FILTER (
             WHERE status IN ('pending', 'notified')
               AND "scheduledStartAt" < NOW() + INTERVAL '2 hours'
           ) AS critical
         FROM transport_dispatch_orders
         WHERE "companyId" = $1
           AND DATE("scheduledStartAt" AT TIME ZONE 'Asia/Riyadh') = $2::date`,
        [scope.companyId, date],
      );
      const dispatches = {
        todayTotal: Number(tRow?.total ?? 0),
        pending: Number(tRow?.pending ?? 0),
        notified: Number(tRow?.notified ?? 0),
        accepted: Number(tRow?.accepted ?? 0),
        executing: Number(tRow?.executing ?? 0),
        completed: Number(tRow?.completed ?? 0),
        cancelled: Number(tRow?.cancelled ?? 0),
        lateCount: Number(tRow?.late ?? 0),
        criticalCount: Number(tRow?.critical ?? 0),
      };

      // ── Bookings for the day ──────────────────────────────────────
      const [bRow] = await rawQuery<{
        draft: string; approved: string; scheduled: string;
        completed: string; unassigned: string;
      }>(
        `SELECT
           COUNT(*) FILTER (WHERE b.status = 'draft')      AS draft,
           COUNT(*) FILTER (WHERE b.status = 'approved')   AS approved,
           COUNT(*) FILTER (WHERE b.status = 'scheduled')  AS scheduled,
           COUNT(*) FILTER (WHERE b.status = 'completed')  AS completed,
           COUNT(*) FILTER (
             WHERE b.status IN ('approved', 'scheduled')
               AND NOT EXISTS (
                 SELECT 1 FROM transport_dispatch_orders d
                  WHERE d."bookingId" = b.id
                    AND d.status NOT IN ('declined', 'cancelled')
               )
           ) AS unassigned
         FROM transport_bookings b
         WHERE b."companyId" = $1
           AND b."deletedAt" IS NULL
           AND b."requestedPickupDate" = $2::date`,
        [scope.companyId, date],
      );
      const bookings = {
        todayDraft: Number(bRow?.draft ?? 0),
        todayApproved: Number(bRow?.approved ?? 0),
        todayScheduled: Number(bRow?.scheduled ?? 0),
        todayCompleted: Number(bRow?.completed ?? 0),
        unassignedTodayCount: Number(bRow?.unassigned ?? 0),
      };

      // ── Alerts — synthesize from the counts ───────────────────────
      const alerts: ControlTowerAlert[] = [];
      if (dispatches.lateCount > 0) {
        alerts.push({
          severity: "critical",
          kind: "late_dispatches",
          message: `${dispatches.lateCount} رحلة متأخرة عن وقتها المجدول.`,
        });
      }
      if (bookings.unassignedTodayCount > 0) {
        alerts.push({
          severity: "warn",
          kind: "unassigned_bookings",
          message: `${bookings.unassignedTodayCount} حجز اليوم بلا إسناد. افتح ops-dashboard للتخطيط.`,
        });
      }
      if (dispatches.criticalCount > 0) {
        alerts.push({
          severity: "warn",
          kind: "critical_window",
          message: `${dispatches.criticalCount} رحلة معلّقة خلال أقل من ساعتين.`,
        });
      }
      if (vehicles.available === 0 && dispatches.pending > 0) {
        alerts.push({
          severity: "critical",
          kind: "no_capacity",
          message: "لا توجد مركبات متاحة بينما رحلات معلّقة بانتظار إسناد.",
        });
      }
      if (drivers.active === 0) {
        alerts.push({
          severity: "critical",
          kind: "no_active_drivers",
          message: "لا يوجد سائقون فعّالون في الأسطول.",
        });
      }
      if (drivers.onRest > 0 && drivers.active > 0 && availableDrivers === 0) {
        alerts.push({
          severity: "warn",
          kind: "all_drivers_resting",
          message: `كل السائقين في حالة راحة الآن (${drivers.onRest}/${drivers.active}).`,
        });
      }
      if (utilizationRate >= 90) {
        alerts.push({
          severity: "warn",
          kind: "high_utilization",
          message: `استغلال الأسطول ${utilizationRate}% — اقترب من الحد الأقصى.`,
        });
      }
      if (utilizationRate <= 20 && dispatches.todayTotal > 0) {
        alerts.push({
          severity: "info",
          kind: "low_utilization",
          message: `استغلال الأسطول ${utilizationRate}% فقط — هل يمكن دمج رحلات؟`,
        });
      }

      const snapshot: ControlTowerSnapshot = {
        date,
        vehicles: { ...vehicles, utilizationRate },
        drivers: { ...drivers, availabilityRate },
        dispatches,
        bookings,
        alerts,
      };
      res.json({ data: snapshot });
    } catch (err) {
      logger.error({ err }, "[control-tower] failed");
      handleRouteError(err, res, "Control tower error:");
    }
  },
);
