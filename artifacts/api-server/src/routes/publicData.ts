import { Router } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { handleRouteError } from "../lib/errorHandler.js";
import { createAuditLog } from "../lib/businessHelpers.js";
import rateLimit from "express-rate-limit";

const router = Router();

const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { ip: false, trustProxy: false },
});

router.get("/announcements", publicLimiter, async (_req, res) => {
  try {
    const rows = await rawQuery(
      `SELECT id, title, body, category, "publishedAt"
       FROM public_announcements
       WHERE "isActive" = true
         AND ("expiresAt" IS NULL OR "expiresAt" > NOW())
       ORDER BY "publishedAt" DESC
       LIMIT 5`
    );
    res.json({ data: rows });
  } catch (err) {
    handleRouteError(err, res, "جلب الإعلانات");
  }
});

router.get("/employee-of-month", publicLimiter, async (_req, res) => {
  try {
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
       WHERE eom."isActive" = true
       ORDER BY eom."year" DESC, eom."month" DESC
       LIMIT 1`
    );
    res.json({ data: rows[0] || null });
  } catch (err) {
    handleRouteError(err, res, "جلب الموظف المثالي");
  }
});

router.post("/forgot-password", publicLimiter, async (req, res) => {
  try {
    const { email } = req.body as { email: string };
    if (!email || !email.includes("@")) {
      res.status(400).json({ error: "الرجاء إدخال بريد إلكتروني صحيح" });
      return;
    }

    await rawExecute(
      `INSERT INTO password_reset_requests (email, status) VALUES ($1, 'pending')`,
      [email.trim().toLowerCase()]
    );

    createAuditLog({
      companyId: 0, userId: 0, action: "forgot_password_request",
      entity: "password_reset_requests", entityId: 0,
      after: { email: email.trim().toLowerCase() },
    }).catch(console.error);

    res.json({ message: "تم إرسال طلب استعادة كلمة المرور بنجاح. سيقوم مدير النظام بمراجعة طلبك." });
  } catch (err) {
    handleRouteError(err, res, "طلب استعادة كلمة المرور");
  }
});

export default router;
