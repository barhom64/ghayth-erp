import { handleRouteError, ValidationError, ForbiddenError, NotFoundError, ConflictError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute, withTransaction, pool } from "../lib/rawdb.js";
import { hashPassword } from "../lib/auth.js";
import { grantUserRole } from "../lib/rbacService.js";
import { bumpCacheVersion } from "../lib/rbac/authzEngine.js";
import { invalidateRoleCache } from "../middlewares/roleGuard.js";
import { issueNumber } from "../lib/numberingService.js";
import { logger } from "../lib/logger.js";
import { createPerUserLimiter } from "../lib/perUserRateLimit.js";
import { getRedisRateLimitStatus } from "../lib/rateLimitStore.js";
import { integrationService } from "../lib/integrationService.js";
import { invalidatePermissionCache } from "../middlewares/permissionMiddleware.js";
import { invalidateSubscriptionCache } from "../middlewares/subscriptionGate.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { createAuditLog, emitEvent, todayISO } from "../lib/businessHelpers.js";
import { sendMessage } from "../lib/messageSender.js";
import { issueAuthToken, TOKEN_TTL_MINUTES, PublicBaseUrlMissingError } from "../lib/authTokens.js";
import { sendAuthEmail } from "../lib/authNotifications.js";
import { encryptSecret, decryptSecret } from "../lib/secrets.js";
import crypto from "node:crypto";
import { ADMIN_ROLES } from "../lib/rbacCatalog.js";

// RD3-04 — fields inside an integration's `config` JSON that hold a
// credential and therefore must be encrypted at rest. The values can
// be any plaintext; once encrypted by encryptSecret() they store as
// `enc-v1:…` payloads that survive a DB dump.
const INTEGRATION_SECRET_KEYS = new Set([
  "password", "apiKey", "accessToken", "secret", "authToken",
  "token", "webhookSecret", "appSecret", "clientSecret", "privateKey",
  "smtpPassword", "smsAuthToken", "key",
]);
function encryptIntegrationConfig(config: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!config || typeof config !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config)) {
    if (INTEGRATION_SECRET_KEYS.has(k) && typeof v === "string" && v.length > 0) {
      out[k] = encryptSecret(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}
function decryptIntegrationConfig(config: Record<string, unknown> | string | null | undefined): Record<string, unknown> {
  if (!config) return {};
  const parsed = typeof config === "string" ? JSON.parse(config) : config;
  if (!parsed || typeof parsed !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (INTEGRATION_SECRET_KEYS.has(k) && typeof v === "string") {
      out[k] = decryptSecret(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

const router = Router();

const createUserSchema = z.object({
  email: z.string().min(1, "البريد الإلكتروني مطلوب"),
  role: z.string().optional(),
  password: z.string().min(8, "كلمة المرور يجب أن تكون 8 أحرف على الأقل").optional(),
  employeeId: z.coerce.number().optional(),
});

const resetPasswordSchema = z.object({
  newPassword: z.string()
    .min(8, "كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل")
    .regex(/[A-Z]/, "يجب أن تحتوي على حرف كبير واحد على الأقل")
    .regex(/[a-z]/, "يجب أن تحتوي على حرف صغير واحد على الأقل")
    .regex(/[0-9]/, "يجب أن تحتوي على رقم واحد على الأقل")
    .regex(/[^a-zA-Z0-9]/, "يجب أن تحتوي على رمز خاص واحد على الأقل"),
});

const createRoleSchema = z.object({
  name: z.string().min(1, "اسم الدور مطلوب"),
  description: z.string().optional(),
  permissions: z.array(z.string()).optional(),
});

const updateUserSchema = z.object({
  isActive: z.boolean().optional(),
  role: z.string().min(1).optional(),
  employeeId: z.coerce.number().int().positive().optional().nullable(),
  email: z.string().email("بريد إلكتروني غير صحيح").optional(),
});

const createUserRoleSchema = z.object({
  userId: z.coerce.number().int().positive("userId مطلوب"),
  roleKey: z.string().min(1, "roleKey مطلوب"),
});

const createRolePermissionSchema = z.object({
  role: z.string().min(1, "role مطلوب"),
  permission: z.string().min(1, "permission مطلوب"),
});

const bulkRolePermissionsSchema = z.object({
  role: z.string().min(1, "role مطلوب"),
  permissions: z.array(z.string().min(1)).min(0),
});

const createIntegrationSchema = z.object({
  name: z.string().min(1, "اسم التكامل مطلوب"),
  // "github" — توكن مزامنة تذاكر الدعم مع المستودع (lib/integrations/githubSupportSync).
  type: z.enum(["email", "sms", "whatsapp", "webhook", "github"]),
  config: z.any().optional(),
  enabled: z.boolean().optional(),
  status: z.enum(["active", "inactive", "error"]).optional(),
  maxRetries: z.coerce.number().int().min(0).optional(),
});

const createCustomRoleSchema = z.object({
  roleKey: z.string().min(1, "roleKey مطلوب").regex(/^[a-z_]+$/, "roleKey يجب أن يحتوي على أحرف إنجليزية صغيرة وشرطات سفلية فقط"),
  label: z.string().min(1, "label مطلوب"),
  level: z.coerce.number().int().min(1).max(99).optional().default(10),
  modules: z.array(z.string()).optional().default([]),
  permissions: z.array(z.string()).optional(),
});

const updateIntegrationSchema = z.object({
  name: z.string().min(1, "اسم التكامل مطلوب").optional(),
  type: z.enum(["email", "sms", "whatsapp", "webhook", "github"]).optional(),
  config: z.any().optional(),
  status: z.enum(["active", "inactive", "error"]).optional(),
  maxRetries: z.coerce.number().int().min(0).optional(),
});

const testIntegrationSchema = z.object({
  testRecipient: z.string().optional(),
});

// Per-user limiter for admin password resets. The /admin router is mounted
// after authMiddleware in routes/index.ts (and gated by requireMinLevel(90)),
// so req.scope is always set here. Owner/admin roles are NOT exempted because
// this is the admin endpoint itself — the cap is a per-actor safety net
// against a runaway script, not against admins as a class.
const resetPasswordLimiter = createPerUserLimiter({
  prefix: "admin:reset-pw",
  windowMs: 60 * 1000,
  max: 5,
  message: "تم تجاوز الحد الأقصى لمحاولات إعادة تعيين كلمة المرور. يرجى المحاولة بعد دقيقة",
  skip: () => false,
});

const ADMIN_ROLE_LEVEL = 90;

async function assertAdmin(req: any): Promise<void> {
  const scope = req.scope;
  if (!scope) {
    throw new ForbiddenError("غير مصرح: صلاحيات المسؤول مطلوبة");
  }
  try {
    const rows = await rawQuery<{ level: number }>(
      `SELECT MAX(r.level) AS level
         FROM rbac_user_roles ur
         JOIN rbac_roles r ON r.id = ur.role_id
        WHERE ur."userId" = $1 AND ur."companyId" = $2`,
      [scope.userId, scope.companyId]
    );
    if (rows.length > 0 && rows[0].level >= ADMIN_ROLE_LEVEL) return;
  } catch (e) { logger.error(e, "assertAdmin role-level query failed"); }
  if (ADMIN_ROLES.includes(scope.role)) return;
  throw new ForbiddenError("غير مصرح: صلاحيات المسؤول مطلوبة");
}

async function userBelongsToCompany(userId: number, companyId: number): Promise<boolean> {
  const [row] = await rawQuery(
    `SELECT 1 FROM users u
     INNER JOIN employees e ON e.id = u."employeeId"
     INNER JOIN employee_assignments ea ON ea."employeeId" = e.id
     WHERE u.id = $1 AND ea."companyId" = $2 LIMIT 1`,
    [userId, companyId]
  );
  return !!row;
}

router.get("/users", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    await assertAdmin(req);
    const scope = req.scope!;
    // Pre-aggregate failed-login counts once instead of running the
    // scalar subquery per row. The original SELECT-list correlated
    // subquery was N+1: postgres planned one execution PER returned
    // user, so 500 users == 501 index lookups into security_log over
    // a 7-day window. The CTE below scans the table once filtered to
    // that same window and joins per-user counts back.
    const rows = await rawQuery(`
      WITH failed_login_counts AS (
        SELECT "userId", COUNT(*) AS "failedAttempts7d"
        FROM security_log
        WHERE reason = 'auth_failed'
          AND "createdAt" > NOW() - INTERVAL '7 days'
        GROUP BY "userId"
      )
      SELECT DISTINCT u.id, u.email, u.role, u."isActive", u."lastLoginAt", u."createdAt", u."employeeId",
             e.name AS "employeeName", e."empNumber",
             COALESCE(flc."failedAttempts7d", 0)::int AS "failedAttempts7d"
      FROM users u
      LEFT JOIN employees e ON e.id = u."employeeId"
      LEFT JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea."companyId" = $1
      LEFT JOIN failed_login_counts flc ON flc."userId" = u.id
      WHERE ea."companyId" = $1
         OR u.id IN (SELECT "userId" FROM rbac_user_roles WHERE "companyId" = $1)
      ORDER BY u."createdAt" DESC
      LIMIT 500
    `, [scope.companyId]);
    res.json(maskFields(req, { data: rows, total: rows.length, page: 1, pageSize: rows.length }));
  } catch (e: any) { logger.error(e, "Get users error"); handleRouteError(e, res, "خطأ غير متوقع"); }
});

router.post("/users", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    await assertAdmin(req);
    const scope = req.scope!;
    const parsed = zodParse(createUserSchema.safeParse(req.body));
    const { email, role, password, employeeId } = parsed;
    if (employeeId) {
      const [empCheck] = await rawQuery(
        `SELECT 1 FROM employee_assignments WHERE "employeeId" = $1 AND "companyId" = $2 LIMIT 1`,
        [employeeId, scope.companyId]
      );
      if (!empCheck) { throw new ForbiddenError("الموظف لا ينتمي لشركتك"); }
    }
    const isAutoGenerated = !password;
    const tempPassword = password || crypto.randomBytes(16).toString('hex');
    const hashed = await hashPassword(tempPassword);
    const newUserId = await withTransaction(async (tx) => {
      const userRes = await tx.query(
        `INSERT INTO users (email, "passwordHash", role, "employeeId", "isActive") VALUES ($1,$2,$3,$4,true) RETURNING id`,
        [email, hashed, role || "employee", employeeId || null]
      );
      const userId = userRes.rows[0].id;
      const assignedRole = role || "employee";
      // Resolve (or lazily seed) the v2 role for this company, then bind the
      // user to it (#1791 — legacy user_roles/custom_roles removed; rbac_roles
      // is the single source for role label/level).
      let { rows: roleRows } = await tx.query<{ id: number }>(
        `SELECT id FROM rbac_roles WHERE "companyId" = $1 AND role_key = $2`,
        [scope.companyId, assignedRole]
      );
      if (!roleRows[0]) {
        const def = PREDEFINED_ROLES.find((r) => r.roleKey === assignedRole);
        await tx.query(
          `INSERT INTO rbac_roles ("companyId", role_key, label_ar, level, color, is_system)
           VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT ("companyId", role_key) DO NOTHING`,
          [scope.companyId, assignedRole, def?.label || assignedRole, def?.level ?? 10, "#3b82f6", !!def]
        );
        ({ rows: roleRows } = await tx.query<{ id: number }>(
          `SELECT id FROM rbac_roles WHERE "companyId" = $1 AND role_key = $2`,
          [scope.companyId, assignedRole]
        ));
      }
      if (roleRows[0]) {
        await tx.query(
          `INSERT INTO rbac_user_roles ("userId", "companyId", role_id, is_primary)
           VALUES ($1, $2, $3, true)
           ON CONFLICT ("userId", "companyId", role_id) DO NOTHING`,
          [userId, scope.companyId, roleRows[0].id]
        );
      }
      return userId;
    });
    const r = { insertId: newUserId };
    let inviteWarning: string | null = null;
    if (isAutoGenerated) {
      // #2137 slice 2: NEVER email a raw password. Instead issue a
      // single-use, short-lived invitation token and send a link the
      // user clicks to SET their own password. The account is created
      // active with an unknown random password (above); the link is the
      // only way in until they set one. issueAuthToken builds the link
      // first, so an empty PUBLIC_BASE_URL fails before any token row is
      // written — we surface a warning instead of a broken email.
      try {
        const issued = await issueAuthToken({ userId: r.insertId, email, purpose: "invitation" });
        await sendAuthEmail({
          companyId: scope.companyId,
          userId: scope.userId,
          recipientEmail: email,
          recipientName: email,
          templateKey: "auth.new_user_invitation.email",
          vars: { userName: email, activationUrl: issued.url, expiresHours: String(TOKEN_TTL_MINUTES.invitation / 60) },
        });
      } catch (e) {
        if (e instanceof PublicBaseUrlMissingError) {
          inviteWarning = "تعذّر إرسال رابط الدعوة: رابط النظام العام (PUBLIC_BASE_URL) غير مضبوط. اضبطه ثم أعد إرسال الدعوة.";
          logger.error("[admin/users] PUBLIC_BASE_URL empty — invitation link not sent");
        } else {
          logger.error(e, "Failed to send invitation email");
          inviteWarning = "أُنشئ الحساب لكن تعذّر إرسال رابط الدعوة.";
        }
      }
    }
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "create", entity: "users", entityId: r.insertId,
      after: { email, role: role || "employee", employeeId: employeeId || null },
    }).catch((e) => logger.error(e, "admin background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "admin.user.created",
      entity: "users",
      entityId: r.insertId,
      details: JSON.stringify({ email, role: role || "employee" }),
    }).catch((e) => logger.error(e, "admin background task failed"));
    res.status(201).json({
      id: r.insertId,
      email,
      role,
      message: inviteWarning
        ? inviteWarning
        : isAutoGenerated
          ? "تم إنشاء الحساب وأُرسلت دعوة لتعيين كلمة المرور إلى بريد المستخدم."
          : "تم إنشاء الحساب بنجاح.",
    });
  } catch (e: any) { logger.error(e, "Create user error"); handleRouteError(e, res, "خطأ غير متوقع"); }
});

router.patch("/users/:id", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    await assertAdmin(req);
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [userBelongs] = await rawQuery(
      `SELECT 1 FROM users u
       LEFT JOIN employees e ON e.id = u."employeeId"
       LEFT JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea."companyId" = $2
       WHERE u.id = $1 AND (
         ea."companyId" = $2
         OR u.id IN (SELECT "userId" FROM rbac_user_roles WHERE "companyId" = $2)
       ) LIMIT 1`,
      [id, scope.companyId]
    );
    if (!userBelongs) { throw new ForbiddenError("المستخدم لا ينتمي لشركتك"); }
    const { isActive, role, employeeId, email } = zodParse(updateUserSchema.safeParse(req.body));
    if (employeeId) {
      const [empCheck] = await rawQuery(
        `SELECT 1 FROM employee_assignments WHERE "employeeId" = $1 AND "companyId" = $2 LIMIT 1`,
        [employeeId, scope.companyId]
      );
      if (!empCheck) { throw new ForbiddenError("الموظف لا ينتمي لشركتك"); }
    }
    let normalizedEmail: string | undefined;
    if (email !== undefined) {
      // users.email is the login identifier AND the recipient of every
      // system link email (reset/invitation/activation). Normalize + enforce
      // uniqueness so a changed login can't collide with another account.
      normalizedEmail = email.trim().toLowerCase();
      const [dup] = await rawQuery(
        `SELECT id FROM users WHERE LOWER(email) = $1 AND id <> $2 LIMIT 1`,
        [normalizedEmail, id]
      );
      if (dup) { throw new ValidationError("البريد الإلكتروني مستخدم لحساب آخر"); }
    }
    const sets: string[] = [];
    const params: unknown[] = [];
    if (isActive !== undefined) { params.push(isActive); sets.push(`"isActive"=$${params.length}`); }
    if (role !== undefined) { params.push(role); sets.push(`role=$${params.length}`); }
    if (employeeId !== undefined) { params.push(employeeId || null); sets.push(`"employeeId"=$${params.length}`); }
    if (normalizedEmail !== undefined) { params.push(normalizedEmail); sets.push(`email=$${params.length}`); }
    if (!sets.length) { throw new ValidationError("لا توجد بيانات للتحديث"); }
    params.push(id);
    await withTransaction(async (tx) => {
      const userRes = await tx.query(`UPDATE users SET ${sets.join(",")} WHERE id=$${params.length} RETURNING id`, params);
      if (!userRes.rowCount) throw new NotFoundError("المستخدم غير موجود");
      if (isActive === false) {
        await tx.query(`UPDATE refresh_tokens SET "revokedAt" = NOW() WHERE "userId" = $1 AND "revokedAt" IS NULL`, [id]);
      }
      if (role !== undefined) {
        // Resolve/seed the v2 role, then make it the user's role for this
        // company (#1791 — legacy user_roles/custom_roles removed).
        let { rows: roleRows } = await tx.query<{ id: number }>(
          `SELECT id FROM rbac_roles WHERE "companyId" = $1 AND role_key = $2`,
          [scope.companyId, role]
        );
        if (!roleRows[0]) {
          const def = PREDEFINED_ROLES.find((r) => r.roleKey === role);
          await tx.query(
            `INSERT INTO rbac_roles ("companyId", role_key, label_ar, level, color, is_system)
             VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT ("companyId", role_key) DO NOTHING`,
            [scope.companyId, role, def?.label || role, def?.level ?? 10, "#3b82f6", !!def]
          );
          ({ rows: roleRows } = await tx.query<{ id: number }>(
            `SELECT id FROM rbac_roles WHERE "companyId" = $1 AND role_key = $2`,
            [scope.companyId, role]
          ));
        }
        if (roleRows[0]) {
          await tx.query(
            `DELETE FROM rbac_user_roles WHERE "userId" = $1 AND "companyId" = $2`,
            [id, scope.companyId]
          );
          await tx.query(
            `INSERT INTO rbac_user_roles ("userId", "companyId", role_id, is_primary)
             VALUES ($1, $2, $3, true)`,
            [id, scope.companyId, roleRows[0].id]
          );
        }
      }
    });
    // A role change must be live immediately, not after the 30s permission-cache
    // TTL — invalidate the engine grant cache (company-wide version bump, like
    // the rbac/v2 grant path) + the per-user roleGuard cache. The old inline
    // DELETE+INSERT here skipped this, so a changed role stayed stale for ~30s.
    if (role !== undefined) {
      await bumpCacheVersion(scope.companyId).catch((e) => logger.error(e, "[admin] bumpCacheVersion after role change failed"));
      invalidateRoleCache(id);
    }
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "update", entity: "users", entityId: id,
      after: { isActive, role, employeeId, email: normalizedEmail },
    }).catch((e) => logger.error(e, "admin background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "admin.user.updated",
      entity: "users",
      entityId: id,
      details: JSON.stringify({ isActive, role, employeeId }),
    }).catch((e) => logger.error(e, "admin background task failed"));
    res.json({ success: true });
  } catch (e: any) { handleRouteError(e, res, "خطأ غير متوقع"); }
});

router.delete("/users/:id", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    await assertAdmin(req);
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    if (id === scope.userId) { throw new ValidationError("لا يمكنك حذف حسابك الخاص"); }
    const [userBelongs] = await rawQuery(
      `SELECT 1 FROM users u
       LEFT JOIN employees e ON e.id = u."employeeId"
       LEFT JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea."companyId" = $2
       WHERE u.id = $1 AND (
         ea."companyId" = $2
         OR u.id IN (SELECT "userId" FROM rbac_user_roles WHERE "companyId" = $2)
       ) LIMIT 1`,
      [id, scope.companyId]
    );
    if (!userBelongs) { throw new ForbiddenError("المستخدم لا ينتمي لشركتك"); }
    await withTransaction(async (tx) => {
      await tx.query(
        `DELETE FROM rbac_user_roles WHERE "userId"=$1 AND "companyId"=$2`,
        [id, scope.companyId]
      );
      // ملاحظة معمارية (مادة 4–9 + 18): هذا الإجراء «إلغاء وصول» لا «حذف موظف».
      // إلغاء الوصول = سحب أدوار RBAC + إبطال الجلسات (أدناه). أما تكليفات الموظف
      // (employee_assignments) فهي بيانات تشغيلية مملوكة لمسار الموارد البشرية،
      // ولا يجوز لمسار الإدارة (خادم) أن يحذفها فيزيائيًا عبر حدود المسار. أي
      // إنهاء خدمة فعلي يتولاه HR عبر تدفّقه الخاص، ويمكنه الاشتراك في الحدث
      // المُصدَر أدناه (admin.user.deleted) للتفاعل ضمن اختصاصه.
      await tx.query(
        `UPDATE refresh_tokens SET "revokedAt" = NOW() WHERE "userId" = $1 AND "revokedAt" IS NULL`,
        [id]
      );
    });
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "delete", entity: "users", entityId: id,
    }).catch((e) => logger.error(e, "admin background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "admin.user.deleted",
      entity: "users",
      entityId: id,
    }).catch((e) => logger.error(e, "admin background task failed"));
    res.json({ success: true, message: "تم إلغاء وصول المستخدم في شركتك" });
  } catch (e: any) { handleRouteError(e, res, "خطأ غير متوقع"); }
});

router.post("/users/:id/reset-password", resetPasswordLimiter, authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    await assertAdmin(req);
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [userBelongs] = await rawQuery(
      `SELECT 1 FROM users u
       LEFT JOIN employees e ON e.id = u."employeeId"
       LEFT JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea."companyId" = $2
       WHERE u.id = $1 AND (
         ea."companyId" = $2
         OR u.id IN (SELECT "userId" FROM rbac_user_roles WHERE "companyId" = $2)
       ) LIMIT 1`,
      [id, scope.companyId]
    );
    if (!userBelongs) { throw new ForbiddenError("المستخدم لا ينتمي لشركتك"); }
    const parsed = zodParse(resetPasswordSchema.safeParse(req.body));
    const { newPassword } = parsed;
    const hashed = await hashPassword(newPassword);
    // Atomic: rotate password AND revoke existing refresh tokens together.
    // Same reasoning as /auth/change-password — half-applied state would
    // leave old tokens valid after a forced password reset, defeating the
    // point of the reset.
    await withTransaction(async (client) => {
      const { rowCount: passwordUpdated } = await client.query(
        `UPDATE users SET "passwordHash"=$1 WHERE id=$2`,
        [hashed, id],
      );
      if (!passwordUpdated) throw new NotFoundError("المستخدم غير موجود");
      await client.query(
        `UPDATE refresh_tokens SET "revokedAt" = NOW() WHERE "userId" = $1 AND "revokedAt" IS NULL`,
        [id],
      );
    });
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "password_reset", entity: "users", entityId: id,
    }).catch((e) => logger.error(e, "admin background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "admin.user.password_reset",
      entity: "users",
      entityId: id,
    }).catch((e) => logger.error(e, "admin background task failed"));
    res.json({ success: true, message: "تم إعادة تعيين كلمة المرور بنجاح" });
  } catch (e: any) { handleRouteError(e, res, "خطأ غير متوقع"); }
});

router.get("/roles", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    await assertAdmin(req);
    const scope = req.scope!;
    const rows = await rawQuery(
      `SELECT id, role_key AS "roleKey", label_ar AS label, level, color, is_system AS "isSystem"
         FROM rbac_roles WHERE "companyId" = $1 AND is_active = TRUE AND is_template = FALSE
        ORDER BY level DESC, label_ar LIMIT 500`,
      [scope.companyId]
    );
    res.json(maskFields(req, { data: rows, total: rows.length, page: 1, pageSize: rows.length }));
  } catch (e: any) { logger.error(e, "Get roles error"); handleRouteError(e, res, "خطأ غير متوقع"); }
});

// POST /roles (custom_roles create) removed in #1791 — custom roles are now
// created/edited via the RBAC v2 editor (/api/admin/rbac/v2). createCustomRoleSchema
// above is now unused (kept harmless; noUnusedLocals is off).

const PREDEFINED_ROLES = [
  { roleKey: "owner", label: "مالك النظام", modules: ["home","hr","finance","fleet","property","operations","warehouse","governance","bi","requests","documents","reports","admin","comms","legal","crm","marketing","store","support","settings"], level: 100 },
  { roleKey: "general_manager", label: "مدير عام", modules: ["home","hr","finance","fleet","property","operations","warehouse","governance","bi","requests","documents","reports","comms","legal","crm","marketing","store","support","settings"], level: 90 },
  { roleKey: "hr_manager", label: "مدير الموارد البشرية", modules: ["home","hr","requests","documents","comms"], level: 70 },
  { roleKey: "finance_manager", label: "مدير المالية", modules: ["home","finance","requests","documents","comms"], level: 70 },
  { roleKey: "fleet_manager", label: "مدير الأسطول", modules: ["home","fleet","requests","documents","comms"], level: 70 },
  { roleKey: "property_manager", label: "مدير الأملاك", modules: ["home","property","requests","documents","comms"], level: 70 },
  { roleKey: "projects_manager", label: "مدير المشاريع", modules: ["home","operations","requests","documents","comms"], level: 70 },
  { roleKey: "warehouse_manager", label: "مدير المستودعات", modules: ["home","warehouse","store","requests","documents","comms"], level: 70 },
  { roleKey: "legal_manager", label: "مدير الشؤون القانونية", modules: ["home","legal","governance","requests","documents","comms"], level: 70 },
  { roleKey: "support_manager", label: "مدير الدعم الفني", modules: ["home","support","requests","documents","comms"], level: 70 },
  { roleKey: "crm_manager", label: "مدير المبيعات", modules: ["home","crm","marketing","requests","documents","comms"], level: 70 },
  { roleKey: "bi_manager", label: "مدير ذكاء الأعمال", modules: ["home","bi","reports","requests","documents","comms"], level: 70 },
  { roleKey: "branch_manager", label: "مدير فرع", modules: ["home","hr","finance","requests","documents","comms","support"], level: 60 },
  // Self-service driver — sees only their assigned trips + cargo via
  // /me/driver (fleet.trips.my, fleet.cargo.my, fleet.driver.me from
  // the featureCatalog self-service floor). `home` keeps the basic
  // notifications surface; `requests` lets them file leave/expense.
  { roleKey: "driver", label: "سائق", modules: ["home","fleet","requests","documents","comms"], level: 10 },
  { roleKey: "employee", label: "موظف", modules: ["home","requests","documents","comms"], level: 10 },
];

router.get("/predefined-roles", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    await assertAdmin(req);
    const scope = req.scope!;
    const customRows = await rawQuery<Record<string, unknown>>(
      `SELECT r.role_key AS "roleKey", r.label_ar AS label, r.level,
              COALESCE((SELECT to_jsonb(array_agg(DISTINCT split_part(g.feature_key, '.', 1)))
                 FROM rbac_role_grants g WHERE g.role_id = r.id), '[]'::jsonb) AS modules
         FROM rbac_roles r
        WHERE r."companyId"=$1 AND r.is_active = TRUE AND r.is_template = FALSE AND r.is_system = FALSE
        ORDER BY r.level DESC LIMIT 500`,
      [scope.companyId]
    ).catch((e) => { logger.error(e, "admin query failed"); return [] as any[]; });
    const customRoles = customRows.map((r: Record<string, unknown>) => ({
      roleKey: r.roleKey,
      label: r.label,
      level: r.level,
      modules: (() => {
        let m = typeof r.modules === "string" ? JSON.parse(r.modules || "[]") : r.modules;
        if (m && typeof m === "object" && !Array.isArray(m) && m.all === true) return undefined;
        return Array.isArray(m) ? m : [];
      })(),
      isCustom: true,
    }));
    const existing = new Set(customRoles.map((r: Record<string, unknown>) => r.roleKey));
    const predefined = PREDEFINED_ROLES.filter(r => !existing.has(r.roleKey));
    res.json(maskFields(req, { data: [...customRoles, ...predefined] }));
  } catch (err) { handleRouteError(err, res, "admin"); }
});

router.get("/user-roles/:userId", authorize({ feature: "admin", action: "view" }), async (req, res) => {
  try {
    await assertAdmin(req);
    const scope = req.scope!;
    const userId = parseId(req.params.userId, "userId");
    if (!userId || isNaN(userId)) { throw new ValidationError("معرف غير صالح"); }
    if (!await userBelongsToCompany(userId, scope.companyId)) {
      throw new ForbiddenError("المستخدم لا ينتمي لشركتك");
    }
    const rows = await rawQuery(
      `SELECT ur.id AS id, r.role_key AS "roleKey", r.label_ar AS label, r.level
         FROM rbac_user_roles ur JOIN rbac_roles r ON r.id = ur.role_id
        WHERE ur."userId"=$1 AND ur."companyId"=$2
          AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
        ORDER BY r.level DESC LIMIT 500`,
      [userId, scope.companyId]
    );
    res.json(maskFields(req, { data: rows }));
  } catch (err) { handleRouteError(err, res, "admin"); }
});

router.post("/user-roles", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    await assertAdmin(req);
    const scope = req.scope!;
    const { userId, roleKey } = zodParse(createUserRoleSchema.safeParse(req.body));
    if (!await userBelongsToCompany(userId, scope.companyId)) {
      throw new ForbiddenError("المستخدم لا ينتمي لشركتك");
    }
    // Resolve the v2 role id; seed it from the predefined catalog if this company
    // doesn't have it yet, so assignment works on a fresh tenant (#1791). Seed +
    // grant run atomically (rawQuery/rawExecute join the ambient transaction via
    // txStore), so a failed grant never leaves a half-applied seed. The actual
    // grant goes through the central rbacService.grantUserRole — same owner as
    // employees.ts / onboard — which enforces SoD AND invalidates both permission
    // caches so the grant is live immediately rather than after the 30s TTL
    // (the old inline INSERT here skipped cache invalidation entirely).
    const roleRow = await withTransaction(async () => {
      let [row] = await rawQuery<{ id: number; label: string }>(
        `SELECT id, label_ar AS label FROM rbac_roles WHERE "companyId"=$1 AND role_key=$2 LIMIT 1`,
        [scope.companyId, roleKey]
      );
      if (!row) {
        const def = PREDEFINED_ROLES.find((r) => r.roleKey === roleKey);
        if (!def) { throw new ValidationError("دور غير معروف"); }
        await rawExecute(
          `INSERT INTO rbac_roles ("companyId", role_key, label_ar, level, color, is_system)
           VALUES ($1,$2,$3,$4,'#3b82f6',true)
           ON CONFLICT ("companyId", role_key) DO NOTHING`,
          [scope.companyId, def.roleKey, def.label, def.level]
        );
        [row] = await rawQuery<{ id: number; label: string }>(
          `SELECT id, label_ar AS label FROM rbac_roles WHERE "companyId"=$1 AND role_key=$2 LIMIT 1`,
          [scope.companyId, roleKey]
        );
      }
      if (!row) { throw new ValidationError("دور غير معروف"); }
      // #1605 — Separation-of-Duties. Unlike the bulk creation paths (soft-skip),
      // this is an explicit single-role admin action, so an SoD conflict is a
      // HARD failure (403) rather than a silent skip.
      const result = await grantUserRole({
        userId,
        roleKey,
        companyId: scope.companyId,
        assignedBy: scope.userId,
      });
      if (!result.ok) {
        if (result.error === "sod_conflict") throw new ForbiddenError(result.reasonAr ?? "تعارض فصل المهام");
        throw new ValidationError(result.reasonAr ?? "تعذّر منح الدور");
      }
      return row;
    });
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "update", entity: "roles", entityId: userId,
      after: { roleKey, label: roleRow.label },
    }).catch((e) => logger.error(e, "admin background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "admin.user_role.assigned",
      entity: "rbac_user_roles",
      entityId: userId,
      details: JSON.stringify({ roleKey, label: roleRow.label }),
    }).catch((e) => logger.error(e, "admin background task failed"));
    res.status(201).json({ userId, roleKey, label: roleRow.label });
  } catch (err) { handleRouteError(err, res, "admin"); }
});

router.delete("/user-roles/:id", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    await assertAdmin(req);
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    if (!id || isNaN(id)) { throw new ValidationError("معرف غير صالح"); }
    const [roleRecord] = await rawQuery(
      `SELECT id FROM rbac_user_roles WHERE id=$1 AND "companyId"=$2 LIMIT 1`,
      [id, scope.companyId]
    );
    if (!roleRecord) { throw new ForbiddenError("غير مصرح: الدور لا ينتمي لشركتك"); }
    const result = await rawExecute(`DELETE FROM rbac_user_roles WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    if (result.affectedRows === 0) { throw new NotFoundError("الدور غير موجود"); }
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "delete", entity: "roles", entityId: id,
    }).catch((e) => logger.error(e, "admin background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "admin.user_role.deleted",
      entity: "user_roles",
      entityId: id,
    }).catch((e) => logger.error(e, "admin background task failed"));
    res.json({ message: "تم حذف الدور بنجاح" });
  } catch (err) { handleRouteError(err, res, "admin"); }
});

router.get("/integrations", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    await assertAdmin(req);
    const scope = req.scope!;
    const rows = await rawQuery(
      `SELECT id, "companyId", type, name, status, "lastSuccessAt", "lastFailureAt", "retryCount", "maxRetries", "createdAt", "updatedAt" FROM integrations WHERE "companyId"=$1 ORDER BY "createdAt" DESC LIMIT 500`,
      [scope.companyId]
    );
    res.json(maskFields(req, { data: rows, total: rows.length }));
  } catch (err) { handleRouteError(err, res, "admin"); }
});

router.post("/integrations", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    await assertAdmin(req);
    const scope = req.scope!;
    const { type, name, config, status, maxRetries } = zodParse(createIntegrationSchema.safeParse(req.body ?? {}));
    // RD3-04 — encrypt sensitive fields inside `config` before persisting.
    // Plaintext was readable from any DB dump or SQL-injection sink.
    const safeConfig = encryptIntegrationConfig(config as Record<string, unknown> | undefined);
    const r = await rawExecute(
      `INSERT INTO integrations ("companyId",type,name,config,status,"maxRetries")
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [scope.companyId, type, name, JSON.stringify(safeConfig), status || "inactive", maxRetries || 3]
    );
    const [row] = await rawQuery(`SELECT id, "companyId", type, name, status, "lastSuccessAt", "lastFailureAt", "retryCount", "maxRetries", "createdAt", "updatedAt" FROM integrations WHERE id=$1 AND "companyId"=$2`, [r.insertId, scope.companyId]);
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "create", entity: "integrations", entityId: r.insertId,
      after: { type, name, status: status || "inactive" },
    }).catch((e) => logger.error(e, "admin background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "admin.integration.created",
      entity: "integrations",
      entityId: r.insertId,
      details: JSON.stringify({ type, name, status: status || "inactive" }),
    }).catch((e) => logger.error(e, "admin background task failed"));
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "admin"); }
});

router.patch("/integrations/:id", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    await assertAdmin(req);
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(updateIntegrationSchema.safeParse(req.body ?? {}));
    const sets: string[] = [];
    const params: unknown[] = [];
    if (b.name !== undefined) { params.push(b.name); sets.push(`name=$${params.length}`); }
    if (b.type !== undefined) { params.push(b.type); sets.push(`type=$${params.length}`); }
    if (b.config !== undefined) {
      // RD3-04 — same encryption pass as the create path.
      const safeConfig = encryptIntegrationConfig(b.config as Record<string, unknown> | undefined);
      params.push(JSON.stringify(safeConfig));
      sets.push(`config=$${params.length}`);
    }
    if (b.status !== undefined) { params.push(b.status); sets.push(`status=$${params.length}`); }
    if (b.maxRetries !== undefined) { params.push(b.maxRetries); sets.push(`"maxRetries"=$${params.length}`); }
    sets.push(`"updatedAt"=NOW()`);
    if (sets.length === 1) { throw new ValidationError("لا توجد بيانات"); }
    params.push(id); params.push(scope.companyId);
    await rawExecute(
      `UPDATE integrations SET ${sets.join(",")} WHERE id=$${params.length - 1} AND "companyId"=$${params.length}`,
      params
    );
    const [row] = await rawQuery(`SELECT id, "companyId", type, name, status, "lastSuccessAt", "lastFailureAt", "retryCount", "maxRetries", "createdAt", "updatedAt" FROM integrations WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "update", entity: "integrations", entityId: id,
      after: { name: b.name, type: b.type, status: b.status },
    }).catch((e) => logger.error(e, "admin background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "admin.integration.updated",
      entity: "integrations",
      entityId: id,
      details: JSON.stringify({ name: b.name, type: b.type, status: b.status }),
    }).catch((e) => logger.error(e, "admin background task failed"));
    res.json(maskFields(req, row));
  } catch (err) { handleRouteError(err, res, "admin"); }
});

router.delete("/integrations/:id", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    await assertAdmin(req);
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const result = await rawExecute(
      `DELETE FROM integrations WHERE id=$1 AND "companyId"=$2`,
      [id, scope.companyId]
    );
    if (result.affectedRows === 0) { throw new NotFoundError("التكامل غير موجود"); }
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "delete", entity: "integrations", entityId: id,
    }).catch((e) => logger.error(e, "admin background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "admin.integration.deleted",
      entity: "integrations",
      entityId: id,
    }).catch((e) => logger.error(e, "admin background task failed"));
    res.json({ message: "تم حذف التكامل" });
  } catch (err) { handleRouteError(err, res, "admin"); }
});

router.post("/integrations/:id/test", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    await assertAdmin(req);
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [integration] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM integrations WHERE id=$1 AND "companyId"=$2`,
      [id, scope.companyId]
    );
    if (!integration) { throw new NotFoundError("التكامل غير موجود"); }
    const { testRecipient } = zodParse(testIntegrationSchema.safeParse(req.body ?? {}));

    const result = await integrationService.send({
      companyId: scope.companyId,
      channel: integration.type as "email" | "webhook" | "sms" | "whatsapp",
      recipient: testRecipient || "test@test.com",
      subject: "اختبار تكامل غيث ERP",
      body: "هذه رسالة اختبار من نظام غيث ERP للتحقق من إعداد التكامل.",
    });

    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "preview", entity: "gov_integrations", entityId: id,
    }).catch((e) => logger.error(e, "admin background task failed"));
    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "admin.integration.tested", entity: "gov_integrations", entityId: id,
      details: JSON.stringify({ success: result.success, channel: integration.type }),
    }).catch((e) => logger.error(e, "admin background task failed"));
    res.json({ success: result.success, error: result.error, logId: result.logId });
  } catch (err) { handleRouteError(err, res, "admin"); }
});

router.get("/integration-logs", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    await assertAdmin(req);
    const scope = req.scope!;
    const { channel, status, integrationId, limit: lim, offset: off } = req.query as Record<string, string | undefined>;
    const pageLimit = Math.min(Number(lim) || 50, 200);
    const pageOffset = Number(off) || 0;
    const conditions = [`"companyId"=$1`];
    const params: unknown[] = [scope.companyId];
    if (channel) { params.push(channel); conditions.push(`channel=$${params.length}`); }
    if (status) { params.push(status); conditions.push(`status=$${params.length}`); }
    if (integrationId) { params.push(Number(integrationId)); conditions.push(`"integrationId"=$${params.length}`); }
    const where = conditions.join(" AND ");
    const [countRow] = await rawQuery<Record<string, unknown>>(`SELECT COUNT(*) AS total FROM integration_logs WHERE ${where}`, params);
    params.push(pageLimit, pageOffset);
    const rows = await rawQuery(
      `SELECT id, "integrationId", channel, status, "errorMessage", "createdAt" FROM integration_logs WHERE ${where} ORDER BY "createdAt" DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json(maskFields(req, { data: rows, total: Number(countRow?.total ?? 0), limit: pageLimit, offset: pageOffset }));
  } catch (err) { handleRouteError(err, res, "admin"); }
});

router.post("/integration-logs/retry", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    await assertAdmin(req);
    const scope = req.scope!;
    const result = await integrationService.retryFailed(scope.companyId);
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "retry", entity: "integrations", entityId: 0,
    }).catch((e) => logger.error(e, "admin background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "admin.integration_logs.retried",
      entity: "integration_logs",
      entityId: 0,
    }).catch((e) => logger.error(e, "admin background task failed"));
    res.json(maskFields(req, result));
  } catch (err) { handleRouteError(err, res, "admin"); }
});

router.get("/system-health", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    await assertAdmin(req);

    const dbStart = Date.now();
    let dbStatus = "healthy";
    let dbLatency = 0;
    try {
      await pool.query("SELECT 1");
      dbLatency = Date.now() - dbStart;
    } catch (e) {
      logger.error(e, "admin health check DB ping failed");
      dbStatus = "error";
      dbLatency = Date.now() - dbStart;
    }

    const scope = req.scope!;
    const cid = scope.companyId;

    const [
      cronJobsRow,
      recentCrons,
      recentCronLogs,
      recentErrors,
      failedLoginsRow,
      userCountRow,
      companyCountRow,
      employeeCountRow,
      sizeRow,
      tableCountRow,
      integrationStatsRow,
      pendingMessagesRow,
    ] = await Promise.all([
      rawQuery<Record<string, unknown>>(
        `SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE "isActive" = true) as active,
          COUNT(*) FILTER (WHERE "lastStatus" = 'failed') as failed
         FROM cron_jobs`
      ).catch((e) => { logger.error(e, "admin query failed"); return [{ total: 0, active: 0, failed: 0 }]; }),

      rawQuery<Record<string, unknown>>(
        `SELECT name, "lastRunAt", "lastStatus", "lastError", schedule, "isActive"
         FROM cron_jobs ORDER BY "lastRunAt" DESC NULLS LAST LIMIT 20`
      ).catch((e) => { logger.error(e, "admin query failed"); return []; }),

      rawQuery<Record<string, unknown>>(
        `SELECT "jobName", status, duration, result, error, "createdAt"
         FROM cron_logs ORDER BY "createdAt" DESC LIMIT 20`
      ).catch((e) => { logger.error(e, "admin query failed"); return []; }),

      rawQuery<Record<string, unknown>>(
        `SELECT action, entity, details, "createdAt"
         FROM event_logs WHERE (action LIKE '%error%' OR action LIKE '%failed%')
           AND ("companyId"=$1 OR "companyId" IS NULL)
         ORDER BY "createdAt" DESC LIMIT 20`,
        [cid]
      ).catch((e) => { logger.error(e, "admin query failed"); return []; }),

      rawQuery<Record<string, unknown>>(
        `SELECT COUNT(*) as count FROM event_logs
         WHERE action IN ('login.failed','auth.failed') AND "createdAt" > NOW() - INTERVAL '24 hours'
           AND ("companyId"=$1 OR "companyId" IS NULL)`,
        [cid]
      ).catch((e) => { logger.error(e, "admin query failed"); return [{ count: 0 }]; }),

      rawQuery<Record<string, unknown>>(`SELECT COUNT(*) as count FROM users`).catch((e) => { logger.error(e, "admin query failed"); return [{ count: 0 }]; }),

      rawQuery<Record<string, unknown>>(`SELECT COUNT(*) as count FROM companies`).catch((e) => { logger.error(e, "admin query failed"); return [{ count: 0 }]; }),

      rawQuery<Record<string, unknown>>(
        `SELECT COUNT(DISTINCT e.id) as count FROM employees e JOIN employee_assignments ea ON ea."employeeId"=e.id WHERE ea."companyId"=$1 AND e."deletedAt" IS NULL`,
        [cid]
      ).catch((e) => { logger.error(e, "admin query failed"); return [{ count: 0 }]; }),

      rawQuery<Record<string, unknown>>(`SELECT pg_size_pretty(pg_database_size(current_database())) as size`).catch((e) => { logger.error(e, "admin stats: db size query failed"); return [{ size: "N/A" }]; }),

      rawQuery<Record<string, unknown>>(`SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema='public'`).catch((e) => { logger.error(e, "admin stats: table count query failed"); return [{ count: 0 }]; }),

      rawQuery<Record<string, unknown>>(
        `SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'active') as active,
          COUNT(*) FILTER (WHERE status = 'error') as errored
         FROM integrations WHERE "companyId"=$1`,
        [cid]
      ).catch((e) => { logger.error(e, "admin query failed"); return [{ total: 0, active: 0, errored: 0 }]; }),

      rawQuery<Record<string, unknown>>(
        `SELECT COUNT(*) as count FROM integration_logs WHERE status IN ('pending','retrying') AND "companyId"=$1`,
        [cid]
      ).catch((e) => { logger.error(e, "admin query failed"); return [{ count: 0 }]; }),
    ]);

    const [cronJobs] = cronJobsRow;
    const [failedLogins] = failedLoginsRow;
    const [userCount] = userCountRow;
    const [companyCount] = companyCountRow;
    const [employeeCount] = employeeCountRow;
    const dbSize = sizeRow[0]?.size || "N/A";
    const tableCount = Number(tableCountRow[0]?.count || 0);
    const [integrationStats] = integrationStatsRow;
    const [pendingMessages] = pendingMessagesRow;

    res.json(maskFields(req, {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      services: {
        api: { status: "healthy", uptime: process.uptime() },
        database: { status: dbStatus, latency: dbLatency, size: dbSize, tables: tableCount },
        crons: {
          total: Number(cronJobs?.total || 0),
          active: Number(cronJobs?.active || 0),
          failed: Number(cronJobs?.failed || 0),
        },
        integrations: {
          total: Number(integrationStats?.total || 0),
          active: Number(integrationStats?.active || 0),
          errored: Number(integrationStats?.errored || 0),
          pendingMessages: Number(pendingMessages?.count || 0),
        },
        // Rate-limit backend status. `fallback-memory` means caps are still
        // enforced but only per-process — the operator should investigate
        // why Redis is unreachable. See lib/rateLimitStore.ts.
        redisRateLimit: getRedisRateLimitStatus(),
      },
      cronJobs: recentCrons,
      recentCronLogs,
      recentErrors,
      security: {
        failedLogins24h: Number(failedLogins?.count || 0),
      },
      counts: {
        users: Number(userCount?.count || 0),
        companies: Number(companyCount?.count || 0),
        employees: Number(employeeCount?.count || 0),
      },
    }));
  } catch (err) { handleRouteError(err, res, "admin"); }
});

router.get("/violations-report", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    await assertAdmin(req);
    const scope = req.scope!;
    const { type, priority, status, department, from, to, limit: lim, offset: off } = req.query as Record<string, string | undefined>;
    const pageLimit = Math.min(Number(lim) || 50, 200);
    const pageOffset = Number(off) || 0;

    const conditions = [`"companyId"=$1`];
    const params: unknown[] = [scope.companyId];

    if (type) { params.push(type); conditions.push(`type=$${params.length}`); }
    if (priority) { params.push(priority); conditions.push(`priority=$${params.length}`); }
    if (status) { params.push(status); conditions.push(`status=$${params.length}`); }
    if (department) { params.push(department); conditions.push(`department=$${params.length}`); }
    if (from) { params.push(from); conditions.push(`"auditDate">=$${params.length}::date`); }
    if (to) { params.push(to); conditions.push(`"auditDate"<=$${params.length}::date`); }

    const whereClause = conditions.join(" AND ");

    const paginated = [...params, pageLimit, pageOffset];
    const [
      violations,
      totalCountRow,
      summaryRow,
      byType,
      byDepartment,
      trend,
    ] = await Promise.all([
      rawQuery(
        `SELECT * FROM audit_violations WHERE ${whereClause} ORDER BY "createdAt" DESC LIMIT $${paginated.length - 1} OFFSET $${paginated.length}`,
        paginated
      ),

      rawQuery<Record<string, unknown>>(
        `SELECT COUNT(*)::int AS count FROM audit_violations WHERE ${whereClause}`,
        params
      ),

      rawQuery<Record<string, unknown>>(
        `SELECT
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE status='open') AS open,
           COUNT(*) FILTER (WHERE status='resolved') AS resolved,
           COUNT(*) FILTER (WHERE priority='critical') AS critical,
           COUNT(*) FILTER (WHERE priority='high') AS high,
           COUNT(*) FILTER (WHERE priority='medium') AS medium,
           COUNT(*) FILTER (WHERE priority='low') AS low
         FROM audit_violations WHERE "companyId"=$1 AND "auditDate"=CURRENT_DATE`,
        [scope.companyId]
      ),

      rawQuery<Record<string, unknown>>(
        `SELECT type, COUNT(*)::int AS count
         FROM audit_violations WHERE "companyId"=$1 AND status='open'
         GROUP BY type ORDER BY count DESC`,
        [scope.companyId]
      ),

      rawQuery<Record<string, unknown>>(
        `SELECT department, COUNT(*)::int AS count
         FROM audit_violations WHERE "companyId"=$1 AND status='open' AND department IS NOT NULL
         GROUP BY department ORDER BY count DESC`,
        [scope.companyId]
      ),

      rawQuery<Record<string, unknown>>(
        `SELECT "auditDate"::text AS date, COUNT(*)::int AS count
         FROM audit_violations WHERE "companyId"=$1
           AND "auditDate" >= CURRENT_DATE - INTERVAL '30 days'
         GROUP BY "auditDate" ORDER BY "auditDate"`,
        [scope.companyId]
      ),
    ]);

    const [totalCount] = totalCountRow;
    const [summary] = summaryRow;

    res.json(maskFields(req, { data: violations, summary, byType, byDepartment, trend, total: totalCount?.count || violations.length }));
  } catch (err) { handleRouteError(err, res, "admin"); }
});

router.patch("/violations/:id/resolve", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    await assertAdmin(req);
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");

    const [existing] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM audit_violations WHERE id=$1 AND "companyId"=$2`,
      [id, scope.companyId]
    );
    if (!existing) { throw new NotFoundError("المخالفة غير موجودة"); }
    if (existing.status === "resolved") { throw new ValidationError("المخالفة تم حلها مسبقاً"); }

    const { affectedRows } = await rawExecute(
      `UPDATE audit_violations SET status='resolved', "resolvedBy"=$1, "resolvedAt"=NOW() WHERE id=$2 AND "companyId"=$3 AND status != 'resolved'`,
      [scope.activeAssignmentId || scope.userId, id, scope.companyId]
    );
    if (!affectedRows) throw new ConflictError("المخالفة تم حلها مسبقاً — أعد التحميل");

    const [updated] = await rawQuery(`SELECT * FROM audit_violations WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "resolve", entity: "audit_violations", entityId: id,
      before: { status: existing.status },
      after: { status: "resolved" },
    }).catch((e) => logger.error(e, "admin background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "admin.violation.resolved",
      entity: "audit_violations",
      entityId: id,
    }).catch((e) => logger.error(e, "admin background task failed"));
    res.json(maskFields(req, updated));
  } catch (err) { handleRouteError(err, res, "admin"); }
});

// Bulk-resolve open audit violations — governance backlog cleanup (the "1307
// findings" case). Optional filters narrow to a type/priority/department;
// an empty body resolves ALL open violations for the company in one action.
const bulkResolveViolationsSchema = z.object({
  type: z.string().optional(),
  priority: z.enum(["critical", "high", "medium", "low"]).optional(),
  department: z.string().optional(),
}).strict();

router.patch("/violations/bulk-resolve", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    await assertAdmin(req);
    const scope = req.scope!;
    const f = zodParse(bulkResolveViolationsSchema.safeParse(req.body ?? {}));
    const conds = [`"companyId" = $1`, `status = 'open'`];
    const params: unknown[] = [scope.companyId];
    if (f.type) { params.push(f.type); conds.push(`type = $${params.length}`); }
    if (f.priority) { params.push(f.priority); conds.push(`priority = $${params.length}`); }
    if (f.department) { params.push(f.department); conds.push(`department = $${params.length}`); }
    params.push(scope.activeAssignmentId || scope.userId);
    const { affectedRows } = await rawExecute(
      `UPDATE audit_violations SET status='resolved', "resolvedBy"=$${params.length}, "resolvedAt"=NOW() WHERE ${conds.join(" AND ")}`,
      params
    );
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "bulk_resolve", entity: "audit_violations", entityId: scope.companyId,
      after: { resolved: affectedRows ?? 0, filters: f },
    }).catch((e) => logger.error(e, "admin background task failed"));
    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "admin.violations.bulk_resolved", entity: "audit_violations", entityId: scope.companyId,
      details: JSON.stringify({ count: affectedRows ?? 0, filters: f }),
    }).catch((e) => logger.error(e, "admin background task failed"));
    res.json({ ok: true, resolved: affectedRows ?? 0, message: `تم إغلاق ${affectedRows ?? 0} مخالفة` });
  } catch (err) { handleRouteError(err, res, "admin"); }
});

router.get("/security-log", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    await assertAdmin(req);
    const scope = req.scope!;
    const { userId, reason, from, to, page = "1", limit: lim = "50" } = req.query as Record<string, string | undefined>;
    const pageNum = Math.max(Number(page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(lim) || 50, 1), 200);
    const offset = (pageNum - 1) * pageSize;

    const conditions = [`sl."companyId" = $1`];
    const params: unknown[] = [scope.companyId];
    let paramIdx = 2;

    if (userId) { params.push(Number(userId)); conditions.push(`sl."userId" = $${paramIdx++}`); }
    if (reason) { params.push(reason); conditions.push(`sl.reason = $${paramIdx++}`); }
    if (from) { params.push(from); conditions.push(`sl."createdAt" >= $${paramIdx++}::timestamptz`); }
    if (to) { params.push(to); conditions.push(`sl."createdAt" <= $${paramIdx++}::timestamptz`); }

    const whereClause = conditions.join(" AND ");

    params.push(pageSize);
    const limitIdx = paramIdx++;
    params.push(offset);
    const offsetIdx = paramIdx++;

    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT sl.id, sl."userId", sl."companyId", sl.role, sl.path, sl.method, sl."requiredPerms", sl.reason, sl.ip, sl."createdAt",
              u.email AS "userEmail", e.name AS "userName"
       FROM security_log sl
       LEFT JOIN users u ON u.id = sl."userId"
       LEFT JOIN employees e ON e.id = u."employeeId"
       WHERE ${whereClause}
       ORDER BY sl."createdAt" DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );

    const countParams = params.slice(0, params.length - 2);
    const [countRow] = await rawQuery<Record<string, unknown>>(
      `SELECT COUNT(*) AS total FROM security_log sl WHERE ${whereClause}`,
      countParams
    );

    const [summary] = await rawQuery<Record<string, unknown>>(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE reason = 'permission_denied') AS "permissionDenied",
         COUNT(*) FILTER (WHERE reason IN ('module_access_denied','module_access_denied_no_modules')) AS "moduleDenied",
         COUNT(*) FILTER (WHERE reason = 'insufficient_level') AS "levelDenied",
         COUNT(*) FILTER (WHERE reason = 'role_required') AS "roleRequired",
         COUNT(*) FILTER (WHERE "createdAt" > NOW() - INTERVAL '24 hours') AS "last24h"
       FROM security_log WHERE "companyId" = $1`,
      [scope.companyId]
    );

    res.json(maskFields(req, {
      data: rows,
      total: Number(countRow?.total ?? 0),
      page: pageNum,
      pageSize,
      summary,
    }));
  } catch (err) { handleRouteError(err, res, "admin"); }
});

// Legacy /role-permissions CRUD (GET / POST / PUT bulk / DELETE) removed in
// #1791 — role permissions are RBAC v2 grants (rbac_role_grants) managed via the
// /api/admin/rbac/v2 editor and enforced by authzEngine. createRolePermissionSchema,
// bulkRolePermissionsSchema and invalidatePermissionCache are now unused here
// (kept harmless; noUnusedLocals is off).


// ─── Governance: Policy Audit ───────────────────────────────────────────
import { runFullPolicyAudit, ROLE_STRATEGIES, SENSITIVE_OPERATIONS, SEPARATION_OF_DUTIES } from "../lib/policyEngine.js";
import { checkSystemGuards } from "../lib/systemGovernor.js";
import { DOMAIN_REGISTRY, getSystemStats, getDomain } from "../lib/domainRegistry.js";
import { STATE_MACHINES } from "../lib/lifecycleEngine.js";
import { EVENT_CATALOG, countEventsByDomain } from "../lib/eventCatalog.js";
import { PERMISSIONS, ROLE_PERMISSIONS } from "../lib/rbacCatalog.js";
import { ENTITY_REGISTRY, getEntitiesByDomain, getMissingCoverage, getCoverageSummary } from "../lib/entityRegistry.js";

router.get("/governance/policy-audit", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const violations = await runFullPolicyAudit(scope.companyId);
    res.json(maskFields(req, { violations, total: violations.length, critical: violations.filter(v => v.severity === "critical").length }));
  } catch (err) { handleRouteError(err, res, "Policy audit error:"); }
});

router.get("/governance/role-strategies", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  res.json(maskFields(req, { strategies: ROLE_STRATEGIES, separationOfDuties: SEPARATION_OF_DUTIES, sensitiveOperations: SENSITIVE_OPERATIONS }));
});

router.get("/governance/system-guards", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const companyId = req.scope?.companyId;
    if (!companyId) {
      res.json({ allowed: true, violations: [], note: "no company scope" });
      return;
    }
    const result = await checkSystemGuards(companyId, "all", { date: todayISO() });
    res.json(maskFields(req, result));
  } catch (err: any) {
    handleRouteError(err, res, "System guards error");
  }
});

router.get("/governance/domain-registry", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    res.json(maskFields(req, { domains: DOMAIN_REGISTRY, stats: getSystemStats() }));
  } catch (err) { handleRouteError(err, res, "Domain registry error:"); }
});

router.get("/governance/gl-reconciliation", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const companyId = req.scope!.companyId;
    const mismatches = await rawQuery<Record<string, unknown>>(
      `SELECT
         coa.code,
         coa.name,
         coa."currentBalance" AS stored_balance,
         COALESCE(SUM(jl.debit) - SUM(jl.credit), 0)::numeric(15,2) AS computed_balance,
         (coa."currentBalance" - COALESCE(SUM(jl.debit) - SUM(jl.credit), 0))::numeric(15,2) AS drift
       FROM chart_of_accounts coa
       LEFT JOIN journal_lines jl ON jl."accountCode" = coa.code
         AND jl."journalId" IN (SELECT id FROM journal_entries WHERE "companyId" = $1 AND "deletedAt" IS NULL)
       WHERE coa."companyId" = $1 AND coa."deletedAt" IS NULL AND coa."allowPosting" = true
       GROUP BY coa.code, coa.name, coa."currentBalance"
       HAVING ABS(coa."currentBalance" - COALESCE(SUM(jl.debit) - SUM(jl.credit), 0)) > 0.01
       ORDER BY ABS(coa."currentBalance" - COALESCE(SUM(jl.debit) - SUM(jl.credit), 0)) DESC
       LIMIT 50`,
      [companyId]
    );
    res.json(maskFields(req, {
      healthy: mismatches.length === 0,
      driftCount: mismatches.length,
      mismatches,
    }));
  } catch (err) { handleRouteError(err, res, "GL reconciliation error:"); }
});

router.get("/governance/lifecycle-machines", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    res.json(maskFields(req, { machines: STATE_MACHINES, total: STATE_MACHINES.length }));
  } catch (err) { handleRouteError(err, res, "Lifecycle machines error:"); }
});

router.get("/governance/event-dlq", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const onlyUnresolved = req.query.unresolved !== "false";
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT id, type, "eventName", "companyId", error, "retryCount", "resolvedAt", "createdAt"
       FROM event_dlq
       WHERE ("companyId"=$1 OR "companyId" IS NULL)
         ${onlyUnresolved ? `AND "resolvedAt" IS NULL` : ""}
       ORDER BY "createdAt" DESC LIMIT 200`,
      [scope.companyId]
    );
    const summary = await rawQuery<Record<string, unknown>>(
      `SELECT "eventName", COUNT(*)::int AS count
       FROM event_dlq
       WHERE ("companyId"=$1 OR "companyId" IS NULL) AND "resolvedAt" IS NULL
       GROUP BY "eventName" ORDER BY count DESC`,
      [scope.companyId]
    );
    res.json(maskFields(req, { entries: rows, total: rows.length, summary }));
  } catch (err) { handleRouteError(err, res, "DLQ list error:"); }
});

router.post("/governance/event-dlq/:id/replay", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [entry] = await rawQuery<Record<string, unknown>>(
      `SELECT id, "eventName", payload, "retryCount" FROM event_dlq WHERE id=$1 AND "resolvedAt" IS NULL AND ("companyId"=$2 OR "companyId" IS NULL)`,
      [id, scope.companyId]
    );
    if (!entry) throw new NotFoundError("لم يتم العثور على عنصر في قائمة الفشل");
    if (!entry.eventName) throw new ValidationError("الحدث الأصلي غير معروف، لا يمكن إعادة المحاولة");

    const { eventBus } = await import("../lib/eventBus.js");
    const payload = typeof entry.payload === "string" ? JSON.parse(entry.payload) : entry.payload;
    eventBus.emit(entry.eventName as string, payload);
    await rawExecute(
      `UPDATE event_dlq SET "retryCount"="retryCount"+1, "resolvedAt"=NOW() WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL)`,
      [id, scope.companyId]
    );
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "admin.event_dlq.replayed", entity: "event_dlq", entityId: id,
      after: { eventName: entry.eventName },
    }).catch(() => undefined);
    res.json({ replayed: true, eventName: entry.eventName });
  } catch (err) { handleRouteError(err, res, "DLQ replay error:"); }
});

router.delete("/governance/event-dlq/:id", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { affectedRows } = await rawExecute(`UPDATE event_dlq SET "resolvedAt"=NOW() WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL)`, [id, scope.companyId]);
    if (!affectedRows) throw new NotFoundError("السجل غير موجود");
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "admin.event_dlq.resolved", entity: "event_dlq", entityId: id,
    }).catch(() => undefined);
    res.json({ resolved: true });
  } catch (err) { handleRouteError(err, res, "DLQ resolve error:"); }
});

router.get("/governance/event-catalog", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const byDomain = countEventsByDomain();
    const recentEvents = await rawQuery<Record<string, unknown>>(
      `SELECT action, entity, "createdAt" FROM event_logs
       WHERE "companyId" = $1 ORDER BY "createdAt" DESC LIMIT 20`,
      [scope.companyId]
    );
    res.json(maskFields(req, {
      total: EVENT_CATALOG.length,
      byDomain,
      catalog: EVENT_CATALOG.map(e => ({ action: e.name, domain: e.domain, label: e.label, critical: e.critical })),
      recentEvents,
    }));
  } catch (err) { handleRouteError(err, res, "Event catalog error:"); }
});

router.get("/governance/rbac-matrix", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const customPerms = await rawQuery<Record<string, unknown>>(
      `SELECT r.role_key AS role, g.feature_key AS permission
         FROM rbac_roles r JOIN rbac_role_grants g ON g.role_id = r.id
        WHERE r."companyId" = $1 LIMIT 1000`,
      [scope.companyId]
    );
    res.json(maskFields(req, {
      permissions: PERMISSIONS,
      roleDefaults: ROLE_PERMISSIONS,
      customPermissions: customPerms,
      totalPermissions: PERMISSIONS.length,
      totalRoles: Object.keys(ROLE_PERMISSIONS).length,
    }));
  } catch (err) { handleRouteError(err, res, "RBAC matrix error:"); }
});

// ── System Master Registry endpoints ──

router.get("/system-registry", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const stats = getSystemStats();
    const byDomain = countEventsByDomain();

    const [tableCountRows] = await rawQuery<Record<string, unknown>>(
      `SELECT COUNT(DISTINCT tablename)::int AS c FROM pg_tables WHERE schemaname = 'public'`,
      []
    );
    const [endpointCountRows] = await rawQuery<Record<string, unknown>>(
      `SELECT COUNT(*)::int AS c FROM audit_logs WHERE "companyId" = $1`,
      [scope.companyId]
    );

    const coverageSummary = getCoverageSummary();
    res.json(maskFields(req, {
      overview: {
        domains: stats.domains,
        tables: tableCountRows?.c || stats.tables,
        lifecycleMachines: STATE_MACHINES.length,
        events: EVENT_CATALOG.length,
        eventsByDomain: byDomain,
        permissions: PERMISSIONS.length,
        roles: Object.keys(ROLE_PERMISSIONS).length,
        cronJobs: stats.cronJobs,
        glDomains: stats.glDomains,
        registeredEntities: ENTITY_REGISTRY.length,
        coverage: coverageSummary,
      },
      domains: DOMAIN_REGISTRY.map(d => ({
        id: d.id,
        label: d.label,
        tables: d.tables,
        permissions: d.permissions,
        engines: d.engines,
        cronJobs: d.cronJobs,
        glIntegration: d.glIntegration,
        obligationTypes: d.obligationTypes,
      })),
    }));
  } catch (err) { handleRouteError(err, res, "System registry error:"); }
});

router.get("/system-registry/entities", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const domain = req.query.domain as string | undefined;
    const entities = domain ? getEntitiesByDomain(domain) : ENTITY_REGISTRY;
    res.json(maskFields(req, { entities, total: entities.length }));
  } catch (err) { handleRouteError(err, res, "Entity registry error:"); }
});

router.get("/system-registry/coverage", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const gaps = getMissingCoverage();
    const summary = getCoverageSummary();
    const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
    const byCategory: Record<string, number> = {};
    for (const g of gaps) {
      bySeverity[g.severity]++;
      byCategory[g.category] = (byCategory[g.category] || 0) + 1;
    }
    res.json(maskFields(req, { gaps, total: gaps.length, bySeverity, byCategory, summary }));
  } catch (err) { handleRouteError(err, res, "Coverage analysis error:"); }
});

router.get("/system-registry/notifications", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const byDomain: Record<string, Array<{ entityId: string; entityLabel: string; notifications: string[] }>> = {};
    for (const entity of ENTITY_REGISTRY) {
      if (entity.notifications.length === 0) continue;
      if (!byDomain[entity.domain]) byDomain[entity.domain] = [];
      byDomain[entity.domain].push({
        entityId: entity.id,
        entityLabel: entity.label,
        notifications: entity.notifications,
      });
    }
    const totalTypes = ENTITY_REGISTRY.reduce((s, e) => s + e.notifications.length, 0);
    const entitiesWithNotifications = ENTITY_REGISTRY.filter(e => e.notifications.length > 0).length;
    res.json(maskFields(req, { byDomain, totalTypes, entitiesWithNotifications, totalEntities: ENTITY_REGISTRY.length }));
  } catch (err) { handleRouteError(err, res, "Notification registry error:"); }
});

router.get("/system-registry/reports", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const byDomain: Record<string, Array<{ entityId: string; entityLabel: string; reports: string[] }>> = {};
    for (const entity of ENTITY_REGISTRY) {
      if (entity.reports.length === 0) continue;
      if (!byDomain[entity.domain]) byDomain[entity.domain] = [];
      byDomain[entity.domain].push({
        entityId: entity.id,
        entityLabel: entity.label,
        reports: entity.reports,
      });
    }
    const totalReports = ENTITY_REGISTRY.reduce((s, e) => s + e.reports.length, 0);
    const entitiesWithReports = ENTITY_REGISTRY.filter(e => e.reports.length > 0).length;
    res.json(maskFields(req, { byDomain, totalReports, entitiesWithReports, totalEntities: ENTITY_REGISTRY.length }));
  } catch (err) { handleRouteError(err, res, "Report registry error:"); }
});

router.get("/system-registry/print-templates", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const templates = ENTITY_REGISTRY
      .filter(e => e.print?.hasTemplate)
      .map(e => ({
        entityId: e.id,
        entityLabel: e.label,
        domain: e.domain,
        templateKey: e.print!.templateKey,
        detailRoute: e.routes.detail,
      }));
    res.json(maskFields(req, { templates, total: templates.length }));
  } catch (err) { handleRouteError(err, res, "Print templates error:"); }
});

router.get("/system-registry/actions", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const domain = req.query.domain as string | undefined;

    let events = EVENT_CATALOG.map((e: any) => ({
      action: e.name,
      domain: e.domain,
      label: e.label,
      critical: e.critical || false,
      sideEffects: e.sideEffects || [],
    }));

    if (domain) {
      events = events.filter(e => e.domain === domain);
    }

    const recentActions = await rawQuery<Record<string, unknown>>(
      `SELECT action, entity, COUNT(*)::int AS count
       FROM event_logs WHERE "companyId" = $1
       GROUP BY action, entity ORDER BY count DESC LIMIT 30`,
      [scope.companyId]
    );

    res.json(maskFields(req, { events, total: events.length, recentActions }));
  } catch (err) { handleRouteError(err, res, "Action registry error:"); }
});

router.get("/system-registry/pages", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const pages = [
      { path: "/", component: "Dashboard", domain: "core", lazy: true },
      { path: "/hr", component: "HR", domain: "hr", lazy: true },
      { path: "/employees", component: "Employees", domain: "hr", lazy: true },
      { path: "/finance", component: "FinanceDashboard", domain: "finance", lazy: true },
      { path: "/finance/invoices", component: "Invoices", domain: "finance", lazy: true },
      { path: "/finance/journal", component: "Journal", domain: "finance", lazy: true },
      { path: "/fleet", component: "Fleet", domain: "fleet", lazy: true },
      { path: "/properties", component: "Properties", domain: "properties", lazy: true },
      { path: "/projects", component: "Projects", domain: "projects", lazy: true },
      { path: "/crm", component: "CRM", domain: "crm", lazy: true },
      { path: "/legal", component: "Legal", domain: "legal", lazy: true },
      { path: "/support", component: "Support", domain: "support", lazy: true },
      { path: "/warehouse", component: "Warehouse", domain: "warehouse", lazy: true },
      { path: "/umrah", component: "Umrah", domain: "umrah", lazy: true },
      { path: "/governance", component: "Governance", domain: "governance", lazy: true },
      { path: "/bi", component: "BI", domain: "bi", lazy: true },
      { path: "/admin", component: "Admin", domain: "admin", lazy: true, minLevel: 90 },
      { path: "/settings", component: "Settings", domain: "admin", lazy: true, minLevel: 70 },
    ];

    const domainCounts: Record<string, number> = {};
    for (const p of pages) {
      domainCounts[p.domain] = (domainCounts[p.domain] || 0) + 1;
    }

    res.json(maskFields(req, { pages, total: pages.length, byDomain: domainCounts }));
  } catch (err) { handleRouteError(err, res, "Page registry error:"); }
});

router.get("/system-registry/missing", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const tablesWithoutEvents = DOMAIN_REGISTRY.flatMap(d =>
      d.tables.filter(t =>
        !EVENT_CATALOG.some((e: any) =>
          e.name.includes(t.replace(/_/g, ".")) || e.name.includes(t.replace(/s$/, ""))
        )
      ).map(t => ({ table: t, domain: d.id }))
    );

    const [orphanNotifications] = await Promise.all([
      rawQuery<Record<string, unknown>>(
        `SELECT DISTINCT type FROM notifications
         WHERE "companyId" = $1 AND type NOT IN (
           SELECT DISTINCT type FROM notifications WHERE "companyId" = $1 AND "actionUrl" IS NOT NULL AND "actionUrl" != ''
         ) LIMIT 20`,
        [scope.companyId]
      ),
    ]);

    const lifecycleEntities = STATE_MACHINES.map((m: any) => m.entity);
    const domainsWithoutLifecycle = DOMAIN_REGISTRY
      .filter(d => !d.tables.some(t => lifecycleEntities.includes(t)))
      .map(d => ({ id: d.id, label: d.label }));

    res.json(maskFields(req, {
      tablesWithoutEvents: { items: tablesWithoutEvents, count: tablesWithoutEvents.length },
      domainsWithoutLifecycle: { items: domainsWithoutLifecycle, count: domainsWithoutLifecycle.length },
      orphanNotifications: { items: orphanNotifications || [], count: orphanNotifications?.length || 0 },
    }));
  } catch (err) { handleRouteError(err, res, "Missing registry items error:"); }
});

// ─── System Health Checks (structured pass/fail) ────────────────────────

router.get("/system-health-checks", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const checks: { name: string; status: "ok" | "warn" | "error"; detail?: string }[] = [];

    // 1. Database connectivity
    try {
      const [row] = await rawQuery<{ c: number }>("SELECT 1 AS c");
      checks.push({ name: "database", status: row?.c === 1 ? "ok" : "error", detail: row?.c === 1 ? "connected" : "query returned unexpected result" });
    } catch (e: any) {
      checks.push({ name: "database", status: "error", detail: e.message });
    }

    // 2. Domain tables exist in DB
    const allTables = DOMAIN_REGISTRY.flatMap(d => d.tables);
    const existingTables = await rawQuery<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
    );
    const existingSet = new Set(existingTables.map(t => t.tablename));
    const missingTables = allTables.filter(t => !existingSet.has(t));
    checks.push({
      name: "domain_tables",
      status: missingTables.length === 0 ? "ok" : "warn",
      detail: missingTables.length === 0
        ? `all ${allTables.length} domain tables exist`
        : `missing ${missingTables.length}: ${missingTables.slice(0, 10).join(", ")}`,
    });

    // 3. Cron jobs health
    const staleCrons = await rawQuery<{ name: string; last_run: string }>(
      `SELECT name, "lastRunAt"::text AS last_run FROM cron_jobs
       WHERE enabled = true AND "lastRunAt" < NOW() - INTERVAL '25 hours'
       ORDER BY "lastRunAt" ASC LIMIT 10`
    ).catch((e) => { logger.error(e, "admin query failed"); return [] as any[]; });
    checks.push({
      name: "cron_jobs",
      status: staleCrons.length === 0 ? "ok" : "warn",
      detail: staleCrons.length === 0
        ? "all enabled cron jobs ran within 25h"
        : `${staleCrons.length} stale: ${staleCrons.map((c) => c.name).join(", ")}`,
    });

    // 4. Failed cron jobs in last 24h
    const [failedCrons] = await rawQuery<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM cron_logs WHERE status = 'failed' AND "createdAt" > NOW() - INTERVAL '24 hours'`
    ).catch((e) => { logger.error(e, "admin query failed"); return [{ c: 0 }]; });
    checks.push({
      name: "cron_failures_24h",
      status: (failedCrons?.c ?? 0) === 0 ? "ok" : "warn",
      detail: `${failedCrons?.c ?? 0} failures in last 24h`,
    });

    // 5. DLQ unresolved entries
    const [dlqCount] = await rawQuery<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM event_dlq WHERE "resolvedAt" IS NULL AND ("companyId"=$1 OR "companyId" IS NULL)`,
      [scope.companyId]
    ).catch((e) => { logger.error(e, "admin query failed"); return [{ c: 0 }]; });
    checks.push({
      name: "event_dlq",
      status: (dlqCount?.c ?? 0) === 0 ? "ok" : (dlqCount?.c ?? 0) > 10 ? "error" : "warn",
      detail: `${dlqCount?.c ?? 0} unresolved entries`,
    });

    // 6. Financial period status
    const [activePeriod] = await rawQuery<{ status: string; endDate: string }>(
      `SELECT status, "endDate"::text FROM financial_periods
       WHERE "companyId" = $1 AND "deletedAt" IS NULL
       ORDER BY "endDate" DESC LIMIT 1`,
      [scope.companyId]
    ).catch((e) => { logger.error(e, "admin query failed"); return [null]; });
    if (activePeriod) {
      checks.push({
        name: "financial_period",
        status: activePeriod.status === "open" ? "ok" : "warn",
        detail: `latest period: ${activePeriod.status}, ends ${activePeriod.endDate}`,
      });
    } else {
      checks.push({ name: "financial_period", status: "warn", detail: "no financial periods found" });
    }

    // 7. GL balance drift (quick check — top 5 drifts)
    const drifts = await rawQuery<{ code: string; drift: number }>(
      `SELECT coa.code,
              (coa."currentBalance" - COALESCE(SUM(jl.debit) - SUM(jl.credit), 0))::numeric(15,2) AS drift
       FROM chart_of_accounts coa
       LEFT JOIN journal_lines jl ON jl."accountCode" = coa.code
         AND jl."journalId" IN (SELECT id FROM journal_entries WHERE "companyId" = $1 AND "deletedAt" IS NULL)
       WHERE coa."companyId" = $1 AND coa."deletedAt" IS NULL AND coa."allowPosting" = true
       GROUP BY coa.code, coa."currentBalance"
       HAVING ABS(coa."currentBalance" - COALESCE(SUM(jl.debit) - SUM(jl.credit), 0)) > 0.01
       LIMIT 5`,
      [scope.companyId]
    ).catch((e) => { logger.error(e, "admin query failed"); return [] as any[]; });
    checks.push({
      name: "gl_balance_drift",
      status: drifts.length === 0 ? "ok" : "warn",
      detail: drifts.length === 0 ? "no balance drift" : `${drifts.length} accounts with drift`,
    });

    // 8. Posting failures in last 24h
    const [postingFails] = await rawQuery<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM financial_posting_failures
       WHERE "companyId" = $1 AND "createdAt" > NOW() - INTERVAL '24 hours'`,
      [scope.companyId]
    ).catch((e) => { logger.error(e, "admin query failed"); return [{ c: 0 }]; });
    checks.push({
      name: "posting_failures_24h",
      status: (postingFails?.c ?? 0) === 0 ? "ok" : "warn",
      detail: `${postingFails?.c ?? 0} posting failures in last 24h`,
    });

    // 9. Domain engine coverage
    const allDeclaredEngines = new Set(DOMAIN_REGISTRY.flatMap(d => d.engines));
    const classBasedEngines = new Set([
      "financialEngine", "fleetEngine", "hrEngine", "propertiesEngine",
      "storeEngine", "crmEngine", "legalEngine", "umrahEngine",
      "projectsEngine", "warehouseEngine", "supportEngine",
    ]);
    const legacyEngines = new Set([
      "obligationsEngine", "lifecycleEngine", "workflowEngine",
      "disciplineEngine", "rulesEngine",
      "umrahCommissionEngine", "umrahImportEngine", "umrahInvoicingEngine",
    ]);
    const unimplemented = [...allDeclaredEngines].filter(
      e => !classBasedEngines.has(e) && !legacyEngines.has(e)
    );
    checks.push({
      name: "engine_coverage",
      status: unimplemented.length === 0 ? "ok" : "warn",
      detail: `${classBasedEngines.size} class-based + ${legacyEngines.size} legacy engines available` +
        (unimplemented.length > 0 ? ` — missing: ${unimplemented.join(", ")}` : ""),
    });

    const overall = checks.every(c => c.status === "ok")
      ? "healthy"
      : checks.some(c => c.status === "error")
        ? "degraded"
        : "attention";

    res.json(maskFields(req, {
      status: overall,
      timestamp: new Date().toISOString(),
      checks,
      summary: {
        ok: checks.filter(c => c.status === "ok").length,
        warn: checks.filter(c => c.status === "warn").length,
        error: checks.filter(c => c.status === "error").length,
      },
    }));
  } catch (err) { handleRouteError(err, res, "System health error:"); }
});

// ─── Domain Dependency Graph ────────────────────────────────────────────

router.get("/system-health/dependency-graph", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const graph: { from: string; to: string; via: string }[] = [];

    for (const d of DOMAIN_REGISTRY) {
      if (d.glIntegration && d.id !== "finance") {
        graph.push({ from: d.id, to: "finance", via: "GL posting" });
      }
    }

    const crossDomainEvents = EVENT_CATALOG.filter((e: any) =>
      e.consumers && e.consumers.length > 0
    );
    for (const evt of crossDomainEvents) {
      const sourceDomain = evt.domain;
      for (const consumer of evt.consumers) {
        const targetDomain = DOMAIN_REGISTRY.find(d =>
          d.engines.some(e => e.toLowerCase().includes(consumer.toLowerCase())) ||
          d.id === consumer
        );
        if (targetDomain && targetDomain.id !== sourceDomain) {
          graph.push({ from: sourceDomain, to: targetDomain.id, via: evt.name });
        }
      }
    }

    const uniqueEdges = Array.from(
      new Map(graph.map(g => [`${g.from}->${g.to}:${g.via}`, g])).values()
    );

    const nodes = [...new Set(uniqueEdges.flatMap(e => [e.from, e.to]))].map(id => {
      const d = getDomain(id);
      return { id, label: d?.label ?? id, glIntegration: d?.glIntegration ?? false };
    });

    res.json(maskFields(req, { nodes, edges: uniqueEdges, totalDependencies: uniqueEdges.length }));
  } catch (err) { handleRouteError(err, res, "Dependency graph error:"); }
});

// ============================================================================
// SYSTEM STOPS — زر الإيقاف الطارئ (Red Button)
// ============================================================================

router.get("/system-stops", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(
      `SELECT ss.*, COALESCE(emp.name, u.email) AS "activatedByName"
       FROM system_stops ss
       LEFT JOIN users u ON u.id = ss."activatedBy"
       LEFT JOIN employees emp ON emp.id = u."employeeId"
       WHERE ss."companyId" = $1
       ORDER BY ss."createdAt" DESC`,
      [scope.companyId]
    );
    res.json(maskFields(req, { data: rows }));
  } catch (err) { handleRouteError(err, res, "List system stops"); }
});

const systemStopSchema = z.object({
  scope: z.enum(["financial", "hr", "operational", "all"]).optional().default("all"),
  reason: z.string().min(1, "سبب الإيقاف مطلوب"),
});

router.post("/system-stops", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { scope: s, reason } = zodParse(systemStopSchema.safeParse(req.body));
    const [row] = await rawQuery<{ id: number }>(
      `INSERT INTO system_stops ("companyId", scope, reason, "activatedBy")
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [scope.companyId, s, reason, scope.userId]
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "system.stop.activated", entity: "system_stops", entityId: row.id, after: { scope: s, reason } }).catch((e) => logger.error(e, "audit log failed"));
    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "system.stop.activated", entity: "system_stops", entityId: row.id, details: `إيقاف نظام (${s}): ${reason}` }).catch((e) => logger.error(e, "emit event failed"));
    res.status(201).json({ id: row.id, message: `تم تفعيل إيقاف النظام — النطاق: ${s}` });
  } catch (err) { handleRouteError(err, res, "Create system stop"); }
});

router.patch("/system-stops/:id/deactivate", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    await rawExecute(
      `UPDATE system_stops SET active=false, "deactivatedBy"=$1, "deactivatedAt"=NOW(), "updatedAt"=NOW()
       WHERE id=$2 AND "companyId"=$3 AND active=true`,
      [scope.userId, id, scope.companyId]
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "system.stop.deactivated", entity: "system_stops", entityId: id, after: {} }).catch((e) => logger.error(e, "audit log failed"));
    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "system.stop.deactivated", entity: "system_stops", entityId: id, details: "إلغاء إيقاف النظام" }).catch((e) => logger.error(e, "emit event failed"));
    res.json({ message: "تم إلغاء تفعيل الإيقاف" });
  } catch (err) { handleRouteError(err, res, "Deactivate system stop"); }
});

// ============================================================================
// RBAC v2 admin completion — Ghaith Operating Foundation (#1413 §6/§8/§18)
//   - RBAC-002: POST /onboard — atomic employee + user account + roles
//   - RBAC-004: GET /users/:id/effective-permissions — grants + source role
//   - RBAC-004: POST /permissions/explain — why a user can / can't do X
// Built on the existing tables + patterns (employees / employee_assignments /
// users / rbac_user_roles). No new RBAC system. See docs/rbac/*.
// ============================================================================

// ── RBAC-002: POST /admin/onboard ───────────────────────────────────────────
const onboardSchema = z.object({
  // employee (mirrors createEmployeeSchema requireds in employees.ts)
  name: z.string().min(1, "اسم الموظف مطلوب"),
  phone: z.string().min(1, "الجوال مطلوب"),
  nationalId: z.string().min(1, "رقم الهوية مطلوب"),
  nationality: z.string().min(1, "الجنسية مطلوبة"),
  email: z.string().email("بريد إلكتروني غير صحيح"),
  branchId: z.coerce.number().int().positive().optional().nullable(),
  departmentId: z.coerce.number().int().positive().optional().nullable(),
  jobTitle: z.string().optional(),
  // Picking a configured job title auto-provisions its default RBAC role +
  // custody policy (job_titles.defaultRoleKey / opensCustody, seeded by
  // migration 249) so activating a new employee is one choice, not a manual
  // role hunt. Explicit `roles` below still override / extend it.
  jobTitleId: z.coerce.number().int().positive().optional().nullable(),
  salary: z.coerce.number().nonnegative().optional(),
  // account
  password: z.string().min(8, "كلمة المرور 8 أحرف على الأقل").optional(),
  // roles — one user, MULTIPLE roles, each with its own scope (#1413 core rule).
  // Optional: a job title with a defaultRoleKey can supply the role instead.
  roles: z
    .array(
      z.object({
        roleKey: z.string().min(1),
        branchId: z.coerce.number().int().positive().optional().nullable(),
        departmentId: z.coerce.number().int().positive().optional().nullable(),
      }),
    )
    .optional()
    .default([]),
});

router.post("/onboard", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    await assertAdmin(req);
    const scope = req.scope!;
    const d = zodParse(onboardSchema.safeParse(req.body));
    const companyId = scope.companyId;
    const defaultBranchId = d.branchId ?? scope.branchId ?? null;

    // Fast-fail: the user account is keyed by email (no username column).
    const existing = await rawQuery<{ id: number }>(
      `SELECT id FROM users WHERE email = $1 LIMIT 1`,
      [d.email],
    );
    if (existing.length > 0) {
      throw new ConflictError("البريد الإلكتروني مستخدم مسبقاً");
    }

    // ── Job-title-driven activation (migration 249) ──
    // A picked job title supplies its defaultRoleKey + opensCustody + display
    // name, so a new employee is activated with the right role automatically.
    // Explicit roles in the body still take precedence and are merged in.
    const roleKeys = new Set(d.roles.map((r) => r.roleKey));
    const wantedRoles = [...d.roles];
    let jobTitleName = d.jobTitle;
    let opensCustody = false;
    if (d.jobTitleId) {
      const [jt] = await rawQuery<{ name: string; defaultRoleKey: string | null; opensCustody: boolean }>(
        `SELECT name, "defaultRoleKey", "opensCustody" FROM job_titles
          WHERE id = $1 AND ("companyId" = $2 OR "companyId" IS NULL) LIMIT 1`,
        [d.jobTitleId, companyId],
      );
      if (!jt) throw new ValidationError(`المسمى الوظيفي غير موجود: ${d.jobTitleId}`);
      if (!jobTitleName) jobTitleName = jt.name;
      opensCustody = Boolean(jt.opensCustody);
      // Auto-add the title's default role when the admin didn't already pick it.
      if (jt.defaultRoleKey && !roleKeys.has(jt.defaultRoleKey)) {
        wantedRoles.unshift({ roleKey: jt.defaultRoleKey, branchId: null, departmentId: null });
        roleKeys.add(jt.defaultRoleKey);
      }
    }
    if (wantedRoles.length === 0) {
      throw new ValidationError("اختر دوراً واحداً على الأقل، أو مسمى وظيفياً له دور افتراضي");
    }

    // Resolve EVERY role key to an rbac_roles.id up front so a bad key fails
    // the whole request instead of half-onboarding the person (#1413 §6).
    const resolvedRoles: { roleId: number; roleKey: string; branchId: number | null; departmentId: number | null }[] = [];
    for (const r of wantedRoles) {
      const roleRow = await rawQuery<{ id: number }>(
        `SELECT id FROM rbac_roles WHERE role_key = $1 AND ("companyId" = $2 OR "companyId" IS NULL) ORDER BY "companyId" NULLS LAST LIMIT 1`,
        [r.roleKey, companyId],
      );
      if (roleRow.length === 0) {
        throw new ValidationError(`الدور غير موجود: ${r.roleKey}`);
      }
      resolvedRoles.push({
        roleId: roleRow[0].id,
        roleKey: r.roleKey,
        branchId: r.branchId ?? defaultBranchId,
        departmentId: r.departmentId ?? d.departmentId ?? null,
      });
    }

    // Mirror the proven employee-number issuance in employees.ts exactly
    // (same scheme key + timing) so onboard shares the hr.employee_code series.
    const issued = await issueNumber({
      companyId,
      branchId: defaultBranchId,
      moduleKey: "hr",
      entityKey: "employee_code",
      entityTable: "employees",
      actorId: scope.userId,
      expectedTiming: "on_draft",
    });
    const empNum = issued.number;
    const tempPassword = d.password || crypto.randomBytes(16).toString("hex");
    const hashed = await hashPassword(tempPassword);
    const primaryRole = resolvedRoles[0].roleKey;

    // Atomic: employee + assignment + user + N role bindings. Any failure rolls
    // it all back — never a person with an account but no role, nor a user row
    // pointing at an employee that didn't get created (#1413 §6).
    const out = await withTransaction(async (tx) => {
      const empRes = await tx.query(
        `INSERT INTO employees (name, phone, email, "empNumber", "nationalId", nationality, status, "companyId", "branchId")
         VALUES ($1,$2,$3,$4,$5,$6,'active',$7,$8) RETURNING id`,
        [d.name, d.phone, d.email, empNum, d.nationalId, d.nationality, companyId, defaultBranchId],
      );
      const employeeId = empRes.rows[0].id;

      await tx.query(
        `INSERT INTO employee_assignments ("employeeId","companyId","branchId","departmentId","jobTitle","jobTitleId",role,salary,"hireDate","isPrimary",status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,'active')`,
        [employeeId, companyId, defaultBranchId, d.departmentId ?? null, jobTitleName || "موظف", d.jobTitleId ?? null, primaryRole, d.salary ?? 0, todayISO()],
      );

      const userRes = await tx.query(
        `INSERT INTO users (email, "passwordHash", role, "employeeId", "isActive")
         VALUES ($1,$2,$3,$4,true) RETURNING id`,
        [d.email, hashed, primaryRole, employeeId],
      );
      const userId = userRes.rows[0].id;

      const grantedRoleKeys: string[] = [];
      const skippedRoles: { roleKey: string; reason: string }[] = [];
      // Bind every wanted role through the central RBAC service so Separation
      // of Duties is ENFORCED here exactly as it is on the manual grant path —
      // no more raw INSERT that silently bound a conflicting pair (e.g.
      // hr_manager + finance_manager) at onboarding. grantUserRole's
      // rawQuery/rawExecute join THIS transaction via rawdb's ALS executor
      // binding, so the binds commit/roll back with the rest of the onboard.
      // Soft-fail per role (mirrors employees.ts Step 8a-bis): a role rejected
      // by SoD is skipped with a warning and left for the admin — the user is
      // still onboarded and the non-conflicting roles are still granted. The
      // first SUCCESSFULLY granted role is is_primary. resolvedRoles[0] always
      // grants (first role of a brand-new user has nothing to conflict with),
      // so it stays primary and matches users.role / employee_assignments.role.
      let primaryClaimed = false;
      for (const rr of resolvedRoles) {
        const result = await grantUserRole({
          userId,
          roleKey: rr.roleKey,
          companyId,
          branchId: rr.branchId,
          departmentId: rr.departmentId,
          assignedBy: scope.userId,
          isPrimary: !primaryClaimed,
        });
        if (result.ok) {
          primaryClaimed = true;
          grantedRoleKeys.push(rr.roleKey);
        } else {
          skippedRoles.push({ roleKey: rr.roleKey, reason: result.reasonAr ?? result.error ?? "غير معروف" });
          logger.warn(
            { roleKey: rr.roleKey, companyId, userId, reason: result.error, detail: result.reasonAr },
            "[onboard] role not granted (soft-skip, SoD/unmapped) — user created, role left for admin",
          );
        }
      }

      // Job-title-driven custody account (mirrors employees.ts Step 8b). Soft —
      // the employee is still activated if the chart account 1400 is missing.
      if (opensCustody) {
        const coa = await tx.query<{ id: number }>(
          `SELECT id FROM chart_of_accounts
            WHERE "companyId" = $1 AND code = '1400' AND "deletedAt" IS NULL LIMIT 1`,
          [companyId],
        );
        if (coa.rows.length > 0) {
          await tx.query(
            `INSERT INTO subsidiary_accounts ("companyId","entityType","entityId","accountType","accountId","isActive")
             VALUES ($1,'employee',$2,'custody',$3,true) ON CONFLICT DO NOTHING`,
            [companyId, employeeId, coa.rows[0].id],
          );
        } else {
          logger.warn({ companyId }, "[onboard] chart_of_accounts 1400 missing — custody sub-account skipped");
        }
      }
      return { employeeId, userId, grantedRoleKeys, skippedRoles };
    });

    // RBAC-001: record WHICH role the actor performed this under, and the
    // truthful outcome — which roles were actually granted vs SoD-skipped.
    createAuditLog({
      companyId, userId: scope.userId, action: "create", entity: "users", entityId: out.userId,
      after: { email: d.email, employeeId: out.employeeId, roles: out.grantedRoleKeys, skippedRoles: out.skippedRoles },
      activeRoleKey: scope.selectedRoleKey ?? null,
    }).catch((e) => logger.error(e, "onboard audit failed"));
    emitEvent({
      companyId, userId: scope.userId, action: "admin.user.onboarded", entity: "users", entityId: out.userId,
      details: JSON.stringify({ email: d.email, employeeId: out.employeeId, roleCount: out.grantedRoleKeys.length, skippedCount: out.skippedRoles.length }),
    }).catch((e) => logger.error(e, "onboard event failed"));

    res.status(201).json({
      employeeId: out.employeeId,
      userId: out.userId,
      empNumber: empNum,
      roles: out.grantedRoleKeys,
      // Don't claim roles were assigned when SoD blocked some — surface them so
      // the admin knows to resolve the conflict manually.
      skippedRoles: out.skippedRoles,
      message: out.skippedRoles.length === 0
        ? "تم إنشاء الموظف والحساب والأدوار بنجاح"
        : `تم إنشاء الموظف والحساب ومنح ${out.grantedRoleKeys.length} دور؛ تعذّر منح ${out.skippedRoles.length} لتعارض فصل المهام (SoD) — أسنِدها يدويًا بعد حلّ التعارض`,
    });
  } catch (e) { logger.error(e, "onboard error"); handleRouteError(e, res, "فشل إنشاء الموظف والحساب"); }
});

// ── RBAC-004: GET /admin/users/:id/effective-permissions ────────────────────
// The merged permission set with the SOURCE role per grant — answers
// "what can this user do, and where did each grant come from?" (#1413 §8).
router.get("/users/:id/effective-permissions", authorize({ feature: "admin", action: "view" }), async (req, res) => {
  try {
    await assertAdmin(req);
    const scope = req.scope!;
    const targetUserId = parseId(req.params.id, "id");

    // Tenant isolation: only users whose employee belongs to the actor's company.
    const u = await rawQuery<{ id: number; email: string }>(
      `SELECT u.id, u.email
         FROM users u
         LEFT JOIN employee_assignments ea ON ea."employeeId" = u."employeeId"
        WHERE u.id = $1 AND (ea."companyId" = $2 OR u."employeeId" IS NULL)
        LIMIT 1`,
      [targetUserId, scope.companyId],
    );
    if (u.length === 0) throw new NotFoundError("المستخدم غير موجود");

    // Grants from the user's assigned roles (the primary source).
    const roleGrants = await rawQuery<{
      feature_key: string; actions: string[]; scope: string; conditions: unknown;
      role_key: string; label_ar: string; is_primary: boolean;
    }>(
      `SELECT g.feature_key, g.actions, g.scope, g.conditions,
              r.role_key, r.label_ar, ur.is_primary
         FROM rbac_user_roles ur
         JOIN rbac_roles r ON r.id = ur.role_id
         JOIN rbac_role_grants g ON g.role_id = r.id
        WHERE ur."userId" = $1 AND ur."companyId" = $2
          AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
        ORDER BY g.feature_key`,
      [targetUserId, scope.companyId],
    );

    // Per-user overrides (JIT grant / explicit deny) — Deny wins (#1413 §8).
    const userGrants = await rawQuery<{ feature_key: string; action: string | null; scope: string | null; type: string }>(
      `SELECT feature_key, action, scope, type
         FROM rbac_user_grants
        WHERE "userId" = $1 AND "companyId" = $2
          AND (expires_at IS NULL OR expires_at > NOW())`,
      [targetUserId, scope.companyId],
    ).catch(() => [] as { feature_key: string; action: string | null; scope: string | null; type: string }[]);

    res.json({
      userId: targetUserId,
      email: u[0].email,
      permissions: roleGrants.map((g) => ({
        feature: g.feature_key,
        actions: g.actions,
        scope: g.scope,
        conditions: g.conditions ?? null,
        source: { roleKey: g.role_key, roleLabel: g.label_ar, isPrimary: g.is_primary },
      })),
      overrides: userGrants.map((g) => ({ feature: g.feature_key, action: g.action, scope: g.scope, type: g.type })),
    });
  } catch (e) { logger.error(e, "effective-permissions error"); handleRouteError(e, res, "فشل جلب الصلاحيات النهائية"); }
});

// ── RBAC-004: POST /admin/permissions/explain ───────────────────────────────
// "Why can / can't this user do feature+action?" — resolved from the user's
// actual grants (same tables the engine reads), with the source role and the
// explicit-deny that would override it (#1413 §8). Arabic answer for non-tech.
const explainSchema = z.object({
  userId: z.coerce.number().int().positive(),
  feature: z.string().min(1),
  action: z.string().min(1),
});

router.post("/permissions/explain", authorize({ feature: "admin", action: "view" }), async (req, res) => {
  try {
    await assertAdmin(req);
    const scope = req.scope!;
    const { userId: targetUserId, feature, action } = zodParse(explainSchema.safeParse(req.body));

    const u = await rawQuery<{ id: number }>(
      `SELECT u.id FROM users u
         LEFT JOIN employee_assignments ea ON ea."employeeId" = u."employeeId"
        WHERE u.id = $1 AND (ea."companyId" = $2 OR u."employeeId" IS NULL)
        LIMIT 1`,
      [targetUserId, scope.companyId],
    );
    if (u.length === 0) throw new NotFoundError("المستخدم غير موجود");

    // Grants that match this feature, with their source role.
    const matches = await rawQuery<{ actions: string[]; scope: string; role_key: string; label_ar: string }>(
      `SELECT g.actions, g.scope, r.role_key, r.label_ar
         FROM rbac_user_roles ur
         JOIN rbac_roles r ON r.id = ur.role_id
         JOIN rbac_role_grants g ON g.role_id = r.id
        WHERE ur."userId" = $1 AND ur."companyId" = $2 AND g.feature_key = $3
          AND (ur.expires_at IS NULL OR ur.expires_at > NOW())`,
      [targetUserId, scope.companyId, feature],
    );
    const granting = matches.find((m) => Array.isArray(m.actions) && m.actions.includes(action));

    // Explicit per-user deny overrides any allow (#1413 §8).
    const denies = await rawQuery<{ action: string | null }>(
      `SELECT action FROM rbac_user_grants
        WHERE "userId" = $1 AND "companyId" = $2 AND feature_key = $3 AND type = 'revoke'
          AND (expires_at IS NULL OR expires_at > NOW())`,
      [targetUserId, scope.companyId, feature],
    ).catch(() => [] as { action: string | null }[]);
    const denied = denies.some((d) => d.action === null || d.action === action);

    const allowed = !!granting && !denied;
    let reason: string;
    if (denied) {
      reason = `ممنوع صراحةً: توجد قاعدة منع على «${feature}» تتفوّق على أي صلاحية ممنوحة.`;
    } else if (granting) {
      reason = `مسموح: الدور «${granting.label_ar}» يمنح «${action}» على «${feature}» ضمن النطاق «${granting.scope}».`;
    } else if (matches.length > 0) {
      reason = `غير مسموح: لدى المستخدم صلاحيات على «${feature}» لكن ليس الإجراء «${action}».`;
    } else {
      reason = `غير مسموح: لا يملك المستخدم أي صلاحية على «${feature}».`;
    }

    res.json({
      userId: targetUserId,
      feature,
      action,
      allowed,
      reason,
      sourceRole: granting ? { roleKey: granting.role_key, roleLabel: granting.label_ar } : null,
      scope: granting ? granting.scope : null,
      deniedByRule: denied,
    });
  } catch (e) { logger.error(e, "permission explain error"); handleRouteError(e, res, "فشل تفسير الصلاحية"); }
});

// B2 subscription status — owner-facing. Returns the current
// subscriptionStatus, trial expiry, and a derived `daysRemaining`
// so the UI banner can say "تجربتك تنتهي خلال 7 أيام".
router.get("/subscription", authorize({ feature: "admin", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const [row] = await rawQuery<{
      subscriptionStatus: string;
      subscriptionPlan: string;
      trialExpiresAt: string | null;
    }>(
      `SELECT "subscriptionStatus", "subscriptionPlan", "trialExpiresAt"
         FROM companies WHERE id = $1`,
      [scope.companyId]
    );
    if (!row) throw new NotFoundError("الشركة غير موجودة");
    const daysRemaining = row.trialExpiresAt
      ? Math.max(0, Math.ceil(
          (new Date(row.trialExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        ))
      : null;
    res.json({
      subscriptionStatus: row.subscriptionStatus,
      subscriptionPlan: row.subscriptionPlan,
      trialExpiresAt: row.trialExpiresAt,
      daysRemaining,
    });
  } catch (err) { handleRouteError(err, res, "subscription status fetch failed"); }
});

// B2 subscription extend / activate — admin-only. Until a real
// billing provider is wired, owners can manually flip status to
// 'active' (e.g. after off-platform payment) or extend the trial.
// This is the manual placeholder for the future Stripe/Tap/HyperPay
// webhook handler. Gated by `admin:update` (owner-equivalent).
router.post("/subscription/activate", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const planName = String(req.body?.plan ?? "active");
    await rawExecute(
      `UPDATE companies
          SET "subscriptionStatus" = 'active',
              "subscriptionPlan" = $1,
              "trialExpiresAt" = NULL
        WHERE id = $2`,
      [planName, scope.companyId]
    );
    invalidateSubscriptionCache(scope.companyId);
    await createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "subscription.activated", entity: "companies", entityId: scope.companyId,
      after: { subscriptionStatus: "active", plan: planName },
    }).catch(() => undefined);
    res.json({ ok: true, subscriptionStatus: "active", subscriptionPlan: planName });
  } catch (err) { handleRouteError(err, res, "activate subscription failed"); }
});

router.post("/subscription/extend-trial", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const days = Math.max(1, Math.min(365, Number(req.body?.days ?? 30)));
    await rawExecute(
      `UPDATE companies
          SET "subscriptionStatus" = 'trial',
              "trialExpiresAt" = COALESCE("trialExpiresAt", NOW()) + ($1 * INTERVAL '1 day')
        WHERE id = $2`,
      [days, scope.companyId]
    );
    invalidateSubscriptionCache(scope.companyId);
    await createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "subscription.trial_extended", entity: "companies", entityId: scope.companyId,
      after: { days },
    }).catch(() => undefined);
    res.json({ ok: true, daysExtended: days });
  } catch (err) { handleRouteError(err, res, "extend trial failed"); }
});

export default router;
