/**
 * Admin → Notification Routing rules + fallback chains.
 *
 * Two CRUD resources backed by tables that already exist in the
 * schema (notification_routing_rules + notification_fallback_chains).
 * The notificationDispatch.ts runtime already reads from these; this
 * router gives operators a UI to manage them instead of editing rows
 * by hand.
 *
 * Eventually feeds the master-plan view's "كل شيء قابل للتحكم من
 * الواجهة" rule (#1139 §6) — every existing platform capability
 * needs a UI surface, not just the ones added in this session.
 */
import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute, assertInsert } from "../lib/rawdb.js";
import {
  handleRouteError,
  ValidationError,
  NotFoundError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { emitEvent, createAuditLog } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";

const router = Router();

// ─────────────────────── Rules ────────────────────────────────────────────

const ruleSchema = z.object({
  eventCategory: z.string().min(1).max(100),
  channels: z.array(z.enum(["in_app", "email", "whatsapp", "sms", "push", "webhook"]))
    .min(1, "اختر قناة واحدة على الأقل"),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  isActive: z.boolean().default(true),
  description: z.string().optional().nullable(),
  fallbackChainId: z.number().int().positive().optional().nullable(),
});

router.get("/rules", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const cid = req.scope!.companyId;
    const rows = await rawQuery(
      `SELECT r.id, r."eventCategory", r.channels, r.priority, r."isActive",
              r.description, r."fallbackChainId", r."createdAt", r."updatedAt",
              fc.name AS "fallbackChainName"
         FROM notification_routing_rules r
         LEFT JOIN notification_fallback_chains fc ON fc.id = r."fallbackChainId"
        WHERE r."companyId" = $1 OR r."companyId" IS NULL
        ORDER BY r."isActive" DESC, r."eventCategory" ASC`,
      [cid],
    );
    res.json(maskFields(req, { data: rows, total: rows.length }));
  } catch (err) {
    handleRouteError(err, res, "admin/notification-routing/rules/list");
  }
});

router.post("/rules", authorize({ feature: "admin", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const body = zodParse(ruleSchema.safeParse(req.body));

    const { insertId } = await rawExecute(
      `INSERT INTO notification_routing_rules
         ("companyId", "eventCategory", channels, priority, "isActive",
          description, "fallbackChainId", "createdBy")
       VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8)`,
      [
        scope.companyId, body.eventCategory, JSON.stringify(body.channels),
        body.priority, body.isActive, body.description ?? null,
        body.fallbackChainId ?? null, scope.userId,
      ],
    );
    assertInsert(insertId, "notification_routing_rules");

    void emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "notification_routing.rule.created",
      entity: "notification_routing_rules", entityId: insertId,
      details: JSON.stringify({ eventCategory: body.eventCategory }),
    }).catch((e) => logger.warn(e, "[event] rule.created"));
    void createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "create", entity: "notification_routing_rules", entityId: insertId, after: body,
    }).catch((e) => logger.warn(e, "[audit] rule.created"));

    res.status(201).json({ id: insertId, ...body });
  } catch (err) {
    handleRouteError(err, res, "admin/notification-routing/rules/create");
  }
});

router.patch("/rules/:id", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const body = zodParse(ruleSchema.partial().safeParse(req.body ?? {}));

    // Load the target rule first so we can tell a company-owned rule
    // from a shared GLOBAL default (companyId IS NULL, seeded by
    // migration 256). Editing a global default must NOT mutate the row
    // every tenant inherits — it creates a company-specific override
    // instead. Editing an own rule updates in place.
    const [target] = await rawQuery<{
      id: number; companyId: number | null; eventCategory: string;
      channels: unknown; priority: string; isActive: boolean;
      description: string | null; fallbackChainId: number | null;
    }>(
      `SELECT id, "companyId", "eventCategory", channels, priority,
              "isActive", description, "fallbackChainId"
         FROM notification_routing_rules
        WHERE id = $1 AND ("companyId" = $2 OR "companyId" IS NULL)
        LIMIT 1`,
      [id, scope.companyId],
    );
    if (!target) throw new NotFoundError("القاعدة غير موجودة");

    // Merge the patch over the existing values.
    const merged = {
      eventCategory: body.eventCategory ?? target.eventCategory,
      channels: body.channels ?? (typeof target.channels === "string" ? JSON.parse(target.channels) : target.channels),
      priority: body.priority ?? target.priority,
      isActive: body.isActive ?? target.isActive,
      description: body.description !== undefined ? body.description : target.description,
      fallbackChainId: body.fallbackChainId !== undefined ? body.fallbackChainId : target.fallbackChainId,
    };

    let row: unknown;
    let auditAction: "update" | "create";
    if (target.companyId === scope.companyId) {
      // Own rule — update in place.
      [row] = await rawQuery(
        `UPDATE notification_routing_rules
            SET "eventCategory" = $1, channels = $2::jsonb, priority = $3,
                "isActive" = $4, description = $5, "fallbackChainId" = $6,
                "updatedAt" = NOW()
          WHERE id = $7 AND "companyId" = $8
         RETURNING *`,
        [merged.eventCategory, JSON.stringify(merged.channels), merged.priority,
         merged.isActive, merged.description, merged.fallbackChainId, id, scope.companyId],
      );
      auditAction = "update";
    } else {
      // Global default — create/replace a company-specific override.
      [row] = await rawQuery(
        `INSERT INTO notification_routing_rules
           ("companyId", "eventCategory", channels, priority, "isActive",
            description, "fallbackChainId", "createdBy")
         VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8)
         ON CONFLICT ("companyId", "eventCategory") DO UPDATE
           SET channels = EXCLUDED.channels, priority = EXCLUDED.priority,
               "isActive" = EXCLUDED."isActive", description = EXCLUDED.description,
               "fallbackChainId" = EXCLUDED."fallbackChainId", "updatedAt" = NOW()
         RETURNING *`,
        [scope.companyId, merged.eventCategory, JSON.stringify(merged.channels),
         merged.priority, merged.isActive, merged.description, merged.fallbackChainId, scope.userId],
      );
      auditAction = "create";
    }

    void createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: auditAction, entity: "notification_routing_rules",
      entityId: (row as { id: number }).id, after: merged,
    }).catch((e) => logger.warn(e, "[audit] rule.updated"));

    res.json(row);
  } catch (err) {
    handleRouteError(err, res, "admin/notification-routing/rules/update");
  }
});

router.delete("/rules/:id", authorize({ feature: "admin", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");

    const [target] = await rawQuery<{ id: number; companyId: number | null; eventCategory: string }>(
      `SELECT id, "companyId", "eventCategory" FROM notification_routing_rules
        WHERE id = $1 AND ("companyId" = $2 OR "companyId" IS NULL) LIMIT 1`,
      [id, scope.companyId],
    );
    if (!target) throw new NotFoundError("القاعدة غير موجودة");

    if (target.companyId === scope.companyId) {
      // Own rule — hard delete. The company falls back to the global
      // default (if any) for this category on the next lookup.
      await rawExecute(
        `DELETE FROM notification_routing_rules WHERE id = $1 AND "companyId" = $2`,
        [id, scope.companyId],
      );
    } else {
      // Global default — a company can't delete the shared row. Instead
      // record a company-specific disabled override so this tenant opts
      // out (getRoutingRule filters on "isActive" = true) without
      // affecting other tenants.
      await rawExecute(
        `INSERT INTO notification_routing_rules
           ("companyId", "eventCategory", channels, priority, "isActive", description, "createdBy")
         VALUES ($1, $2, '["in_app"]'::jsonb, 'normal', false, 'تعطيل تجاوز محلي للقاعدة الافتراضية', $3)
         ON CONFLICT ("companyId", "eventCategory") DO UPDATE
           SET "isActive" = false, "updatedAt" = NOW()`,
        [scope.companyId, target.eventCategory, scope.userId],
      );
    }

    void createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "delete", entity: "notification_routing_rules", entityId: id, after: { id, eventCategory: target.eventCategory },
    }).catch((e) => logger.warn(e, "[audit] rule.deleted"));
    res.json({ ok: true });
  } catch (err) {
    handleRouteError(err, res, "admin/notification-routing/rules/delete");
  }
});

// ─────────────────────── Fallback chains ──────────────────────────────────

const chainSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional().nullable(),
  steps: z.array(z.object({
    delayMinutes: z.number().int().min(0).max(10080), // up to a week
    channels: z.array(z.string()),
    target: z.string().optional(),
  })).min(1, "أضف خطوة واحدة على الأقل"),
  isActive: z.boolean().default(true),
});

router.get("/chains", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const cid = req.scope!.companyId;
    const rows = await rawQuery(
      `SELECT id, name, description, steps, "isActive", "createdAt", "updatedAt"
         FROM notification_fallback_chains
        WHERE "companyId" = $1 OR "companyId" IS NULL
        ORDER BY "isActive" DESC, name ASC`,
      [cid],
    );
    res.json(maskFields(req, { data: rows, total: rows.length }));
  } catch (err) {
    handleRouteError(err, res, "admin/notification-routing/chains/list");
  }
});

router.post("/chains", authorize({ feature: "admin", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const body = zodParse(chainSchema.safeParse(req.body));
    const { insertId } = await rawExecute(
      `INSERT INTO notification_fallback_chains
         ("companyId", name, description, steps, "isActive", "createdBy")
       VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
      [
        scope.companyId, body.name, body.description ?? null,
        JSON.stringify(body.steps), body.isActive, scope.userId,
      ],
    );
    assertInsert(insertId, "notification_fallback_chains");
    void createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "create", entity: "notification_fallback_chains", entityId: insertId, after: body,
    }).catch((e) => logger.warn(e, "[audit] chain.created"));
    res.status(201).json({ id: insertId, ...body });
  } catch (err) {
    handleRouteError(err, res, "admin/notification-routing/chains/create");
  }
});

router.patch("/chains/:id", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const body = zodParse(chainSchema.partial().safeParse(req.body ?? {}));

    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    const setIf = (col: string, val: unknown, jsonb = false) => {
      if (val === undefined) return;
      sets.push(`"${col}" = $${idx++}${jsonb ? "::jsonb" : ""}`);
      params.push(jsonb ? JSON.stringify(val) : val);
    };
    setIf("name", body.name);
    setIf("description", body.description);
    setIf("steps", body.steps, true);
    setIf("isActive", body.isActive);
    if (sets.length === 0) throw new ValidationError("لا توجد بيانات للتحديث");
    sets.push(`"updatedAt" = NOW()`);
    params.push(id, scope.companyId);

    const [row] = await rawQuery(
      `UPDATE notification_fallback_chains SET ${sets.join(", ")}
        WHERE id = $${idx++} AND ("companyId" = $${idx} OR "companyId" IS NULL)
       RETURNING *`,
      params,
    );
    if (!row) throw new NotFoundError("السلسلة غير موجودة");

    void createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "update", entity: "notification_fallback_chains", entityId: id, after: body,
    }).catch((e) => logger.warn(e, "[audit] chain.updated"));

    res.json(row);
  } catch (err) {
    handleRouteError(err, res, "admin/notification-routing/chains/update");
  }
});

export default router;
