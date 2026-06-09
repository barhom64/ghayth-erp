/**
 * Driver Intelligence routes (#1812 follow-up).
 *
 *   GET /fleet/drivers/intelligence — fleet-wide leaderboard
 *   GET /fleet/drivers/:id/intelligence — per-driver detail
 *
 * Computed at read time from existing dispatch_orders data — no new
 * schema. See lib/fleet/driverIntelligence.ts for the algorithm.
 */

import { Router } from "express";

import { handleRouteError, parseId } from "../lib/errorHandler.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { authorize } from "../lib/rbac/authorize.js";
import {
  computeDriverIntelligence, computeFleetIntelligence,
} from "../lib/fleet/driverIntelligence.js";

export const fleetDriverIntelligenceRouter = Router();
fleetDriverIntelligenceRouter.use(authMiddleware);

fleetDriverIntelligenceRouter.get(
  "/fleet/drivers/intelligence",
  authorize({ feature: "fleet.dispatch", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const windowDays = req.query.windowDays
        ? Math.max(7, Math.min(365, Number(req.query.windowDays)))
        : 90;
      const stats = await computeFleetIntelligence(scope.companyId, windowDays);
      res.json({ data: stats, windowDays });
    } catch (err) {
      handleRouteError(err, res, "Fleet intelligence error:");
    }
  },
);

fleetDriverIntelligenceRouter.get(
  "/fleet/drivers/:id/intelligence",
  authorize({ feature: "fleet.dispatch", action: "view" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const driverId = parseId(req.params.id, "id");
      const windowDays = req.query.windowDays
        ? Math.max(7, Math.min(365, Number(req.query.windowDays)))
        : 90;
      const stats = await computeDriverIntelligence({
        companyId: scope.companyId, driverId, windowDays,
      });
      res.json({ data: stats, windowDays });
    } catch (err) {
      handleRouteError(err, res, "Driver intelligence error:");
    }
  },
);
