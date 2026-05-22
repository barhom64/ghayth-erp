import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { handleRouteError, zodParse } from "../lib/errorHandler.js";
import { createAuditLog, emitEvent } from "../lib/businessHelpers.js";
import rateLimit from "express-rate-limit";
import { makeRateLimitStore } from "../lib/rateLimitStore.js";
import { logger } from "../lib/logger.js";
import { config } from "../lib/config.js";

const forgotPasswordSchema = z.object({
  email: z.string().email("الرجاء إدخال بريد إلكتروني صحيح"),
});

const router = Router();

const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: config.isProduction ? 30 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { ip: false, trustProxy: false },
  store: makeRateLimitStore("public:ip"),
});

router.get("/announcements", publicLimiter, async (_req, res) => {
  try {
    const companyId = Number(_req.query.companyId) || 0;
    if (!companyId) { res.json({ data: [] }); return; }
    const rows = await rawQuery(
      `SELECT id, title, body, category, "publishedAt"
       FROM public_announcements
       WHERE "companyId" = $1 AND "isActive" = true
         AND ("expiresAt" IS NULL OR "expiresAt" > NOW())
       ORDER BY "publishedAt" DESC
       LIMIT 5`,
      [companyId]
    );
    res.json({ data: rows });
  } catch (err) {
    handleRouteError(err, res, "جلب الإعلانات");
  }
});

router.get("/employee-of-month", publicLimiter, async (_req, res) => {
  try {
    const companyId = Number(_req.query.companyId) || 0;
    if (!companyId) { res.json({ data: null }); return; }
    const rows = await rawQuery(
      `SELECT eom.id, eom."month", eom."year", eom.reason,
              e.name AS "employeeName", e."photoUrl",
              jt.name AS "jobTitle",
              b.name AS "branchName"
       FROM employee_of_month eom
       JOIN employees e ON e.id = eom."employeeId"
       LEFT JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea.status = 'active'
       LEFT JOIN job_titles jt ON jt.id = ea."jobTitleId"
       LEFT JOIN branches b ON b.id = COALESCE(eom."branchId", ea."branchId")
       WHERE eom."companyId" = $1 AND eom."isActive" = true
       ORDER BY eom."year" DESC, eom."month" DESC
       LIMIT 1`,
      [companyId]
    );
    res.json({ data: rows[0] || null });
  } catch (err) {
    handleRouteError(err, res, "جلب الموظف المثالي");
  }
});

router.post("/forgot-password", publicLimiter, async (req, res) => {
  try {
    const { email } = zodParse(forgotPasswordSchema.safeParse(req.body));

    await rawExecute(
      `INSERT INTO password_reset_requests (email, status) VALUES ($1, 'pending')`,
      [email.trim().toLowerCase()]
    );

    createAuditLog({
      companyId: 0, userId: 0, action: "forgot_password_request",
      entity: "password_reset_requests", entityId: 0,
      after: { email: email.trim().toLowerCase() },
    }).catch((e) => logger.error(e, "publicData background task failed"));

    emitEvent({ companyId: 0, branchId: 0, userId: 0, action: "password_reset.requested", entity: "password_reset_requests", entityId: 0, details: JSON.stringify({ email: email.trim().toLowerCase() }) }).catch((e) => logger.error(e, "publicData background task failed"));

    res.json({ message: "تم إرسال طلب استعادة كلمة المرور بنجاح. سيقوم مدير النظام بمراجعة طلبك." });
  } catch (err) {
    handleRouteError(err, res, "طلب استعادة كلمة المرور");
  }
});

export default router;
