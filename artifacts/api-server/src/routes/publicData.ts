import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { handleRouteError, zodParse } from "../lib/errorHandler.js";
import { createAuditLog, emitEvent } from "../lib/businessHelpers.js";
import rateLimit from "express-rate-limit";
import { makeRateLimitStore } from "../lib/rateLimitStore.js";
import { logger } from "../lib/logger.js";
import { config } from "../lib/config.js";
import { issueAuthToken, TOKEN_TTL_MINUTES, PublicBaseUrlMissingError } from "../lib/authTokens.js";
import { sendAuthEmail } from "../lib/authNotifications.js";

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

// #2137 slice 2 — token-driven self-service password reset.
//
// Primary (operational) path: when the email matches an active user, issue
// a single-use, short-lived reset token and email the link through the
// unified messaging seam (sendMessage → message_log → outbound_queue).
//
// Compatibility fallback (legacy_admin_review_fallback): when the email
// matches NO user, the old admin-review row is still inserted so an admin
// can investigate. Kept this slice; slated for deprecation in a later
// cleanup slice.
//
// No user enumeration: BOTH branches return the SAME generic message, and
// the response never reveals whether the email exists or whether a link
// was sent.
const result500 = "تعذّر إرسال رابط إعادة التعيين حالياً، حاول لاحقاً.";

router.post("/forgot-password", publicLimiter, async (req, res) => {
  try {
    const { email } = zodParse(forgotPasswordSchema.safeParse(req.body));
    const normEmail = email.trim().toLowerCase();
    const genericOk = { message: "إن كان البريد مسجّلاً لدينا، فستصلك رسالة بها رابط لإعادة تعيين كلمة المرور." };

    const [user] = await rawQuery<{ id: number; email: string; name: string; companyId: number }>(
      `SELECT u.id, u.email,
              COALESCE(e.name, u.email) AS name,
              COALESCE(ea."companyId", 0) AS "companyId"
         FROM users u
         LEFT JOIN employees e ON e.id = u."employeeId"
         LEFT JOIN employee_assignments ea ON ea."employeeId" = u."employeeId" AND ea.status = 'active'
        WHERE LOWER(u.email) = $1 AND u."isActive" = TRUE
        ORDER BY ea."isPrimary" DESC NULLS LAST
        LIMIT 1`,
      [normEmail],
    );

    if (user) {
      // Operational path — issue token + email link. issueAuthToken builds
      // the link first, so an empty PUBLIC_BASE_URL fails BEFORE any token
      // row is written (no broken link, no orphan token).
      try {
        const issued = await issueAuthToken({ userId: user.id, email: user.email, purpose: "password_reset" });
        await sendAuthEmail({
          companyId: user.companyId,
          userId: user.id,
          recipientEmail: user.email,
          recipientName: user.name,
          templateKey: "auth.password_reset.email",
          vars: {
            userName: user.name,
            resetUrl: issued.url,
            expiresMinutes: String(TOKEN_TTL_MINUTES.password_reset),
          },
        });
      } catch (e) {
        if (e instanceof PublicBaseUrlMissingError) {
          // Operational gate: don't email a broken link. Surface a safe
          // technical error (no secret) + audit; the operator must set
          // PUBLIC_BASE_URL.
          logger.error("[forgot-password] PUBLIC_BASE_URL is empty — refused to send a broken reset link");
          void createAuditLog({ companyId: 0, userId: 0, action: "password_reset_blocked_no_base_url", entity: "users", entityId: user.id }).catch(() => undefined);
          res.status(500).json({ error: result500 });
          return;
        }
        throw e;
      }
    } else {
      // Compatibility fallback — admin-review row for an unknown email.
      await rawExecute(
        `INSERT INTO password_reset_requests (email, status) VALUES ($1, 'pending')`,
        [normEmail],
      );
    }

    void createAuditLog({
      companyId: 0, userId: 0, action: "forgot_password_request",
      entity: "password_reset_requests", entityId: user?.id ?? 0,
      after: { emailMasked: normEmail.replace(/.(?=.{4})/g, "*"), matched: !!user },
    }).catch((e) => logger.error(e, "publicData background task failed"));
    void emitEvent({ companyId: 0, branchId: 0, userId: 0, action: "password_reset.requested", entity: "password_reset_requests", entityId: user?.id ?? 0, details: JSON.stringify({ matched: !!user }) }).catch((e) => logger.error(e, "publicData background task failed"));

    res.json(genericOk);
  } catch (err) {
    handleRouteError(err, res, "طلب استعادة كلمة المرور");
  }
});

export default router;
