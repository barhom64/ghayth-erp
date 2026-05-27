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
 *                                      notificationEngine so DLP rules
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
 *   3. Applies DLP via the same scanner notificationEngine uses on its
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

    const [original] = await rawQuery<{
      channel: string;
      fromNumber: string | null;
      toNumber: string | null;
      relatedType: string | null;
      relatedId: number | null;
    }>(
      `SELECT channel, "fromNumber", "toNumber", "relatedType", "relatedId"
         FROM communications_log
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

    // Phase 4 contract step: read from v_message_log_all (the unified
    // view created in migration 221). Columns are aliased back to
    // fromNumber / toNumber so the frontend response shape is identical
    // to the pre-contract version — this is purely a storage swap, no
    // API change. The view's fromAddress/toAddress columns are wider
    // (varchar(300) vs the legacy varchar(20)) so future email-address
    // peer keys work without truncation.
    const rows = await rawQuery(
      `WITH peer AS (
         SELECT id, channel, direction,
                COALESCE(NULLIF("fromAddress",''), "toAddress") AS peer_addr,
                "fromAddress" AS "fromNumber", "toAddress" AS "toNumber",
                subject, body, status, folder, "isStarred",
                "relatedType", "relatedId", "createdAt",
                ROW_NUMBER() OVER (
                  PARTITION BY channel, COALESCE(NULLIF("fromAddress",''), "toAddress")
                  ORDER BY "createdAt" DESC
                ) AS rn,
                COUNT(*) OVER (
                  PARTITION BY channel, COALESCE(NULLIF("fromAddress",''), "toAddress")
                ) AS total_messages,
                COUNT(*) FILTER (WHERE direction = 'inbound') OVER (
                  PARTITION BY channel, COALESCE(NULLIF("fromAddress",''), "toAddress")
                ) AS inbound_count
           FROM v_message_log_all
          WHERE "companyId" = $1 AND "deletedAt" IS NULL
            ${channelCond}${folderCond}
       )
       SELECT id, channel, direction, peer_addr AS peer, "fromNumber", "toNumber",
              subject, LEFT(body, 300) AS body_preview, status,
              folder, "isStarred",
              "relatedType", "relatedId", "createdAt",
              total_messages, inbound_count
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
    const rows = await rawQuery(
      `SELECT id, channel, direction,
              "fromAddress" AS "fromNumber", "toAddress" AS "toNumber",
              subject, body, status, "relatedType", "relatedId", "createdAt"
         FROM v_message_log_all
        WHERE "companyId" = $1
          AND channel = $2
          AND "deletedAt" IS NULL
          AND (
            COALESCE(NULLIF("fromAddress",''), '') = $3
            OR COALESCE(NULLIF("toAddress",''), '') = $3
          )
        ORDER BY "createdAt" ASC
        LIMIT 500`,
      [cid, channel, address],
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

    // Mirror in communications_log so it shows up in the unified
    // thread view alongside email/SMS/WhatsApp.
    await rawExecute(
      `INSERT INTO communications_log ("companyId", channel, direction, "fromNumber", "toNumber", body, status, "relatedType", "relatedId", "createdAt")
       VALUES ($1, 'pbx', $2, $3, $4, $5, 'logged', $6, $7, NOW())`,
      [
        scope.companyId, body.direction,
        body.direction === "outbound" ? scope.userId.toString() : body.callerNumber,
        body.direction === "outbound" ? body.calledNumber : scope.userId.toString(),
        `${body.status} · ${body.duration}s${body.notes ? ` · ${body.notes}` : ""}`,
        body.relatedType ?? null, body.relatedId ?? null,
      ],
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
    const { affectedRows } = await rawExecute(
      `UPDATE communications_log SET folder = $1
        WHERE id = $2 AND "companyId" = $3 AND "deletedAt" IS NULL`,
      [body.folder, id, scope.companyId],
    );
    if (!affectedRows) throw new NotFoundError("الرسالة غير موجودة");
    void createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "update", entity: "communications_log", entityId: id,
      after: { folder: body.folder },
    }).catch((e) => logger.warn(e, "[audit] message.folder"));
    res.json({ ok: true, folder: body.folder });
  } catch (err) {
    handleRouteError(err, res, "inbox/messages/folder");
  }
});

/**
 * POST /inbox/messages/:id/star — toggle the starred flag.
 */
router.post("/messages/:id/star", authorize({ feature: "communications", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<{ isStarred: boolean }>(
      `UPDATE communications_log SET "isStarred" = NOT "isStarred"
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

export default router;
