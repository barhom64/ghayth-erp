import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { handleRouteError, zodParse } from "../lib/errorHandler.js";
import { verifyOnboardingToken, markOnboardingTokenUsed } from "../lib/employeeOnboarding.js";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { sendNotification } from "../lib/notificationService.js";
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

// ─── الاستكمال الذاتي للموظف (token عام) ─────────────────────────────────────
// الموظف المُضاف سريعًا يفتح هذه الصفحة برمز مؤقت، يرى ما حدّده صاحب الشركة
// (قراءة فقط)، ويملأ بياناته الشخصية فقط. تُحفظ في مرحلة مؤقتة بانتظار اعتماد
// HR — لا تُكتب على السجل ولا تُفعّل الموظف هنا. لا يمنح الرمز أي دخول للنظام.

// الحقول التي يملؤها الموظف — تطابق تقسيم الحقول المعتمد (لا منصب/راتب/فرع/مدير).
const selfOnboardingSchema = z.object({
  nationalId: z.string().trim().max(40).optional().nullable(),
  nationality: z.string().trim().max(80).optional().nullable(),
  gender: z.enum(["male", "female"]).optional().nullable(),
  dateOfBirth: z.string().trim().optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  personalEmail: z.string().email().optional().nullable(),
  iqamaNumber: z.string().trim().max(40).optional().nullable(),
  iqamaExpiry: z.string().trim().optional().nullable(),
  passportNumber: z.string().trim().max(40).optional().nullable(),
  passportExpiry: z.string().trim().optional().nullable(),
  borderNumber: z.string().trim().max(40).optional().nullable(),
  visaNumber: z.string().trim().max(40).optional().nullable(),
  visaType: z.string().trim().max(40).optional().nullable(),
  visaExpiry: z.string().trim().optional().nullable(),
  bankName: z.string().trim().max(120).optional().nullable(),
  bankAccount: z.string().trim().max(60).optional().nullable(),
  iban: z.string().trim().max(60).optional().nullable(),
  emergencyContact: z.string().trim().max(120).optional().nullable(),
  emergencyPhone: z.string().trim().max(40).optional().nullable(),
  attachments: z.array(z.any()).optional().nullable(),
});

// GET — يعرض ملخص ما حدّده صاحب الشركة (قراءة فقط) + أي مُدخَلات سابقة.
router.get("/onboarding/:token", publicLimiter, async (req, res) => {
  try {
    const verified = await verifyOnboardingToken(String(req.params.token || ""));
    if (!verified) {
      res.status(410).json({ error: "الرابط غير صالح أو منتهٍ. اطلب رابطًا جديدًا من جهة العمل." });
      return;
    }
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT e.id, e.name, e."empNumber", e."selfSubmittedData",
              COALESCE(jt.name, ea."jobTitle") AS "jobTitle",
              b.name AS "branchName", d.name AS "departmentName", ea."hireDate"
         FROM employees e
         JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea."isPrimary" = TRUE
         LEFT JOIN job_titles jt ON jt.id = ea."jobTitleId"
         LEFT JOIN branches b ON b.id = ea."branchId"
         LEFT JOIN departments d ON d.id = ea."departmentId"
        WHERE e.id = $1 AND e."companyId" = $2 AND e."deletedAt" IS NULL
        LIMIT 1`,
      [verified.employeeId, verified.companyId],
    );
    if (rows.length === 0) {
      res.status(410).json({ error: "الرابط غير صالح. اطلب رابطًا جديدًا من جهة العمل." });
      return;
    }
    const r = rows[0] as any;
    res.json({
      // ما حدّده صاحب الشركة — قراءة فقط.
      ownerSet: {
        name: r.name, empNumber: r.empNumber, jobTitle: r.jobTitle,
        branchName: r.branchName, departmentName: r.departmentName, hireDate: r.hireDate,
      },
      // مُدخَلات سابقة (إن أُرسلت ولم تُعتمد بعد) لإكمالها.
      submitted: r.selfSubmittedData ?? null,
    });
  } catch (err) {
    handleRouteError(err, res, "فتح صفحة الاستكمال الذاتي");
  }
});

// رفع وثيقة (صورة هوية/جواز/PDF) من صفحة الاستكمال العامة — نموذج خادمي:
// الموظف يرسل base64، والخادم يتحقق من النوع والحجم ثم يرفعه بصلاحياته.
// لا رابط تخزين موقّع يُسلَّم لِحامل الرمز (لا تعريض كتابة مباشرة للتخزين).
const ALLOWED_DOC_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
const MAX_DOC_BYTES = 5 * 1024 * 1024; // 5MB للملف الخام
const onboardingDocSchema = z.object({
  fileName: z.string().trim().min(1).max(160),
  mimeType: z.enum(ALLOWED_DOC_MIME),
  dataBase64: z.string().min(1),
});
const objectStorage = new ObjectStorageService();

router.post("/onboarding/:token/document", publicLimiter, async (req, res) => {
  try {
    const verified = await verifyOnboardingToken(String(req.params.token || ""));
    if (!verified) {
      res.status(410).json({ error: "الرابط غير صالح أو منتهٍ. اطلب رابطًا جديدًا من جهة العمل." });
      return;
    }
    const body = zodParse(onboardingDocSchema.safeParse(req.body ?? {}));
    // تجريد بادئة data URL إن وُجدت ثم فك الترميز والتحقق من الحجم الفعلي.
    const b64 = body.dataBase64.includes(",") ? body.dataBase64.slice(body.dataBase64.indexOf(",") + 1) : body.dataBase64;
    let buffer: Buffer;
    try {
      buffer = Buffer.from(b64, "base64");
    } catch {
      res.status(400).json({ error: "تعذّر قراءة الملف. أعد المحاولة." });
      return;
    }
    if (buffer.length === 0) {
      res.status(400).json({ error: "الملف فارغ." });
      return;
    }
    if (buffer.length > MAX_DOC_BYTES) {
      res.status(413).json({ error: "حجم الملف يتجاوز الحد المسموح (5 ميغابايت)." });
      return;
    }
    const path = await objectStorage.uploadBytes(buffer, body.mimeType);
    void createAuditLog({
      companyId: verified.companyId, branchId: undefined, userId: 0,
      action: "employee.self_onboarding_document_uploaded", entity: "employees", entityId: verified.employeeId,
      after: { fileName: body.fileName, mimeType: body.mimeType, size: buffer.length },
    }).catch((e) => logger.error(e, "publicData background task failed"));
    res.json({
      ok: true,
      attachment: { path, name: body.fileName, mimeType: body.mimeType, size: buffer.length, uploadedAt: new Date().toISOString() },
    });
  } catch (err) {
    handleRouteError(err, res, "رفع وثيقة الاستكمال الذاتي");
  }
});

// POST — يحفظ بيانات الموظف في المرحلة المؤقتة (بانتظار الاعتماد).
router.post("/onboarding/:token", publicLimiter, async (req, res) => {
  try {
    const verified = await verifyOnboardingToken(String(req.params.token || ""));
    if (!verified) {
      res.status(410).json({ error: "الرابط غير صالح أو منتهٍ. اطلب رابطًا جديدًا من جهة العمل." });
      return;
    }
    const data = zodParse(selfOnboardingSchema.safeParse(req.body ?? {}));
    // حدود المسارات (#2839): الكتابة في جدول HR المملوك (employees) تتمّ عبر عقد
    // المسار القائد (HR) لا مباشرةً من مسار البيانات العامة.
    const { applySelfOnboardingSubmission } = await import("./employees.js");
    const updatedRow = await applySelfOnboardingSubmission(verified.employeeId, verified.companyId, data);
    await markOnboardingTokenUsed(verified.tokenId);
    const empName = updatedRow?.name ?? "موظف";
    // إغلاق الحلقة: إشعار داخلي لمسؤولي الموارد البشرية بأن طلبًا بانتظار المراجعة.
    // الإشعارات مسار خادم (إرسال فقط) — لا قرار ولا سياسة هنا.
    void sendNotification({
      companyId: verified.companyId,
      type: "hr",
      title: "طلب استكمال بيانات جديد",
      body: `أرسل الموظف ${empName} بياناته الشخصية — بانتظار المراجعة والاعتماد.`,
      priority: "normal",
      targetRole: "hr_manager",
      refType: "employees",
      refId: verified.employeeId,
      actionUrl: "/hr/self-onboarding-review",
      channels: ["in_app"],
    }).catch((e) => logger.error(e, "self-onboarding notify failed"));
    void createAuditLog({
      companyId: verified.companyId, branchId: undefined, userId: 0,
      action: "employee.self_onboarding_submitted", entity: "employees", entityId: verified.employeeId,
      after: { selfSubmitted: true },
    }).catch((e) => logger.error(e, "publicData background task failed"));
    void emitEvent({
      companyId: verified.companyId, branchId: 0, userId: 0,
      action: "employee.self_onboarding_submitted", entity: "employees", entityId: verified.employeeId,
      details: JSON.stringify({ submitted: true }),
    }).catch((e) => logger.error(e, "publicData background task failed"));
    res.json({ ok: true, message: "تم استلام بياناتك. ستتم مراجعتها واعتمادها لتفعيل حسابك." });
  } catch (err) {
    handleRouteError(err, res, "إرسال بيانات الاستكمال الذاتي");
  }
});

export default router;
