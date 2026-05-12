import { handleRouteError, ValidationError, ForbiddenError, NotFoundError, ConflictError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute, withTransaction, pool } from "../lib/rawdb.js";
import { hashPassword } from "../lib/auth.js";
import { logger } from "../lib/logger.js";
import { createPerUserLimiter } from "../lib/perUserRateLimit.js";
import { getRedisRateLimitStatus } from "../lib/rateLimitStore.js";
import { integrationService } from "../lib/integrationService.js";
import { invalidatePermissionCache } from "../middlewares/permissionMiddleware.js";
import { authorize } from "../lib/rbac/authorize.js";
import { createAuditLog, emitEvent, todayISO } from "../lib/businessHelpers.js";
import crypto from "node:crypto";
import { ADMIN_ROLES } from "../lib/rbacCatalog.js";

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
  type: z.enum(["email", "sms", "whatsapp", "webhook"]),
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
  type: z.enum(["email", "sms", "whatsapp", "webhook"]).optional(),
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
      `SELECT MAX(level) AS level FROM user_roles WHERE "userId" = $1 AND "companyId" = $2`,
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
    const rows = await rawQuery(`
      SELECT DISTINCT u.id, u.email, u.role, u."isActive", u."lastLoginAt", u."createdAt", u."employeeId",
             e.name AS "employeeName", e."empNumber",
             (SELECT COUNT(*) FROM security_log sl WHERE sl."userId" = u.id AND sl.reason = 'auth_failed' AND sl."createdAt" > NOW() - INTERVAL '7 days') AS "failedAttempts7d"
      FROM users u
      LEFT JOIN employees e ON e.id = u."employeeId"
      LEFT JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea."companyId" = $1
      WHERE ea."companyId" = $1
         OR u.id IN (SELECT "userId" FROM user_roles WHERE "companyId" = $1)
      ORDER BY u."createdAt" DESC
      LIMIT 500
    `, [scope.companyId]);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
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
      const roleDef = PREDEFINED_ROLES.find(r => r.roleKey === assignedRole) || { roleKey: assignedRole, label: assignedRole, modules: [], level: 10 };
      const customRoleRes = await tx.query(
        `SELECT label, level, modules FROM custom_roles WHERE "companyId"=$1 AND "roleKey"=$2 LIMIT 1`,
        [scope.companyId, assignedRole]
      );
      const customRoleDef = customRoleRes.rows[0];
      const finalDef = customRoleDef
        ? { roleKey: assignedRole, label: customRoleDef.label, level: customRoleDef.level, modules: Array.isArray(customRoleDef.modules) ? customRoleDef.modules : JSON.parse(customRoleDef.modules || "[]") }
        : roleDef;
      await tx.query(
        `INSERT INTO user_roles ("userId","roleKey",label,level,modules,"companyId","createdAt")
         VALUES ($1,$2,$3,$4,$5,$6,NOW())
         ON CONFLICT ("userId","roleKey","companyId") DO UPDATE SET label=EXCLUDED.label, level=EXCLUDED.level, modules=EXCLUDED.modules`,
        [userId, finalDef.roleKey, finalDef.label, finalDef.level, JSON.stringify(finalDef.modules), scope.companyId]
      );
      return userId;
    });
    const r = { insertId: newUserId };
    if (isAutoGenerated) {
      rawExecute(
        `INSERT INTO email_queue ("companyId","toEmail","recipientName",subject,body,status,"createdAt","refType","refId")
         VALUES ($1,$2,$3,$4,$5,'pending',NOW(),'user',$6)`,
        [
          scope.companyId,
          email,
          email,
          "بيانات الدخول إلى النظام",
          `مرحباً،\n\nتم إنشاء حساب لك في نظام غيث ERP.\n\nالبريد الإلكتروني: ${email}\nكلمة المرور المؤقتة: ${tempPassword}\n\nيرجى تغيير كلمة المرور فور تسجيل الدخول الأول.\n\nهذه الرسالة تلقائية، يرجى عدم الرد عليها.`,
          r.insertId,
        ]
      ).catch((err) => logger.error(err, "Failed to queue welcome email"));
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
      message: isAutoGenerated
        ? "تم إنشاء الحساب. كلمة المرور المؤقتة قُيِّدت في قائمة الإيميلات للإرسال."
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
         OR u.id IN (SELECT "userId" FROM user_roles WHERE "companyId" = $2)
       ) LIMIT 1`,
      [id, scope.companyId]
    );
    if (!userBelongs) { throw new ForbiddenError("المستخدم لا ينتمي لشركتك"); }
    const { isActive, role, employeeId } = zodParse(updateUserSchema.safeParse(req.body));
    if (employeeId) {
      const [empCheck] = await rawQuery(
        `SELECT 1 FROM employee_assignments WHERE "employeeId" = $1 AND "companyId" = $2 LIMIT 1`,
        [employeeId, scope.companyId]
      );
      if (!empCheck) { throw new ForbiddenError("الموظف لا ينتمي لشركتك"); }
    }
    const sets: string[] = [];
    const params: any[] = [];
    if (isActive !== undefined) { params.push(isActive); sets.push(`"isActive"=$${params.length}`); }
    if (role !== undefined) { params.push(role); sets.push(`role=$${params.length}`); }
    if (employeeId !== undefined) { params.push(employeeId || null); sets.push(`"employeeId"=$${params.length}`); }
    if (!sets.length) { throw new ValidationError("لا توجد بيانات للتحديث"); }
    params.push(id);
    await withTransaction(async (tx) => {
      const userRes = await tx.query(`UPDATE users SET ${sets.join(",")} WHERE id=$${params.length} RETURNING id`, params);
      if (!userRes.rowCount) throw new NotFoundError("المستخدم غير موجود");
      if (isActive === false) {
        await tx.query(`UPDATE refresh_tokens SET "revokedAt" = NOW() WHERE "userId" = $1 AND "revokedAt" IS NULL`, [id]);
      }
      if (role !== undefined) {
        const roleDef = PREDEFINED_ROLES.find(r => r.roleKey === role) || { roleKey: role, label: role, modules: [], level: 10 };
        const { rows: customRows } = await tx.query(
          `SELECT label, level, modules FROM custom_roles WHERE "companyId"=$1 AND "roleKey"=$2 LIMIT 1`,
          [scope.companyId, role]
        );
        const customRoleDef = customRows[0] ?? null;
        const finalDef = customRoleDef
          ? { roleKey: role, label: customRoleDef.label, level: customRoleDef.level, modules: Array.isArray(customRoleDef.modules) ? customRoleDef.modules : JSON.parse(customRoleDef.modules || "[]") }
          : roleDef;
        await tx.query(
          `INSERT INTO user_roles ("userId","roleKey",label,level,modules,"companyId","createdAt")
           VALUES ($1,$2,$3,$4,$5,$6,NOW())
           ON CONFLICT ("userId","roleKey","companyId") DO UPDATE SET label=EXCLUDED.label, level=EXCLUDED.level, modules=EXCLUDED.modules`,
          [id, finalDef.roleKey, finalDef.label, finalDef.level, JSON.stringify(finalDef.modules), scope.companyId]
        );
      }
    });
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "update", entity: "users", entityId: id,
      after: { isActive, role, employeeId },
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
         OR u.id IN (SELECT "userId" FROM user_roles WHERE "companyId" = $2)
       ) LIMIT 1`,
      [id, scope.companyId]
    );
    if (!userBelongs) { throw new ForbiddenError("المستخدم لا ينتمي لشركتك"); }
    await withTransaction(async (tx) => {
      await tx.query(
        `DELETE FROM user_roles WHERE "userId"=$1 AND "companyId"=$2`,
        [id, scope.companyId]
      );
      await tx.query(
        `DELETE FROM employee_assignments ea
         USING employees e
         WHERE ea."employeeId" = e.id AND e.id = (SELECT "employeeId" FROM users WHERE id=$1)
           AND ea."companyId"=$2`,
        [id, scope.companyId]
      );
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
         OR u.id IN (SELECT "userId" FROM user_roles WHERE "companyId" = $2)
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
    const systemRoles = await rawQuery(`SELECT * FROM roles ORDER BY name LIMIT 100`, []);
    const customRoles = await rawQuery(`SELECT * FROM custom_roles WHERE "companyId" = $1 ORDER BY label LIMIT 500`, [scope.companyId]);
    const rows = [...systemRoles, ...customRoles];
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (e: any) { logger.error(e, "Get roles error"); handleRouteError(e, res, "خطأ غير متوقع"); }
});

router.post("/roles", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    await assertAdmin(req);
    const scope = req.scope!;
    const { roleKey, label, level: roleLevel, modules: mods, permissions: rolePermissions } = zodParse(createCustomRoleSchema.safeParse(req.body ?? {}));
    await withTransaction(async (tx) => {
      await tx.query(
        `INSERT INTO custom_roles ("companyId","roleKey",label,level,modules,"createdBy","createdAt")
         VALUES ($1,$2,$3,$4,$5,$6,NOW())
         ON CONFLICT ("companyId","roleKey") DO UPDATE SET label=EXCLUDED.label, level=EXCLUDED.level, modules=EXCLUDED.modules`,
        [scope.companyId, roleKey, label, roleLevel, JSON.stringify(mods), scope.userId]
      );
      if (Array.isArray(rolePermissions) && rolePermissions.length > 0) {
        await tx.query(
          `DELETE FROM role_permissions WHERE role=$1 AND "companyId"=$2`,
          [roleKey, scope.companyId]
        );
        for (const perm of rolePermissions) {
          await tx.query(
            `INSERT INTO role_permissions (role, permission, "companyId") VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
            [roleKey, perm, scope.companyId]
          );
        }
      }
    });
    invalidatePermissionCache(roleKey, scope.companyId);
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "create", entity: "roles", entityId: 0,
      after: { roleKey, label, level: roleLevel, modules: mods },
    }).catch((e) => logger.error(e, "admin background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "admin.role.created",
      entity: "roles",
      entityId: 0,
      details: JSON.stringify({ roleKey, label, level: roleLevel }),
    }).catch((e) => logger.error(e, "admin background task failed"));
    const [row] = await rawQuery<Record<string, unknown>>(`SELECT * FROM custom_roles WHERE "companyId"=$1 AND "roleKey"=$2`, [scope.companyId, roleKey]);
    res.status(201).json(row || { roleKey, label, level: roleLevel, modules: mods });
  } catch (e: any) { logger.error(e, "Create role error"); handleRouteError(e, res, "خطأ غير متوقع"); }
});

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
  { roleKey: "employee", label: "موظف", modules: ["home","requests","documents","comms"], level: 10 },
];

router.get("/predefined-roles", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    await assertAdmin(req);
    const scope = req.scope!;
    const customRows = await rawQuery<Record<string, unknown>>(
      `SELECT "roleKey", label, level, modules FROM custom_roles WHERE "companyId"=$1 ORDER BY level DESC LIMIT 500`,
      [scope.companyId]
    ).catch((e) => { logger.error(e, "admin query failed"); return [] as any[]; });
    const customRoles = customRows.map((r: any) => ({
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
    const existing = new Set(customRoles.map((r: any) => r.roleKey));
    const predefined = PREDEFINED_ROLES.filter(r => !existing.has(r.roleKey));
    res.json({ data: [...customRoles, ...predefined] });
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
      `SELECT * FROM user_roles WHERE "userId"=$1 AND "companyId"=$2 ORDER BY level DESC LIMIT 500`,
      [userId, scope.companyId]
    );
    res.json({ data: rows });
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
    let def: { roleKey: string; label: string; modules: string[]; level: number } | undefined = PREDEFINED_ROLES.find(r => r.roleKey === roleKey);
    if (!def) {
      const [customRole] = await rawQuery<Record<string, unknown>>(
        `SELECT "roleKey", label, modules, level FROM custom_roles WHERE "roleKey"=$1 AND "companyId"=$2 LIMIT 1`,
        [roleKey, scope.companyId]
      ).catch((e) => { logger.error(e, "admin query failed"); return [] as any[]; });
      if (customRole) {
        def = {
          roleKey: customRole.roleKey,
          label: customRole.label,
          level: customRole.level,
          modules: Array.isArray(customRole.modules) ? customRole.modules : (typeof customRole.modules === "string" ? JSON.parse(customRole.modules || "[]") : []),
        };
      }
    }
    if (!def) { throw new ValidationError("دور غير معروف"); }
    await rawExecute(
      `INSERT INTO user_roles ("userId", "roleKey", label, modules, level, "companyId") VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT ("userId","roleKey","companyId") DO UPDATE SET label=EXCLUDED.label, modules=EXCLUDED.modules, level=EXCLUDED.level`,
      [userId, def.roleKey, def.label, JSON.stringify(def.modules), def.level, scope.companyId]
    );
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "update", entity: "roles", entityId: userId,
      after: { roleKey: def.roleKey, label: def.label },
    }).catch((e) => logger.error(e, "admin background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "admin.user_role.assigned",
      entity: "user_roles",
      entityId: userId,
      details: JSON.stringify({ roleKey: def.roleKey, label: def.label }),
    }).catch((e) => logger.error(e, "admin background task failed"));
    const [row] = await rawQuery<Record<string, unknown>>(`SELECT * FROM user_roles WHERE "userId"=$1 AND "roleKey"=$2 AND "companyId"=$3`, [userId, def.roleKey, scope.companyId]);
    res.status(201).json(row || { userId, roleKey: def.roleKey });
  } catch (err) { handleRouteError(err, res, "admin"); }
});

router.delete("/user-roles/:id", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    await assertAdmin(req);
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    if (!id || isNaN(id)) { throw new ValidationError("معرف غير صالح"); }
    const [roleRecord] = await rawQuery(
      `SELECT id FROM user_roles WHERE id=$1 AND "companyId"=$2 LIMIT 1`,
      [id, scope.companyId]
    );
    if (!roleRecord) { throw new ForbiddenError("غير مصرح: الدور لا ينتمي لشركتك"); }
    const result = await rawExecute(`DELETE FROM user_roles WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
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
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "admin"); }
});

router.post("/integrations", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    await assertAdmin(req);
    const scope = req.scope!;
    const { type, name, config, status, maxRetries } = zodParse(createIntegrationSchema.safeParse(req.body ?? {}));
    const r = await rawExecute(
      `INSERT INTO integrations ("companyId",type,name,config,status,"maxRetries")
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [scope.companyId, type, name, JSON.stringify(config || {}), status || "inactive", maxRetries || 3]
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
    const params: any[] = [];
    if (b.name !== undefined) { params.push(b.name); sets.push(`name=$${params.length}`); }
    if (b.type !== undefined) { params.push(b.type); sets.push(`type=$${params.length}`); }
    if (b.config !== undefined) { params.push(JSON.stringify(b.config)); sets.push(`config=$${params.length}`); }
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
    res.json(row);
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
    const { channel, status, integrationId, limit: lim, offset: off } = req.query as any;
    const pageLimit = Math.min(Number(lim) || 50, 200);
    const pageOffset = Number(off) || 0;
    const conditions = [`"companyId"=$1`];
    const params: any[] = [scope.companyId];
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
    res.json({ data: rows, total: Number(countRow?.total ?? 0), limit: pageLimit, offset: pageOffset });
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
    res.json(result);
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

    res.json({
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
    });
  } catch (err) { handleRouteError(err, res, "admin"); }
});

router.get("/violations-report", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    await assertAdmin(req);
    const scope = req.scope!;
    const { type, priority, status, department, from, to, limit: lim, offset: off } = req.query as any;
    const pageLimit = Math.min(Number(lim) || 50, 200);
    const pageOffset = Number(off) || 0;

    const conditions = [`"companyId"=$1`];
    const params: any[] = [scope.companyId];

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

    res.json({ data: violations, summary, byType, byDepartment, trend, total: totalCount?.count || violations.length });
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
    res.json(updated);
  } catch (err) { handleRouteError(err, res, "admin"); }
});

router.get("/security-log", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    await assertAdmin(req);
    const scope = req.scope!;
    const { userId, reason, from, to, page = "1", limit: lim = "50" } = req.query as any;
    const pageNum = Math.max(Number(page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(lim) || 50, 1), 200);
    const offset = (pageNum - 1) * pageSize;

    const conditions = [`sl."companyId" = $1`];
    const params: any[] = [scope.companyId];
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

    res.json({
      data: rows,
      total: Number(countRow?.total ?? 0),
      page: pageNum,
      pageSize,
      summary,
    });
  } catch (err) { handleRouteError(err, res, "admin"); }
});

router.get("/role-permissions", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    await assertAdmin(req);
    const scope = req.scope!;
    const { role } = req.query as any;
    const conditions = [`("companyId" IS NULL OR "companyId" = $1)`];
    const params: any[] = [scope.companyId];
    if (role) { params.push(role); conditions.push(`"role" = $${params.length}`); }
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT id, role, permission, "companyId", "createdAt" FROM role_permissions WHERE ${conditions.join(" AND ")} ORDER BY role, permission LIMIT 500`,
      params
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "admin"); }
});

router.post("/role-permissions", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    await assertAdmin(req);
    const scope = req.scope!;
    const { role, permission } = zodParse(createRolePermissionSchema.safeParse(req.body));
    const r = await rawExecute(
      `INSERT INTO role_permissions (role, permission, "companyId") VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [role, permission, scope.companyId]
    );
    invalidatePermissionCache(role, scope.companyId);
    if (r.insertId) {
      createAuditLog({
        companyId: scope.companyId, userId: scope.userId,
        action: "create", entity: "role_permissions", entityId: r.insertId,
        after: { role, permission },
      }).catch((e) => logger.error(e, "admin background task failed"));
      emitEvent({
        companyId: scope.companyId,
        userId: scope.userId,
        action: "admin.role_permission.created",
        entity: "role_permissions",
        entityId: r.insertId,
        details: JSON.stringify({ role, permission }),
      }).catch((e) => logger.error(e, "admin background task failed"));
    }
    const [row] = await rawQuery<Record<string, unknown>>(`SELECT * FROM role_permissions WHERE id=$1 AND "companyId"=$2`, [r.insertId || 0, scope.companyId]);
    res.status(201).json(row || { id: r.insertId, role, permission });
  } catch (err) { handleRouteError(err, res, "admin"); }
});

router.put("/role-permissions/bulk", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    await assertAdmin(req);
    const scope = req.scope!;
    const { role, permissions } = zodParse(bulkRolePermissionsSchema.safeParse(req.body));
    await withTransaction(async (tx) => {
      await tx.query(`DELETE FROM role_permissions WHERE role=$1 AND "companyId"=$2`, [role, scope.companyId]);
      if (permissions.length > 0) {
        const valuesSql: string[] = [];
        const params: any[] = [role, scope.companyId];
        for (const perm of permissions) {
          params.push(perm);
          valuesSql.push(`($1, $${params.length}, $2)`);
        }
        await tx.query(
          `INSERT INTO role_permissions (role, permission, "companyId") VALUES ${valuesSql.join(",")} ON CONFLICT DO NOTHING`,
          params
        );
      }
    });
    invalidatePermissionCache(role, scope.companyId);
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "update", entity: "role_permissions", entityId: 0,
      after: { role, permissionCount: permissions.length },
    }).catch((e) => logger.error(e, "admin background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "admin.role_permissions.bulk_updated",
      entity: "role_permissions",
      entityId: 0,
      details: JSON.stringify({ role, permissionCount: permissions.length }),
    }).catch((e) => logger.error(e, "admin background task failed"));
    res.json({ success: true, role, count: permissions.length });
  } catch (err) { handleRouteError(err, res, "admin"); }
});

router.delete("/role-permissions/:id", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    await assertAdmin(req);
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const result = await rawExecute(
      `DELETE FROM role_permissions WHERE id=$1 AND "companyId"=$2`,
      [id, scope.companyId]
    );
    if (result.affectedRows === 0) { throw new NotFoundError("الصلاحية غير موجودة أو غير مصرح بحذفها"); }
    invalidatePermissionCache(undefined, scope.companyId);
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "delete", entity: "role_permissions", entityId: id,
    }).catch((e) => logger.error(e, "admin background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "admin.role_permission.deleted",
      entity: "role_permissions",
      entityId: id,
    }).catch((e) => logger.error(e, "admin background task failed"));
    res.json({ message: "تم حذف الصلاحية" });
  } catch (err) { handleRouteError(err, res, "admin"); }
});


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
    res.json({ violations, total: violations.length, critical: violations.filter(v => v.severity === "critical").length });
  } catch (err) { handleRouteError(err, res, "Policy audit error:"); }
});

router.get("/governance/role-strategies", authorize({ feature: "admin", action: "list" }), async (_req, res) => {
  res.json({ strategies: ROLE_STRATEGIES, separationOfDuties: SEPARATION_OF_DUTIES, sensitiveOperations: SENSITIVE_OPERATIONS });
});

router.get("/governance/system-guards", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const companyId = req.scope?.companyId;
    if (!companyId) {
      res.json({ allowed: true, violations: [], note: "no company scope" });
      return;
    }
    const result = await checkSystemGuards(companyId, "all", { date: todayISO() });
    res.json(result);
  } catch (err: any) {
    handleRouteError(err, res, "System guards error");
  }
});

router.get("/governance/domain-registry", authorize({ feature: "admin", action: "list" }), async (_req, res) => {
  try {
    res.json({ domains: DOMAIN_REGISTRY, stats: getSystemStats() });
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
    res.json({
      healthy: mismatches.length === 0,
      driftCount: mismatches.length,
      mismatches,
    });
  } catch (err) { handleRouteError(err, res, "GL reconciliation error:"); }
});

router.get("/governance/lifecycle-machines", authorize({ feature: "admin", action: "list" }), async (_req, res) => {
  try {
    res.json({ machines: STATE_MACHINES, total: STATE_MACHINES.length });
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
    res.json({ entries: rows, total: rows.length, summary });
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
    res.json({ replayed: true, eventName: entry.eventName });
  } catch (err) { handleRouteError(err, res, "DLQ replay error:"); }
});

router.delete("/governance/event-dlq/:id", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { affectedRows } = await rawExecute(`UPDATE event_dlq SET "resolvedAt"=NOW() WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL)`, [id, scope.companyId]);
    if (!affectedRows) throw new NotFoundError("السجل غير موجود");
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
    res.json({
      total: EVENT_CATALOG.length,
      byDomain,
      catalog: EVENT_CATALOG.map(e => ({ action: e.name, domain: e.domain, label: e.label, critical: e.critical })),
      recentEvents,
    });
  } catch (err) { handleRouteError(err, res, "Event catalog error:"); }
});

router.get("/governance/rbac-matrix", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const customPerms = await rawQuery<Record<string, unknown>>(
      `SELECT role, permission FROM role_permissions WHERE "companyId" = $1 LIMIT 500`,
      [scope.companyId]
    );
    res.json({
      permissions: PERMISSIONS,
      roleDefaults: ROLE_PERMISSIONS,
      customPermissions: customPerms,
      totalPermissions: PERMISSIONS.length,
      totalRoles: Object.keys(ROLE_PERMISSIONS).length,
    });
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
    res.json({
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
    });
  } catch (err) { handleRouteError(err, res, "System registry error:"); }
});

router.get("/system-registry/entities", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const domain = req.query.domain as string | undefined;
    const entities = domain ? getEntitiesByDomain(domain) : ENTITY_REGISTRY;
    res.json({ entities, total: entities.length });
  } catch (err) { handleRouteError(err, res, "Entity registry error:"); }
});

router.get("/system-registry/coverage", authorize({ feature: "admin", action: "list" }), async (_req, res) => {
  try {
    const gaps = getMissingCoverage();
    const summary = getCoverageSummary();
    const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
    const byCategory: Record<string, number> = {};
    for (const g of gaps) {
      bySeverity[g.severity]++;
      byCategory[g.category] = (byCategory[g.category] || 0) + 1;
    }
    res.json({ gaps, total: gaps.length, bySeverity, byCategory, summary });
  } catch (err) { handleRouteError(err, res, "Coverage analysis error:"); }
});

router.get("/system-registry/notifications", authorize({ feature: "admin", action: "list" }), async (_req, res) => {
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
    res.json({ byDomain, totalTypes, entitiesWithNotifications, totalEntities: ENTITY_REGISTRY.length });
  } catch (err) { handleRouteError(err, res, "Notification registry error:"); }
});

router.get("/system-registry/reports", authorize({ feature: "admin", action: "list" }), async (_req, res) => {
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
    res.json({ byDomain, totalReports, entitiesWithReports, totalEntities: ENTITY_REGISTRY.length });
  } catch (err) { handleRouteError(err, res, "Report registry error:"); }
});

router.get("/system-registry/print-templates", authorize({ feature: "admin", action: "list" }), async (_req, res) => {
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
    res.json({ templates, total: templates.length });
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

    res.json({ events, total: events.length, recentActions });
  } catch (err) { handleRouteError(err, res, "Action registry error:"); }
});

router.get("/system-registry/pages", authorize({ feature: "admin", action: "list" }), async (_req, res) => {
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

    res.json({ pages, total: pages.length, byDomain: domainCounts });
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

    res.json({
      tablesWithoutEvents: { items: tablesWithoutEvents, count: tablesWithoutEvents.length },
      domainsWithoutLifecycle: { items: domainsWithoutLifecycle, count: domainsWithoutLifecycle.length },
      orphanNotifications: { items: orphanNotifications || [], count: orphanNotifications?.length || 0 },
    });
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
        : `${staleCrons.length} stale: ${staleCrons.map((c: any) => c.name).join(", ")}`,
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

    res.json({
      status: overall,
      timestamp: new Date().toISOString(),
      checks,
      summary: {
        ok: checks.filter(c => c.status === "ok").length,
        warn: checks.filter(c => c.status === "warn").length,
        error: checks.filter(c => c.status === "error").length,
      },
    });
  } catch (err) { handleRouteError(err, res, "System health error:"); }
});

// ─── Domain Dependency Graph ────────────────────────────────────────────

router.get("/system-health/dependency-graph", authorize({ feature: "admin", action: "list" }), async (_req, res) => {
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

    res.json({ nodes, edges: uniqueEdges, totalDependencies: uniqueEdges.length });
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
    res.json({ data: rows });
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

export default router;
