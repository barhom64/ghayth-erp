import { Router, type Request, type Response } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { getDeliveryStats } from "../lib/notificationEngine.js";
import { requireMinLevel } from "../middlewares/roleGuard.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import { createAuditLog } from "../lib/businessHelpers.js";

const router = Router();

router.get("/preferences", async (req: Request, res: Response): Promise<any> => {
  try {
    const scope = req.scope;
    if (!scope) return res.status(401).json({ error: "Unauthorized" });
    const { companyId } = scope;

    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT id, category, "inApp", email, sms, whatsapp, push, webhook,
              "quietHoursStart"::text, "quietHoursEnd"::text, "updatedAt"
       FROM notification_preferences
       WHERE "companyId" = $1 AND "userId" = $2
       ORDER BY category`,
      [companyId, scope.userId]
    );

    const categories = await rawQuery<{ eventCategory: string; description: string | null }>(
      `SELECT DISTINCT "eventCategory", description
       FROM notification_routing_rules
       WHERE ("companyId" = $1 OR "companyId" IS NULL) AND "isActive" = true
       ORDER BY "eventCategory"`,
      [companyId]
    );

    res.json({ data: rows, categories });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.put("/preferences", requirePermission("admin:write"), async (req: Request, res: Response): Promise<any> => {
  try {
    const scope = req.scope;
    if (!scope) return res.status(401).json({ error: "Unauthorized" });
    const { companyId } = scope;

    const preferences = req.body.preferences as Array<{
      category: string;
      inApp?: boolean;
      email?: boolean;
      sms?: boolean;
      whatsapp?: boolean;
      push?: boolean;
      webhook?: boolean;
      quietHoursStart?: string | null;
      quietHoursEnd?: string | null;
    }>;

    if (!Array.isArray(preferences)) return res.status(400).json({ error: "preferences must be an array" });

    for (const pref of preferences) {
      await rawExecute(
        `INSERT INTO notification_preferences
           ("companyId", "userId", category, channel, enabled, "inApp", email, sms, whatsapp, push, webhook, "quietHoursStart", "quietHoursEnd", "updatedAt")
         VALUES ($1, $2, $3, 'in_app', true, $4, $5, $6, $7, $8, $9, $10::time, $11::time, NOW())
         ON CONFLICT ("userId", channel, category)
         DO UPDATE SET
           "inApp" = EXCLUDED."inApp",
           email = EXCLUDED.email,
           sms = EXCLUDED.sms,
           whatsapp = EXCLUDED.whatsapp,
           push = EXCLUDED.push,
           webhook = EXCLUDED.webhook,
           "quietHoursStart" = EXCLUDED."quietHoursStart",
           "quietHoursEnd" = EXCLUDED."quietHoursEnd",
           "updatedAt" = NOW()`,
        [
          companyId, scope.userId, pref.category,
          pref.inApp ?? true, pref.email ?? true,
          pref.sms ?? false, pref.whatsapp ?? false,
          pref.push ?? true, pref.webhook ?? false,
          pref.quietHoursStart ?? null, pref.quietHoursEnd ?? null,
        ]
      );
    }

    createAuditLog({
      companyId, userId: scope.userId, action: "update_notification_preferences",
      entity: "notification_preferences", entityId: 0,
      after: { preferences },
    }).catch(console.error);

    res.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.get("/routing-rules", requirePermission("admin:write"), async (req: Request, res: Response) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT r.*, fc.name AS "fallbackChainName"
       FROM notification_routing_rules r
       LEFT JOIN notification_fallback_chains fc ON fc.id = r."fallbackChainId"
       WHERE r."companyId" = $1 OR r."companyId" IS NULL
       ORDER BY r."companyId" DESC NULLS LAST, r."eventCategory"`,
      [scope.companyId]
    );
    res.json({ data: rows });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.post("/routing-rules", requirePermission("admin:write"), async (req: Request, res: Response): Promise<any> => {
  try {
    const scope = req.scope!;
    const { eventCategory, channels, priority, description, fallbackChainId, isActive } = req.body;
    if (!eventCategory || !channels) return res.status(400).json({ error: "eventCategory and channels required" });
    if (!Array.isArray(channels)) return res.status(400).json({ error: "channels must be an array" });

    const rows = await rawQuery<{ id: number }>(
      `INSERT INTO notification_routing_rules
         ("companyId", "eventCategory", channels, priority, description, "fallbackChainId", "isActive", "createdBy")
       VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8)
       ON CONFLICT ("companyId", "eventCategory")
       DO UPDATE SET
         channels = EXCLUDED.channels,
         priority = EXCLUDED.priority,
         description = EXCLUDED.description,
         "fallbackChainId" = EXCLUDED."fallbackChainId",
         "isActive" = EXCLUDED."isActive",
         "updatedAt" = NOW()
       RETURNING id`,
      [scope.companyId, eventCategory, JSON.stringify(channels), priority ?? "normal",
       description ?? null, fallbackChainId ?? null, isActive ?? true, scope.activeAssignmentId]
    );

    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "create_routing_rule",
      entity: "notification_routing_rules", entityId: rows[0]?.id ?? 0,
      after: { eventCategory, channels, priority, description, fallbackChainId, isActive },
    }).catch(console.error);

    res.json({ data: rows[0] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.put("/routing-rules/:id", requirePermission("admin:write"), async (req: Request, res: Response): Promise<any> => {
  try {
    const scope = req.scope!;
    const { channels, priority, description, fallbackChainId, isActive } = req.body;
    if (channels && !Array.isArray(channels)) return res.status(400).json({ error: "channels must be an array" });

    await rawExecute(
      `UPDATE notification_routing_rules
       SET channels = COALESCE($2::jsonb, channels),
           priority = COALESCE($3, priority),
           description = COALESCE($4, description),
           "fallbackChainId" = $5,
           "isActive" = COALESCE($6, "isActive"),
           "updatedAt" = NOW()
       WHERE id = $1 AND "companyId" = $7`,
      [req.params.id, channels ? JSON.stringify(channels) : null, priority ?? null,
       description ?? null, fallbackChainId ?? null, isActive ?? null, scope.companyId]
    );

    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "update_routing_rule",
      entity: "notification_routing_rules", entityId: Number(req.params.id),
      after: { channels, priority, description, fallbackChainId, isActive },
    }).catch(console.error);

    res.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.delete("/routing-rules/:id", requirePermission("admin:write"), async (req: Request, res: Response) => {
  try {
    const scope = req.scope!;
    const [before] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM notification_routing_rules WHERE id = $1 AND "companyId" = $2`,
      [req.params.id, scope.companyId]
    );
    await rawExecute(
      `DELETE FROM notification_routing_rules WHERE id = $1 AND "companyId" = $2`,
      [req.params.id, scope.companyId]
    );

    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "delete_routing_rule",
      entity: "notification_routing_rules", entityId: Number(req.params.id),
      before,
    }).catch(console.error);

    res.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.get("/templates", requirePermission("admin:write"), async (req: Request, res: Response) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT id, "templateKey", channel, "titleTemplate", "bodyTemplate", variables,
              language, "isActive", "isDefault", "companyId", "updatedAt"
       FROM notification_templates
       WHERE "companyId" = $1 OR "companyId" IS NULL
       ORDER BY "companyId" DESC NULLS LAST, "templateKey", channel`,
      [scope.companyId]
    );
    res.json({ data: rows });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.post("/templates", requirePermission("admin:write"), async (req: Request, res: Response): Promise<any> => {
  try {
    const scope = req.scope!;
    const { templateKey, channel, titleTemplate, bodyTemplate, variables, language, isActive } = req.body;
    if (!templateKey || !channel || !bodyTemplate) {
      return res.status(400).json({ error: "templateKey, channel, and bodyTemplate required" });
    }

    const rows = await rawQuery<{ id: number }>(
      `INSERT INTO notification_templates
         ("companyId", "templateKey", channel, "titleTemplate", "bodyTemplate", variables, language, "isActive", "createdBy")
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
       ON CONFLICT ("companyId", "templateKey", channel, language)
       DO UPDATE SET
         "titleTemplate" = EXCLUDED."titleTemplate",
         "bodyTemplate" = EXCLUDED."bodyTemplate",
         variables = EXCLUDED.variables,
         "isActive" = EXCLUDED."isActive",
         "updatedAt" = NOW()
       RETURNING id`,
      [scope.companyId, templateKey, channel, titleTemplate ?? null, bodyTemplate,
       variables ? JSON.stringify(variables) : "[]", language ?? "ar", isActive ?? true,
       scope.activeAssignmentId]
    );

    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "create_notification_template",
      entity: "notification_templates", entityId: rows[0]?.id ?? 0,
      after: { templateKey, channel, titleTemplate, bodyTemplate, language, isActive },
    }).catch(console.error);

    res.json({ data: rows[0] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.put("/templates/:id", requirePermission("admin:write"), async (req: Request, res: Response) => {
  try {
    const scope = req.scope!;
    const { titleTemplate, bodyTemplate, variables, isActive } = req.body;

    await rawExecute(
      `UPDATE notification_templates
       SET "titleTemplate" = COALESCE($2, "titleTemplate"),
           "bodyTemplate" = COALESCE($3, "bodyTemplate"),
           variables = COALESCE($4::jsonb, variables),
           "isActive" = COALESCE($5, "isActive"),
           "updatedAt" = NOW()
       WHERE id = $1 AND "companyId" = $6`,
      [req.params.id, titleTemplate ?? null, bodyTemplate ?? null,
       variables ? JSON.stringify(variables) : null, isActive ?? null, scope.companyId]
    );

    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "update_notification_template",
      entity: "notification_templates", entityId: Number(req.params.id),
      after: { titleTemplate, bodyTemplate, isActive },
    }).catch(console.error);

    res.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.delete("/templates/:id", requirePermission("admin:write"), async (req: Request, res: Response) => {
  try {
    const scope = req.scope!;
    const [before] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM notification_templates WHERE id = $1 AND "companyId" = $2`,
      [req.params.id, scope.companyId]
    );
    await rawExecute(
      `DELETE FROM notification_templates WHERE id = $1 AND "companyId" = $2 AND "isDefault" = false`,
      [req.params.id, scope.companyId]
    );

    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "delete_notification_template",
      entity: "notification_templates", entityId: Number(req.params.id),
      before,
    }).catch(console.error);

    res.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.get("/fallback-chains", requirePermission("admin:write"), async (req: Request, res: Response) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT id, name, description, steps, "isActive", "companyId", "updatedAt"
       FROM notification_fallback_chains
       WHERE "companyId" = $1 OR "companyId" IS NULL
       ORDER BY "companyId" DESC NULLS LAST, name`,
      [scope.companyId]
    );
    res.json({ data: rows });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.post("/fallback-chains", requirePermission("admin:write"), async (req: Request, res: Response): Promise<any> => {
  try {
    const scope = req.scope!;
    const { name, description, steps, isActive } = req.body;
    if (!name || !steps) return res.status(400).json({ error: "name and steps required" });
    if (!Array.isArray(steps)) return res.status(400).json({ error: "steps must be an array" });

    const rows = await rawQuery<{ id: number }>(
      `INSERT INTO notification_fallback_chains ("companyId", name, description, steps, "isActive", "createdBy")
       VALUES ($1, $2, $3, $4::jsonb, $5, $6)
       RETURNING id`,
      [scope.companyId, name, description ?? null, JSON.stringify(steps), isActive ?? true, scope.activeAssignmentId]
    );

    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "create_fallback_chain",
      entity: "notification_fallback_chains", entityId: rows[0]?.id ?? 0,
      after: { name, description, steps, isActive },
    }).catch(console.error);

    res.json({ data: rows[0] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.put("/fallback-chains/:id", requirePermission("admin:write"), async (req: Request, res: Response): Promise<any> => {
  try {
    const scope = req.scope!;
    const { name, description, steps, isActive } = req.body;
    if (steps && !Array.isArray(steps)) return res.status(400).json({ error: "steps must be an array" });

    await rawExecute(
      `UPDATE notification_fallback_chains
       SET name = COALESCE($2, name),
           description = COALESCE($3, description),
           steps = COALESCE($4::jsonb, steps),
           "isActive" = COALESCE($5, "isActive"),
           "updatedAt" = NOW()
       WHERE id = $1 AND "companyId" = $6`,
      [req.params.id, name ?? null, description ?? null,
       steps ? JSON.stringify(steps) : null, isActive ?? null, scope.companyId]
    );

    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "update_fallback_chain",
      entity: "notification_fallback_chains", entityId: Number(req.params.id),
      after: { name, description, steps, isActive },
    }).catch(console.error);

    res.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.delete("/fallback-chains/:id", requirePermission("admin:write"), async (req: Request, res: Response) => {
  try {
    const scope = req.scope!;
    const [before] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM notification_fallback_chains WHERE id = $1 AND "companyId" = $2`,
      [req.params.id, scope.companyId]
    );
    await rawExecute(
      `DELETE FROM notification_fallback_chains WHERE id = $1 AND "companyId" = $2`,
      [req.params.id, scope.companyId]
    );

    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "delete_fallback_chain",
      entity: "notification_fallback_chains", entityId: Number(req.params.id),
      before,
    }).catch(console.error);

    res.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.get("/webhooks", requirePermission("admin:write"), async (req: Request, res: Response) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT id, name, url, events, headers, "isActive",
              "lastSuccessAt", "lastFailureAt", "lastError", "failCount", "updatedAt"
       FROM notification_webhooks
       WHERE "companyId" = $1
       ORDER BY name`,
      [scope.companyId]
    );
    const masked = rows.map((r) => ({ ...r, secret: r.secret ? "__configured__" : null }));
    res.json({ data: masked });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.post("/webhooks", requirePermission("admin:write"), async (req: Request, res: Response): Promise<any> => {
  try {
    const scope = req.scope!;
    const { name, url, secret, events, headers, isActive } = req.body;
    if (!name || !url) return res.status(400).json({ error: "name and url required" });

    const parsedUrl = new URL(url);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return res.status(400).json({ error: "Webhook URL must use http or https" });
    }

    const rows = await rawQuery<{ id: number }>(
      `INSERT INTO notification_webhooks ("companyId", name, url, secret, events, headers, "isActive", "createdBy")
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8)
       RETURNING id`,
      [scope.companyId, name, url, secret ?? null,
       JSON.stringify(events ?? ["*"]), JSON.stringify(headers ?? {}),
       isActive ?? true, scope.activeAssignmentId]
    );

    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "create_webhook",
      entity: "notification_webhooks", entityId: rows[0]?.id ?? 0,
      after: { name, url, events, isActive },
    }).catch(console.error);

    res.json({ data: rows[0] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.put("/webhooks/:id", requirePermission("admin:write"), async (req: Request, res: Response): Promise<any> => {
  try {
    const scope = req.scope!;
    const { name, url, secret, events, headers, isActive } = req.body;

    if (url) {
      const parsedUrl = new URL(url);
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        return res.status(400).json({ error: "Webhook URL must use http or https" });
      }
    }

    const secretValue = secret === "__configured__" ? undefined : secret;

    await rawExecute(
      `UPDATE notification_webhooks
       SET name = COALESCE($2, name),
           url = COALESCE($3, url),
           ${secretValue !== undefined ? `secret = $9,` : ""}
           events = COALESCE($4::jsonb, events),
           headers = COALESCE($5::jsonb, headers),
           "isActive" = COALESCE($6, "isActive"),
           "updatedAt" = NOW()
       WHERE id = $1 AND "companyId" = $7`,
      secretValue !== undefined
        ? [req.params.id, name ?? null, url ?? null,
           events ? JSON.stringify(events) : null, headers ? JSON.stringify(headers) : null,
           isActive ?? null, scope.companyId, null, secretValue]
        : [req.params.id, name ?? null, url ?? null,
           events ? JSON.stringify(events) : null, headers ? JSON.stringify(headers) : null,
           isActive ?? null, scope.companyId]
    );

    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "update_webhook",
      entity: "notification_webhooks", entityId: Number(req.params.id),
      after: { name, url, events, isActive },
    }).catch(console.error);

    res.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.delete("/webhooks/:id", requirePermission("admin:write"), async (req: Request, res: Response) => {
  try {
    const scope = req.scope!;
    const [before] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM notification_webhooks WHERE id = $1 AND "companyId" = $2`,
      [req.params.id, scope.companyId]
    );
    await rawExecute(
      `DELETE FROM notification_webhooks WHERE id = $1 AND "companyId" = $2`,
      [req.params.id, scope.companyId]
    );

    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "delete_webhook",
      entity: "notification_webhooks", entityId: Number(req.params.id),
      before,
    }).catch(console.error);

    res.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.get("/delivery-stats", requirePermission("admin:write"), async (req: Request, res: Response) => {
  try {
    const scope = req.scope!;
    const days = parseInt(req.query.days as string) || 30;
    const stats = await getDeliveryStats(scope.companyId, days);
    res.json({ data: stats });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.get("/delivery-log", requirePermission("admin:write"), async (req: Request, res: Response) => {
  try {
    const scope = req.scope!;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = (page - 1) * limit;
    const channel = req.query.channel as string;
    const status = req.query.status as string;

    let where = `"companyId" = $1`;
    const params: (string | number)[] = [scope.companyId];

    if (channel) {
      params.push(channel);
      where += ` AND channel = $${params.length}`;
    }
    if (status) {
      params.push(status);
      where += ` AND status = $${params.length}`;
    }

    const countResult = await rawQuery<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM notification_delivery_log WHERE ${where}`, params
    );

    params.push(limit, offset);
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT id, channel, recipient, "templateKey", subject, status,
              "externalId", "errorMessage", "attemptCount",
              "fallbackChainId", "fallbackStep", "parentDeliveryId",
              "queuedAt", "sentAt", "deliveredAt", "failedAt", "createdAt"
       FROM notification_delivery_log
       WHERE ${where}
       ORDER BY "createdAt" DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({ data: rows, total: countResult[0]?.count ?? 0, page, limit });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export default router;
