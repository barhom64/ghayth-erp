/**
 * HR — معدّلات أجر السائق بالساعة (الدفعة 2، إعداد بلا دفتر).
 *
 *   GET    /hr/driver-pay-rates        — الافتراضي + التجاوزات (مع أسماء)
 *   POST   /hr/driver-pay-rates        — ضبط/تحديث معدّل (افتراضي أو تجاوز تعيين)
 *   DELETE /hr/driver-pay-rates/:id     — حذف معدّل (تجاوز)
 *
 * Gating: hr.driver_pay (list/update/delete). الموارد البشرية قائد في سياسة
 * الأجر — لا قراءة لجداول الأسطول هنا ولا قيد. مُركَّب تحت /hr مع authMiddleware
 * العام و requireModule("hr").
 */

import { Router } from "express";
import {
  handleRouteError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import {
  type HrScope,
  driverPayRateSchema,
  listDriverPayRates,
  upsertDriverPayRate,
  removeDriverPayRate,
} from "../lib/hr/driverPayRates.js";

const router = Router();

function hrScope(req: any): HrScope {
  const s = req.scope!;
  return {
    companyId: s.companyId,
    branchId: s.branchId ?? null,
    userId: s.userId,
    activeAssignmentId: s.activeAssignmentId ?? null,
  };
}

router.get(
  "/driver-pay-rates",
  authorize({ feature: "hr.driver_pay", action: "list" }),
  async (req, res) => {
    try {
      const rows = await listDriverPayRates(hrScope(req));
      res.json(maskFields(req, { data: rows }));
    } catch (err) {
      handleRouteError(err, res, "List driver pay rates error:");
    }
  },
);

router.post(
  "/driver-pay-rates",
  authorize({ feature: "hr.driver_pay", action: "update" }),
  async (req, res) => {
    try {
      const b = zodParse(driverPayRateSchema.safeParse(req.body));
      const result = await upsertDriverPayRate(hrScope(req), b);
      res.json({ data: result });
    } catch (err) {
      handleRouteError(err, res, "Set driver pay rate error:");
    }
  },
);

router.delete(
  "/driver-pay-rates/:id",
  authorize({ feature: "hr.driver_pay", action: "delete" }),
  async (req, res) => {
    try {
      const id = parseId(req.params.id, "id");
      await removeDriverPayRate(hrScope(req), id);
      res.json({ data: { ok: true } });
    } catch (err) {
      handleRouteError(err, res, "Remove driver pay rate error:");
    }
  },
);

export default router;
