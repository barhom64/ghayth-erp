/**
 * Fleet — مكافآت حركات النقل (الدفعة أ، تشغيلية بلا دفتر).
 *
 *   GET   /fleet/movement-bonuses              — قائمة (مشرف)
 *   POST  /fleet/movement-bonuses              — منح مكافأة على حركة
 *   POST  /fleet/movement-bonuses/:id/approve  — اعتماد (بوابة بشرية، صلاحية منفصلة)
 *
 * Gating: المنح/القائمة → fleet.movement_bonus:update/list ؛ الاعتماد →
 * fleet.movement_bonus:approve (منفصل عن المنح). قفل الحدود: لا قيد هنا —
 * المكافأة تُرحَّل في الموارد البشرية (الدفعة ب).
 */

import { Router } from "express";
import { handleRouteError, parseId, zodParse } from "../lib/errorHandler.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { authorize } from "../lib/rbac/authorize.js";
import {
  type FleetScope,
  awardBonusSchema,
  approveBonusSchema,
  awardMovementBonus,
  approveMovementBonus,
  listMovementBonuses,
  listEligibleMovements,
} from "../lib/fleet/movementBonuses.js";

export const fleetMovementBonusesRouter = Router();
fleetMovementBonusesRouter.use(authMiddleware);

function fleetScope(req: any): FleetScope {
  const s = req.scope!;
  return {
    companyId: s.companyId,
    branchId: s.branchId ?? null,
    userId: s.userId,
    activeAssignmentId: s.activeAssignmentId ?? null,
  };
}

fleetMovementBonusesRouter.get(
  "/fleet/movement-bonuses",
  authorize({ feature: "fleet.movement_bonus", action: "list" }),
  async (req, res) => {
    try {
      const q = req.query as Record<string, string | undefined>;
      const rows = await listMovementBonuses(fleetScope(req), {
        status: q.status,
        driverId: q.driverId ? Number(q.driverId) : undefined,
        dispatchOrderId: q.dispatchOrderId ? Number(q.dispatchOrderId) : undefined,
        limit: q.limit ? Number(q.limit) : undefined,
      });
      res.json({ data: rows });
    } catch (err) {
      handleRouteError(err, res, "List movement bonuses error:");
    }
  },
);

// منتقي الحركات — الحركات المؤهَّلة للمكافأة (قراءة فقط). يسبق `/:id/approve`
// (مسار مميّز) فلا تعارض توجيه. صلاحية القائمة نفسها.
fleetMovementBonusesRouter.get(
  "/fleet/movement-bonuses/eligible-movements",
  authorize({ feature: "fleet.movement_bonus", action: "list" }),
  async (req, res) => {
    try {
      const q = req.query as Record<string, string | undefined>;
      const rows = await listEligibleMovements(fleetScope(req), {
        driverId: q.driverId ? Number(q.driverId) : undefined,
        search: q.search,
        limit: q.limit ? Number(q.limit) : undefined,
      });
      res.json({ data: rows });
    } catch (err) {
      handleRouteError(err, res, "List eligible movements error:");
    }
  },
);

fleetMovementBonusesRouter.post(
  "/fleet/movement-bonuses",
  authorize({ feature: "fleet.movement_bonus", action: "update" }),
  async (req, res) => {
    try {
      const b = zodParse(awardBonusSchema.safeParse(req.body));
      const result = await awardMovementBonus(fleetScope(req), b);
      res.json({ data: result });
    } catch (err) {
      handleRouteError(err, res, "Award movement bonus error:");
    }
  },
);

fleetMovementBonusesRouter.post(
  "/fleet/movement-bonuses/:id/approve",
  authorize({ feature: "fleet.movement_bonus", action: "approve" }),
  async (req, res) => {
    try {
      const id = parseId(req.params.id);
      const b = zodParse(approveBonusSchema.safeParse(req.body));
      await approveMovementBonus(fleetScope(req), id, b);
      res.json({ data: { ok: true } });
    } catch (err) {
      handleRouteError(err, res, "Approve movement bonus error:");
    }
  },
);
