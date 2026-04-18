import { Router } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { handleRouteError } from "../lib/errorHandler.js";
import { hashPassword, verifyPassword } from "../lib/auth.js";
import { createAuditLog } from "../lib/businessHelpers.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import type { Request, Response, NextFunction } from "express";

const router = Router();
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is required for careers portal"); })();

const portalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { ip: false, trustProxy: false },
});

function signApplicantToken(accountId: number): string {
  return jwt.sign({ accountId, type: "careers_portal" }, SECRET, { expiresIn: "7d" });
}

function careersAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "غير مصرح" });
    return;
  }
  try {
    const payload: any = jwt.verify(auth.slice(7), SECRET);
    if (payload.type !== "careers_portal") {
      res.status(401).json({ error: "غير مصرح" });
      return;
    }
    (req as any).applicantId = payload.accountId;
    next();
  } catch {
    res.status(401).json({ error: "انتهت الجلسة" });
  }
}

router.post("/auth/register", portalLimiter, async (req: Request, res: Response) => {
  try {
    const { name, email, phone, password } = req.body as {
      name: string; email: string; phone?: string; password: string;
    };

    if (!name || !email || !password) {
      res.status(400).json({ error: "الاسم والبريد الإلكتروني وكلمة المرور مطلوبة" });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" });
      return;
    }

    const existing = await rawQuery(
      `SELECT id FROM applicant_accounts WHERE email = $1`,
      [email.trim().toLowerCase()]
    );
    if (existing.length > 0) {
      res.status(409).json({ error: "البريد الإلكتروني مسجّل مسبقاً" });
      return;
    }

    const hash = await hashPassword(password);
    const result = await rawExecute(
      `INSERT INTO applicant_accounts (name, email, phone, "passwordHash")
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [name.trim(), email.trim().toLowerCase(), phone || null, hash]
    );

    const token = signApplicantToken(result.insertId);

    createAuditLog({
      companyId: 0, userId: result.insertId, action: "careers_register",
      entity: "applicant_accounts", entityId: result.insertId,
      after: { name: name.trim(), email: email.trim().toLowerCase() },
    }).catch(console.error);

    res.json({ token, accountId: result.insertId });
  } catch (err) {
    handleRouteError(err, res, "تسجيل حساب متقدم");
  }
});

router.post("/auth/login", portalLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body as { email: string; password: string };
    if (!email || !password) {
      res.status(400).json({ error: "البريد وكلمة المرور مطلوبان" });
      return;
    }

    const rows = await rawQuery<{ id: number; passwordHash: string; isActive: boolean }>(
      `SELECT id, "passwordHash", "isActive" FROM applicant_accounts WHERE email = $1`,
      [email.trim().toLowerCase()]
    );
    if (rows.length === 0) {
      res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
      return;
    }

    const account = rows[0];
    if (!account.isActive) {
      res.status(403).json({ error: "الحساب معطّل" });
      return;
    }

    const valid = await verifyPassword(password, account.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
      return;
    }

    const token = signApplicantToken(account.id);

    createAuditLog({
      companyId: 0, userId: account.id, action: "careers_login",
      entity: "applicant_accounts", entityId: account.id,
      after: { email: email.trim().toLowerCase() },
    }).catch(console.error);

    res.json({ token, accountId: account.id });
  } catch (err) {
    handleRouteError(err, res, "دخول متقدم");
  }
});

router.get("/jobs", portalLimiter, async (_req: Request, res: Response) => {
  try {
    const rows = await rawQuery(
      `SELECT id, title, department, location, type, description, requirements,
              "salaryMin", "salaryMax", status, "closingDate", "createdAt"
       FROM job_postings
       WHERE status = 'open'
         AND ("isPublic" IS NULL OR "isPublic" = true)
         AND ("closingDate" IS NULL OR "closingDate" >= CURRENT_DATE)
       ORDER BY "createdAt" DESC`
    );
    res.json({ data: rows });
  } catch (err) {
    handleRouteError(err, res, "جلب الوظائف");
  }
});

router.get("/jobs/:id", portalLimiter, async (req: Request, res: Response) => {
  try {
    const rows = await rawQuery(
      `SELECT id, title, department, location, type, description, requirements,
              "salaryMin", "salaryMax", status, "closingDate", "createdAt"
       FROM job_postings
       WHERE id = $1 AND status = 'open'`,
      [req.params.id]
    );
    if (rows.length === 0) {
      res.status(404).json({ error: "الوظيفة غير موجودة" });
      return;
    }
    res.json({ data: rows[0] });
  } catch (err) {
    handleRouteError(err, res, "جلب تفاصيل وظيفة");
  }
});

router.get("/me", careersAuth, async (req: Request, res: Response) => {
  try {
    const rows = await rawQuery(
      `SELECT id, name, email, phone, "nationalId", gender, "dateOfBirth",
              city, education, "experienceYears", "resumeUrl", "photoUrl", skills, "createdAt"
       FROM applicant_accounts WHERE id = $1`,
      [(req as any).applicantId]
    );
    if (rows.length === 0) {
      res.status(404).json({ error: "الحساب غير موجود" });
      return;
    }
    res.json({ data: rows[0] });
  } catch (err) {
    handleRouteError(err, res, "جلب بيانات المتقدم");
  }
});

router.patch("/me", careersAuth, async (req: Request, res: Response) => {
  try {
    const { name, phone, nationalId, gender, dateOfBirth, city, education, experienceYears, skills } = req.body;
    await rawExecute(
      `UPDATE applicant_accounts SET
        name = COALESCE($2, name),
        phone = COALESCE($3, phone),
        "nationalId" = COALESCE($4, "nationalId"),
        gender = COALESCE($5, gender),
        "dateOfBirth" = COALESCE($6, "dateOfBirth"),
        city = COALESCE($7, city),
        education = COALESCE($8, education),
        "experienceYears" = COALESCE($9, "experienceYears"),
        skills = COALESCE($10, skills),
        "updatedAt" = NOW()
       WHERE id = $1`,
      [(req as any).applicantId, name, phone, nationalId, gender, dateOfBirth, city, education, experienceYears, skills]
    );

    createAuditLog({
      companyId: 0, userId: (req as any).applicantId, action: "careers_update_profile",
      entity: "applicant_accounts", entityId: (req as any).applicantId,
      after: { name, phone, city, education, experienceYears },
    }).catch(console.error);

    res.json({ message: "تم تحديث البيانات" });
  } catch (err) {
    handleRouteError(err, res, "تحديث بيانات المتقدم");
  }
});

router.patch("/me/resume", careersAuth, async (req: Request, res: Response) => {
  try {
    const { resumeUrl } = req.body as { resumeUrl: string };
    if (!resumeUrl || typeof resumeUrl !== "string" || !resumeUrl.trim()) {
      res.status(400).json({ error: "رابط السيرة الذاتية مطلوب" });
      return;
    }
    await rawExecute(
      `UPDATE applicant_accounts SET "resumeUrl" = $2, "updatedAt" = NOW() WHERE id = $1`,
      [(req as any).applicantId, resumeUrl.trim()]
    );

    createAuditLog({
      companyId: 0, userId: (req as any).applicantId, action: "careers_update_resume",
      entity: "applicant_accounts", entityId: (req as any).applicantId,
      after: { resumeUrl: resumeUrl.trim() },
    }).catch(console.error);

    res.json({ message: "تم حفظ رابط السيرة الذاتية بنجاح" });
  } catch (err) {
    handleRouteError(err, res, "تحديث رابط السيرة الذاتية");
  }
});

router.get("/my-applications", careersAuth, async (req: Request, res: Response) => {
  try {
    const rows = await rawQuery(
      `SELECT ja.id, ja.status, ja."coverLetter", ja."createdAt",
              jp.title AS "jobTitle", jp.department, jp.location
       FROM job_applications ja
       JOIN job_postings jp ON jp.id = ja."postingId"
       WHERE ja."applicantAccountId" = $1
       ORDER BY ja."createdAt" DESC`,
      [(req as any).applicantId]
    );
    res.json({ data: rows });
  } catch (err) {
    handleRouteError(err, res, "جلب طلباتي");
  }
});

router.post("/apply", careersAuth, async (req: Request, res: Response) => {
  try {
    const { postingId, coverLetter } = req.body as { postingId: number; coverLetter?: string };
    const applicantId = (req as any).applicantId;

    if (!postingId) {
      res.status(400).json({ error: "يجب تحديد الوظيفة" });
      return;
    }

    const posting = await rawQuery(
      `SELECT id, status FROM job_postings WHERE id = $1 AND status = 'open'`,
      [postingId]
    );
    if (posting.length === 0) {
      res.status(404).json({ error: "الوظيفة غير متاحة أو مغلقة" });
      return;
    }

    const existing = await rawQuery(
      `SELECT id FROM job_applications WHERE "postingId" = $1 AND "applicantAccountId" = $2`,
      [postingId, applicantId]
    );
    if (existing.length > 0) {
      res.status(409).json({ error: "سبق لك التقديم على هذه الوظيفة" });
      return;
    }

    const account = await rawQuery(
      `SELECT name, email, phone, "resumeUrl" FROM applicant_accounts WHERE id = $1`,
      [applicantId]
    );
    const applicant = account[0];

    const result = await rawExecute(
      `INSERT INTO job_applications ("postingId", "applicantName", email, phone, "resumeUrl", "coverLetter", "applicantAccountId", status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'new') RETURNING id`,
      [postingId, applicant.name, applicant.email, applicant.phone, applicant.resumeUrl, coverLetter || null, applicantId]
    );

    createAuditLog({
      companyId: 0, userId: applicantId, action: "careers_apply",
      entity: "job_applications", entityId: result.insertId,
      after: { postingId, applicantId, coverLetter: coverLetter ? "provided" : null },
    }).catch(console.error);

    res.json({ applicationId: result.insertId, message: "تم تقديم طلبك بنجاح" });
  } catch (err) {
    handleRouteError(err, res, "تقديم طلب توظيف");
  }
});

export default router;
