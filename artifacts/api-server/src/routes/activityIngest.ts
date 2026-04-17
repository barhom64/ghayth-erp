import { Router } from "express";
  import { authMiddleware } from "../middlewares/authMiddleware.js";
  import { logPageView } from "../lib/activityTracker.js";

  const router = Router();

  router.post("/intelligence/activity", authMiddleware, async (req, res): Promise<void> => {
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
  