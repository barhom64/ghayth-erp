/**
 * Inbox — user-facing communications API.
 *
 * Until this router existed, employees could only see communication
 * logs through the read-only /communications page. There was no way
 * to:
 *   - send a new email / WhatsApp / SMS from the UI
 *   - reply to a conversation thread
 *   - see a single recipient's full history as a thread
 *
 * Routes:
 *   POST /inbox/send                 — compose a new outbound message
 *                                      on any channel; passes through
 *                                      notificationDispatch so DLP rules
 *                                      apply + provider failover works
 *   POST /inbox/threads/:id/reply    — reply in an existing thread
 *                                      (keyed by recipient address)
 *   GET  /inbox/threads              — list of conversations grouped by
 *                                      recipient + channel, with last
 *                                      message preview
 *   GET  /inbox/threads/:channel/:address — single thread detail with
 *                                      all messages in order
 *
 * Every send routes through dispatchSend below, which:
 *   1. Records the outbound row in communications_log (audit trail).
 *   2. Inserts into the channel's queue (email_queue / sms_queue /
 *      whatsapp_queue) so the existing workers pick it up.
 *   3. Applies DLP via the same scanner notificationDispatch uses on its
 *      template-driven sends. Blocked messages are written to the log
 *      with status='blocked_dlp' so the operator UI surfaces them.
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
import { sendMessage } from "../lib/messageSender.js";
import { logger } from "../lib/logger.js";

const router = Router();

const channelEnum = z.enum(["email", "whatsapp", "sms"]);

// Note: the actual send happens via lib/messageSender.sendMessage()
// — this router used to have a private dispatchSend() helper, but
// the same helper now lives in lib/messageSender.ts as the SINGLE
// send seam every route (inbox/communications/support/admin/employees)
// goes through. See docs/architecture/communications-unification.md.

// ─────────────────────── POST /send ───────────────────────────────────────

const sendSchema = z.object({
  channel: channelEnum,
  recipient: z.string().min(1, "المستلم مطلوب").max(300),
  recipientName: z.string().max(200).optional().nullable(),
  subject: z.string().max(500).optional().nullable(),
  body: z.string().min(1, "نص الرسالة مطلوب").max(20000),
  relatedType: z.string().max(60).optional().nullable(),
  relatedId: z.number().int().positive().optional().nullable(),
  // ISO 8601 datetime. When set, the row lands in outbound_queue with
  // scheduledAt > NOW() so the cron worker leaves it alone until then.
  scheduledAt: z.string().datetime({ offset: true }).optional().nullable(),
});

router.post("/send", authorize({ feature: "communications", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const body = zodParse(sendSchema.safeParse(req.body));

    // Lightweight per-channel format validation so a user typo doesn't
    // queue an obviously-broken message.
    if (body.channel === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.recipient)) {
      throw new ValidationError("صيغة البريد الإلكتروني غير صحيحة", { field: "recipient" });
    }
    if ((body.channel === "whatsapp" || body.channel === "sms") && !/^\+?[0-9]{7,20}$/.test(body.recipient.replace(/[\s-]/g, ""))) {
      throw new ValidationError("صيغة رقم الهاتف غير صحيحة", { field: "recipient" });
    }
    if (body.channel === "email" && !body.subject) {
      throw new ValidationError("عنوان البريد مطلوب", { field: "subject" });
    }
    if (body.scheduledAt) {
      const when = new Date(body.scheduledAt);
      // Reject obviously-broken values + dates in the past (no point
      // scheduling something that already happened).
      if (Number.isNaN(when.getTime())) {
        throw new ValidationError("صيغة وقت الجدولة غير صحيحة", { field: "scheduledAt" });
      }
      if (when.getTime() < Date.now() - 60_000) {
        throw new ValidationError("وقت الجدولة في الماضي", { field: "scheduledAt" });
      }
    }

    const result = await sendMessage({
      ...body,
      companyId: scope.companyId,
      userId: scope.userId,
    });
    res.status(result.blocked ? 422 : 201).json(maskFields(req, result));
  } catch (err) {
    handleRouteError(err, res, "inbox/send");
  }
});

// ─────────────────────── POST /threads/:id/reply ─────────────────────────

const replySchema = z.object({
  body: z.string().min(1).max(20000),
});

/**
 * Reply in an existing thread. The thread id is the
 * communications_log row that opens the conversation; we reuse its
 * channel, recipient, and relatedType/relatedId so the reply lands
 * in the same thread the UI groups by.
 */
router.post("/threads/:id/reply", authorize({ feature: "communications", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const body = zodParse(replySchema.safeParse(req.body));

    // Phase 4 contract slice 2: read from v_message_log_all so the
    // thread id passed in matches the id returned by GET /threads
    // (which already migrated in slice 1). Without this fix, the ids
    // would diverge — /threads returns message_log.id but the lookup
    // here would search communications_log.id.
    const [original] = await rawQuery<{
      channel: string;
      fromNumber: string | null;
      toNumber: string | null;
      relatedType: string | null;
      relatedId: number | null;
    }>(
      `SELECT channel,
              "fromAddress" AS "fromNumber",
              "toAddress" AS "toNumber",
              "relatedType", "relatedId"
         FROM v_message_log_all
        WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL
        LIMIT 1`,
      [id, scope.companyId],
    );
    if (!original) throw new NotFoundError("المحادثة غير موجودة");

    // The reply target is whichever of from/to we DIDN'T send last as
    // outbound. Inbound messages have the customer in fromNumber; we
    // reply to that. Outbound messages have the customer in toNumber.
    const recipient = original.fromNumber ?? original.toNumber ?? "";
    if (!recipient) throw new ValidationError("لا يوجد عنوان مستلم في المحادثة الأصلية");

    if (original.channel !== "email" && original.channel !== "whatsapp" && original.channel !== "sms") {
      throw new ValidationError(`القناة "${original.channel}" لا تدعم الرد المباشر`);
    }

    const result = await sendMessage({
      channel: original.channel as "email" | "whatsapp" | "sms",
      recipient,
      body: body.body,
      relatedType: original.relatedType,
      relatedId: original.relatedId,
      companyId: scope.companyId,
      userId: scope.userId,
    });
    res.status(result.blocked ? 422 : 201).json(maskFields(req, result));
  } catch (err) {
    handleRouteError(err, res, "inbox/threads/reply");
  }
});

// ─────────────────────── GET /threads ─────────────────────────────────────

/**
 * Thread list — one row per (channel, peer) where peer is the
 * counter-party address. Uses a window function over communications_log
 * to pick the most-recent message per group, plus an unread count from
 * inbound messages without a read marker (we don't have a per-user
 * read table yet, so unread = inbound + not in this session — for the
 * first version we just return total + last activity timestamp).
 */
router.get("/threads", authorize({ feature: "communications", action: "list" }), async (req, res) => {
  try {
    const cid = req.scope!.companyId;
    const channel = (req.query.channel as string | undefined) ?? null;
    // folder=starred is special — filters by isStarred=true. The
    // other folders (inbox/sent/archive/trash/spam) filter the
    // folder column directly.
    const folder = (req.query.folder as string | undefined) ?? null;
    const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50)));

    const params: unknown[] = [cid];
    let channelCond = "";
    if (channel && ["email", "whatsapp", "sms"].includes(channel)) {
      params.push(channel);
      channelCond = ` AND channel = $${params.length}`;
    }
    let folderCond = "";
    if (folder === "starred") {
      folderCond = ` AND "isStarred" = true`;
    } else if (folder && ["inbox", "sent", "drafts", "archive", "trash", "spam"].includes(folder)) {
      params.push(folder);
      folderCond = ` AND folder = $${params.length}`;
    }

    // Entity filter: when the page is opened from a client/supplier/etc.
    // detail page with ?relatedType=X&relatedId=Y, surface only messages
    // linked to that entity. messageSender writes those columns on every
    // outbound send (recipient.ts uses them); inbound emails get linked
    // via matchSenderToEntity. Falls back to peer-address matching when
    // an entity has registered phone/email addresses so legacy unlinked
    // rows still show up.
    let relatedCond = "";
    const relatedType = (req.query.relatedType as string | undefined)?.trim();
    const relatedId = Number(req.query.relatedId);
    if (relatedType && Number.isFinite(relatedId) && relatedId > 0) {
      params.push(relatedType, relatedId);
      const tIdx = params.length - 1;
      const iIdx = params.length;
      // Resolve the entity's contact addresses so unlinked rows (e.g.
      // imported emails before the entity existed) still surface.
      let addrSubquery = "";
      if (relatedType === "clients") {
        addrSubquery = `SELECT phone FROM clients WHERE id = $${iIdx} AND "companyId" = $1 UNION SELECT email FROM clients WHERE id = $${iIdx} AND "companyId" = $1`;
      } else if (relatedType === "suppliers") {
        addrSubquery = `SELECT phone FROM suppliers WHERE id = $${iIdx} AND "companyId" = $1 UNION SELECT email FROM suppliers WHERE id = $${iIdx} AND "companyId" = $1`;
      } else if (relatedType === "employees") {
        addrSubquery = `SELECT phone FROM employees WHERE id = $${iIdx} AND "companyId" = $1 UNION SELECT email FROM employees WHERE id = $${iIdx} AND "companyId" = $1 UNION SELECT "personalEmail" FROM employees WHERE id = $${iIdx} AND "companyId" = $1 UNION SELECT "internalEmail" FROM employees WHERE id = $${iIdx} AND "companyId" = $1`;
      }
      if (addrSubquery) {
        relatedCond = ` AND (("relatedType" = $${tIdx} AND "relatedId" = $${iIdx}) OR "fromAddress" IN (${addrSubquery}) OR "toAddress" IN (${addrSubquery}))`;
      } else {
        relatedCond = ` AND "relatedType" = $${tIdx} AND "relatedId" = $${iIdx}`;
      }
    }

    // Phase 4 contract step: read from v_message_log_all (the unified
    // view created in migration 221). Columns are aliased back to
    // fromNumber / toNumber so the frontend response shape is identical
    // to the pre-contract version — this is purely a storage swap, no
    // API change. The view's fromAddress/toAddress columns are wider
    // (varchar(300) vs the legacy varchar(20)) so future email-address
    // peer keys work without truncation.
    // Append the current userId so the unread-count subquery can
    // LEFT JOIN against the per-user read state without a separate
    // round-trip. message_read_state only has rows for *read* messages,
    // so COUNT(... mrs IS NULL) = unread inbound for this user.
    params.push(req.scope!.userId);
    const userIdx = params.length;

    const rows = await rawQuery(
      `WITH peer AS (
         SELECT v.id, v.channel, v.direction,
                COALESCE(NULLIF(v."fromAddress",''), v."toAddress") AS peer_addr,
                v."fromAddress" AS "fromNumber", v."toAddress" AS "toNumber",
                v.subject, v.body, v.status, v.folder, v."isStarred",
                v."relatedType", v."relatedId", v."createdAt",
                CASE WHEN v.direction = 'inbound' AND mrs."messageLogId" IS NULL
                     THEN 1 ELSE 0 END AS is_unread,
                ROW_NUMBER() OVER (
                  PARTITION BY v.channel, COALESCE(NULLIF(v."fromAddress",''), v."toAddress")
                  ORDER BY v."createdAt" DESC
                ) AS rn,
                COUNT(*) OVER (
                  PARTITION BY v.channel, COALESCE(NULLIF(v."fromAddress",''), v."toAddress")
                ) AS total_messages,
                COUNT(*) FILTER (WHERE v.direction = 'inbound') OVER (
                  PARTITION BY v.channel, COALESCE(NULLIF(v."fromAddress",''), v."toAddress")
                ) AS inbound_count,
                SUM(CASE WHEN v.direction = 'inbound' AND mrs."messageLogId" IS NULL
                         THEN 1 ELSE 0 END) OVER (
                  PARTITION BY v.channel, COALESCE(NULLIF(v."fromAddress",''), v."toAddress")
                ) AS unread_count
           FROM v_message_log_all v
           LEFT JOIN message_read_state mrs
             ON mrs."messageLogId" = v.id AND mrs."userId" = $${userIdx}
          WHERE v."companyId" = $1 AND v."deletedAt" IS NULL
            ${channelCond}${folderCond}${relatedCond}
       )
       SELECT id, channel, direction, peer_addr AS peer, "fromNumber", "toNumber",
              subject, LEFT(body, 300) AS body_preview, status,
              folder, "isStarred",
              "relatedType", "relatedId", "createdAt",
              total_messages, inbound_count, unread_count
         FROM peer
        WHERE rn = 1 AND peer_addr IS NOT NULL
        ORDER BY "createdAt" DESC
        LIMIT $${params.length + 1}`,
      [...params, limit],
    );
    res.json(maskFields(req, { data: rows, total: rows.length }));
  } catch (err) {
    handleRouteError(err, res, "inbox/threads/list");
  }
});

// ─────────────────────── GET /search ──────────────────────────────────────

/**
 * Full-text search across the user's inbox. Hits subject + body
 * + fromAddress + toAddress so a customer-name query like "أحمد"
 * matches both a message titled "طلب من أحمد" and a thread from
 * a sender whose name appears in the body.
 *
 * Returns messages (not threads) ordered by recency so the user
 * sees the most recent match first. Tenant-scoped, soft-delete aware.
 *
 * Query params:
 *   q        — search term (required, 2+ chars after trim)
 *   channel  — optional filter (email/whatsapp/sms/pbx)
 *   from     — optional ISO date lower bound (inclusive)
 *   to       — optional ISO date upper bound (inclusive)
 *   limit    — 1-100, default 50
 */
router.get("/search", authorize({ feature: "communications", action: "list" }), async (req, res) => {
  try {
    const cid = req.scope!.companyId;
    const q = String(req.query.q ?? "").trim();
    if (q.length < 2) {
      res.json({ data: [], total: 0, query: q });
      return;
    }
    const channel = (req.query.channel as string | undefined) ?? null;
    const fromDate = (req.query.from as string | undefined) ?? null;
    const toDate = (req.query.to as string | undefined) ?? null;
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50)));

    const params: unknown[] = [cid, `%${q}%`];
    let channelCond = "";
    if (channel && ["email", "whatsapp", "sms", "pbx"].includes(channel)) {
      params.push(channel);
      channelCond = ` AND channel = $${params.length}`;
    }
    let dateCond = "";
    if (fromDate) {
      params.push(fromDate);
      dateCond += ` AND "createdAt" >= $${params.length}`;
    }
    if (toDate) {
      params.push(toDate);
      dateCond += ` AND "createdAt" <= $${params.length}`;
    }
    params.push(limit);

    const rows = await rawQuery(
      `SELECT id, channel, direction,
              "fromAddress" AS "fromNumber",
              "toAddress"   AS "toNumber",
              subject,
              LEFT(body, 300) AS body_preview,
              status, folder, "isStarred",
              "relatedType", "relatedId", "createdAt"
         FROM v_message_log_all
        WHERE "companyId" = $1
          AND "deletedAt" IS NULL
          AND (subject ILIKE $2 OR body ILIKE $2
               OR "fromAddress" ILIKE $2 OR "toAddress" ILIKE $2)
          ${channelCond}${dateCond}
        ORDER BY "createdAt" DESC
        LIMIT $${params.length}`,
      params,
    );
    res.json(maskFields(req, { data: rows, total: rows.length, query: q }));
  } catch (err) {
    handleRouteError(err, res, "inbox/search");
  }
});

// ─────────────────────── GET /threads/:channel/:address ──────────────────

router.get("/threads/:channel/:address", authorize({ feature: "communications", action: "list" }), async (req, res) => {
  try {
    const cid = req.scope!.companyId;
    const channel = String(req.params.channel);
    const address = String(req.params.address);
    if (!["email", "whatsapp", "sms"].includes(channel)) {
      throw new ValidationError("قناة غير مدعومة");
    }
    // Phase 4 contract step: read from v_message_log_all + alias the
    // unified column names back to fromNumber/toNumber so the frontend
    // sees no shape change. See /threads (above) for the rationale.
    // LEFT JOIN message_read_state so the response carries an isRead
    // bit per message — frontend renders unread chips inside the thread.
    const rows = await rawQuery(
      `SELECT v.id, v.channel, v.direction,
              v."fromAddress" AS "fromNumber", v."toAddress" AS "toNumber",
              v.subject, v.body, v.status, v."relatedType", v."relatedId", v."createdAt",
              (v.direction = 'outbound' OR mrs."messageLogId" IS NOT NULL) AS "isRead",
              mrs."readAt"
         FROM v_message_log_all v
         LEFT JOIN message_read_state mrs
           ON mrs."messageLogId" = v.id AND mrs."userId" = $4
        WHERE v."companyId" = $1
          AND v.channel = $2
          AND v."deletedAt" IS NULL
          AND (
            COALESCE(NULLIF(v."fromAddress",''), '') = $3
            OR COALESCE(NULLIF(v."toAddress",''), '') = $3
          )
        ORDER BY v."createdAt" ASC
        LIMIT 500`,
      [cid, channel, address, req.scope!.userId],
    );
    res.json(maskFields(req, { data: rows, total: rows.length, peer: address, channel }));
  } catch (err) {
    handleRouteError(err, res, "inbox/threads/get");
  }
});

// ─────────────────────── GET /calls ───────────────────────────────────────

router.get("/calls", authorize({ feature: "communications", action: "list" }), async (req, res) => {
  try {
    const cid = req.scope!.companyId;
    const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50)));
    const rows = await rawQuery(
      `SELECT c.id, c."callId", c."callerNumber", c."calledNumber", c.direction,
              c.duration, c.status, c."recordingUrl", c."createdAt",
              t.status AS "transcriptStatus", t.summary IS NOT NULL AS "hasSummary",
              LEFT(t.summary, 300) AS "summaryPreview"
         FROM pbx_calls c
         LEFT JOIN pbx_call_transcripts t ON t."callId" = c.id
        WHERE c."companyId" = $1
        ORDER BY c."createdAt" DESC
        LIMIT $2`,
      [cid, limit],
    );
    res.json(maskFields(req, { data: rows, total: rows.length }));
  } catch (err) {
    handleRouteError(err, res, "inbox/calls");
  }
});

// ─────────────────────── POST /calls ──────────────────────────────────────

const logCallSchema = z.object({
  callerNumber: z.string().min(1).max(20),
  calledNumber: z.string().min(1).max(20),
  direction: z.enum(["inbound", "outbound"]).default("outbound"),
  duration: z.number().int().min(0).max(86400).default(0),
  status: z.enum(["completed", "no_answer", "busy", "failed"]).default("completed"),
  notes: z.string().max(2000).optional().nullable(),
  relatedType: z.string().max(60).optional().nullable(),
  relatedId: z.number().int().positive().optional().nullable(),
});

/**
 * Manual call log — used when an employee makes a call from their
 * personal mobile and wants to record it in the system. No PBX
 * integration required; the row goes straight into pbx_calls with
 * callId='manual-<random>' so it doesn't collide with vendor IDs.
 */
router.post("/calls", authorize({ feature: "communications", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const body = zodParse(logCallSchema.safeParse(req.body));
    const callId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { insertId } = await rawExecute(
      `INSERT INTO pbx_calls ("companyId", "callId", "callerNumber", "calledNumber", direction, duration, status, "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        scope.companyId, callId,
        body.callerNumber, body.calledNumber,
        body.direction, body.duration, body.status,
      ],
    );
    assertInsert(insertId, "pbx_calls");

    // Mirror in message_log so the call shows up in the unified thread
    // view alongside email/SMS/WhatsApp. Phase 4 final contract:
    // legacy communications_log INSERT dropped; channel='pbx' accepted
    // by the relaxed constraint from migration 224.
    const fromAddr = body.direction === "outbound" ? scope.userId.toString() : body.callerNumber;
    const toAddr = body.direction === "outbound" ? body.calledNumber : scope.userId.toString();
    const callBody = `${body.status} · ${body.duration}s${body.notes ? ` · ${body.notes}` : ""}`;
    await rawExecute(
      `INSERT INTO message_log
         ("companyId", channel, direction, "fromAddress", "toAddress",
          body, status, folder, "relatedType", "relatedId", "createdAt")
       VALUES ($1, 'pbx', $2, $3, $4, $5, 'logged',
               CASE WHEN $2 = 'inbound' THEN 'inbox' ELSE 'sent' END,
               $6, $7, NOW())`,
      [scope.companyId, body.direction, fromAddr, toAddr, callBody, body.relatedType ?? null, body.relatedId ?? null],
    );

    void emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "communications.call.logged_manual",
      entity: "pbx_calls", entityId: insertId,
      details: JSON.stringify({ direction: body.direction, status: body.status, duration: body.duration }),
    }).catch((e) => logger.warn(e, "[event] call.logged_manual"));
    void createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "create", entity: "pbx_calls", entityId: insertId,
      after: { callId, callerNumber: body.callerNumber, calledNumber: body.calledNumber, manual: true },
    }).catch((e) => logger.warn(e, "[audit] call.logged_manual"));

    res.status(201).json({ id: insertId, callId, manual: true });
  } catch (err) {
    handleRouteError(err, res, "inbox/calls/create");
  }
});

// ─────────────────────── GET /recipients/search ──────────────────────────

/**
 * Search clients + employees by name/phone/email and return a flat
 * list the compose dialog can autocomplete into. Channel-aware:
 *   - email  → returns only entries with an email address
 *   - sms/whatsapp → returns only entries with a phone number
 * Capped at 30 results so the dropdown stays fast.
 */
router.get("/recipients/search", authorize({ feature: "communications", action: "list" }), async (req, res) => {
  try {
    const cid = req.scope!.companyId;
    const q = String(req.query.q ?? "").trim();
    const channel = String(req.query.channel ?? "email") as "email" | "sms" | "whatsapp";
    if (q.length < 2) {
      res.json(maskFields(req, { data: [], total: 0 }));
      return;
    }
    const like = `%${q}%`;

    // Pull from clients + employees in one query via UNION ALL. The
    // channel filter restricts to rows that actually have the right
    // contact field, so an email search never returns a phone-only
    // client.
    const fieldCheck = channel === "email" ? `c.email IS NOT NULL AND c.email <> ''`
      : `c.phone IS NOT NULL AND c.phone <> ''`;
    const empFieldCheck = channel === "email" ? `e.email IS NOT NULL AND e.email <> ''`
      : `e.phone IS NOT NULL AND e.phone <> ''`;

    const rows = await rawQuery(
      `(
         SELECT 'client' AS kind, c.id, c.name,
                c.phone, c.email,
                COALESCE(c.code, '') AS code
           FROM clients c
          WHERE c."companyId" = $1
            AND c."deletedAt" IS NULL
            AND ${fieldCheck}
            AND (c.name ILIKE $2 OR c.phone ILIKE $2 OR c.email ILIKE $2 OR c.code ILIKE $2)
          LIMIT 15
       )
       UNION ALL
       (
         SELECT 'employee' AS kind, e.id, e.name,
                e.phone, e.email,
                COALESCE(e."empNumber", '') AS code
           FROM employees e
           JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea."companyId" = $1
          WHERE e."deletedAt" IS NULL
            AND ${empFieldCheck}
            AND (e.name ILIKE $2 OR e.phone ILIKE $2 OR e.email ILIKE $2)
          LIMIT 15
       )`,
      [cid, like],
    );
    res.json(maskFields(req, { data: rows, total: rows.length }));
  } catch (err) {
    handleRouteError(err, res, "inbox/recipients/search");
  }
});

// ─────────────────────── GET /templates ──────────────────────────────────

/**
 * List notification templates for the compose dialog's template
 * picker. Operator-managed via the existing notification engine;
 * here we just expose the active ones filterable by channel.
 */
router.get("/templates", authorize({ feature: "communications", action: "list" }), async (req, res) => {
  try {
    const cid = req.scope!.companyId;
    const channel = (req.query.channel as string | undefined) ?? null;
    const params: unknown[] = [cid];
    let channelCond = "";
    if (channel && ["email", "whatsapp", "sms"].includes(channel)) {
      params.push(channel);
      channelCond = ` AND channel = $${params.length}`;
    }
    const rows = await rawQuery(
      `SELECT id, "templateKey", channel, "titleTemplate", "bodyTemplate",
              variables, language, "isDefault"
         FROM notification_templates
        WHERE ("companyId" = $1 OR "companyId" IS NULL)
          AND "isActive" = true
          ${channelCond}
        ORDER BY "isDefault" DESC, "templateKey" ASC
        LIMIT 100`,
      params,
    );
    res.json(maskFields(req, { data: rows, total: rows.length }));
  } catch (err) {
    handleRouteError(err, res, "inbox/templates");
  }
});

// ─────────────────────── Phase 2 — Folders / Drafts / Signatures ─────────

/**
 * POST /inbox/messages/:id/folder — move a message to a folder.
 * Folders: inbox / sent / drafts / archive / trash / spam.
 * Tenant-scoped; the underlying communications_log row must belong
 * to the caller's company.
 */
const folderSchema = z.object({
  folder: z.enum(["inbox", "sent", "drafts", "archive", "trash", "spam"]),
});

router.post("/messages/:id/folder", authorize({ feature: "communications", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const body = zodParse(folderSchema.safeParse(req.body));
    // Phase 4 contract slice 7: UPDATE message_log (the unified table)
    // because GET /threads (since slice 1) returns message_log.id. If
    // we still updated communications_log, the id wouldn't resolve to
    // a row for messages written by messageSender's dual-write.
    // The Phase-4 backfill seeded message_log from the legacy table,
    // so older rows update correctly here too.
    const { affectedRows } = await rawExecute(
      `UPDATE message_log SET folder = $1
        WHERE id = $2 AND "companyId" = $3 AND "deletedAt" IS NULL`,
      [body.folder, id, scope.companyId],
    );
    if (!affectedRows) throw new NotFoundError("الرسالة غير موجودة");
    void createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "update", entity: "message_log", entityId: id,
      after: { folder: body.folder },
    }).catch((e) => logger.warn(e, "[audit] message.folder"));
    res.json({ ok: true, folder: body.folder });
  } catch (err) {
    handleRouteError(err, res, "inbox/messages/folder");
  }
});

/**
 * POST /inbox/messages/bulk-folder — move many messages to a folder in
 * one round trip. Used by the inbox UI's "select all → archive" / "→
 * trash" affordance which would otherwise issue one PATCH per row.
 *
 * Body: { ids: number[]; folder: "inbox"|"sent"|"archive"|"trash"|"spam" }
 *
 * Caps at 500 ids per call so a runaway client can't lock the table.
 * Returns the count actually updated (rows that matched tenant + id +
 * not-deleted). All rows that match get one audit log entry summarizing
 * the bulk action so the audit table doesn't balloon by 500x.
 */
const bulkFolderSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(500),
  folder: z.enum(["inbox", "sent", "archive", "trash", "spam"]),
});

router.post("/messages/bulk-folder", authorize({ feature: "communications", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const body = zodParse(bulkFolderSchema.safeParse(req.body));

    const { affectedRows } = await rawExecute(
      `UPDATE message_log
          SET folder = $1
        WHERE id = ANY($2::int[])
          AND "companyId" = $3
          AND "deletedAt" IS NULL`,
      [body.folder, body.ids, scope.companyId],
    );

    void createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "update", entity: "message_log",
      // 0 marks "bulk action" — actual ids are in the metadata.
      entityId: 0,
      after: { folder: body.folder, idsCount: body.ids.length, affected: affectedRows, ids: body.ids.slice(0, 50) },
    }).catch((e) => logger.warn(e, "[audit] message.bulk_folder"));

    res.json({ ok: true, folder: body.folder, affected: affectedRows });
  } catch (err) {
    handleRouteError(err, res, "inbox/messages/bulk-folder");
  }
});

/**
 * POST /inbox/messages/:id/retry — re-queue a failed outbound message.
 *
 * When the cron worker exhausts maxAttempts the row sits at status='failed'
 * with the last errorMessage. Operators often want to retry after fixing
 * the cause (DNS, credentials, recipient address). This endpoint resets
 * attempts=0, status='pending', clears errorMessage and bumps scheduledAt
 * to NOW so the next worker tick picks it up.
 *
 * Guards:
 *   - the row must belong to this tenant
 *   - the row must have current status='failed' (no retrying a row
 *     that's actively sending; no resurrecting a cancelled row)
 *   - blocked_dlp on the message_log side stops the reset (DLP block is
 *     a policy decision, not a delivery failure)
 */
router.post("/messages/:id/retry", authorize({ feature: "communications", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const msgId = parseId(req.params.id, "id");

    // Source of truth is message_log.id; the queue row links via
    // messageLogId. We require a queue row to retry — outbound-only.
    const [msg] = await rawQuery<{ id: number; status: string; direction: string }>(
      `SELECT id, status, direction FROM message_log
        WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL LIMIT 1`,
      [msgId, scope.companyId],
    );
    if (!msg) throw new NotFoundError("الرسالة غير موجودة");
    if (msg.direction !== "outbound") throw new ValidationError("لا يمكن إعادة محاولة رسالة واردة");
    if (msg.status === "blocked_dlp") {
      throw new ValidationError("هذه الرسالة محجوبة بواسطة قواعد DLP — لا يمكن إعادة محاولتها");
    }

    const { affectedRows } = await rawExecute(
      `UPDATE outbound_queue
          SET status = 'pending',
              attempts = 0,
              "errorMessage" = NULL,
              "scheduledAt" = NOW(),
              "updatedAt" = NOW()
        WHERE "messageLogId" = $1 AND "companyId" = $2 AND status = 'failed'`,
      [msgId, scope.companyId],
    );
    if (!affectedRows) {
      throw new ValidationError("لا يوجد صف في قائمة الإرسال بحالة فاشلة لهذه الرسالة");
    }

    // Mirror message_log so the inbox shows the new status immediately,
    // without waiting for the worker to tick.
    await rawExecute(
      `UPDATE message_log SET status = 'queued' WHERE id = $1 AND "companyId" = $2`,
      [msgId, scope.companyId],
    ).catch((e) => logger.warn(e, "[inbox/retry] mirror status update failed"));

    void createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "update", entity: "message_log", entityId: msgId,
      after: { retriedAt: new Date().toISOString(), status: "queued" },
    }).catch((e) => logger.warn(e, "[audit] message.retry"));

    res.json({ ok: true, status: "queued", rowsReset: affectedRows });
  } catch (err) {
    handleRouteError(err, res, "inbox/messages/retry");
  }
});

/**
 * POST /inbox/messages/:id/cancel — cancel a scheduled outbound message.
 *
 * Only works when the row in outbound_queue is still 'pending' AND its
 * scheduledAt is comfortably in the future. Once the worker picks it up
 * (status flips to 'sending') or it actually went out, cancellation is
 * no longer possible. Mirrors message_log.status='cancelled' so the
 * inbox UI reflects the change immediately.
 */
router.post("/messages/:id/cancel", authorize({ feature: "communications", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const msgId = parseId(req.params.id, "id");

    const [msg] = await rawQuery<{ id: number; status: string; direction: string }>(
      `SELECT id, status, direction FROM message_log
        WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL LIMIT 1`,
      [msgId, scope.companyId],
    );
    if (!msg) throw new NotFoundError("الرسالة غير موجودة");
    if (msg.direction !== "outbound") throw new ValidationError("لا يمكن إلغاء رسالة واردة");

    // Cron worker ticks every 60s — add a 30s safety margin so we don't
    // race a worker that's milliseconds away from picking the row up.
    const { affectedRows } = await rawExecute(
      `UPDATE outbound_queue
          SET status = 'cancelled', "updatedAt" = NOW()
        WHERE "messageLogId" = $1 AND "companyId" = $2
          AND status = 'pending'
          AND "scheduledAt" IS NOT NULL
          AND "scheduledAt" > NOW() + INTERVAL '30 seconds'`,
      [msgId, scope.companyId],
    );
    if (!affectedRows) {
      throw new ValidationError(
        "لا يمكن إلغاء هذه الرسالة — قد تكون قيد الإرسال أو حان وقت جدولتها",
      );
    }

    await rawExecute(
      `UPDATE message_log SET status = 'cancelled' WHERE id = $1 AND "companyId" = $2`,
      [msgId, scope.companyId],
    ).catch((e) => logger.warn(e, "[inbox/cancel] mirror status update failed"));

    void createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "update", entity: "message_log", entityId: msgId,
      after: { cancelledAt: new Date().toISOString(), status: "cancelled" },
    }).catch((e) => logger.warn(e, "[audit] message.cancel"));

    res.json({ ok: true, status: "cancelled" });
  } catch (err) {
    handleRouteError(err, res, "inbox/messages/cancel");
  }
});
/**
 * POST /inbox/messages/:id/star — toggle the starred flag.
 */
router.post("/messages/:id/star", authorize({ feature: "communications", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    // Phase 4 contract slice 7 — see /folder above.
    const [row] = await rawQuery<{ isStarred: boolean }>(
      `UPDATE message_log SET "isStarred" = NOT "isStarred"
        WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL
        RETURNING "isStarred"`,
      [id, scope.companyId],
    );
    if (!row) throw new NotFoundError("الرسالة غير موجودة");
    res.json({ ok: true, isStarred: row.isStarred });
  } catch (err) {
    handleRouteError(err, res, "inbox/messages/star");
  }
});

// ─────────────────────── Read state (per-user) ────────────────────────────

/**
 * POST /inbox/messages/:id/read — mark a single inbound message as
 * read by the current user. Idempotent: repeated calls just bump
 * readAt. Outbound rows are no-op (already known to the sender) but
 * we still 200 so the frontend can call it indiscriminately.
 *
 * Read state is per-user — see migration 265 for the rationale.
 */
router.post("/messages/:id/read", authorize({ feature: "communications", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [msg] = await rawQuery<{ direction: string }>(
      `SELECT direction FROM message_log
        WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId],
    );
    if (!msg) throw new NotFoundError("الرسالة غير موجودة");
    if (msg.direction !== "inbound") {
      res.json({ ok: true, skipped: "outbound" });
      return;
    }
    await rawExecute(
      `INSERT INTO message_read_state ("messageLogId", "userId", "companyId", "readAt")
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT ("messageLogId", "userId") DO UPDATE SET "readAt" = NOW()`,
      [id, scope.userId, scope.companyId],
    );
    res.json({ ok: true });
  } catch (err) {
    handleRouteError(err, res, "inbox/messages/read");
  }
});

/**
 * POST /inbox/threads/:channel/:address/read — bulk-mark every inbound
 * message in a thread as read by the current user. Called by the
 * frontend when the user opens a thread, so a multi-message
 * conversation drops the unread badge in one round-trip instead of N.
 */
router.post("/threads/:channel/:address/read", authorize({ feature: "communications", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const channel = String(req.params.channel);
    const address = String(req.params.address);
    if (!["email", "whatsapp", "sms"].includes(channel)) {
      throw new ValidationError("قناة غير مدعومة");
    }
    // INSERT … SELECT only inbound rows of the thread that the user
    // hasn't already marked. ON CONFLICT is a safety net for races
    // between two tabs of the same user.
    const { affectedRows } = await rawExecute(
      `INSERT INTO message_read_state ("messageLogId", "userId", "companyId", "readAt")
       SELECT ml.id, $2, $3, NOW()
         FROM message_log ml
        WHERE ml."companyId" = $3
          AND ml.channel = $1
          AND ml.direction = 'inbound'
          AND ml."deletedAt" IS NULL
          AND (
            COALESCE(NULLIF(ml."fromAddress",''), '') = $4
            OR COALESCE(NULLIF(ml."toAddress",''), '') = $4
          )
       ON CONFLICT ("messageLogId", "userId") DO UPDATE SET "readAt" = NOW()`,
      [channel, scope.userId, scope.companyId, address],
    );
    res.json({ ok: true, marked: affectedRows });
  } catch (err) {
    handleRouteError(err, res, "inbox/threads/read");
  }
});

/**
 * GET /inbox/unread-count — total unread inbound messages for the
 * current user, plus a per-channel breakdown so the sidebar can
 * render a badge next to each channel filter. Drives the navbar
 * inbox badge.
 */
router.get("/unread-count", authorize({ feature: "communications", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<{ channel: string; n: string }>(
      `SELECT ml.channel, COUNT(*)::text AS n
         FROM message_log ml
         LEFT JOIN message_read_state mrs
           ON mrs."messageLogId" = ml.id AND mrs."userId" = $2
        WHERE ml."companyId" = $1
          AND ml.direction = 'inbound'
          AND ml."deletedAt" IS NULL
          AND ml.folder NOT IN ('trash', 'spam', 'archive')
          AND mrs."messageLogId" IS NULL
        GROUP BY ml.channel`,
      [scope.companyId, scope.userId],
    );
    const byChannel: Record<string, number> = {};
    let total = 0;
    for (const r of rows) {
      const n = Number(r.n);
      byChannel[r.channel] = n;
      total += n;
    }
    res.json({ total, byChannel });
  } catch (err) {
    handleRouteError(err, res, "inbox/unread-count");
  }
});

// ─────────────────────── Drafts ───────────────────────────────────────────

const draftSchema = z.object({
  channel: z.enum(["email", "whatsapp", "sms"]),
  recipient: z.string().max(300).optional().nullable(),
  recipientName: z.string().max(200).optional().nullable(),
  subject: z.string().max(500).optional().nullable(),
  body: z.string().max(20000).default(""),
  templateKey: z.string().max(120).optional().nullable(),
  relatedType: z.string().max(60).optional().nullable(),
  relatedId: z.number().int().positive().optional().nullable(),
  scheduledAt: z.string().datetime().optional().nullable(),
});

router.get("/drafts", authorize({ feature: "communications", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(
      `SELECT id, channel, recipient, "recipientName", subject, body, "templateKey",
              "relatedType", "relatedId", "scheduledAt", "lastSavedAt", "createdAt"
         FROM email_drafts
        WHERE "companyId" = $1 AND "userId" = $2
        ORDER BY "lastSavedAt" DESC
        LIMIT 100`,
      [scope.companyId, scope.userId],
    );
    res.json(maskFields(req, { data: rows, total: rows.length }));
  } catch (err) {
    handleRouteError(err, res, "inbox/drafts/list");
  }
});

router.post("/drafts", authorize({ feature: "communications", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const body = zodParse(draftSchema.safeParse(req.body));
    const { insertId } = await rawExecute(
      `INSERT INTO email_drafts
         ("companyId", "userId", channel, recipient, "recipientName", subject, body,
          "templateKey", "relatedType", "relatedId", "scheduledAt", "lastSavedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
      [
        scope.companyId, scope.userId, body.channel,
        body.recipient ?? null, body.recipientName ?? null,
        body.subject ?? null, body.body, body.templateKey ?? null,
        body.relatedType ?? null, body.relatedId ?? null,
        body.scheduledAt ?? null,
      ],
    );
    assertInsert(insertId, "email_drafts");
    res.status(201).json({ id: insertId });
  } catch (err) {
    handleRouteError(err, res, "inbox/drafts/create");
  }
});

router.patch("/drafts/:id", authorize({ feature: "communications", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const body = zodParse(draftSchema.partial().safeParse(req.body ?? {}));
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    for (const [col, val] of Object.entries(body)) {
      if (val === undefined) continue;
      sets.push(`"${col}" = $${idx++}`);
      params.push(val);
    }
    if (sets.length === 0) throw new ValidationError("لا توجد بيانات للتحديث");
    sets.push(`"lastSavedAt" = NOW()`);
    params.push(id, scope.companyId, scope.userId);
    const [row] = await rawQuery(
      `UPDATE email_drafts SET ${sets.join(", ")}
        WHERE id = $${idx++} AND "companyId" = $${idx++} AND "userId" = $${idx}
       RETURNING *`,
      params,
    );
    if (!row) throw new NotFoundError("المسودة غير موجودة");
    res.json(maskFields(req, row));
  } catch (err) {
    handleRouteError(err, res, "inbox/drafts/update");
  }
});

router.delete("/drafts/:id", authorize({ feature: "communications", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { affectedRows } = await rawExecute(
      `DELETE FROM email_drafts WHERE id = $1 AND "companyId" = $2 AND "userId" = $3`,
      [id, scope.companyId, scope.userId],
    );
    if (!affectedRows) throw new NotFoundError("المسودة غير موجودة");
    res.json({ ok: true });
  } catch (err) {
    handleRouteError(err, res, "inbox/drafts/delete");
  }
});

/**
 * POST /inbox/drafts/:id/send — finalise a saved draft as an actual
 * send. Pulls the draft, calls sendMessage(), and deletes the draft
 * on success.
 */
router.post("/drafts/:id/send", authorize({ feature: "communications", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [draft] = await rawQuery<{
      channel: "email" | "whatsapp" | "sms";
      recipient: string | null;
      recipientName: string | null;
      subject: string | null;
      body: string;
      relatedType: string | null;
      relatedId: number | null;
      scheduledAt: string | null;
      templateKey: string | null;
    }>(
      `SELECT channel, recipient, "recipientName", subject, body,
              "relatedType", "relatedId", "scheduledAt", "templateKey"
         FROM email_drafts
        WHERE id = $1 AND "companyId" = $2 AND "userId" = $3`,
      [id, scope.companyId, scope.userId],
    );
    if (!draft) throw new NotFoundError("المسودة غير موجودة");
    if (!draft.recipient || !draft.body) {
      throw new ValidationError("المسودة لا تحتوي على مستلم أو محتوى");
    }
    const result = await sendMessage({
      channel: draft.channel,
      recipient: draft.recipient,
      recipientName: draft.recipientName,
      subject: draft.subject,
      body: draft.body,
      relatedType: draft.relatedType,
      relatedId: draft.relatedId,
      scheduledAt: draft.scheduledAt,
      templateKey: draft.templateKey,
      companyId: scope.companyId,
      userId: scope.userId,
    });
    if (!result.blocked) {
      // Only delete the draft on successful queue. If DLP blocked,
      // the operator can still edit and retry.
      await rawExecute(`DELETE FROM email_drafts WHERE id = $1`, [id]);
    }
    res.status(result.blocked ? 422 : 201).json(maskFields(req, result));
  } catch (err) {
    handleRouteError(err, res, "inbox/drafts/send");
  }
});

// ─────────────────────── Signatures ──────────────────────────────────────

const signatureSchema = z.object({
  name: z.string().min(1).max(120),
  body: z.string().min(1).max(5000),
  isDefault: z.boolean().default(false),
});

router.get("/signatures", authorize({ feature: "communications", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(
      `SELECT id, name, body, "isDefault", "createdAt", "updatedAt"
         FROM email_signatures
        WHERE "companyId" = $1 AND "userId" = $2
        ORDER BY "isDefault" DESC, name ASC`,
      [scope.companyId, scope.userId],
    );
    res.json(maskFields(req, { data: rows, total: rows.length }));
  } catch (err) {
    handleRouteError(err, res, "inbox/signatures/list");
  }
});

router.post("/signatures", authorize({ feature: "communications", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const body = zodParse(signatureSchema.safeParse(req.body));
    // If setting default, unset all other defaults first so the
    // partial unique index never raises.
    if (body.isDefault) {
      await rawExecute(
        `UPDATE email_signatures SET "isDefault" = false
          WHERE "companyId" = $1 AND "userId" = $2 AND "isDefault" = true`,
        [scope.companyId, scope.userId],
      );
    }
    const { insertId } = await rawExecute(
      `INSERT INTO email_signatures ("companyId", "userId", name, body, "isDefault")
       VALUES ($1, $2, $3, $4, $5)`,
      [scope.companyId, scope.userId, body.name, body.body, body.isDefault],
    );
    assertInsert(insertId, "email_signatures");
    res.status(201).json({ id: insertId, ...body });
  } catch (err) {
    handleRouteError(err, res, "inbox/signatures/create");
  }
});

router.patch("/signatures/:id", authorize({ feature: "communications", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const body = zodParse(signatureSchema.partial().safeParse(req.body ?? {}));
    if (body.isDefault === true) {
      await rawExecute(
        `UPDATE email_signatures SET "isDefault" = false
          WHERE "companyId" = $1 AND "userId" = $2 AND "isDefault" = true AND id <> $3`,
        [scope.companyId, scope.userId, id],
      );
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
    params.push(id, scope.companyId, scope.userId);
    const [row] = await rawQuery(
      `UPDATE email_signatures SET ${sets.join(", ")}
        WHERE id = $${idx++} AND "companyId" = $${idx++} AND "userId" = $${idx}
       RETURNING *`,
      params,
    );
    if (!row) throw new NotFoundError("التوقيع غير موجود");
    res.json(maskFields(req, row));
  } catch (err) {
    handleRouteError(err, res, "inbox/signatures/update");
  }
});

router.delete("/signatures/:id", authorize({ feature: "communications", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { affectedRows } = await rawExecute(
      `DELETE FROM email_signatures WHERE id = $1 AND "companyId" = $2 AND "userId" = $3`,
      [id, scope.companyId, scope.userId],
    );
    if (!affectedRows) throw new NotFoundError("التوقيع غير موجود");
    res.json({ ok: true });
  } catch (err) {
    handleRouteError(err, res, "inbox/signatures/delete");
  }
});

// ─────────────────────── Folder counts (sidebar) ──────────────────────────

router.get("/folder-counts", authorize({ feature: "communications", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    // Phase 4 contract step: this endpoint reads from v_message_log_all,
    // the view exposing the unified message_log table (created in
    // migration 221). Legacy communications_log rows are visible through
    // the same view via the Phase-4 backfill, so this is a drop-in swap
    // — the user-visible totals stay identical, and a future contract
    // step (DROP TABLE communications_log) won't need another route edit.
    const [folderRows, draftRow, starredRow] = await Promise.all([
      rawQuery<{ folder: string; count: string }>(
        `SELECT folder, COUNT(*)::text AS count FROM v_message_log_all
          WHERE "companyId" = $1 AND "deletedAt" IS NULL
          GROUP BY folder`,
        [scope.companyId],
      ),
      rawQuery<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM email_drafts
          WHERE "companyId" = $1 AND "userId" = $2`,
        [scope.companyId, scope.userId],
      ),
      rawQuery<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM v_message_log_all
          WHERE "companyId" = $1 AND "isStarred" = true AND "deletedAt" IS NULL`,
        [scope.companyId],
      ),
    ]);
    const counts: Record<string, number> = {
      inbox: 0, sent: 0, drafts: 0, archive: 0, trash: 0, spam: 0, starred: 0,
    };
    for (const r of folderRows) {
      counts[r.folder] = Number(r.count);
    }
    counts.drafts = Number(draftRow[0]?.count ?? 0);
    counts.starred = Number(starredRow[0]?.count ?? 0);
    res.json(maskFields(req, counts));
  } catch (err) {
    handleRouteError(err, res, "inbox/folder-counts");
  }
});

// ─────────────────────── Thread snooze (follow-up reminders) ─────────────

const snoozeCreateSchema = z.object({
  wakeAt: z.string().datetime({ offset: true }),
  reason: z.string().max(300).optional().nullable(),
});

/**
 * POST /inbox/threads/:channel/:address/snooze — snooze a thread
 * until wakeAt for the current user. Hides the thread from the
 * default inbox view and queues a follow-up task to fire at wakeAt
 * via the thread_snooze_wake cron worker.
 *
 * Idempotent: posting again for the same (user, thread) replaces the
 * existing active snooze rather than stacking. Matches the unique
 * partial index on (companyId, userId, channel, peerAddress) WHERE
 * wokenAt IS NULL AND cancelledAt IS NULL.
 */
router.post("/threads/:channel/:address/snooze", authorize({ feature: "communications", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const channel = String(req.params.channel);
    const address = String(req.params.address);
    if (!["email", "whatsapp", "sms", "pbx"].includes(channel)) {
      throw new ValidationError("قناة غير مدعومة");
    }
    const body = zodParse(snoozeCreateSchema.safeParse(req.body));
    const wake = new Date(body.wakeAt);
    if (Number.isNaN(wake.getTime())) {
      throw new ValidationError("صيغة وقت التنبيه غير صحيحة", { field: "wakeAt" });
    }
    // 60s margin so a "snooze for 30 seconds" request can't fire before
    // the POST round-trips — UI presets start at 1h anyway.
    if (wake.getTime() < Date.now() + 60_000) {
      throw new ValidationError("وقت التنبيه قريب جدًا — اختر وقتًا أبعد", { field: "wakeAt" });
    }
    // Replace any existing active snooze on the same thread for this
    // user via INSERT … ON CONFLICT against the partial unique index.
    const [row] = await rawQuery<{ id: number }>(
      `INSERT INTO thread_snoozes ("companyId", "userId", channel, "peerAddress", "wakeAt", reason)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT ("companyId", "userId", channel, "peerAddress")
         WHERE "wokenAt" IS NULL AND "cancelledAt" IS NULL
       DO UPDATE SET "wakeAt" = EXCLUDED."wakeAt",
                     reason   = EXCLUDED.reason,
                     "snoozedAt" = NOW()
       RETURNING id`,
      [scope.companyId, scope.userId, channel, address, wake.toISOString(), body.reason ?? null],
    );
    void createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "create", entity: "thread_snoozes", entityId: row.id,
      after: { channel, peerAddress: address, wakeAt: wake.toISOString() },
    }).catch((e) => logger.warn(e, "[audit] thread.snooze.create"));
    res.status(201).json({ id: row.id, wakeAt: wake.toISOString() });
  } catch (err) {
    handleRouteError(err, res, "inbox/threads/snooze/create");
  }
});

/**
 * DELETE /inbox/threads/:channel/:address/snooze — un-snooze the
 * current user's active snooze on a thread. No-op if there isn't
 * one. Returns the cancelled-row id so the frontend can update
 * its cached state.
 */
router.delete("/threads/:channel/:address/snooze", authorize({ feature: "communications", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const channel = String(req.params.channel);
    const address = String(req.params.address);
    const rows = await rawQuery<{ id: number }>(
      `UPDATE thread_snoozes SET "cancelledAt" = NOW()
        WHERE "companyId" = $1 AND "userId" = $2
          AND channel = $3 AND "peerAddress" = $4
          AND "wokenAt" IS NULL AND "cancelledAt" IS NULL
        RETURNING id`,
      [scope.companyId, scope.userId, channel, address],
    );
    res.json({ ok: true, cancelledId: rows[0]?.id ?? null });
  } catch (err) {
    handleRouteError(err, res, "inbox/threads/snooze/cancel");
  }
});

/**
 * GET /inbox/snoozed — list the current user's currently-snoozed
 * threads. Ordered by wakeAt so "what's coming back next" sits on
 * top. Frontend renders a dedicated "مؤجَّلة" folder driven by this.
 */
router.get("/snoozed", authorize({ feature: "communications", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(
      `SELECT s.id, s.channel, s."peerAddress" AS peer, s."wakeAt",
              s."snoozedAt", s.reason
         FROM thread_snoozes s
        WHERE s."companyId" = $1 AND s."userId" = $2
          AND s."wokenAt" IS NULL AND s."cancelledAt" IS NULL
        ORDER BY s."wakeAt" ASC
        LIMIT 100`,
      [scope.companyId, scope.userId],
    );
    res.json(maskFields(req, { data: rows, total: rows.length }));
  } catch (err) {
    handleRouteError(err, res, "inbox/snoozed");
  }
});

export default router;
