import { Router } from "express";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { logPageView } from "../lib/activityTracker.js";
import { handleRouteError, ValidationError } from "../lib/errorHandler.js";
import rateLimit from "express-rate-limit";
import { z } from "zod";

const router = Router();

const activityLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "تم تجاوز الحد الأقصى للطلبات" },
  validate: { ip: false, trustProxy: false },
});

const logActivitySchema = z.object({
  page: z.string().min(1, "الصفحة مطلوبة"),
  sessionId: z.string().optional(),
});

router.post("/intelligence/activity", activityLimiter, authMiddleware, async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const parsed = logActivitySchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? "بيانات غير صالحة");
    const { page, sessionId } = parsed.data;
    await logPageView({
      companyId: scope.companyId,
      userId: scope.userId,
      assignmentId: scope.activeAssignmentId,
      page,
      sessionId,
    });
    res.json({ ok: true });
  } catch (err) {
    handleRouteError(err, res, "Activity ingest error:");
  }
});

export default router;
