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
import { applyDlp } from "../lib/communicationControl.js";
import { logger } from "../lib/logger.js";

const router = Router();

// ─────────────────────── shared dispatcher ────────────────────────────────

const channelEnum = z.enum(["email", "whatsapp", "sms"]);

interface DispatchInput {
  channel: "email" | "whatsapp" | "sms";
  recipient: string;
  recipientName?: string | null;
  subject?: string | null;
  body: string;
  relatedType?: string | null;
  relatedId?: number | null;
  templateKey?: string | null;
  companyId: number;
  userId: number;
}

interface DispatchResult {
  logId: number;
  queued: boolean;
  blocked: boolean;
  reason?: string;
  dlpMatches?: Array<{ rule: string; action: string }>;
}

/**
 * Sole send-path used by both /send and /reply. Returns a structured
 * result so the caller can surface "blocked by DLP rule X" to the UI
 * without inferring from a 400. Never throws on DLP — failing closed
 * (block) is fine because the operator sees the reason inline.
 */
async function dispatchSend(input: DispatchInput): Promise<DispatchResult> {
  // 1. DLP scan first — if blocked, persist a log row marked
  //    'blocked_dlp' so the audit trail captures the attempt + reason.
  const dlp = await applyDlp(input.body, input.channel, input.companyId).catch((err) => {
    logger.error(err, "[inbox] DLP scan failed — failing closed");
    return { body: input.body, blocked: true, reason: "DLP_SCAN_ERROR", matches: [] };
  });

  const finalBody = dlp.body;
  const status = dlp.blocked ? "blocked_dlp" : "queued";
  const matchSummary = dlp.matches.map((m) => ({ rule: m.ruleName, action: m.action }));

  // 2. Write the communications_log row regardless — we always want
  //    a record, even of blocked attempts.
  const { insertId: logId } = await rawExecute(
    `INSERT INTO communications_log
       ("companyId", channel, direction, "fromNumber", "toNumber",
        subject, body, status, "relatedType", "relatedId", "createdAt")
     VALUES ($1, $2, 'outbound', NULL, $3, $4, $5, $6, $7, $8, NOW())`,
    [
      input.companyId, input.channel, input.recipient,
      input.subject ?? null, finalBody, status,
      input.relatedType ?? null, input.relatedId ?? null,
    ],
  );
  assertInsert(logId, "communications_log");

  if (dlp.blocked) {
    void emitEvent({
      companyId: input.companyId, userId: input.userId,
      action: "communications.message.blocked_dlp",
      entity: "communications_log", entityId: logId,
      details: JSON.stringify({ channel: input.channel, reason: dlp.reason }),
    }).catch((e) => logger.warn(e, "[event] blocked_dlp"));
    return {
      logId, queued: false, blocked: true,
      reason: dlp.reason ?? "blocked by DLP",
      dlpMatches: matchSummary,
    };
  }

  // 3. Insert into the channel's queue. The existing workers
  //    (cronScheduler: email_queue_drain etc.) pick from these.
  switch (input.channel) {
    case "email":
      await rawExecute(
        `INSERT INTO email_queue
           ("companyId", "toEmail", "recipientName", subject, body, status, "createdAt", "refType", "refId")
         VALUES ($1, $2, $3, $4, $5, 'pending', NOW(), $6, $7)`,
        [
          input.companyId, input.recipient, input.recipientName ?? "",
          input.subject ?? "(بدون عنوان)", finalBody,
          input.relatedType ?? null, input.relatedId ?? null,
        ],
      );
      break;
    case "sms":
      await rawExecute(
        `INSERT INTO sms_queue ("companyId", "recipientPhone", message, status, "createdAt")
         VALUES ($1, $2, $3, 'pending', NOW())`,
        [input.companyId, input.recipient, finalBody],
      );
      break;
    case "whatsapp":
      await rawExecute(
        `INSERT INTO whatsapp_queue ("companyId", phone, "recipientName", message, status, "createdAt")
         VALUES ($1, $2, $3, $4, 'pending', NOW())`,
        [input.companyId, input.recipient, input.recipientName ?? "", finalBody],
      );
      break;
  }

  void emitEvent({
    companyId: input.companyId, userId: input.userId,
    action: `communications.${input.channel}.sent`,
    entity: "communications_log", entityId: logId,
    details: JSON.stringify({ channel: input.channel, recipient: input.recipient.replace(/.(?=.{4})/g, "*") }),
  }).catch((e) => logger.warn(e, `[event] ${input.channel}.sent`));
  void createAuditLog({
    companyId: input.companyId, userId: input.userId,
    action: "create", entity: "communications_log", entityId: logId,
    after: { channel: input.channel, recipient: input.recipient, subject: input.subject },
  }).catch((e) => logger.warn(e, "[audit] communications.send"));

  return {
    logId, queued: true, blocked: false,
    dlpMatches: matchSummary.length > 0 ? matchSummary : undefined,
  };
}

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

    const result = await dispatchSend({
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

    const result = await dispatchSend({
      channel: original.channel,
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
    const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50)));

    const params: unknown[] = [cid];
    let channelCond = "";
    if (channel && ["email", "whatsapp", "sms"].includes(channel)) {
      params.push(channel);
      channelCond = ` AND channel = $${params.length}`;
    }

    const rows = await rawQuery(
      `WITH peer AS (
         SELECT id, channel, direction,
                COALESCE(NULLIF("fromNumber",''), "toNumber") AS peer_addr,
                "fromNumber", "toNumber",
                subject, body, status, "relatedType", "relatedId", "createdAt",
                ROW_NUMBER() OVER (
                  PARTITION BY channel, COALESCE(NULLIF("fromNumber",''), "toNumber")
                  ORDER BY "createdAt" DESC
                ) AS rn,
                COUNT(*) OVER (
                  PARTITION BY channel, COALESCE(NULLIF("fromNumber",''), "toNumber")
                ) AS total_messages,
                COUNT(*) FILTER (WHERE direction = 'inbound') OVER (
                  PARTITION BY channel, COALESCE(NULLIF("fromNumber",''), "toNumber")
                ) AS inbound_count
           FROM communications_log
          WHERE "companyId" = $1 AND "deletedAt" IS NULL
            ${channelCond}
       )
       SELECT id, channel, direction, peer_addr AS peer, "fromNumber", "toNumber",
              subject, LEFT(body, 300) AS body_preview, status,
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
    const rows = await rawQuery(
      `SELECT id, channel, direction, "fromNumber", "toNumber",
              subject, body, status, "relatedType", "relatedId", "createdAt"
         FROM communications_log
        WHERE "companyId" = $1
          AND channel = $2
          AND "deletedAt" IS NULL
          AND (
            COALESCE(NULLIF("fromNumber",''), '') = $3
            OR COALESCE(NULLIF("toNumber",''), '') = $3
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

export default router;
