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
import { rawQuery, rawExecute, assertInsert, withTransaction } from "../lib/rawdb.js";
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
           FROM v_message_log_all
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

// ─────────────────────── channel readiness ────────────────────────────────

/**
 * GET /readiness — per-channel "is this actually wired?" snapshot.
 *
 * For each user-facing channel (email/sms/whatsapp/pbx) returns:
 *   - status: 'ready' | 'partial' | 'inactive' | 'blocked'
 *   - hasIntegration: active integration row with credentials configured
 *   - hasRoutingRule: at least one rule (company or global) sending here
 *   - pendingQueue: rows in outbound_queue waiting to drain
 *   - failedQueue: rows that failed permanently
 *   - extras per-channel (mailbox count for email, extension count for pbx)
 *
 * Answers the operator question "can I trust that an email actually
 * arrives if I trigger an event right now?" — instead of having to chase
 * three tabs and infer the answer.
 */
router.get("/readiness", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const cid = req.scope!.companyId;

    const integrationCounts = await rawQuery<{ type: string; active: string }>(
      `SELECT type, COUNT(*) FILTER (WHERE status = 'active')::text AS active
         FROM integrations
        WHERE "companyId" = $1 AND type IN ('email','smtp','sms','whatsapp','pbx')
        GROUP BY type`,
      [cid],
    ).catch(() => [] as { type: string; active: string }[]);

    const queueCounts = await rawQuery<{ channel: string; status: string; n: string }>(
      `SELECT channel, status, COUNT(*)::text AS n
         FROM outbound_queue
        WHERE "companyId" = $1
          AND "createdAt" > NOW() - INTERVAL '24 hours'
        GROUP BY channel, status`,
      [cid],
    ).catch(() => [] as { channel: string; status: string; n: string }[]);

    // A channel has a routing rule when any active rule (company or
    // global) lists it. We pull the channels arrays and reduce in JS so
    // we don't need a jsonb operator in the SELECT clause.
    const rules = await rawQuery<{ channels: unknown; isActive: boolean }>(
      `SELECT channels, "isActive"
         FROM notification_routing_rules
        WHERE ("companyId" = $1 OR "companyId" IS NULL) AND "isActive" = true`,
      [cid],
    ).catch(() => [] as { channels: unknown; isActive: boolean }[]);
    const enabledByChannel = new Set<string>();
    for (const r of rules) {
      const arr = typeof r.channels === "string" ? JSON.parse(r.channels) : r.channels;
      if (Array.isArray(arr)) for (const c of arr) enabledByChannel.add(String(c));
    }

    const mailboxCount = await rawQuery<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM mailbox_accounts
        WHERE "companyId" = $1 AND "deletedAt" IS NULL`,
      [cid],
    ).catch(() => [{ n: "0" }] as { n: string }[]);
    const extensionCount = await rawQuery<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM pbx_extensions
        WHERE "companyId" = $1 AND status = 'active'`,
      [cid],
    ).catch(() => [{ n: "0" }] as { n: string }[]);

    type ChannelKey = "email" | "sms" | "whatsapp" | "pbx";
    const integrationFor: Record<ChannelKey, string[]> = {
      email: ["email", "smtp"],
      sms: ["sms"],
      whatsapp: ["whatsapp"],
      pbx: ["pbx"],
    };

    const channelInfo = (k: ChannelKey) => {
      const integrationTypes = integrationFor[k];
      const hasIntegration = integrationCounts
        .filter((r) => integrationTypes.includes(r.type))
        .reduce((s, r) => s + Number(r.active || 0), 0) > 0;
      const pending = queueCounts.find((q) => q.channel === k && q.status === "pending");
      const failed = queueCounts.find((q) => q.channel === k && q.status === "failed");
      const hasRoutingRule = enabledByChannel.has(k);
      let status: "ready" | "partial" | "inactive" | "blocked";
      if (!hasIntegration && !hasRoutingRule) status = "inactive";
      else if (!hasIntegration || !hasRoutingRule) status = "partial";
      else if (Number(failed?.n ?? 0) > 0) status = "blocked";
      else status = "ready";
      const base = {
        channel: k,
        status,
        hasIntegration,
        hasRoutingRule,
        pendingQueue: Number(pending?.n ?? 0),
        failedQueue: Number(failed?.n ?? 0),
      };
      if (k === "email") return { ...base, connectedMailboxes: Number(mailboxCount[0]?.n ?? 0) };
      if (k === "pbx") return { ...base, activeExtensions: Number(extensionCount[0]?.n ?? 0) };
      return base;
    };

    res.json({
      data: {
        channels: [channelInfo("email"), channelInfo("sms"), channelInfo("whatsapp"), channelInfo("pbx")],
        // Routing rule + integration counts as a small at-a-glance bag.
        rulesActive: rules.length,
      },
    });
  } catch (err) {
    handleRouteError(err, res, "admin/communication-control/readiness");
  }
});

// ─────────────────────── outbound queue ─────────────────────────────────

/**
 * GET /outbound-queue — operational view of outbound_queue rows.
 *
 * The cron worker drains pending/queued rows on a 1-minute tick. When
 * something jams (bad credentials, provider outage, DNS flake) rows
 * pile up at 'failed' with their last errorMessage. Without this
 * endpoint the only way to see the backlog was direct SQL — operators
 * couldn't tell if a channel was degraded.
 *
 * Query params:
 *   status   — pending | sending | sent | failed | cancelled (optional)
 *   channel  — email | sms | whatsapp | push | pbx | internal (optional)
 *   hours    — window 1-168 (default 24)
 *   limit    — 1-200 (default 100)
 */
router.get("/outbound-queue", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const cid = req.scope!.companyId;
    const status = (req.query.status as string | undefined) ?? null;
    const channel = (req.query.channel as string | undefined) ?? null;
    const hours = Math.max(1, Math.min(168, Number(req.query.hours ?? 24)));
    const limit = Math.max(1, Math.min(200, Number(req.query.limit ?? 100)));

    const params: unknown[] = [cid, `${hours} hours`];
    let statusCond = "";
    if (status && ["pending","sending","sent","failed","cancelled"].includes(status)) {
      params.push(status);
      statusCond = ` AND status = $${params.length}`;
    }
    let channelCond = "";
    if (channel && ["email","sms","whatsapp","push","pbx","internal"].includes(channel)) {
      params.push(channel);
      channelCond = ` AND channel = $${params.length}`;
    }
    params.push(limit);

    const rows = await rawQuery(
      `SELECT id, channel, recipient, "recipientName", subject,
              status, attempts, "maxAttempts",
              LEFT(COALESCE("errorMessage",''), 240) AS "errorMessage",
              "scheduledAt"::text, "sentAt"::text,
              "messageLogId", "createdAt"::text
         FROM outbound_queue
        WHERE "companyId" = $1
          AND "createdAt" > NOW() - $2::interval
          ${statusCond}${channelCond}
        ORDER BY "createdAt" DESC
        LIMIT $${params.length}`,
      params,
    );

    // A small aggregate so the UI shows totals per status without a
    // second round-trip — the operator usually wants the count of
    // failed/pending to size the response.
    const totals = await rawQuery<{ status: string; count: string }>(
      `SELECT status, COUNT(*)::text AS count
         FROM outbound_queue
        WHERE "companyId" = $1
          AND "createdAt" > NOW() - $2::interval
        GROUP BY status`,
      [cid, `${hours} hours`],
    ).catch(() => [] as { status: string; count: string }[]);

    res.json({
      data: rows,
      total: rows.length,
      windowHours: hours,
      totalsByStatus: Object.fromEntries(totals.map(t => [t.status, Number(t.count)])),
    });
  } catch (err) {
    handleRouteError(err, res, "admin/communication-control/outbound-queue");
  }
});

/**
 * POST /outbound-queue/bulk-retry — admin force-retry every failed
 * row in the window. Mirrors POST /inbox/messages/:id/retry but as
 * a batch operation. Useful right after fixing a credentials or DNS
 * issue: one click drains the backlog without having to retry per
 * thread.
 */
const bulkRetrySchema = z.object({
  channel: z.enum(["email","sms","whatsapp","push","pbx","internal"]).optional(),
  hours: z.number().int().min(1).max(168).optional(),
  limit: z.number().int().min(1).max(500).optional(),
});

router.post("/outbound-queue/bulk-retry", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const body = zodParse(bulkRetrySchema.safeParse(req.body ?? {}));
    const hours = body.hours ?? 24;
    const limit = body.limit ?? 500;

    const params: unknown[] = [scope.companyId, `${hours} hours`];
    let channelCond = "";
    if (body.channel) {
      params.push(body.channel);
      channelCond = ` AND channel = $${params.length}`;
    }
    params.push(limit);

    // Re-queue + its message_log mirror are written atomically so the
    // inbox UI can never diverge from the queue state (previously the
    // mirror was a best-effort .catch left to drift until the next worker
    // tick).
    const queueReset = await withTransaction(async () => {
      const { affectedRows } = await rawExecute(
        `UPDATE outbound_queue
            SET status = 'pending',
                attempts = 0,
                "errorMessage" = NULL,
                "scheduledAt" = NOW(),
                "updatedAt" = NOW()
          WHERE "companyId" = $1
            AND status = 'failed'
            AND "createdAt" > NOW() - $2::interval
            ${channelCond}
            AND id IN (
              SELECT id FROM outbound_queue
               WHERE "companyId" = $1
                 AND status = 'failed'
                 AND "createdAt" > NOW() - $2::interval
                 ${channelCond}
               ORDER BY "createdAt" DESC
               LIMIT $${params.length}
            )`,
        params,
      );

      // Mirror message_log so the inbox UI reflects immediately.
      if (affectedRows > 0) {
        await rawExecute(
          `UPDATE message_log
              SET status = 'queued'
            WHERE id IN (
              SELECT "messageLogId" FROM outbound_queue
               WHERE "companyId" = $1
                 AND status = 'pending' AND attempts = 0
                 AND "updatedAt" > NOW() - INTERVAL '10 seconds'
                 AND "messageLogId" IS NOT NULL
            ) AND "companyId" = $1`,
          [scope.companyId],
        );
      }
      return affectedRows;
    });

    void createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "update", entity: "outbound_queue", entityId: 0,
      after: { bulkRetry: true, queueReset, channel: body.channel ?? "all", hours },
    }).catch((e) => logger.warn(e, "[audit] outbound-queue.bulk-retry"));

    res.json({ ok: true, queueReset });
  } catch (err) {
    handleRouteError(err, res, "admin/communication-control/outbound-queue/bulk-retry");
  }
});

/**
/**
 * GET /validation — inbound → triage → resolution funnel for the last
 * 24h. Drives the "هل النظام فعلاً يستقبل ويفرز ويُنشئ مهام؟" answer
 * the operator needs at a glance.
 *
 * Counters:
 *   - inboundTotal      — every direction='inbound' message in 24h
 *   - inboundByChannel  — per-channel breakdown
 *   - matchedToEntity   — those linked to a client/employee
 *   - unmatchedSenders  — distinct fromAddresses that DID NOT match
 *                         (so the operator knows who to link manually)
 *   - tasksOpened       — tasks whose linkedEntityType=message_log was
 *                         generated by the classifier in the same window
 *   - tasksResolved     — those tasks now in status='done'|'completed'
 *   - tasksBreached     — slaDeadline < NOW and not yet resolved
 */
router.get("/validation", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const cid = req.scope!.companyId;
    const sinceHours = Math.max(1, Math.min(168, Number(req.query.hours ?? 24)));

    const [
      inboundTotalRow,
      inboundByChannel,
      matchedRow,
      unmatchedRows,
      tasksOpenedRow,
      tasksResolvedRow,
      tasksBreachedRow,
    ] = await Promise.all([
      rawQuery<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM v_message_log_all
          WHERE "companyId" = $1 AND direction = 'inbound'
            AND "createdAt" > NOW() - ($2 || ' hours')::interval
            AND "deletedAt" IS NULL`,
        [cid, sinceHours],
      ),
      rawQuery<{ channel: string; count: number }>(
        `SELECT channel, COUNT(*)::int AS count FROM v_message_log_all
          WHERE "companyId" = $1 AND direction = 'inbound'
            AND "createdAt" > NOW() - ($2 || ' hours')::interval
            AND "deletedAt" IS NULL
          GROUP BY channel ORDER BY count DESC`,
        [cid, sinceHours],
      ),
      rawQuery<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM v_message_log_all
          WHERE "companyId" = $1 AND direction = 'inbound'
            AND "createdAt" > NOW() - ($2 || ' hours')::interval
            AND "deletedAt" IS NULL
            AND "relatedType" IS NOT NULL AND "relatedId" IS NOT NULL`,
        [cid, sinceHours],
      ),
      rawQuery<{ fromAddress: string; count: number }>(
        `SELECT "fromAddress", COUNT(*)::int AS count FROM v_message_log_all
          WHERE "companyId" = $1 AND direction = 'inbound'
            AND "createdAt" > NOW() - ($2 || ' hours')::interval
            AND "deletedAt" IS NULL
            AND ("relatedType" IS NULL OR "relatedId" IS NULL)
            AND "fromAddress" IS NOT NULL AND "fromAddress" <> ''
          GROUP BY "fromAddress" ORDER BY count DESC LIMIT 20`,
        [cid, sinceHours],
      ),
      rawQuery<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM tasks
          WHERE "companyId" = $1
            AND "linkedEntityType" IN ('message_log','clients','employees')
            AND "createdAt" > NOW() - ($2 || ' hours')::interval
            AND "deletedAt" IS NULL`,
        [cid, sinceHours],
      ),
      rawQuery<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM tasks
          WHERE "companyId" = $1
            AND "linkedEntityType" IN ('message_log','clients','employees')
            AND "createdAt" > NOW() - ($2 || ' hours')::interval
            AND status IN ('done','completed')
            AND "deletedAt" IS NULL`,
        [cid, sinceHours],
      ),
      rawQuery<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM tasks
          WHERE "companyId" = $1
            AND "linkedEntityType" IN ('message_log','clients','employees')
            AND "createdAt" > NOW() - ($2 || ' hours')::interval
            AND "slaDeadline" < NOW()
            AND status NOT IN ('done','completed')
            AND "deletedAt" IS NULL`,
        [cid, sinceHours],
      ),
    ]);

    const inboundTotal = inboundTotalRow[0]?.count ?? 0;
    const matched = matchedRow[0]?.count ?? 0;
    const tasksOpened = tasksOpenedRow[0]?.count ?? 0;
    const tasksResolved = tasksResolvedRow[0]?.count ?? 0;
    const tasksBreached = tasksBreachedRow[0]?.count ?? 0;

    res.json({
      data: {
        windowHours: sinceHours,
        inbound: {
          total: inboundTotal,
          byChannel: inboundByChannel,
        },
        triage: {
          matched,
          unmatched: inboundTotal - matched,
          matchedPct: inboundTotal > 0 ? Math.round((matched / inboundTotal) * 100) : 0,
          unmatchedSenders: unmatchedRows,
        },
        tasks: {
          opened: tasksOpened,
          resolved: tasksResolved,
          breached: tasksBreached,
          resolvedPct: tasksOpened > 0 ? Math.round((tasksResolved / tasksOpened) * 100) : 0,
        },
      },
    });
  } catch (err) {
    handleRouteError(err, res, "admin/communication-control/validation");
  }
});

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
                "fromAddress" AS from_addr,
                "toAddress" AS to_addr,
                subject,
                LEFT(body, 500) AS body,
                status,
                "relatedType" AS related_type,
                "relatedId" AS related_id,
                "createdAt"
           FROM v_message_log_all
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
