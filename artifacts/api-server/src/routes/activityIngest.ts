import { Router } from "express";
  import { authMiddleware } from "../middlewares/authMiddleware.js";
  import { logPageView } from "../lib/activityTracker.js";
  import rateLimit from "express-rate-limit";

  const router = Router();

  const activityLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "تم تجاوز الحد الأقصى للطلبات" },
    validate: { ip: false, trustProxy: false },
  });

  router.post("/intelligence/activity", activityLimiter, authMiddleware, async (req, res): Promise<void> => {
    try {
      const scope = req.scope!;
      const { page, sessionId } = req.body;
      if (!page) { res.status(400).json({ error: "page مطلوب" }); return; }
      await logPageView({
        companyId: scope.companyId,
        userId: scope.userId,
        assignmentId: scope.activeAssignmentId,
        page,
        sessionId,
      });
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "خطأ في تسجيل النشاط" });
    }
  });

  export default router;
  