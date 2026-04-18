import { handleRouteError } from "../lib/errorHandler.js";
import { Router } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { signToken, signRefreshToken, verifyPassword, hashPassword } from "../lib/auth.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import rateLimit from "express-rate-limit";
import { logger } from "../lib/logger.js";
import { createAuditLog } from "../lib/businessHelpers.js";

const router = Router();

const authRouteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "تم تجاوز الحد الأقصى للطلبات. يرجى المحاولة بعد دقيقة" },
  validate: { ip: false, trustProxy: false },
});

router.use(authRouteLimiter);

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
});

const changePasswordLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "تم تجاوز الحد الأقصى لطلبات تغيير كلمة المرور. يرجى المحاولة بعد دقيقة" },
  validate: { ip: false, trustProxy: false },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "تم تجاوز الحد الأقصى لطلبات إنشاء الحسابات. يرجى المحاولة لاحقاً" },
  validate: { ip: false, trustProxy: false },
});

router.post("/register", registerLimiter, async (_req, res) => {
  res.status(405).json({ error: "إنشاء الحسابات يتم بواسطة المسؤول فقط — Self-registration is not permitted" });
});

router.post("/login", loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body as { email: string; password: string };

    if (!email || !password) {
      res.status(400).json({ error: "البريد الإلكتروني وكلمة المرور مطلوبان" });
      return;
    }

    const [user] = await rawQuery<any>(
      `SELECT u.id, u."passwordHash", u."isActive", u."employeeId",
              u."failedLoginAttempts", u."lockedUntil"
       FROM users u WHERE u.email = $1`,
      [email]
    );

    if (!user) {
      res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({ error: "الحساب موقوف" });
      return;
    }

    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      const remaining = Math.ceil((new Date(user.lockedUntil).getTime() - Date.now()) / 60000);
      res.status(429).json({ error: `الحساب مقفل مؤقتاً. يرجى المحاولة بعد ${remaining} دقيقة` });
      return;
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      const attempts = (user.failedLoginAttempts || 0) + 1;
      if (attempts >= MAX_FAILED_ATTEMPTS) {
        const lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
        try {
          await rawExecute(
            `UPDATE users SET "failedLoginAttempts"=$1, "lockedUntil"=$2 WHERE id=$3`,
            [attempts, lockedUntil.toISOString(), user.id]
          );
        } catch (lockErr) {
          logger.error({ err: lockErr, userId: user.id }, "Failed to persist account lockout");
        }
        logger.warn({ userId: user.id }, "Account locked due to too many failed login attempts");
        createAuditLog({
          companyId: 0, userId: user.id,
          action: "login_failed", entity: "users", entityId: user.id,
          after: { email, reason: "account_locked", attempts },
        }).catch(console.error);
        res.status(429).json({ error: `تم قفل الحساب لمدة ${LOCKOUT_MINUTES} دقيقة بسبب تكرار محاولات الدخول الفاشلة` });
      } else {
        try {
          await rawExecute(
            `UPDATE users SET "failedLoginAttempts"=$1 WHERE id=$2`,
            [attempts, user.id]
          );
        } catch (attemptsErr) {
          logger.error({ err: attemptsErr, userId: user.id }, "Failed to increment failed login attempts counter");
        }
        createAuditLog({
          companyId: 0, userId: user.id,
          action: "login_failed", entity: "users", entityId: user.id,
          after: { email, reason: "invalid_password", attempts },
        }).catch(console.error);
        res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
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
      res.status(403).json({ error: "لا يوجد تعيين نشط لهذا المستخدم" });
      return;
    }

    const userRoles = await rawQuery<any>(
      `SELECT id, "roleKey", label, modules, level FROM user_roles WHERE "userId" = $1 ORDER BY level DESC`,
      [user.id]
    );

    const primary = assignments[0];
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

    res.json({ token, refreshToken, assignments, userRoles });
  } catch (err) {
    handleRouteError(err, res, "Login error:");
  }
});

router.post("/refresh", async (req, res) => {
  try {
    const { refreshToken } = req.body as { refreshToken: string };
    if (!refreshToken) {
      res.status(400).json({ error: "refreshToken مطلوب" });
      return;
    }

    const [rt] = await rawQuery<any>(
      `SELECT rt.*, u."isActive", u."employeeId"
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt."userId"
       WHERE rt.token = $1`,
      [refreshToken]
    );

    if (!rt) {
      res.status(401).json({ error: "رمز التحديث غير صالح" });
      return;
    }

    if (rt.revokedAt) {
      res.status(401).json({ error: "رمز التحديث ملغي" });
      return;
    }

    if (new Date(rt.expiresAt) < new Date()) {
      res.status(401).json({ error: "انتهت صلاحية رمز التحديث" });
      return;
    }

    if (!rt.isActive) {
      res.status(403).json({ error: "الحساب موقوف" });
      return;
    }

    const [primaryAssignment] = await rawQuery<any>(
      `SELECT ea.id, ea.role FROM employee_assignments ea
       WHERE ea."employeeId" = $1 AND ea.status = 'active'
       ORDER BY ea."isPrimary" DESC NULLS LAST LIMIT 1`,
      [rt.employeeId]
    );

    if (!primaryAssignment) {
      res.status(403).json({ error: "لا يوجد تعيين نشط" });
      return;
    }

    const newToken = signToken({
      userId: rt.userId,
      assignmentId: primaryAssignment.id,
      role: primaryAssignment.role,
    });

    res.json({ token: newToken });
  } catch (err) {
    handleRouteError(err, res, "Refresh token error:");
  }
});

router.post("/logout", authMiddleware, async (req, res) => {
  try {
    const scope = req.scope!;
    const { refreshToken } = req.body as { refreshToken?: string };
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
    res.json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "Logout error:");
  }
});

router.post("/switch-assignment", authMiddleware, async (req, res) => {
  try {
    const scope = req.scope!;
    const { assignmentId } = req.body as { assignmentId: number };
    if (!assignmentId) {
      res.status(400).json({ error: "assignmentId مطلوب" });
      return;
    }
    if (!scope.allowedAssignments.includes(Number(assignmentId))) {
      res.status(403).json({ error: "غير مسموح بالتبديل إلى هذا التعيين" });
      return;
    }
    const [assignment] = await rawQuery<any>(
      `SELECT ea.id, ea."companyId", ea."branchId", ea.role FROM employee_assignments ea WHERE ea.id = $1 AND ea.status = 'active'`,
      [assignmentId]
    );
    if (!assignment) {
      res.status(404).json({ error: "التعيين غير موجود أو غير نشط" });
      return;
    }
    const token = signToken({ userId: scope.userId, assignmentId: Number(assignmentId), role: assignment.role });
    res.json({ token });
  } catch (err) {
    handleRouteError(err, res, "Switch assignment error:");
  }
});

router.get("/me", authMiddleware, async (req, res) => {
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
       WHERE ea.id = $1`,
      [scope.activeAssignmentId]
    );

    if (!employee) {
      res.status(404).json({ error: "المستخدم غير موجود" });
      return;
    }

    const userRoles = await rawQuery<any>(
      `SELECT id, "roleKey", label, modules, level FROM user_roles WHERE "userId" = $1 ORDER BY level DESC`,
      [scope.userId]
    );

    res.json({ ...employee, userRoles });
  } catch (err) {
    handleRouteError(err, res, "GetMe error:");
  }
});

router.post("/change-password", authMiddleware, changePasswordLimiter, async (req, res) => {
  try {
    const scope = req.scope!;
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: "كلمة المرور الحالية والجديدة مطلوبتان" });
      return;
    }
    if (newPassword.length < 6) {
      res.status(400).json({ error: "كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل" });
      return;
    }
    const [user] = await rawQuery<any>(`SELECT id, "passwordHash" FROM users WHERE id=$1`, [scope.userId]);
    if (!user) { res.status(404).json({ error: "المستخدم غير موجود" }); return; }
    const valid = await verifyPassword(currentPassword, user.passwordHash);
    if (!valid) { res.status(401).json({ error: "كلمة المرور الحالية غير صحيحة" }); return; }
    const hashed = await hashPassword(newPassword);
    await rawExecute(`UPDATE users SET "passwordHash"=$1 WHERE id=$2`, [hashed, scope.userId]);
    try {
      await rawExecute(
        `UPDATE refresh_tokens SET "revokedAt"=NOW() WHERE "userId"=$1 AND "revokedAt" IS NULL`,
        [scope.userId]
      );
    } catch (revokeErr) {
      logger.error({ err: revokeErr, userId: scope.userId }, "Failed to revoke refresh tokens after password change");
    }
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "password_change", entity: "users", entityId: scope.userId,
    }).catch(console.error);
    res.json({ success: true, message: "تم تغيير كلمة المرور بنجاح" });
  } catch (err) {
    handleRouteError(err, res, "Change password error:");
  }
});

export default router;
