import { Router } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { handleRouteError, ValidationError, NotFoundError, ConflictError, ForbiddenError } from "../lib/errorHandler.js";
import { hashPassword, verifyPassword } from "../lib/auth.js";
import { createAuditLog, emitEvent } from "../lib/businessHelpers.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import type { Request, Response, NextFunction } from "express";

const router = Router();
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is required for careers portal"); })();

const careersRegisterSchema = z.object({
  name: z.string().min(1, "الاسم مطلوب"),
  email: z.string().email("البريد الإلكتروني غير صالح"),
  phone: z.string().optional().nullable(),
  password: z.string().min(6, "كلمة المرور يجب أن تكون 6 أحرف على الأقل"),
});

const careersLoginSchema = z.object({
  email: z.string().email("البريد الإلكتروني غير صالح"),
  password: z.string().min(1, "كلمة المرور مطلوبة"),
});

const careersProfileUpdateSchema = z.object({
  name: z.string().min(1).optional().nullable(),
  phone: z.string().optional().nullable(),
  nationalId: z.string().optional().nullable(),
  gender: z.string().optional().nullable(),
  dateOfBirth: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  education: z.string().optional().nullable(),
  experienceYears: z.coerce.number().optional().nullable(),
  skills: z.any().optional().nullable(),
});

const careersResumeUpdateSchema = z.object({
  resumeUrl: z.string().min(1, "رابط السيرة الذاتية مطلوب"),
});

const careersApplySchema = z.object({
  postingId: z.coerce.number({ invalid_type_error: "يجب تحديد الوظيفة" }).int().positive("يجب تحديد الوظيفة"),
  coverLetter: z.string().optional().nullable(),
});

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
    const parsed_careersRegisterSchema = careersRegisterSchema.safeParse(req.body);
    if (!parsed_careersRegisterSchema.success) throw new ValidationError(parsed_careersRegisterSchema.error.errors[0]?.message ?? "بيانات غير صالحة");
    const body = parsed_careersRegisterSchema.data;
    const { name, email, phone, password } = body;

    const existing = await rawQuery(
      `SELECT id FROM applicant_accounts WHERE email = $1`,
      [email.trim().toLowerCase()]
    );
    if (existing.length > 0) {
      throw new ConflictError("البريد الإلكتروني مسجّل مسبقاً");
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
    emitEvent({ companyId: 0, branchId: 0, userId: result.insertId, action: "careers.account.registered", entity: "applicant_accounts", entityId: result.insertId, details: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase() }) }).catch(console.error);

    res.json({ token, accountId: result.insertId });
  } catch (err) {
    handleRouteError(err, res, "تسجيل حساب متقدم");
  }
});

router.post("/auth/login", portalLimiter, async (req: Request, res: Response) => {
  try {
    const parsed_careersLoginSchema = careersLoginSchema.safeParse(req.body);
    if (!parsed_careersLoginSchema.success) throw new ValidationError(parsed_careersLoginSchema.error.errors[0]?.message ?? "بيانات غير صالحة");
    const body = parsed_careersLoginSchema.data;
    const { email, password } = body;

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
      throw new ForbiddenError("الحساب معطّل");
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
    emitEvent({ companyId: 0, branchId: 0, userId: account.id, action: "careers.account.logged_in", entity: "applicant_accounts", entityId: account.id, details: JSON.stringify({ email: email.trim().toLowerCase() }) }).catch(console.error);

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
      [Number(req.params.id)]
    );
    if (rows.length === 0) {
      throw new NotFoundError("الوظيفة غير موجودة");
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
      throw new NotFoundError("الحساب غير موجود");
    }
    res.json({ data: rows[0] });
  } catch (err) {
    handleRouteError(err, res, "جلب بيانات المتقدم");
  }
});

router.patch("/me", careersAuth, async (req: Request, res: Response) => {
  try {
    const parsed_careersProfileUpdateSchema = careersProfileUpdateSchema.safeParse(req.body);
    if (!parsed_careersProfileUpdateSchema.success) throw new ValidationError(parsed_careersProfileUpdateSchema.error.errors[0]?.message ?? "بيانات غير صالحة");
    const body = parsed_careersProfileUpdateSchema.data;
    const { name, phone, nationalId, gender, dateOfBirth, city, education, experienceYears, skills } = body;
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
    emitEvent({ companyId: 0, branchId: 0, userId: (req as any).applicantId, action: "careers.profile.updated", entity: "applicant_accounts", entityId: (req as any).applicantId, details: JSON.stringify({ name, phone, city, education, experienceYears }) }).catch(console.error);

    res.json({ message: "تم تحديث البيانات" });
  } catch (err) {
    handleRouteError(err, res, "تحديث بيانات المتقدم");
  }
});

router.patch("/me/resume", careersAuth, async (req: Request, res: Response) => {
  try {
    const parsed_careersResumeUpdateSchema = careersResumeUpdateSchema.safeParse(req.body);
    if (!parsed_careersResumeUpdateSchema.success) throw new ValidationError(parsed_careersResumeUpdateSchema.error.errors[0]?.message ?? "بيانات غير صالحة");
    const body = parsed_careersResumeUpdateSchema.data;
    const resumeUrl = body.resumeUrl.trim();
    if (!resumeUrl) {
      throw new ValidationError("رابط السيرة الذاتية مطلوب");
    }
    await rawExecute(
      `UPDATE applicant_accounts SET "resumeUrl" = $2, "updatedAt" = NOW() WHERE id = $1`,
      [(req as any).applicantId, resumeUrl]
    );

    createAuditLog({
      companyId: 0, userId: (req as any).applicantId, action: "careers_update_resume",
      entity: "applicant_accounts", entityId: (req as any).applicantId,
      after: { resumeUrl },
    }).catch(console.error);
    emitEvent({ companyId: 0, branchId: 0, userId: (req as any).applicantId, action: "careers.resume.updated", entity: "applicant_accounts", entityId: (req as any).applicantId, details: JSON.stringify({ resumeUrl }) }).catch(console.error);

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
    const parsed_careersApplySchema = careersApplySchema.safeParse(req.body);
    if (!parsed_careersApplySchema.success) throw new ValidationError(parsed_careersApplySchema.error.errors[0]?.message ?? "بيانات غير صالحة");
    const body = parsed_careersApplySchema.data;
    const { postingId, coverLetter } = body;
    const applicantId = (req as any).applicantId;

    const posting = await rawQuery(
      `SELECT id, status FROM job_postings WHERE id = $1 AND status = 'open'`,
      [postingId]
    );
    if (posting.length === 0) {
      throw new NotFoundError("الوظيفة غير متاحة أو مغلقة");
    }

    const existing = await rawQuery(
      `SELECT id FROM job_applications WHERE "postingId" = $1 AND "applicantAccountId" = $2`,
      [postingId, applicantId]
    );
    if (existing.length > 0) {
      throw new ConflictError("سبق لك التقديم على هذه الوظيفة");
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
    emitEvent({ companyId: 0, branchId: 0, userId: applicantId, action: "careers.application.submitted", entity: "job_applications", entityId: result.insertId, details: JSON.stringify({ postingId, applicantId }) }).catch(console.error);

    res.json({ applicationId: result.insertId, message: "تم تقديم طلبك بنجاح" });
  } catch (err) {
    handleRouteError(err, res, "تقديم طلب توظيف");
  }
});

export default router;
