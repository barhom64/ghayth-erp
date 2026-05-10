import { Router } from "express";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { logPageView } from "../lib/activityTracker.js";
import { handleRouteError, zodParse } from "../lib/errorHandler.js";
import { createAuditLog, emitEvent } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";
import { createPerUserLimiter } from "../lib/perUserRateLimit.js";
import { z } from "zod";

const router = Router();

// Per-user activity-ingest limiter. Re-ordered below to run AFTER
// authMiddleware so req.scope is set; owner/admin exempt.
const activityLimiter = createPerUserLimiter({
  prefix: "activity:ingest",
  windowMs: 60 * 1000,
  max: 120,
  message: "تم تجاوز الحد الأقصى للطلبات",
});

const logActivitySchema = z.object({
  page: z.string().min(1, "الصفحة مطلوبة"),
  sessionId: z.string().optional(),
});

router.post("/intelligence/activity", authMiddleware, activityLimiter, async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const { page, sessionId } = zodParse(logActivitySchema.safeParse(req.body));
    await logPageView({
      companyId: scope.companyId,
      userId: scope.userId,
      assignmentId: scope.activeAssignmentId,
      page,
      sessionId,
    });
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "create", entity: "user_activity", entityId: 0,
    }).catch((e) => logger.error(e, "activity ingest background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "activity.ingested", entity: "activity_logs", entityId: 0, details: JSON.stringify({ page, sessionId }) }).catch((e) => logger.error(e, "activity ingest background task failed"));
    res.json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "Activity ingest error:");
  }
});

export default router;
