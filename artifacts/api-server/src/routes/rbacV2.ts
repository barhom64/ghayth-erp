/**
 * rbacV2 — admin API for managing the layered RBAC v2 model.
 *
 * Mounted under `/rbac/v2`. All routes require `admin.roles` feature
 * with the `update` action (or `view` for read-only routes).
 *
 * Endpoints:
 *   GET    /features                — full catalog tree
 *   GET    /roles                   — list roles for the active company
 *   POST   /roles                   — create role
 *   PATCH  /roles/:id               — update role meta
 *   DELETE /roles/:id               — delete role (system roles refused)
 *   GET    /roles/:id/grants        — feature grants for role
 *   PUT    /roles/:id/grants        — replace grants in bulk
 *   PUT    /roles/:id/field-policies — replace field policies in bulk
 *   PUT    /roles/:id/approval-limits — replace approval limits in bulk
 *   POST   /roles/:id/clone         — clone a role as template
 *   GET    /roles/:id/history       — change history
 *   GET    /sod                     — SoD rules + violations
 *   POST   /simulate                — "view as user X" — returns the
 *                                     effective grants/fields/limits
 *                                     for a given userId
 *   GET    /templates               — global role templates
 *   POST   /templates/:id/apply     — instantiate a template into the
 *                                     current company
 */

import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute, withTransaction } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { authorize } from "../lib/rbac/authorize.js";
import { bumpCacheVersion, checkAccess } from "../lib/rbac/authzEngine.js";
import { invalidateSodCache } from "../lib/rbac/sodEnforcement.js";
import { createNotification } from "../lib/businessHelpers.js";
import { FEATURE_CATALOG, FEATURE_INDEX } from "../lib/rbac/featureCatalog.js";
import { handleRouteError, ValidationError, NotFoundError, parseId, zodParse } from "../lib/errorHandler.js";

const router = Router();
router.use(authMiddleware);

const updateRoleSchema = z.object({
  labelAr: z.string().max(200).optional(),
  labelEn: z.string().max(200).optional(),
  description: z.string().max(1000).optional(),
  level: z.coerce.number().int().min(0).max(100).optional(),
  parentRoleId: z.coerce.number().int().positive().nullable().optional(),
  color: z.string().max(20).optional(),
  isActive: z.boolean().optional(),
  roleKey: z.string().max(100).optional(),
}).strict();

const cloneRoleSchema = z.object({
  newRoleKey: z.string().min(1).max(100),
  labelAr: z.string().min(1).max(200),
  asTemplate: z.boolean().optional(),
}).strict();

const assignUserRoleSchema = z.object({
  roleId: z.coerce.number().int().positive(),
  branchId: z.coerce.number().int().positive().nullable().optional(),
  departmentId: z.coerce.number().int().positive().nullable().optional(),
  isPrimary: z.boolean().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
}).strict();

// ─── Catalog (read-only, anyone authenticated) ──────────────────────────────
router.get("/features", async (req, res) => {
  try {
    const rows = await rawQuery<any>(
      `SELECT feature_key, parent_key, module_key, label_ar, label_en, description_ar, icon,
              available_actions, available_scopes, sensitive_fields, approvable_actions,
              display_order, is_self_service, is_system_critical
         FROM feature_catalog
        ORDER BY display_order, feature_key`
    );
    res.json({ features: rows.length ? rows : FEATURE_CATALOG });
  } catch (err) {
    handleRouteError(err, res, "list features");
  }
});

// ─── Roles (admin.roles feature) ────────────────────────────────────────────
router.get("/roles", authorize({ feature: "admin.roles", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(
      `SELECT r.id, r.role_key, r.label_ar, r.label_en, r.description, r.level,
              r.parent_role_id, r.color, r.is_system, r.is_template, r.is_active,
              r."createdAt", r."updatedAt",
              (SELECT COUNT(*) FROM rbac_user_roles ur WHERE ur.role_id = r.id) AS member_count,
              (SELECT COUNT(*) FROM rbac_role_grants g WHERE g.role_id = r.id) AS grant_count
         FROM rbac_roles r
        WHERE r."companyId" = $1 OR (r.is_template AND r."companyId" IS NULL)
        ORDER BY r.level DESC, r.role_key`,
      [scope.companyId]
    );
    res.json({ data: rows });
  } catch (err) {
    handleRouteError(err, res, "list roles");
  }
});

const createRoleSchema = z.object({
  roleKey: z.string().min(1).max(80),
  labelAr: z.string().min(1).max(200),
  labelEn: z.string().max(200).optional(),
  description: z.string().optional(),
  level: z.coerce.number().int().min(0).max(100).optional(),
  parentRoleId: z.coerce.number().int().nullable().optional(),
  color: z.string().max(20).optional(),
});

router.post("/roles", authorize({ feature: "admin.roles", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const parsed = createRoleSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? "بيانات غير صالحة");
    const { roleKey, labelAr, labelEn, description, level, parentRoleId, color } = parsed.data;

    const result = await rawExecute(
      `INSERT INTO rbac_roles ("companyId", role_key, label_ar, label_en, description, level, parent_role_id, color, "createdBy")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [scope.companyId, roleKey, labelAr, labelEn, description, level ?? 50, parentRoleId, color ?? "#3b82f6", scope.userId]
    );

    await recordHistory(result.insertId, scope.companyId, scope.userId, "role.create", null, parsed.data, null);
    await bumpCacheVersion(scope.companyId);
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    handleRouteError(err, res, "create role");
  }
});

router.patch("/roles/:id", authorize({ feature: "admin.roles", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(updateRoleSchema.safeParse(req.body));
    const [before] = await rawQuery<any>(`SELECT * FROM rbac_roles WHERE id = $1 AND "companyId" = $2`, [id, scope.companyId]);
    if (!before) return void res.status(404).json({ error: "الدور غير موجود" });
    if (before.is_system && b.roleKey && b.roleKey !== before.role_key) {
      return void res.status(403).json({ error: "لا يمكن تغيير مفتاح دور نظامي" });
    }

    const fields = ["label_ar", "label_en", "description", "level", "parent_role_id", "color", "is_active"];
    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;
    for (const f of fields) {
      const camel = f.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      if ((b as any)[camel] !== undefined) {
        sets.push(`${f} = $${idx++}`);
        params.push((b as any)[camel]);
      }
    }
    if (sets.length === 0) return void res.json({ updated: 0 });
    params.push(id, scope.companyId);
    await rawExecute(
      `UPDATE rbac_roles SET ${sets.join(", ")}, "updatedAt" = NOW() WHERE id = $${idx++} AND "companyId" = $${idx}`,
      params
    );

    await recordHistory(id, scope.companyId, scope.userId, "role.update", before, req.body, null);
    await bumpCacheVersion(scope.companyId);
    res.json({ updated: 1 });
  } catch (err) {
    handleRouteError(err, res, "update role");
  }
});

router.delete("/roles/:id", authorize({ feature: "admin.roles", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [role] = await rawQuery<any>(`SELECT * FROM rbac_roles WHERE id = $1 AND "companyId" = $2`, [id, scope.companyId]);
    if (!role) return void res.status(404).json({ error: "الدور غير موجود" });
    if (role.is_system) return void res.status(403).json({ error: "لا يمكن حذف الأدوار النظامية" });

    const [{ count }] = await rawQuery<{ count: string }>(`SELECT COUNT(*)::text AS count FROM rbac_user_roles WHERE role_id = $1`, [id]);
    if (Number(count) > 0) return void res.status(409).json({ error: `الدور مرتبط بـ ${count} مستخدم — افصلهم أولاً` });

    await rawExecute(`DELETE FROM rbac_roles WHERE id = $1`, [id]);
    await recordHistory(id, scope.companyId, scope.userId, "role.delete", role, null, null);
    await bumpCacheVersion(scope.companyId);
    res.json({ deleted: 1 });
  } catch (err) {
    handleRouteError(err, res, "delete role");
  }
});

// ─── Grants (the heart) ─────────────────────────────────────────────────────
router.get("/roles/:id/grants", authorize({ feature: "admin.roles", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [{ count }] = await rawQuery<{ count: string }>(`SELECT COUNT(*)::text AS count FROM rbac_roles WHERE id = $1 AND ("companyId" = $2 OR is_template)`, [id, scope.companyId]);
    if (Number(count) === 0) return void res.status(404).json({ error: "الدور غير موجود" });

    const grants = await rawQuery<any>(
      `SELECT feature_key, actions, scope, conditions FROM rbac_role_grants WHERE role_id = $1 ORDER BY feature_key`,
      [id]
    );
    res.json({ grants });
  } catch (err) {
    handleRouteError(err, res, "list grants");
  }
});

const grantsSchema = z.object({
  grants: z.array(z.object({
    featureKey: z.string(),
    actions: z.array(z.string()),
    scope: z.string(),
    conditions: z.any().optional(),
  })),
});

router.put("/roles/:id/grants", authorize({ feature: "admin.roles", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const parsed = grantsSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("بيانات الصلاحيات غير صالحة");

    // Validate each grant against the catalog
    for (const g of parsed.data.grants) {
      const feat = FEATURE_INDEX.get(g.featureKey);
      if (!feat) throw new ValidationError(`الميزة "${g.featureKey}" غير معروفة`);
      for (const a of g.actions) {
        if (a !== "*" && !feat.availableActions.includes(a as any)) {
          throw new ValidationError(`الإجراء "${a}" غير متاح للميزة "${g.featureKey}"`);
        }
      }
      if (!feat.availableScopes.includes(g.scope as any)) {
        throw new ValidationError(`النطاق "${g.scope}" غير متاح للميزة "${g.featureKey}"`);
      }
    }

    await withTransaction(async (client) => {
      const before = await client.query(`SELECT feature_key, actions, scope FROM rbac_role_grants WHERE role_id = $1`, [id]);
      await client.query(`DELETE FROM rbac_role_grants WHERE role_id = $1`, [id]);
      for (const g of parsed.data.grants) {
        await client.query(
          `INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope, conditions)
           VALUES ($1, $2, $3, $4, $5)`,
          [id, g.featureKey, g.actions, g.scope, g.conditions ?? null]
        );
      }
      await client.query(
        `INSERT INTO rbac_role_history (role_id, "companyId", "changedBy", change_type, before_state, after_state)
         VALUES ($1, $2, $3, 'grants.replace', $4, $5)`,
        [id, scope.companyId, scope.userId, JSON.stringify(before.rows), JSON.stringify(parsed.data.grants)]
      );
    });

    await bumpCacheVersion(scope.companyId);
    res.json({ updated: parsed.data.grants.length });
  } catch (err) {
    handleRouteError(err, res, "replace grants");
  }
});

// ─── Field policies ─────────────────────────────────────────────────────────
router.get("/roles/:id/field-policies", authorize({ feature: "admin.roles", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [{ count }] = await rawQuery<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM rbac_roles WHERE id = $1 AND ("companyId" = $2 OR is_template)`,
      [id, scope.companyId]
    );
    if (Number(count) === 0) return void res.status(404).json({ error: "الدور غير موجود" });
    const policies = await rawQuery<any>(
      `SELECT feature_key, field_name, mode FROM rbac_field_policies WHERE role_id = $1 ORDER BY feature_key, field_name`,
      [id]
    );
    res.json({ policies });
  } catch (err) {
    handleRouteError(err, res, "list field policies");
  }
});

const fieldPoliciesSchema = z.object({
  policies: z.array(z.object({
    featureKey: z.string(),
    fieldName: z.string(),
    mode: z.enum(["visible", "masked", "hidden", "readonly", "editable"]),
  })),
});

router.put("/roles/:id/field-policies", authorize({ feature: "admin.roles", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const parsed = fieldPoliciesSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("بيانات سياسة الحقول غير صالحة");

    await withTransaction(async (client) => {
      const before = await client.query(`SELECT feature_key, field_name, mode FROM rbac_field_policies WHERE role_id = $1`, [id]);
      await client.query(`DELETE FROM rbac_field_policies WHERE role_id = $1`, [id]);
      for (const p of parsed.data.policies) {
        await client.query(
          `INSERT INTO rbac_field_policies (role_id, feature_key, field_name, mode)
           VALUES ($1, $2, $3, $4)`,
          [id, p.featureKey, p.fieldName, p.mode]
        );
      }
      await client.query(
        `INSERT INTO rbac_role_history (role_id, "companyId", "changedBy", change_type, before_state, after_state)
         VALUES ($1, $2, $3, 'field_policies.replace', $4, $5)`,
        [id, scope.companyId, scope.userId, JSON.stringify(before.rows), JSON.stringify(parsed.data.policies)]
      );
    });

    await bumpCacheVersion(scope.companyId);
    res.json({ updated: parsed.data.policies.length });
  } catch (err) {
    handleRouteError(err, res, "replace field policies");
  }
});

// ─── Approval limits ────────────────────────────────────────────────────────
router.get("/roles/:id/approval-limits", authorize({ feature: "admin.roles", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [{ count }] = await rawQuery<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM rbac_roles WHERE id = $1 AND ("companyId" = $2 OR is_template)`,
      [id, scope.companyId]
    );
    if (Number(count) === 0) return void res.status(404).json({ error: "الدور غير موجود" });
    const limits = await rawQuery<any>(
      `SELECT feature_key, action, currency, max_amount, requires_dual_control
         FROM rbac_approval_limits WHERE role_id = $1 ORDER BY feature_key, action`,
      [id]
    );
    res.json({ limits });
  } catch (err) {
    handleRouteError(err, res, "list approval limits");
  }
});

const approvalLimitsSchema = z.object({
  limits: z.array(z.object({
    featureKey: z.string(),
    action: z.string(),
    currency: z.string().default("SAR"),
    maxAmount: z.coerce.number().nullable(),
    requiresDualControl: z.boolean().default(false),
  })),
});

router.put("/roles/:id/approval-limits", authorize({ feature: "admin.roles", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const parsed = approvalLimitsSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("بيانات سقوف الاعتماد غير صالحة");

    await withTransaction(async (client) => {
      await client.query(`DELETE FROM rbac_approval_limits WHERE role_id = $1`, [id]);
      for (const l of parsed.data.limits) {
        await client.query(
          `INSERT INTO rbac_approval_limits (role_id, feature_key, action, currency, max_amount, requires_dual_control)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [id, l.featureKey, l.action, l.currency, l.maxAmount, l.requiresDualControl]
        );
      }
      await client.query(
        `INSERT INTO rbac_role_history (role_id, "companyId", "changedBy", change_type, after_state)
         VALUES ($1, $2, $3, 'approval_limits.replace', $4)`,
        [id, scope.companyId, scope.userId, JSON.stringify(parsed.data.limits)]
      );
    });

    await bumpCacheVersion(scope.companyId);
    res.json({ updated: parsed.data.limits.length });
  } catch (err) {
    handleRouteError(err, res, "replace approval limits");
  }
});

// ─── SoD rules CRUD (custom per-company rules) ──────────────────────────────
const sodRuleSchema = z.object({
  ruleKey: z.string().min(1).max(100),
  labelAr: z.string().min(1).max(200),
  featureA: z.string().min(1),
  actionA: z.string().min(1),
  featureB: z.string().min(1),
  actionB: z.string().min(1),
  severity: z.enum(["critical", "high", "medium", "low"]).default("high"),
  isActive: z.boolean().default(true),
});

router.post("/sod", authorize({ feature: "admin.roles", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const parsed = sodRuleSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? "بيانات غير صالحة");
    const { ruleKey, labelAr, featureA, actionA, featureB, actionB, severity, isActive } = parsed.data;

    // Validate features exist in catalog
    if (!FEATURE_INDEX.has(featureA)) throw new ValidationError(`الميزة "${featureA}" غير معروفة`);
    if (!FEATURE_INDEX.has(featureB)) throw new ValidationError(`الميزة "${featureB}" غير معروفة`);

    const result = await rawExecute(
      `INSERT INTO rbac_sod_rules ("companyId", rule_key, label_ar, feature_a, action_a, feature_b, action_b, severity, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [scope.companyId, ruleKey, labelAr, featureA, actionA, featureB, actionB, severity, isActive]
    );
    invalidateSodCache(scope.companyId);
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    handleRouteError(err, res, "create SoD rule");
  }
});

const updateSodSchema = z.object({
  labelAr: z.string().min(1).max(200).optional(),
  featureA: z.string().min(1).optional(),
  actionA: z.string().min(1).optional(),
  featureB: z.string().min(1).optional(),
  actionB: z.string().min(1).optional(),
  severity: z.enum(["critical", "high", "medium", "low"]).optional(),
  isActive: z.boolean().optional(),
}).strict();

router.patch("/sod/:id", authorize({ feature: "admin.roles", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(updateSodSchema.safeParse(req.body));
    const fields = ["label_ar", "feature_a", "action_a", "feature_b", "action_b", "severity", "is_active"];
    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;
    for (const f of fields) {
      const camel = f.replace(/_([a-z])/g, (_, c) => c.toUpperCase()) as keyof typeof b;
      if (b[camel] !== undefined) {
        sets.push(`${f} = $${idx++}`);
        params.push(b[camel]);
      }
    }
    if (sets.length === 0) return void res.json({ updated: 0 });
    params.push(id, scope.companyId);
    await rawExecute(
      `UPDATE rbac_sod_rules SET ${sets.join(", ")} WHERE id = $${idx++} AND ("companyId" = $${idx} OR "companyId" IS NULL)`,
      params
    );
    invalidateSodCache(scope.companyId);
    res.json({ updated: 1 });
  } catch (err) {
    handleRouteError(err, res, "update SoD rule");
  }
});

router.delete("/sod/:id", authorize({ feature: "admin.roles", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [rule] = await rawQuery<any>(`SELECT * FROM rbac_sod_rules WHERE id = $1`, [id]);
    if (!rule) return void res.status(404).json({ error: "القاعدة غير موجودة" });
    if (rule.companyId == null) return void res.status(403).json({ error: "لا يمكن حذف القواعد النظامية، عطّلها بدلاً من ذلك" });
    const { affectedRows } = await rawExecute(`DELETE FROM rbac_sod_rules WHERE id = $1 AND "companyId" = $2`, [id, scope.companyId]);
    if (!affectedRows) throw new NotFoundError("قاعدة فصل المهام غير موجودة");
    invalidateSodCache(scope.companyId);
    res.json({ deleted: 1 });
  } catch (err) {
    handleRouteError(err, res, "delete SoD rule");
  }
});

// ─── User assignment helpers ────────────────────────────────────────────────
router.get("/users", authorize({ feature: "admin.users", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const search = String(req.query.q || "").trim();
    const params: any[] = [scope.companyId];
    let where = `ea."companyId" = $1 AND ea.status = 'active'`;
    if (search) {
      where += ` AND (e.name ILIKE $2 OR u.email ILIKE $2 OR ea."jobTitle" ILIKE $2)`;
      params.push(`%${search}%`);
    }
    const rows = await rawQuery<any>(
      `SELECT u.id AS "userId", u.email, e.name AS "userName", e."empNumber",
              ea.role AS legacy_role, ea."jobTitle", ea."branchId", b.name AS "branchName",
              ea."departmentId", d.name AS "departmentName",
              (SELECT COUNT(*)::int FROM rbac_user_roles ur
                WHERE ur."userId" = u.id AND ur."companyId" = $1
                  AND (ur.expires_at IS NULL OR ur.expires_at > NOW())) AS v2_role_count
         FROM users u
         JOIN employee_assignments ea ON ea."employeeId" = u."employeeId"
         JOIN employees e ON e.id = u."employeeId"
         LEFT JOIN branches b ON b.id = ea."branchId"
         LEFT JOIN departments d ON d.id = ea."departmentId"
        WHERE ${where}
        ORDER BY e.name LIMIT 200`,
      params
    );
    res.json({ users: rows });
  } catch (err) {
    handleRouteError(err, res, "list users");
  }
});

// ─── Clone / Templates ──────────────────────────────────────────────────────
router.post("/roles/:id/clone", authorize({ feature: "admin.roles", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const sourceId = parseId(req.params.id, "id");
    const { newRoleKey, labelAr, asTemplate } = zodParse(cloneRoleSchema.safeParse(req.body));

    await withTransaction(async (client) => {
      const [src] = (await client.query(`SELECT * FROM rbac_roles WHERE id = $1`, [sourceId])).rows;
      if (!src) throw new ValidationError("الدور المصدر غير موجود");

      const ins = await client.query(
        `INSERT INTO rbac_roles ("companyId", role_key, label_ar, label_en, description, level, parent_role_id, color, is_template, "createdBy")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [
          asTemplate ? null : scope.companyId,
          newRoleKey,
          labelAr,
          src.label_en,
          src.description,
          src.level,
          src.parent_role_id,
          src.color,
          !!asTemplate,
          scope.userId,
        ]
      );
      const newId = ins.rows[0].id;
      await client.query(
        `INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope, conditions)
         SELECT $1, feature_key, actions, scope, conditions FROM rbac_role_grants WHERE role_id = $2`,
        [newId, sourceId]
      );
      await client.query(
        `INSERT INTO rbac_field_policies (role_id, feature_key, field_name, mode)
         SELECT $1, feature_key, field_name, mode FROM rbac_field_policies WHERE role_id = $2`,
        [newId, sourceId]
      );
      await client.query(
        `INSERT INTO rbac_approval_limits (role_id, feature_key, action, currency, max_amount, requires_dual_control)
         SELECT $1, feature_key, action, currency, max_amount, requires_dual_control FROM rbac_approval_limits WHERE role_id = $2`,
        [newId, sourceId]
      );
      res.status(201).json({ id: newId });
    });

    await bumpCacheVersion(scope.companyId);
  } catch (err) {
    handleRouteError(err, res, "clone role");
  }
});

router.get("/templates", async (req, res) => {
  try {
    const rows = await rawQuery<any>(
      `SELECT id, role_key, label_ar, label_en, description, level, color,
              (SELECT COUNT(*) FROM rbac_role_grants WHERE role_id = r.id) AS grant_count,
              (SELECT COUNT(*) FROM rbac_field_policies WHERE role_id = r.id) AS field_count,
              (SELECT COUNT(*) FROM rbac_approval_limits WHERE role_id = r.id) AS limit_count
         FROM rbac_roles r WHERE is_template = TRUE
         ORDER BY level DESC, role_key`
    );
    res.json({ templates: rows });
  } catch (err) {
    handleRouteError(err, res, "list templates");
  }
});

const applyTemplateSchema = z.object({
  newRoleKey: z.string().min(1).max(80),
  labelAr: z.string().min(1).max(200),
});

router.post("/templates/:id/apply", authorize({ feature: "admin.roles", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const templateId = parseId(req.params.id, "id");
    const parsed = applyTemplateSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? "بيانات غير صالحة");
    const { newRoleKey, labelAr } = parsed.data;

    const newId = await withTransaction(async (client) => {
      const [tpl] = (await client.query(`SELECT * FROM rbac_roles WHERE id = $1 AND is_template = TRUE`, [templateId])).rows;
      if (!tpl) throw new ValidationError("القالب غير موجود");

      const ins = await client.query(
        `INSERT INTO rbac_roles ("companyId", role_key, label_ar, label_en, description, level, color, is_system, is_template, "createdBy")
         VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE, FALSE, $8) RETURNING id`,
        [scope.companyId, newRoleKey, labelAr, tpl.label_en, tpl.description, tpl.level, tpl.color, scope.userId]
      );
      const id = ins.rows[0].id;
      await client.query(
        `INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope, conditions)
         SELECT $1, feature_key, actions, scope, conditions FROM rbac_role_grants WHERE role_id = $2`,
        [id, templateId]
      );
      await client.query(
        `INSERT INTO rbac_field_policies (role_id, feature_key, field_name, mode)
         SELECT $1, feature_key, field_name, mode FROM rbac_field_policies WHERE role_id = $2`,
        [id, templateId]
      );
      await client.query(
        `INSERT INTO rbac_approval_limits (role_id, feature_key, action, currency, max_amount, requires_dual_control)
         SELECT $1, feature_key, action, currency, max_amount, requires_dual_control FROM rbac_approval_limits WHERE role_id = $2`,
        [id, templateId]
      );
      await client.query(
        `INSERT INTO rbac_role_history (role_id, "companyId", "changedBy", change_type, after_state, reason)
         VALUES ($1, $2, $3, 'role.from_template', $4, $5)`,
        [id, scope.companyId, scope.userId, JSON.stringify({ templateId, templateKey: tpl.role_key }), `instantiated from template ${tpl.role_key}`]
      );
      return id;
    });
    await bumpCacheVersion(scope.companyId);
    res.status(201).json({ id: newId });
  } catch (err) {
    handleRouteError(err, res, "apply template");
  }
});

// ─── History ────────────────────────────────────────────────────────────────
router.get("/roles/:id/history", authorize({ feature: "admin.roles", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const rows = await rawQuery<any>(
      `SELECT h.id, h."changedBy", h.change_type, h.before_state, h.after_state, h.reason, h."createdAt",
              COALESCE(e.name, u.email) AS "changedByName"
         FROM rbac_role_history h
         LEFT JOIN users u ON u.id = h."changedBy"
         LEFT JOIN employees e ON e.id = u."employeeId"
        WHERE h.role_id = $1 AND h."companyId" = $2
        ORDER BY h."createdAt" DESC LIMIT 100`,
      [id, scope.companyId]
    );
    res.json({ history: rows });
  } catch (err) {
    handleRouteError(err, res, "list history");
  }
});

// ─── SoD ────────────────────────────────────────────────────────────────────
router.get("/sod", authorize({ feature: "admin.roles", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rules = await rawQuery<any>(
      `SELECT id, rule_key, label_ar, feature_a, action_a, feature_b, action_b, severity, is_active
         FROM rbac_sod_rules WHERE "companyId" IS NULL OR "companyId" = $1`,
      [scope.companyId]
    );

    // Detect violations: any role/user holding both sides of any rule
    const violations: any[] = [];
    for (const r of rules.filter((x: any) => x.is_active)) {
      const offenders = await rawQuery<any>(
        `SELECT DISTINCT ur."userId", rr.id AS role_id, rr.role_key, rr.label_ar
           FROM rbac_user_roles ur
           JOIN rbac_roles rr ON rr.id = ur.role_id
           JOIN rbac_role_grants ga ON ga.role_id = rr.id AND ga.feature_key = $1 AND $2 = ANY(ga.actions)
           JOIN rbac_role_grants gb ON gb.role_id = rr.id AND gb.feature_key = $3 AND $4 = ANY(gb.actions)
          WHERE ur."companyId" = $5`,
        [r.feature_a, r.action_a, r.feature_b, r.action_b, scope.companyId]
      ).catch(() => [] as any[]);
      if (offenders.length > 0) {
        violations.push({ rule: r, offenders });
      }
    }
    res.json({ rules, violations });
  } catch (err) {
    handleRouteError(err, res, "sod report");
  }
});

// ─── Simulation ─────────────────────────────────────────────────────────────
const simulateSchema = z.object({
  userId: z.coerce.number().int().positive(),
  feature: z.string(),
  action: z.string(),
});

router.post("/simulate", authorize({ feature: "admin.roles", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const parsed = simulateSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("بيانات المحاكاة غير صالحة");

    // Build a synthetic scope for the target user
    const [target] = await rawQuery<any>(
      `SELECT u.id AS "userId", u."employeeId", ea."companyId", ea."branchId", ea.role,
              ea."jobTitleId", jt.name AS "jobTitle", e.name AS "userName"
         FROM users u
         JOIN employee_assignments ea ON ea."employeeId" = u."employeeId" AND ea.status = 'active'
         LEFT JOIN job_titles jt ON jt.id = ea."jobTitleId"
         LEFT JOIN employees e ON e.id = u."employeeId"
        WHERE u.id = $1 AND ea."companyId" = $2 LIMIT 1`,
      [parsed.data.userId, scope.companyId]
    );
    if (!target) return void res.status(404).json({ error: "المستخدم غير موجود في هذه الشركة" });

    const synthScope = {
      userId: target.userId,
      employeeId: target.employeeId,
      companyId: target.companyId,
      branchId: target.branchId,
      activeAssignmentId: 0,
      allowedCompanies: [target.companyId],
      allowedBranches: [target.branchId],
      allowedAssignments: [],
      role: target.role,
      isOwner: target.role === "owner",
      jobTitle: target.jobTitle,
      jobTitleId: target.jobTitleId,
      userName: target.userName ?? "مستخدم",
    };

    const result = await checkAccess(synthScope, { feature: parsed.data.feature, action: parsed.data.action as any });
    res.json({ target, result });
  } catch (err) {
    handleRouteError(err, res, "simulate");
  }
});

// ─── Effective grants for a user (full picture) ────────────────────────────
router.get("/users/:userId/effective", authorize({ feature: "admin.roles", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const userId = parseId(req.params.userId, "userId");
    const [target] = await rawQuery<any>(
      `SELECT u.id, u."employeeId", e.name AS "userName", ea."companyId", ea."branchId",
              ea."departmentId", ea.role, jt.name AS "jobTitle"
         FROM users u
         JOIN employee_assignments ea ON ea."employeeId" = u."employeeId" AND ea.status = 'active'
         LEFT JOIN job_titles jt ON jt.id = ea."jobTitleId"
         LEFT JOIN employees e ON e.id = u."employeeId"
        WHERE u.id = $1 AND ea."companyId" = $2 LIMIT 1`,
      [userId, scope.companyId]
    );
    if (!target) return void res.status(404).json({ error: "المستخدم غير موجود" });

    const roles = await rawQuery<any>(
      `SELECT ur.role_id, ur.is_primary, ur.expires_at, r.role_key, r.label_ar, r.color, r.level
         FROM rbac_user_roles ur
         JOIN rbac_roles r ON r.id = ur.role_id
        WHERE ur."userId" = $1 AND ur."companyId" = $2
          AND (ur.expires_at IS NULL OR ur.expires_at > NOW())`,
      [userId, scope.companyId]
    );

    const grants = await rawQuery<any>(
      `SELECT g.role_id, g.feature_key, g.actions, g.scope, r.label_ar AS role_label
         FROM rbac_role_grants g
         JOIN rbac_user_roles ur ON ur.role_id = g.role_id
         JOIN rbac_roles r ON r.id = g.role_id
        WHERE ur."userId" = $1 AND ur."companyId" = $2
          AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
        ORDER BY g.feature_key`,
      [userId, scope.companyId]
    );

    const fields = await rawQuery<any>(
      `SELECT fp.feature_key, fp.field_name, fp.mode, r.label_ar AS role_label
         FROM rbac_field_policies fp
         JOIN rbac_user_roles ur ON ur.role_id = fp.role_id
         JOIN rbac_roles r ON r.id = fp.role_id
        WHERE ur."userId" = $1 AND ur."companyId" = $2
          AND (ur.expires_at IS NULL OR ur.expires_at > NOW())`,
      [userId, scope.companyId]
    );

    const limits = await rawQuery<any>(
      `SELECT al.feature_key, al.action, al.currency, al.max_amount, al.requires_dual_control, r.label_ar AS role_label
         FROM rbac_approval_limits al
         JOIN rbac_user_roles ur ON ur.role_id = al.role_id
         JOIN rbac_roles r ON r.id = al.role_id
        WHERE ur."userId" = $1 AND ur."companyId" = $2
          AND (ur.expires_at IS NULL OR ur.expires_at > NOW())`,
      [userId, scope.companyId]
    );

    const overrides = await rawQuery<any>(
      `SELECT feature_key, action, scope, type, expires_at, reason
         FROM rbac_user_grants
        WHERE "userId" = $1 AND "companyId" = $2
          AND (expires_at IS NULL OR expires_at > NOW())`,
      [userId, scope.companyId]
    );

    res.json({ target, roles, grants, fields, limits, overrides });
  } catch (err) {
    handleRouteError(err, res, "effective grants");
  }
});

// ─── User role bindings ─────────────────────────────────────────────────────
router.get("/users/:userId/roles", authorize({ feature: "admin.roles", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const userId = parseId(req.params.userId, "userId");
    const rows = await rawQuery<any>(
      `SELECT ur.id, ur.role_id, ur."branchId", ur."departmentId", ur.is_primary, ur.expires_at,
              r.role_key, r.label_ar, r.color, r.level
         FROM rbac_user_roles ur
         JOIN rbac_roles r ON r.id = ur.role_id
        WHERE ur."userId" = $1 AND ur."companyId" = $2`,
      [userId, scope.companyId]
    );
    res.json({ roles: rows });
  } catch (err) {
    handleRouteError(err, res, "list user roles");
  }
});

router.post("/users/:userId/roles", authorize({ feature: "admin.roles", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const userId = parseId(req.params.userId, "userId");
    const { roleId, branchId, departmentId, isPrimary, expiresAt } = zodParse(assignUserRoleSchema.safeParse(req.body));

    await rawExecute(
      `INSERT INTO rbac_user_roles ("userId", "companyId", role_id, "branchId", "departmentId", is_primary, expires_at, "assignedBy")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT ("userId", "companyId", role_id) DO UPDATE SET
         "branchId" = EXCLUDED."branchId", "departmentId" = EXCLUDED."departmentId",
         is_primary = EXCLUDED.is_primary, expires_at = EXCLUDED.expires_at`,
      [userId, scope.companyId, roleId, branchId ?? null, departmentId ?? null, !!isPrimary, expiresAt ?? null, scope.userId]
    );
    await bumpCacheVersion(scope.companyId);
    res.status(201).json({ ok: true });
  } catch (err) {
    handleRouteError(err, res, "assign role");
  }
});

router.delete("/users/:userId/roles/:roleId", authorize({ feature: "admin.roles", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    await rawExecute(
      `DELETE FROM rbac_user_roles WHERE "userId" = $1 AND role_id = $2 AND "companyId" = $3`,
      [parseId(req.params.userId, "userId"), parseId(req.params.roleId, "roleId"), scope.companyId]
    );
    await bumpCacheVersion(scope.companyId);
    res.json({ ok: true });
  } catch (err) {
    handleRouteError(err, res, "unassign role");
  }
});

async function recordHistory(roleId: number | null, companyId: number, userId: number, type: string, before: any, after: any, reason: string | null) {
  await rawExecute(
    `INSERT INTO rbac_role_history (role_id, "companyId", "changedBy", change_type, before_state, after_state, reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [roleId, companyId, userId, type, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, reason]
  ).catch(() => undefined);
}

// ─── Admin convenience: re-sync all roles to current user ──────────────────
//
// Owners / GMs already bypass authorization, but having every role
// listed in rbac_user_roles unlocks the frontend's role-switcher so
// the admin can browse the system "as" each role to verify behaviour
// without logging out and back in. Migration 141 does the same on
// boot; this endpoint is the on-demand version (no restart needed).
router.post("/admin/sync-all-roles", authorize({ feature: "admin.roles", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    if (!scope.isOwner && scope.role !== "owner" && scope.role !== "general_manager") {
      return void res.status(403).json({
        error: "هذه العملية مقصورة على المالك أو المدير العام",
        code: "FORBIDDEN",
      });
    }

    const inserted = await rawExecute(
      `INSERT INTO rbac_user_roles ("userId", "companyId", role_id, is_primary, "assignedBy")
       SELECT $1, $2, r.id, FALSE, $1
         FROM rbac_roles r
        WHERE r."companyId" = $2 AND r.is_active = TRUE AND r.is_template = FALSE
       ON CONFLICT ("userId", "companyId", role_id) DO NOTHING`,
      [scope.userId, scope.companyId]
    );

    const [{ count }] = await rawQuery<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM rbac_user_roles
        WHERE "userId" = $1 AND "companyId" = $2`,
      [scope.userId, scope.companyId]
    );

    await bumpCacheVersion(scope.companyId);
    res.json({ added: inserted.affectedRows ?? 0, totalRoles: Number(count) });
  } catch (err) {
    handleRouteError(err, res, "sync all roles");
  }
});

// ─── JIT (Just-in-Time) elevation ───────────────────────────────────────────
//
// An employee submits a request for a temporary permission they don't
// normally have. A manager reviews. Approval inserts a time-bound row
// into rbac_user_grants so the existing engine picks it up immediately,
// and the existing expired-grants cron (PR #180) cleans up after expiry.

const jitRequestSchema = z.object({
  featureKey: z.string().min(1),
  action: z.string().min(1),
  scope: z.enum(["self", "team", "department", "department_tree", "branch", "branches", "company", "all"]).default("self"),
  justification: z.string().min(10, "السبب مطلوب (10 أحرف على الأقل)").max(500),
  requestedMinutes: z.number().int().min(5).max(1440).default(60),
}).strict();

const jitDecisionSchema = z.object({
  reason: z.string().max(500).optional(),
}).strict();

// Anyone authenticated can submit a JIT request for themselves.
router.post("/jit/request", async (req, res) => {
  try {
    const scope = req.scope!;
    const body = jitRequestSchema.parse(req.body);

    // Validate against the feature catalog: feature must exist, action
    // must be in availableActions, and scope must be in availableScopes.
    // Without these checks, a malformed UI / direct API call could
    // produce a row the engine can never honour, leaving JIT requests
    // stuck in 'approved' but useless.
    const feature = FEATURE_INDEX.get(body.featureKey);
    if (!feature) {
      throw new ValidationError(`الميزة "${body.featureKey}" غير معروفة`);
    }
    if (!feature.availableActions.includes(body.action as any)) {
      throw new ValidationError(
        `الإجراء "${body.action}" غير متاح للميزة "${feature.labelAr}"`,
        { field: "action", fix: `الإجراءات المتاحة: ${feature.availableActions.join("، ")}` }
      );
    }
    if (!feature.availableScopes.includes(body.scope as any)) {
      throw new ValidationError(
        `النطاق "${body.scope}" غير متاح للميزة "${feature.labelAr}"`,
        { field: "scope", fix: `النطاقات المتاحة: ${feature.availableScopes.join("، ")}` }
      );
    }

    // Throttle abuse: a user with one open pending JIT request can't
    // spam more than 10 in flight per company.
    const [{ count }] = await rawQuery<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM rbac_jit_requests
        WHERE "userId" = $1 AND "companyId" = $2 AND status = 'pending'`,
      [scope.userId, scope.companyId]
    );
    if (Number(count) >= 10) {
      throw new ValidationError(
        "لديك طلبات صلاحية مؤقتة كثيرة بانتظار المراجعة (10 حدّ أقصى)",
        { fix: "ألغِ الطلبات القديمة أو انتظر مراجعتها" }
      );
    }

    const { insertId } = await rawExecute(
      `INSERT INTO rbac_jit_requests
         ("userId", "companyId", feature_key, action, scope, justification, requested_minutes, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
       RETURNING id`,
      [scope.userId, scope.companyId, body.featureKey, body.action, body.scope, body.justification, body.requestedMinutes]
    );
    res.status(201).json({ id: insertId, status: "pending" });
  } catch (err) {
    handleRouteError(err, res, "create JIT request");
  }
});

router.get("/jit/my", async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(
      `SELECT id, feature_key, action, scope, justification, requested_minutes, status,
              "approvedBy", "approvedAt", "rejectedReason", granted_at, expires_at, "createdAt"
         FROM rbac_jit_requests
        WHERE "userId" = $1 AND "companyId" = $2
        ORDER BY "createdAt" DESC LIMIT 100`,
      [scope.userId, scope.companyId]
    );
    res.json({ data: rows });
  } catch (err) {
    handleRouteError(err, res, "list my JIT requests");
  }
});

router.get("/jit/pending", authorize({ feature: "admin.roles", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(
      `SELECT j.id, j."userId", e.name AS "userName", j.feature_key, j.action, j.scope,
              j.justification, j.requested_minutes, j."createdAt"
         FROM rbac_jit_requests j
         LEFT JOIN users u ON u.id = j."userId"
         LEFT JOIN employees e ON e.id = u."employeeId"
        WHERE j."companyId" = $1 AND j.status = 'pending'
        ORDER BY j."createdAt" ASC LIMIT 200`,
      [scope.companyId]
    );
    res.json({ data: rows });
  } catch (err) {
    handleRouteError(err, res, "list pending JIT");
  }
});

router.post("/jit/:id/approve", authorize({ feature: "admin.roles", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const body = jitDecisionSchema.parse(req.body || {});

    await withTransaction(async (client) => {
      const { rows: [j] } = await client.query<any>(
        `SELECT * FROM rbac_jit_requests WHERE id = $1 AND "companyId" = $2 FOR UPDATE`,
        [id, scope.companyId]
      );
      if (!j) throw new NotFoundError("طلب JIT غير موجود");
      if (j.status !== "pending") throw new ValidationError(`لا يمكن اعتماد طلب بحالة "${j.status}"`);
      if (j.userId === scope.userId) throw new ValidationError("لا يمكنك اعتماد طلبك");

      const expiresAt = new Date(Date.now() + j.requested_minutes * 60_000);

      // Insert the time-bound user grant — engine sees it instantly.
      await client.query(
        `INSERT INTO rbac_user_grants
           ("userId", "companyId", feature_key, action, scope, type, expires_at, reason, "grantedBy")
         VALUES ($1, $2, $3, $4, $5, 'grant', $6, $7, $8)`,
        [j.userId, scope.companyId, j.feature_key, j.action, j.scope, expiresAt,
         `JIT #${j.id}: ${j.justification}`, scope.userId]
      );
      await client.query(
        `UPDATE rbac_jit_requests
            SET status = 'approved', "approvedBy" = $1, "approvedAt" = NOW(),
                granted_at = NOW(), expires_at = $2, "updatedAt" = NOW()
          WHERE id = $3`,
        [scope.userId, expiresAt, id]
      );
      await client.query(
        `INSERT INTO rbac_role_history (role_id, "companyId", "changedBy", change_type, after_state, reason)
         VALUES (NULL, $1, $2, 'jit.approve', $3, $4)`,
        [scope.companyId, scope.userId,
         JSON.stringify({ jitId: id, userId: j.userId, feature: j.feature_key, action: j.action, expiresAt }),
         body.reason || null]
      );
    });
    await bumpCacheVersion(scope.companyId);

    // Notify the requester so they don't have to refresh the JIT page
    // to find out. We look up their active assignment ID to feed
    // createNotification (which keys on assignmentId, not userId).
    void (async () => {
      const [{ rows: [j] }, asgRes] = await Promise.all([
        rawQuery<any>(`SELECT "userId", feature_key, action, requested_minutes FROM rbac_jit_requests WHERE id = $1`, [id])
          .then((rows) => ({ rows })),
        rawQuery<{ id: number }>(
          `SELECT ea.id FROM employee_assignments ea
             JOIN users u ON u."employeeId" = ea."employeeId"
            WHERE u.id = (SELECT "userId" FROM rbac_jit_requests WHERE id = $1)
              AND ea."companyId" = $2 AND ea.status = 'active'
            ORDER BY ea."isPrimary" DESC, ea.id ASC LIMIT 1`,
          [id, scope.companyId]
        ),
      ]).catch(() => [{ rows: [] }, []] as any);
      const assignmentId = asgRes[0]?.id;
      if (!assignmentId || !j) return;
      await createNotification({
        companyId: scope.companyId,
        assignmentId,
        type: "rbac.jit.approved",
        title: "تم اعتماد طلب الصلاحية المؤقتة",
        body: `يمكنك الآن استخدام "${j.feature_key}:${j.action}" لمدة ${j.requested_minutes} دقيقة`,
        priority: "high",
        refType: "rbac_jit_request",
        refId: id,
        actionUrl: "/admin?tab=rbac-jit",
      });
    })().catch(() => undefined);

    res.json({ ok: true });
  } catch (err) {
    handleRouteError(err, res, "approve JIT");
  }
});

router.post("/jit/:id/reject", authorize({ feature: "admin.roles", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const body = jitDecisionSchema.parse(req.body || {});

    const { affectedRows } = await rawExecute(
      `UPDATE rbac_jit_requests
          SET status = 'rejected', "approvedBy" = $1, "approvedAt" = NOW(),
              "rejectedReason" = $2, "updatedAt" = NOW()
        WHERE id = $3 AND "companyId" = $4 AND status = 'pending'`,
      [scope.userId, body.reason || "(no reason)", id, scope.companyId]
    );
    if (!affectedRows) throw new NotFoundError("طلب JIT غير موجود أو ليس بانتظار قرار");

    await rawExecute(
      `INSERT INTO rbac_role_history (role_id, "companyId", "changedBy", change_type, after_state, reason)
       VALUES (NULL, $1, $2, 'jit.reject', $3, $4)`,
      [scope.companyId, scope.userId, JSON.stringify({ jitId: id }), body.reason || null]
    ).catch(() => undefined);

    // Notify the requester of the rejection.
    void (async () => {
      const asgRes = await rawQuery<{ id: number }>(
        `SELECT ea.id FROM employee_assignments ea
           JOIN users u ON u."employeeId" = ea."employeeId"
          WHERE u.id = (SELECT "userId" FROM rbac_jit_requests WHERE id = $1)
            AND ea."companyId" = $2 AND ea.status = 'active'
          ORDER BY ea."isPrimary" DESC, ea.id ASC LIMIT 1`,
        [id, scope.companyId]
      ).catch(() => [] as { id: number }[]);
      const assignmentId = asgRes[0]?.id;
      if (!assignmentId) return;
      await createNotification({
        companyId: scope.companyId,
        assignmentId,
        type: "rbac.jit.rejected",
        title: "تم رفض طلب الصلاحية المؤقتة",
        body: body.reason || "لم يُذكر سبب",
        priority: "normal",
        refType: "rbac_jit_request",
        refId: id,
        actionUrl: "/admin?tab=rbac-jit",
      });
    })().catch(() => undefined);

    res.json({ ok: true });
  } catch (err) {
    handleRouteError(err, res, "reject JIT");
  }
});

// User can cancel their own pending request.
router.post("/jit/:id/cancel", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { affectedRows } = await rawExecute(
      `UPDATE rbac_jit_requests
          SET status = 'cancelled', "updatedAt" = NOW()
        WHERE id = $1 AND "userId" = $2 AND "companyId" = $3 AND status = 'pending'`,
      [id, scope.userId, scope.companyId]
    );
    if (!affectedRows) throw new NotFoundError("طلب JIT غير موجود أو لا يمكن إلغاؤه");
    res.json({ ok: true });
  } catch (err) {
    handleRouteError(err, res, "cancel JIT");
  }
});

export default router;
