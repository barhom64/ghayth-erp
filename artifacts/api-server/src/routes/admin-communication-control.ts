/**
 * Communication Control Plane admin surface (#1139 §3).
 *
 * Three resources + one read-only view:
 *   1. providers       — failover registry per channel
 *   2. dlp-rules       — outbound-message scan rules
 *   3. inbox           — unified inbound view (read across the
 *                        existing communications_log / notification_log
 *                        / pbx_calls tables — no new write surface here)
 *   4. overview        — counts + recent-activity for the landing tab
 *
 * Send-side wiring (failover + DLP) is the responsibility of the
 * outbound queue workers; this router only manages the control
 * surface (CRUD + observability). The helpers in
 * lib/communicationControl.ts are the seam they pull from.
 */
import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute, assertInsert } from "../lib/rawdb.js";
import {
  handleRouteError,
  ValidationError,
  NotFoundError,
  ConflictError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { emitEvent, createAuditLog } from "../lib/businessHelpers.js";
import {
  invalidateCommunicationControlCache,
  applyDlp,
  type Channel,
} from "../lib/communicationControl.js";
import { logger } from "../lib/logger.js";

const router = Router();

// ─────────────────────── overview ─────────────────────────────────────────

router.get("/overview", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const cid = req.scope!.companyId;
    const [
      providerRows,
      dlpRows,
      inbox24hRows,
      pbxLast24hRows,
      transcriptsPendingRows,
    ] = await Promise.all([
      rawQuery(
        `SELECT channel, status, COUNT(*)::int AS count
           FROM communication_providers
          GROUP BY channel, status
          ORDER BY channel, status`,
      ),
      rawQuery(
        `SELECT severity, action, COUNT(*) FILTER (WHERE enabled = true)::int AS count
           FROM communication_dlp_rules
          WHERE ("companyId" = $1 OR "companyId" IS NULL)
          GROUP BY severity, action
          ORDER BY severity DESC`,
        [cid],
      ),
      rawQuery(
        `SELECT channel, direction, COUNT(*)::int AS count
           FROM communications_log
          WHERE "createdAt" > NOW() - INTERVAL '24 hours'
            AND ("companyId" = $1 OR "companyId" IS NULL)
            AND "deletedAt" IS NULL
          GROUP BY channel, direction
          ORDER BY channel, direction`,
        [cid],
      ),
      rawQuery(
        `SELECT direction, status, COUNT(*)::int AS count
           FROM pbx_calls
          WHERE "createdAt" > NOW() - INTERVAL '24 hours'
            AND "companyId" = $1
          GROUP BY direction, status`,
        [cid],
      ),
      rawQuery(
        `SELECT COUNT(*)::int AS count
           FROM pbx_call_transcripts
          WHERE status = 'pending' AND "companyId" = $1`,
        [cid],
      ),
    ]);

    res.json(maskFields(req, {
      providers: providerRows,
      dlpRules: dlpRows,
      inboundLast24h: inbox24hRows,
      pbxLast24h: pbxLast24hRows,
      pendingTranscripts: Number(transcriptsPendingRows[0]?.count ?? 0),
      collectedAt: new Date().toISOString(),
    }));
  } catch (err) {
    handleRouteError(err, res, "admin/communication-control/overview");
  }
});

// ─────────────────────── unified inbox ────────────────────────────────────

/**
 * GET /inbox — unified inbound view across communications_log +
 * pbx_calls. UNION ALL with the same column shape so the UI doesn't
 * have to branch per source. Capped at 100 rows to keep the response
 * fast; the operator filters by channel/date for narrower windows.
 */
router.get("/inbox", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const cid = req.scope!.companyId;
    const channelFilter = (req.query.channel as string | undefined) ?? null;
    const sinceHours = Math.max(1, Math.min(168, Number(req.query.hours ?? 24)));

    const params: unknown[] = [cid, `${sinceHours} hours`];
    let channelCond = "";
    if (channelFilter) {
      params.push(channelFilter);
      channelCond = ` AND channel = $${params.length}`;
    }

    const rows = await rawQuery(
      `WITH msgs AS (
         SELECT 'message'::text AS source,
                id::text AS id,
                channel,
                direction,
                "fromNumber" AS from_addr,
                "toNumber" AS to_addr,
                subject,
                LEFT(body, 500) AS body,
                status,
                "relatedType" AS related_type,
                "relatedId" AS related_id,
                "createdAt"
           FROM communications_log
          WHERE "companyId" = $1
            AND "createdAt" > NOW() - $2::interval
            AND "deletedAt" IS NULL
            ${channelCond}
       ),
       calls AS (
         SELECT 'call'::text AS source,
                id::text AS id,
                'pbx' AS channel,
                direction,
                "callerNumber" AS from_addr,
                "calledNumber" AS to_addr,
                NULL::text AS subject,
                'call duration: ' || COALESCE(duration::text, '0') || 's' AS body,
                status,
                NULL::text AS related_type,
                NULL::integer AS related_id,
                "createdAt"
           FROM pbx_calls
          WHERE "companyId" = $1
            AND "createdAt" > NOW() - $2::interval
            ${channelFilter === "pbx" || !channelFilter ? "" : "AND FALSE"}
       )
       SELECT * FROM msgs
       UNION ALL
       SELECT * FROM calls
       ORDER BY "createdAt" DESC
       LIMIT 100`,
      params,
    );

    res.json(maskFields(req, { data: rows, total: rows.length, windowHours: sinceHours }));
  } catch (err) {
    handleRouteError(err, res, "admin/communication-control/inbox");
  }
});

// ─────────────────────── providers ────────────────────────────────────────

const VALID_CHANNELS: Channel[] = ["email", "whatsapp", "sms", "pbx", "webhook"];

const providerCreateSchema = z.object({
  channel: z.enum(["email", "whatsapp", "sms", "pbx", "webhook"]),
  slug: z.string().min(2).max(80).regex(/^[a-z0-9-_]+$/, "أحرف لاتينية صغيرة وأرقام و - فقط"),
  name: z.string().min(1).max(200),
  status: z.enum(["active", "disabled", "failover-only"]).default("active"),
  priority: z.number().int().min(1).max(1000).default(100),
  config: z.record(z.unknown()).default({}),
  notes: z.string().optional().nullable(),
});

const providerUpdateSchema = providerCreateSchema.partial().omit({ channel: true, slug: true });

router.get("/providers", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const rows = await rawQuery(
      `SELECT id, channel, slug, name, status, priority, config, notes,
              "createdAt", "updatedAt"
         FROM communication_providers
        ORDER BY channel, priority ASC, slug ASC`,
    );
    res.json(maskFields(req, { data: rows, total: rows.length }));
  } catch (err) {
    handleRouteError(err, res, "admin/communication-control/providers/list");
  }
});

router.post("/providers", authorize({ feature: "admin", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const body = zodParse(providerCreateSchema.safeParse(req.body));

    const { insertId } = await rawExecute(
      `INSERT INTO communication_providers (channel, slug, name, status, priority, config, notes)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
      [body.channel, body.slug, body.name, body.status, body.priority, JSON.stringify(body.config), body.notes ?? null],
    ).catch((err) => {
      if (String(err?.message).includes("communication_providers_channel_slug_unique")) {
        throw new ConflictError("مزوّد بنفس الـ slug مسجّل بالفعل في هذه القناة");
      }
      throw err;
    });
    assertInsert(insertId, "communication_providers");

    invalidateCommunicationControlCache();

    void emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "communication_control.provider.created",
      entity: "communication_providers", entityId: insertId,
      details: JSON.stringify({ channel: body.channel, slug: body.slug }),
    }).catch((e) => logger.warn(e, "[event] provider.created"));
    void createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "create", entity: "communication_providers", entityId: insertId, after: body,
    }).catch((e) => logger.warn(e, "[audit] provider.created"));

    res.status(201).json({ id: insertId, ...body });
  } catch (err) {
    handleRouteError(err, res, "admin/communication-control/providers/create");
  }
});

router.patch("/providers/:id", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const body = zodParse(providerUpdateSchema.safeParse(req.body ?? {}));

    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    const setIf = (col: string, val: unknown, jsonb = false) => {
      if (val === undefined) return;
      sets.push(`"${col}" = $${idx++}${jsonb ? "::jsonb" : ""}`);
      params.push(jsonb ? JSON.stringify(val) : val);
    };
    setIf("name", body.name);
    setIf("status", body.status);
    setIf("priority", body.priority);
    setIf("config", body.config, true);
    setIf("notes", body.notes);

    if (sets.length === 0) throw new ValidationError("لا توجد بيانات للتحديث");
    sets.push(`"updatedAt" = NOW()`);
    params.push(id);

    const [row] = await rawQuery(
      `UPDATE communication_providers SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
      params,
    );
    if (!row) throw new NotFoundError("المزوّد غير موجود");
    invalidateCommunicationControlCache();

    void emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "communication_control.provider.updated",
      entity: "communication_providers", entityId: id, details: JSON.stringify(body),
    }).catch((e) => logger.warn(e, "[event] provider.updated"));
    void createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "update", entity: "communication_providers", entityId: id, after: body,
    }).catch((e) => logger.warn(e, "[audit] provider.updated"));

    res.json(row);
  } catch (err) {
    handleRouteError(err, res, "admin/communication-control/providers/update");
  }
});

// ─────────────────────── DLP rules ────────────────────────────────────────

const dlpRuleSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional().nullable(),
  channel: z.enum(["email", "whatsapp", "sms", "pbx", "webhook"]).optional().nullable(),
  pattern: z.string().min(1),
  action: z.enum(["flag", "redact", "block"]).default("flag"),
  replacement: z.string().max(60).optional().nullable(),
  severity: z.enum(["info", "warning", "critical"]).default("warning"),
  enabled: z.boolean().default(true),
});

router.get("/dlp-rules", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const cid = req.scope!.companyId;
    const rows = await rawQuery(
      `SELECT id, "companyId", name, description, channel, pattern, action, replacement,
              severity, enabled, "createdAt", "updatedAt"
         FROM communication_dlp_rules
        WHERE "companyId" = $1 OR "companyId" IS NULL
        ORDER BY enabled DESC, severity DESC, id ASC`,
      [cid],
    );
    res.json(maskFields(req, { data: rows, total: rows.length }));
  } catch (err) {
    handleRouteError(err, res, "admin/communication-control/dlp-rules/list");
  }
});

router.post("/dlp-rules", authorize({ feature: "admin", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const body = zodParse(dlpRuleSchema.safeParse(req.body));

    // Validate the regex is JS-compilable BEFORE we persist it, so a
    // malformed pattern fails the API call instead of being silently
    // skipped at scan time.
    try { new RegExp(body.pattern.replace(/\\m|\\M/g, "\\b"), "g"); }
    catch { throw new ValidationError("نمط regex غير صالح", { field: "pattern" }); }

    const { insertId } = await rawExecute(
      `INSERT INTO communication_dlp_rules
         ("companyId", name, description, channel, pattern, action, replacement, severity, enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        scope.companyId, body.name, body.description ?? null, body.channel ?? null,
        body.pattern, body.action, body.replacement ?? null, body.severity, body.enabled,
      ],
    );
    assertInsert(insertId, "communication_dlp_rules");

    invalidateCommunicationControlCache();

    void emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "communication_control.dlp_rule.created",
      entity: "communication_dlp_rules", entityId: insertId,
      details: JSON.stringify({ name: body.name, action: body.action }),
    }).catch((e) => logger.warn(e, "[event] dlp.created"));
    void createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "create", entity: "communication_dlp_rules", entityId: insertId, after: body,
    }).catch((e) => logger.warn(e, "[audit] dlp.created"));

    res.status(201).json({ id: insertId, ...body });
  } catch (err) {
    handleRouteError(err, res, "admin/communication-control/dlp-rules/create");
  }
});

router.patch("/dlp-rules/:id", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const body = zodParse(dlpRuleSchema.partial().safeParse(req.body ?? {}));

    if (body.pattern !== undefined) {
      try { new RegExp(body.pattern.replace(/\\m|\\M/g, "\\b"), "g"); }
      catch { throw new ValidationError("نمط regex غير صالح", { field: "pattern" }); }
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    for (const [col, val] of Object.entries(body)) {
      if (val === undefined) continue;
      sets.push(`"${col}" = $${idx++}`);
      params.push(val);
    }
    if (sets.length === 0) throw new ValidationError("لا توجد بيانات للتحديث");
    sets.push(`"updatedAt" = NOW()`);
    params.push(id);

    const [row] = await rawQuery(
      `UPDATE communication_dlp_rules SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
      params,
    );
    if (!row) throw new NotFoundError("القاعدة غير موجودة");
    invalidateCommunicationControlCache();

    void createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "update", entity: "communication_dlp_rules", entityId: id, after: body,
    }).catch((e) => logger.warn(e, "[audit] dlp.updated"));

    res.json(row);
  } catch (err) {
    handleRouteError(err, res, "admin/communication-control/dlp-rules/update");
  }
});

/**
 * POST /dlp-rules/test — dry-run the DLP scan against arbitrary text.
 * Lets the operator preview what would be redacted/blocked before
 * shipping a rule.
 */
const dlpTestSchema = z.object({
  body: z.string().min(1, "النص مطلوب"),
  channel: z.enum(["email", "whatsapp", "sms", "pbx", "webhook"]),
});

router.post("/dlp-rules/test", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const cid = req.scope!.companyId;
    const body = zodParse(dlpTestSchema.safeParse(req.body));
    const result = await applyDlp(body.body, body.channel, cid);
    res.json(maskFields(req, result));
  } catch (err) {
    handleRouteError(err, res, "admin/communication-control/dlp-rules/test");
  }
});

export default router;
