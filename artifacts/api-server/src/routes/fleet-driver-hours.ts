/**
 * Fleet — ساعات عمل السائق (الدفعة 1، تشغيلية بلا دفتر).
 *
 *   GET   /fleet/driver-work-hours              — قائمة (مشرف): تتبع|يدوي|معتمد
 *   POST  /fleet/driver-work-hours/derive       — اشتقاق يوم سائق من التتبع
 *   PATCH /fleet/driver-work-hours/:id           — ضبط الساعات اليدوية
 *   POST  /fleet/driver-work-hours/:id/approve   — اعتماد الساعات (بوابة بشرية)
 *   GET   /fleet/driver/me/work-hours            — السائق يرى ساعاته (عرض فقط)
 *
 * Gating:
 *   • القائمة/الاشتقاق/اليدوي → fleet.driver_hours:list/update
 *   • الاعتماد               → fleet.driver_hours:approve (منفصل عن الإدخال)
 *   • السائق لنفسه           → fleet.driver_hours:view (نطاق self، يُحلّ من
 *     scope.employeeId إلى fleet_drivers.id)
 *
 * قفل الحدود: لا معدّل أجر ولا قيد هنا. المعدّل والأجر في الموارد البشرية.
 */

import { Router } from "express";
import { z } from "zod";

import { handleRouteError, parseId, zodParse } from "../lib/errorHandler.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { authorize } from "../lib/rbac/authorize.js";
import { todayISO } from "../lib/businessHelpers.js";
import {
  type FleetScope,
  manualHoursSchema,
  approveHoursSchema,
  upsertDerivedDriverHours,
  listDriverWorkHours,
  setManualDriverHours,
  approveDriverWorkHours,
  resolveOwnDriverId,
} from "../lib/fleet/driverHours.js";

export const fleetDriverHoursRouter = Router();
fleetDriverHoursRouter.use(authMiddleware);

function fleetScope(req: any): FleetScope {
  const s = req.scope!;
  return {
    companyId: s.companyId,
    branchId: s.branchId ?? null,
    userId: s.userId,
    activeAssignmentId: s.activeAssignmentId ?? null,
  };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const deriveSchema = z.object({
  driverId: z.coerce.number().int().positive(),
  workDate: z.string().regex(DATE_RE, "تاريخ غير صالح").optional(),
});

// ── قائمة المشرف ──────────────────────────────────────────────────────────
fleetDriverHoursRouter.get(
  "/fleet/driver-work-hours",
  authorize({ feature: "fleet.driver_hours", action: "list" }),
  async (req, res) => {
    try {
      const scope = fleetScope(req);
      const q = req.query as Record<string, string | undefined>;
      const rows = await listDriverWorkHours(scope, {
        driverId: q.driverId ? Number(q.driverId) : undefined,
        from: q.from && DATE_RE.test(q.from) ? q.from : undefined,
        to: q.to && DATE_RE.test(q.to) ? q.to : undefined,
        status: q.status,
        limit: q.limit ? Number(q.limit) : undefined,
      });
      res.json({ data: rows });
    } catch (err) {
      handleRouteError(err, res, "List driver work-hours error:");
    }
  },
);

// ── اشتقاق يوم سائق من التتبع (مقترح pending) ───────────────────────────────
fleetDriverHoursRouter.post(
  "/fleet/driver-work-hours/derive",
  authorize({ feature: "fleet.driver_hours", action: "update" }),
  async (req, res) => {
    try {
      const scope = fleetScope(req);
      const b = zodParse(deriveSchema.safeParse(req.body));
      const result = await upsertDerivedDriverHours(scope, b.driverId, b.workDate ?? todayISO());
      res.json({ data: result });
    } catch (err) {
      handleRouteError(err, res, "Derive driver work-hours error:");
    }
  },
);

// ── ضبط الساعات اليدوية ─────────────────────────────────────────────────────
fleetDriverHoursRouter.patch(
  "/fleet/driver-work-hours/:id",
  authorize({ feature: "fleet.driver_hours", action: "update" }),
  async (req, res) => {
    try {
      const scope = fleetScope(req);
      const id = parseId(req.params.id);
      const b = zodParse(manualHoursSchema.safeParse(req.body));
      await setManualDriverHours(scope, id, b);
      res.json({ data: { ok: true } });
    } catch (err) {
      handleRouteError(err, res, "Set manual driver work-hours error:");
    }
  },
);

// ── اعتماد الساعات (بوابة بشرية، صلاحية منفصلة) ──────────────────────────────
fleetDriverHoursRouter.post(
  "/fleet/driver-work-hours/:id/approve",
  authorize({ feature: "fleet.driver_hours", action: "approve" }),
  async (req, res) => {
    try {
      const scope = fleetScope(req);
      const id = parseId(req.params.id);
      const b = zodParse(approveHoursSchema.safeParse(req.body));
      await approveDriverWorkHours(scope, id, b);
      res.json({ data: { ok: true } });
    } catch (err) {
      handleRouteError(err, res, "Approve driver work-hours error:");
    }
  },
);

// ── السائق يرى ساعاته (عرض فقط، نطاق self) ───────────────────────────────────
fleetDriverHoursRouter.get(
  "/fleet/driver/me/work-hours",
  authorize({ feature: "fleet.driver_hours", action: "view" }),
  async (req, res) => {
    try {
      const scope = fleetScope(req);
      const employeeId = req.scope!.employeeId;
      if (employeeId == null) {
        res.json({ data: [] });
        return;
      }
      const driverId = await resolveOwnDriverId(scope, employeeId);
      if (driverId == null) {
        res.json({ data: [] });
        return;
      }
      const q = req.query as Record<string, string | undefined>;
      const rows = await listDriverWorkHours(scope, {
        driverId,
        from: q.from && DATE_RE.test(q.from) ? q.from : undefined,
        to: q.to && DATE_RE.test(q.to) ? q.to : undefined,
      });
      res.json({ data: rows });
    } catch (err) {
      handleRouteError(err, res, "Driver self work-hours error:");
    }
  },
);
