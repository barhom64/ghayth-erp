import { handleRouteError, ValidationError, ForbiddenError, NotFoundError } from "../lib/errorHandler.js";
import { Router, type Response as ExpressResponse } from "express";
import { z } from "zod";
import { rawQuery, rawExecute, withTransaction } from "../lib/rawdb.js";
import { signToken, signRefreshToken, verifyPassword, hashPassword } from "../lib/auth.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import rateLimit from "express-rate-limit";
import { createPerUserLimiter } from "../lib/perUserRateLimit.js";
import { makeRateLimitStore } from "../lib/rateLimitStore.js";
import { logger } from "../lib/logger.js";
import { createAuditLog, emitEvent } from "../lib/businessHelpers.js";

const router = Router();

const isProduction = process.env.NODE_ENV === "production";

function setAccessTokenCookie(res: ExpressResponse, token: string) {
  res.cookie("erp_access", token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/api",
    maxAge: 15 * 60 * 1000,
  });
}

function setRefreshTokenCookie(res: ExpressResponse, refreshToken: string) {
  res.cookie("erp_refresh", refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/api/auth",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function clearAuthCookies(res: ExpressResponse) {
  res.clearCookie("erp_access", { path: "/api" });
  res.clearCookie("erp_refresh", { path: "/api/auth" });
}

const loginSchema = z.object({
  email: z.string().min(1, "البريد الإلكتروني مطلوب"),
  password: z.string().min(1, "كلمة المرور مطلوبة"),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, "رمز التحديث مطلوب"),
});

const switchAssignmentSchema = z.object({
  assignmentId: z.coerce.number({ required_error: "التعيين مطلوب" }),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "كلمة المرور الحالية مطلوبة"),
  newPassword: z.string()
    .min(8, "كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل")
    .regex(/[A-Z]/, "يجب أن تحتوي على حرف كبير واحد على الأقل")
    .regex(/[a-z]/, "يجب أن تحتوي على حرف صغير واحد على الأقل")
    .regex(/[0-9]/, "يجب أن تحتوي على رقم واحد على الأقل")
    .regex(/[^a-zA-Z0-9]/, "يجب أن تحتوي على رمز خاص واحد على الأقل"),
});

// NOTE: A router-wide per-IP authRouteLimiter previously sat here. It has
// been removed because it threw IP-based caps on authenticated endpoints
// (/auth/me, /auth/logout, /auth/switch-assignment, /auth/change-password),
// which violates the per-user rate-limit policy (admins on a shared proxy
// IP could be unfairly throttled). Anonymous endpoints below
// (/register, /login, /refresh) keep their own dedicated per-IP limiters,
// and /change-password gets a per-user limiter (changePasswordLimiter).
// The truly authenticated endpoints (/me, /logout, /switch-assignment) are
// covered by the global per-user limiter mounted in routes/index.ts after
// authMiddleware.

const REFRESH_TOKEN_TTL_DAYS = 7;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "تم تجاوز الحد الأقصى لمحاولات الدخول. يرجى المحاولة بعد دقيقة" },
  validate: { ip: false, trustProxy: false },
  store: makeRateLimitStore("auth:login"),
});

// Per-user limiter for the authenticated /auth/* endpoints (/me, /logout,
// /switch-assignment). The /auth router is mounted in routes/index.ts
// BEFORE the global authMiddleware mount, so the per-route authMiddleware
// must run first inside each route chain to set req.scope. Owner/admin
// exempt — these are routine session management calls.
const authedUserLimiter = createPerUserLimiter({
  prefix: "auth:authed",
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === "production" ? 120 : 1200,
  message: "تم تجاوز الحد الأقصى للطلبات. يرجى المحاولة بعد دقيقة",
});

// Per-user change-password limiter. Mounted after authMiddleware on the
// /change-password route, so req.scope is set. Owner/admin NOT exempt — the
// cap is a per-actor safety net against credential-stuffing-style abuse.
const changePasswordLimiter = createPerUserLimiter({
  prefix: "auth:change-pw",
  windowMs: 60 * 1000,
  max: 5,
  message: "تم تجاوز الحد الأقصى لطلبات تغيير كلمة المرور. يرجى المحاولة بعد دقيقة",
  skip: () => false,
});

const refreshLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "تم تجاوز الحد الأقصى لطلبات تحديث الرمز. يرجى المحاولة بعد دقيقة" },
  validate: { ip: false, trustProxy: false },
  store: makeRateLimitStore("auth:refresh"),
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "تم تجاوز الحد الأقصى لطلبات إنشاء الحسابات. يرجى المحاولة لاحقاً" },
  validate: { ip: false, trustProxy: false },
  store: makeRateLimitStore("auth:register"),
});

router.post("/register", registerLimiter, async (_req, res) => {
  emitEvent({ companyId: 0, userId: 0, action: "auth.register", entity: "users", entityId: 0 }).catch((e) => logger.error(e, "auth background task failed"));
  createAuditLog({ companyId: 0, userId: 0, action: "create", entity: "users", entityId: 0, after: { blocked: true, reason: "self_registration_not_permitted" } }).catch((e) => logger.error(e, "auth background task failed"));
  res.status(405).json({ error: "إنشاء الحسابات يتم بواسطة المسؤول فقط — Self-registration is not permitted" });
});

router.post("/login", loginLimiter, async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors[0]?.message ?? "بيانات غير صالحة");
    }
    const { email, password } = parsed.data;

    const [user] = await rawQuery<any>(
      `SELECT u.id, u."passwordHash", u."isActive", u."employeeId",
              u."failedLoginAttempts", u."lockedUntil"
       FROM users u WHERE u.email = $1`,
      [email]
    );

    if (!user) {
      throw new ForbiddenError("بيانات الدخول غير صحيحة");
    }

    if (!user.isActive) {
      throw new ForbiddenError("الحساب موقوف");
    }

    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      res.status(429).json({ error: "الحساب مقفل مؤقتاً بسبب محاولات دخول فاشلة متكررة. يرجى المحاولة لاحقاً" });
      return;
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      // Atomic increment to prevent race conditions (C10)
      const [updated] = await rawQuery<any>(
        `UPDATE users SET "failedLoginAttempts" = "failedLoginAttempts" + 1 WHERE id = $1 RETURNING "failedLoginAttempts"`,
        [user.id]
      );
      const attempts = updated.failedLoginAttempts;
      if (attempts >= MAX_FAILED_ATTEMPTS) {
        const lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
        try {
          await rawExecute(
            `UPDATE users SET "lockedUntil"=$1 WHERE id=$2`,
            [lockedUntil.toISOString(), user.id]
          );
        } catch (lockErr) {
          logger.error({ err: lockErr, userId: user.id }, "Failed to persist account lockout");
        }
        logger.warn({ userId: user.id }, "Account locked due to too many failed login attempts");
        createAuditLog({
          companyId: 0, userId: user.id,
          action: "login_failed", entity: "users", entityId: user.id,
          after: { email, reason: "account_locked", attempts },
        }).catch((e) => logger.error(e, "auth background task failed"));
        res.status(429).json({ error: `تم قفل الحساب لمدة ${LOCKOUT_MINUTES} دقيقة بسبب تكرار محاولات الدخول الفاشلة` });
      } else {
        createAuditLog({
          companyId: 0, userId: user.id,
          action: "login_failed", entity: "users", entityId: user.id,
          after: { email, reason: "invalid_password", attempts },
        }).catch((e) => logger.error(e, "auth background task failed"));
        throw new ForbiddenError("بيانات الدخول غير صحيحة");
      }
      return;
    }

    try {
      await rawExecute(
        `UPDATE users SET "lastLoginAt"=NOW(), "failedLoginAttempts"=0, "lockedUntil"=NULL WHERE id=$1`,
        [user.id]
      );
    } catch (resetErr) {
      logger.error({ err: resetErr, userId: user.id }, "Failed to reset login state after successful auth");
    }

    const assignments = await rawQuery<any>(
      `SELECT ea.id, ea."companyId", ea."branchId", ea.role, ea.status,
              ea."jobTitleId", COALESCE(jt.name, ea."jobTitle") AS "jobTitle",
              c.name AS "companyName", b.name AS "branchName"
       FROM employee_assignments ea
       LEFT JOIN companies c ON c.id = ea."companyId"
       LEFT JOIN branches b ON b.id = ea."branchId"
       LEFT JOIN job_titles jt ON jt.id = ea."jobTitleId"
       WHERE ea."employeeId" = $1 AND ea.status = 'active'`,
      [user.employeeId]
    );

    if (!assignments.length) {
      throw new ForbiddenError("لا يوجد تعيين نشط لهذا المستخدم");
    }

    const primary = assignments[0];

    // Union legacy `user_roles` with v2 `rbac_user_roles` so the
    // frontend role-switcher shows every role an admin has been granted
    // (migration 141 auto-assigns all v2 roles to owners/GMs for testing).
    // V2 ids are negated to keep React keys unique against legacy ids.
    const userRoles = await rawQuery<any>(
      `SELECT id, "roleKey", label, modules, level, source FROM (
         SELECT id, "roleKey", label, modules, level, 1 AS source_order, 'legacy' AS source
           FROM user_roles WHERE "userId" = $1
         UNION ALL
         SELECT
           -r.id AS id,
           r.role_key AS "roleKey",
           r.label_ar AS label,
           COALESCE(
             (SELECT to_jsonb(array_agg(DISTINCT split_part(g.feature_key, '.', 1)))
                FROM rbac_role_grants g WHERE g.role_id = r.id),
             '[]'::jsonb
           ) AS modules,
           r.level,
           2 AS source_order,
           'v2' AS source
          FROM rbac_user_roles ur
          JOIN rbac_roles r ON r.id = ur.role_id
         WHERE ur."userId" = $1 AND ur."companyId" = $2
           AND r.is_active = TRUE AND r.is_template = FALSE
           AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
           AND NOT EXISTS (
             SELECT 1 FROM user_roles ul
              WHERE ul."userId" = $1 AND ul."roleKey" = r.role_key
           )
       ) combined
       ORDER BY source_order, level DESC`,
      [user.id, primary.companyId]
    );
    const token = signToken({
      userId: user.id,
      assignmentId: primary.id,
      role: primary.role,
    });

    const refreshToken = signRefreshToken();
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
    const userAgent = req.headers["user-agent"] ?? null;
    const ipAddress = req.ip ?? null;

    await rawExecute(
      `INSERT INTO refresh_tokens (token, "userId", "expiresAt", "userAgent", "ipAddress")
       VALUES ($1, $2, $3, $4, $5)`,
      [refreshToken, user.id, expiresAt.toISOString(), userAgent, ipAddress]
    );

    setAccessTokenCookie(res, token);
    setRefreshTokenCookie(res, refreshToken);

    emitEvent({ companyId: primary.companyId, branchId: primary.branchId, userId: user.id, action: "auth.login.success", entity: "users", entityId: user.id, ip: ipAddress || "unknown", details: JSON.stringify({ email, assignmentId: primary.id }) }).catch((e) => logger.error(e, "auth background task failed"));
    res.json({ assignments, userRoles });
  } catch (err) {
    handleRouteError(err, res, "Login error:");
  }
});

router.post("/refresh", refreshLimiter, async (req, res) => {
  try {
    const refreshToken = req.cookies?.erp_refresh || req.body?.refreshToken;
    if (!refreshToken || typeof refreshToken !== "string") {
      throw new ValidationError("رمز التحديث مطلوب");
    }

    const [rt] = await rawQuery<any>(
      `SELECT rt.*, u."isActive", u."employeeId", u."lockedUntil"
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt."userId"
       WHERE rt.token = $1`,
      [refreshToken]
    );

    if (!rt) {
      throw new ForbiddenError("رمز التحديث غير صالح");
    }

    if (rt.revokedAt) {
      throw new ForbiddenError("رمز التحديث ملغي");
    }

    if (new Date(rt.expiresAt) < new Date()) {
      throw new ForbiddenError("انتهت صلاحية رمز التحديث");
    }

    if (!rt.isActive) {
      throw new ForbiddenError("الحساب موقوف");
    }

    if (rt.lockedUntil && new Date(rt.lockedUntil) > new Date()) {
      throw new ForbiddenError("الحساب مقفل مؤقتاً");
    }

    const [primaryAssignment] = await rawQuery<any>(
      `SELECT ea.id, ea.role FROM employee_assignments ea
       WHERE ea."employeeId" = $1 AND ea.status = 'active'
       ORDER BY ea."isPrimary" DESC NULLS LAST LIMIT 1`,
      [rt.employeeId]
    );

    if (!primaryAssignment) {
      throw new ForbiddenError("لا يوجد تعيين نشط");
    }

    const newToken = signToken({
      userId: rt.userId,
      assignmentId: primaryAssignment.id,
      role: primaryAssignment.role,
    });

    setAccessTokenCookie(res, newToken);

    const newRefreshToken = signRefreshToken();
    const newExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
    await withTransaction(async (client) => {
      await client.query(`UPDATE refresh_tokens SET "revokedAt" = NOW() WHERE id = $1 AND "revokedAt" IS NULL`, [rt.id]);
      await client.query(
        `INSERT INTO refresh_tokens (token, "userId", "expiresAt", "userAgent", "ipAddress") VALUES ($1, $2, $3, $4, $5)`,
        [newRefreshToken, rt.userId, newExpiresAt.toISOString(), req.headers["user-agent"] ?? null, req.ip ?? null]
      );
    });
    setRefreshTokenCookie(res, newRefreshToken);

    emitEvent({ companyId: 0, userId: rt.userId, action: "auth.refresh", entity: "users", entityId: rt.userId }).catch((e) => logger.error(e, "auth background task failed"));
    createAuditLog({ companyId: 0, userId: rt.userId, action: "update", entity: "users", entityId: rt.userId, after: { reason: "token_refresh" } }).catch((e) => logger.error(e, "auth background task failed"));
    res.json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "Refresh token error:");
  }
});

router.post("/logout", authMiddleware, authedUserLimiter, async (req, res) => {
  try {
    const scope = req.scope!;
    const refreshToken = req.cookies?.erp_refresh || req.body?.refreshToken;
    if (refreshToken) {
      try {
        await rawExecute(
          `UPDATE refresh_tokens SET "revokedAt"=NOW() WHERE token=$1 AND "userId"=$2`,
          [refreshToken, scope.userId]
        );
      } catch (revokeErr) {
        logger.error({ err: revokeErr, userId: scope.userId }, "Failed to revoke refresh token on logout");
      }
    }
    clearAuthCookies(res);
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "auth.logout", entity: "users", entityId: scope.userId }).catch((e) => logger.error(e, "auth background task failed"));
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "users", entityId: scope.userId, after: { reason: "logout" } }).catch((e) => logger.error(e, "auth background task failed"));
    res.json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "Logout error:");
  }
});

router.post("/switch-assignment", authMiddleware, authedUserLimiter, async (req, res) => {
  try {
    const scope = req.scope!;
    const parsed = switchAssignmentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors[0]?.message ?? "بيانات غير صالحة");
    }
    const { assignmentId } = parsed.data;
    if (!scope.allowedAssignments.includes(Number(assignmentId))) {
      throw new ForbiddenError("غير مسموح بالتبديل إلى هذا التعيين");
    }
    const [assignment] = await rawQuery<any>(
      `SELECT ea.id, ea."companyId", ea."branchId", ea.role FROM employee_assignments ea WHERE ea.id = $1 AND ea.status = 'active'`,
      [assignmentId]
    );
    if (!assignment) {
      throw new NotFoundError("التعيين غير موجود أو غير نشط");
    }

    const token = signToken({ userId: scope.userId, assignmentId: Number(assignmentId), role: assignment.role });
    setAccessTokenCookie(res, token);

    const refreshToken = signRefreshToken();
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
    const userAgent = req.headers["user-agent"] ?? null;
    const ipAddress = req.ip ?? null;

    await withTransaction(async (client) => {
      await client.query('UPDATE refresh_tokens SET "revokedAt"=NOW() WHERE "userId"=$1 AND "revokedAt" IS NULL', [scope.userId]);
      await client.query(
        `INSERT INTO refresh_tokens (token, "userId", "expiresAt", "userAgent", "ipAddress") VALUES ($1, $2, $3, $4, $5)`,
        [refreshToken, scope.userId, expiresAt.toISOString(), userAgent, ipAddress]
      );
    });

    setRefreshTokenCookie(res, refreshToken);

    emitEvent({ companyId: assignment.companyId, userId: scope.userId, action: "auth.switch_assignment", entity: "user_assignments", entityId: Number(assignmentId) }).catch((e) => logger.error(e, "auth background task failed"));
    createAuditLog({ companyId: assignment.companyId, userId: scope.userId, action: "update", entity: "employee_assignments", entityId: Number(assignmentId), after: { switchedTo: assignmentId, role: assignment.role } }).catch((e) => logger.error(e, "auth background task failed"));
    res.json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "Switch assignment error:");
  }
});

router.get("/me", authMiddleware, authedUserLimiter, async (req, res) => {
  try {
    const scope = req.scope!;

    const [employee] = await rawQuery<any>(
      `SELECT e.id, e.name, e.phone, e.email, e."empNumber",
              e."photoUrl", e.status,
              COALESCE(jt.name, ea."jobTitle") AS "jobTitle",
              ea."jobTitleId", ea.role, ea.salary,
              ea."companyId", ea."branchId",
              c.name AS "companyName", b.name AS "branchName"
       FROM employees e
       JOIN employee_assignments ea ON ea."employeeId" = e.id
       LEFT JOIN companies c ON c.id = ea."companyId"
       LEFT JOIN branches b ON b.id = ea."branchId"
       LEFT JOIN job_titles jt ON jt.id = ea."jobTitleId"
       WHERE ea.id = $1 AND e."deletedAt" IS NULL`,
      [scope.activeAssignmentId]
    );

    if (!employee) {
      throw new NotFoundError("المستخدم غير موجود");
    }

    // Union legacy `user_roles` with v2 `rbac_user_roles`. See /login for rationale.
    const userRoles = await rawQuery<any>(
      `SELECT id, "roleKey", label, modules, level, source FROM (
         SELECT id, "roleKey", label, modules, level, 1 AS source_order, 'legacy' AS source
           FROM user_roles WHERE "userId" = $1
         UNION ALL
         SELECT
           -r.id AS id,
           r.role_key AS "roleKey",
           r.label_ar AS label,
           COALESCE(
             (SELECT to_jsonb(array_agg(DISTINCT split_part(g.feature_key, '.', 1)))
                FROM rbac_role_grants g WHERE g.role_id = r.id),
             '[]'::jsonb
           ) AS modules,
           r.level,
           2 AS source_order,
           'v2' AS source
          FROM rbac_user_roles ur
          JOIN rbac_roles r ON r.id = ur.role_id
         WHERE ur."userId" = $1 AND ur."companyId" = $2
           AND r.is_active = TRUE AND r.is_template = FALSE
           AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
           AND NOT EXISTS (
             SELECT 1 FROM user_roles ul
              WHERE ul."userId" = $1 AND ul."roleKey" = r.role_key
           )
       ) combined
       ORDER BY source_order, level DESC`,
      [scope.userId, scope.companyId]
    );

    res.json({ ...employee, userRoles });
  } catch (err) {
    handleRouteError(err, res, "GetMe error:");
  }
});

router.post("/change-password", authMiddleware, changePasswordLimiter, async (req, res) => {
  try {
    const scope = req.scope!;
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors[0]?.message ?? "بيانات غير صالحة");
    }
    const { currentPassword, newPassword } = parsed.data;
    const [user] = await rawQuery<any>(`SELECT id, "passwordHash" FROM users WHERE id=$1`, [scope.userId]);
    if (!user) { throw new NotFoundError("المستخدم غير موجود"); }
    const valid = await verifyPassword(currentPassword, user.passwordHash);
    if (!valid) { throw new ForbiddenError("كلمة المرور الحالية غير صحيحة"); }
    const hashed = await hashPassword(newPassword);

    // Atomic: rotate password AND revoke existing refresh tokens together.
    // Previously the revoke ran in fire-and-forget try/catch; if it failed
    // (DB blip mid-request) the password was changed but old tokens stayed
    // valid — a security regression masked by a "success" response. Wrap
    // both in a single transaction so they commit or roll back together.
    await withTransaction(async (client) => {
      const { rowCount: passwordUpdated } = await client.query(
        `UPDATE users SET "passwordHash"=$1 WHERE id=$2`,
        [hashed, scope.userId],
      );
      if (!passwordUpdated) throw new NotFoundError("المستخدم غير موجود");
      await client.query(
        `UPDATE refresh_tokens SET "revokedAt"=NOW() WHERE "userId"=$1 AND "revokedAt" IS NULL`,
        [scope.userId],
      );
    });

    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "password_change", entity: "users", entityId: scope.userId,
    }).catch((e) => logger.error(e, "auth background task failed"));
    clearAuthCookies(res);
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "auth.password.changed", entity: "users", entityId: scope.userId }).catch((e) => logger.error(e, "auth background task failed"));
    res.json({ success: true, message: "تم تغيير كلمة المرور بنجاح" });
  } catch (err) {
    handleRouteError(err, res, "Change password error:");
  }
});

export default router;
