/**
 * Inbox conversations — the persisted Conversation canon API (#2138).
 *
 * Until migration 335, an inbox "thread" was a window-function grouping
 * computed on every GET /inbox/threads — it could be listed but carried
 * no state. This router serves the materialised `conversations` rows
 * (kept 1:1 with the legacy thread grouping by the message_log BEFORE
 * INSERT trigger) and adds the state operations the conversation-first
 * UX needs: assign / close / reopen / escalate / link.
 *
 * Routes (mounted at /inbox/conversations):
 *   GET    /                 — list conversations (status/channel/priority/
 *                              assigned/q/related filters)
 *   GET    /:id              — conversation + entity links + full thread
 *   POST   /                 — create (or reuse) a conversation, optionally
 *                              sending the first message
 *   POST   /:id/messages     — send a message inside the conversation
 *   POST   /:id/link         — link a business entity to the conversation
 *   POST   /:id/unlink       — remove an entity link
 *   POST   /:id/assign       — assign / unassign a user
 *   POST   /:id/close        — close
 *   POST   /:id/reopen       — reopen a closed / escalated conversation
 *   POST   /:id/escalate     — escalate + raise priority
 *
 * Mandates honoured (#2138):
 *   - Every outbound send goes through lib/messageSender.sendMessage()
 *     — DLP, message_log, outbound_queue, events, audit all apply.
 *   - No new queue / message store: message_log stays the single
 *     message table; conversations only materialises the thread key.
 *   - Entity links go through the LINKABLE_ENTITIES contract below —
 *     the communication path never reaches into another module's logic,
 *     it only verifies the target row exists in-tenant.
 *   - GET /inbox/threads (the legacy computed view) keeps working
 *     unchanged for the current UI until the frontend slice lands.
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
import { emitEvent, auditFromRequest } from "../lib/businessHelpers.js";
import { buildScopedWhere, parseScopeFilters } from "../lib/scopedQuery.js";
import { sendMessage } from "../lib/messageSender.js";
import { logger } from "../lib/logger.js";

const router = Router();

const sendableChannelEnum = z.enum(["email", "whatsapp", "sms"]);

// ─────────────────────── linkable entity contract ─────────────────────────
//
// The integration contract for conversation ↔ entity links. Each entry
// says how to verify "this row exists in this tenant" — nothing more.
// `partyNameSql` additionally resolves a display name for entries that
// can act as the conversation PARTICIPANT (a person/org you talk to,
// not a document you talk about).
//
// employees is the only tenant-by-assignment table (no companyId
// column) — its check joins employee_assignments like the rest of the
// codebase does.
const LINKABLE_ENTITIES: Record<
  string,
  { existsSql: string; partyNameSql?: string }
> = {
  clients: {
    existsSql: `SELECT id FROM clients WHERE id = $1 AND "companyId" = $2`,
    partyNameSql: `SELECT name FROM clients WHERE id = $1 AND "companyId" = $2`,
  },
  suppliers: {
    existsSql: `SELECT id FROM suppliers WHERE id = $1 AND "companyId" = $2`,
    partyNameSql: `SELECT name FROM suppliers WHERE id = $1 AND "companyId" = $2`,
  },
  employees: {
    existsSql: `SELECT e.id FROM employees e
                  JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea."companyId" = $2
                 WHERE e.id = $1 LIMIT 1`,
    partyNameSql: `SELECT e.name FROM employees e
                     JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea."companyId" = $2
                    WHERE e.id = $1 LIMIT 1`,
  },
  invoices: { existsSql: `SELECT id FROM invoices WHERE id = $1 AND "companyId" = $2` },
  legal_cases: { existsSql: `SELECT id FROM legal_cases WHERE id = $1 AND "companyId" = $2` },
  legal_contracts: { existsSql: `SELECT id FROM legal_contracts WHERE id = $1 AND "companyId" = $2` },
  projects: { existsSql: `SELECT id FROM projects WHERE id = $1 AND "companyId" = $2` },
  support_tickets: { existsSql: `SELECT id FROM support_tickets WHERE id = $1 AND "companyId" = $2` },
  fleet_vehicles: { existsSql: `SELECT id FROM fleet_vehicles WHERE id = $1 AND "companyId" = $2` },
  fleet_trips: { existsSql: `SELECT id FROM fleet_trips WHERE id = $1 AND "companyId" = $2` },
  transport_bookings: { existsSql: `SELECT id FROM transport_bookings WHERE id = $1 AND "companyId" = $2` },
  hr_leave_requests: { existsSql: `SELECT id FROM hr_leave_requests WHERE id = $1 AND "companyId" = $2` },
};

const relatedTypeEnum = z.enum(
  Object.keys(LINKABLE_ENTITIES) as [string, ...string[]],
);

// ─────────────────────── helpers ───────────────────────────────────────────

interface ConversationRow {
  id: number;
  channelPrimary: string;
  title: string | null;
  participantType: string | null;
  participantId: number | null;
  participantName: string | null;
  participantAddress: string;
  status: string;
  priority: string;
  assignedTo: number | null;
  ownerPath: string | null;
  lastMessageAt: string | null;
  slaStatus: string | null;
  riskLevel: string | null;
  createdAt: string;
  updatedAt: string;
}

const CONVERSATION_COLUMNS = `
  c.id, c."channelPrimary", c.title,
  c."participantType", c."participantId", c."participantName", c."participantAddress",
  c.status, c.priority, c."assignedTo", c."ownerPath",
  c."lastMessageAt", c."slaStatus", c."riskLevel", c."createdAt", c."updatedAt"`;

async function loadConversation(id: number, companyId: number): Promise<ConversationRow> {
  const [row] = await rawQuery<ConversationRow>(
    `SELECT ${CONVERSATION_COLUMNS}
       FROM conversations c
      WHERE c.id = $1 AND c."companyId" = $2 AND c."deletedAt" IS NULL
      LIMIT 1`,
    [id, companyId],
  );
  if (!row) throw new NotFoundError("المحادثة غير موجودة");
  return row;
}

/**
 * Audit + event for a conversation state change — both best-effort.
 * Audit goes through auditFromRequest so the IGOC context columns
 * (activeRoleKey / activeDepartmentId / resolvedScope / impersonation)
 * land on every row.
 */
function recordConversationAction(
  req: { scope?: any },
  params: {
    conversationId: number;
    eventAction: string;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    details?: Record<string, unknown>;
  },
): void {
  void emitEvent({
    companyId: req.scope!.companyId,
    userId: req.scope!.userId,
    action: params.eventAction,
    entity: "conversations",
    entityId: params.conversationId,
    details: JSON.stringify(params.details ?? {}),
  }).catch((e) => logger.warn(e, `[event] ${params.eventAction}`));
  void auditFromRequest(req, "update", "conversations", params.conversationId, {
    before: params.before,
    after: params.after,
  });
}

function validateAddressForChannel(channel: string, address: string): void {
  if (channel === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    throw new ValidationError("صيغة البريد الإلكتروني غير صحيحة", { field: "participantAddress" });
  }
  if ((channel === "whatsapp" || channel === "sms") && !/^\+?[0-9]{7,20}$/.test(address.replace(/[\s-]/g, ""))) {
    throw new ValidationError("صيغة رقم الهاتف غير صحيحة", { field: "participantAddress" });
  }
}

// ─────────────────────── GET / ─────────────────────────────────────────────

router.get("/", authorize({ feature: "communications", action: "list" }), async (req, res) => {
  try {
    // Multi-company picker honoured via buildScopedWhere. conversations
    // has no branchId of its own (the party, not a branch, owns the
    // thread), so disableBranchScope matches the table shape.
    const { where: scopeWhere, params } = buildScopedWhere(
      req.scope!,
      parseScopeFilters(req),
      {
        companyColumn: 'c."companyId"',
        disableBranchScope: true,
        disableDepartmentScope: true,
        softDeleteColumn: 'c."deletedAt"',
      },
    );
    params.push(req.scope!.userId);
    const userIdx = params.length;
    let cond = "";

    const status = (req.query.status as string | undefined) ?? null;
    if (status && ["open", "awaiting_reply", "closed", "escalated"].includes(status)) {
      params.push(status);
      cond += ` AND c.status = $${params.length}`;
    }
    const channel = (req.query.channel as string | undefined) ?? null;
    if (channel && ["email", "whatsapp", "sms", "pbx", "push", "in_app", "internal"].includes(channel)) {
      params.push(channel);
      cond += ` AND c."channelPrimary" = $${params.length}`;
    }
    const priority = (req.query.priority as string | undefined) ?? null;
    if (priority && ["low", "normal", "high", "urgent"].includes(priority)) {
      params.push(priority);
      cond += ` AND c.priority = $${params.length}`;
    }
    const assigned = (req.query.assigned as string | undefined) ?? null;
    if (assigned === "me") {
      cond += ` AND c."assignedTo" = $${userIdx}`;
    } else if (assigned && Number.isFinite(Number(assigned))) {
      params.push(Number(assigned));
      cond += ` AND c."assignedTo" = $${params.length}`;
    }
    const q = String(req.query.q ?? "").trim();
    if (q.length >= 2) {
      params.push(`%${q}%`);
      cond += ` AND (c.title ILIKE $${params.length} OR c."participantName" ILIKE $${params.length} OR c."participantAddress" ILIKE $${params.length})`;
    }
    // Entity filter — conversations linked to ?relatedType=X&relatedId=Y
    // through the conversation_links contract table.
    const relatedType = (req.query.relatedType as string | undefined)?.trim();
    const relatedId = Number(req.query.relatedId);
    if (relatedType && LINKABLE_ENTITIES[relatedType] && Number.isFinite(relatedId) && relatedId > 0) {
      params.push(relatedType, relatedId);
      cond += ` AND EXISTS (
        SELECT 1 FROM conversation_links cl
         WHERE cl."conversationId" = c.id AND cl."deletedAt" IS NULL
           AND cl."relatedType" = $${params.length - 1} AND cl."relatedId" = $${params.length})`;
    }

    const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50)));
    const offset = Math.max(0, Number(req.query.offset ?? 0));
    params.push(limit, offset);

    const rows = await rawQuery(
      `SELECT ${CONVERSATION_COLUMNS},
              lm.body_preview AS "lastMessagePreview",
              lm.direction    AS "lastDirection",
              lm.status       AS "lastMessageStatus",
              COALESCE(mc.total, 0)  AS "totalMessages",
              COALESCE(mc.unread, 0) AS "unreadCount"
         FROM conversations c
         LEFT JOIN LATERAL (
           SELECT LEFT(ml.body, 300) AS body_preview, ml.direction, ml.status
             FROM message_log ml
            WHERE ml."conversationId" = c.id AND ml."deletedAt" IS NULL
            ORDER BY ml."createdAt" DESC
            LIMIT 1
         ) lm ON TRUE
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int AS total,
                  COUNT(*) FILTER (
                    WHERE ml.direction = 'inbound' AND mrs."messageLogId" IS NULL
                  )::int AS unread
             FROM message_log ml
             LEFT JOIN message_read_state mrs
               ON mrs."messageLogId" = ml.id AND mrs."userId" = $${userIdx}
            WHERE ml."conversationId" = c.id AND ml."deletedAt" IS NULL
         ) mc ON TRUE
        WHERE ${scopeWhere}${cond}
        ORDER BY c."lastMessageAt" DESC NULLS LAST, c.id DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    res.json(maskFields(req, { data: rows, total: rows.length }));
  } catch (err) {
    handleRouteError(err, res, "inbox/conversations/list");
  }
});

// ─────────────────────── GET /:id ──────────────────────────────────────────

router.get("/:id", authorize({ feature: "communications", action: "list" }), async (req, res) => {
  try {
    const cid = req.scope!.companyId;
    const id = parseId(req.params.id, "id");
    const conversation = await loadConversation(id, cid);

    const [links, messages] = await Promise.all([
      rawQuery(
        `SELECT id, "relatedType", "relatedId", "linkedBy", "createdAt"
           FROM conversation_links
          WHERE "conversationId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL
          ORDER BY "createdAt" ASC`,
        [id, cid],
      ),
      rawQuery(
        `SELECT ml.id, ml.channel, ml.direction,
                ml."fromAddress", ml."toAddress",
                ml.subject, ml.body, ml.status, ml.folder,
                ml."relatedType", ml."relatedId", ml."createdAt",
                (ml.direction = 'outbound' OR mrs."messageLogId" IS NOT NULL) AS "isRead",
                mrs."readAt"
           FROM message_log ml
           LEFT JOIN message_read_state mrs
             ON mrs."messageLogId" = ml.id AND mrs."userId" = $3
          WHERE ml."conversationId" = $1 AND ml."companyId" = $2 AND ml."deletedAt" IS NULL
          ORDER BY ml."createdAt" ASC
          LIMIT 500`,
        [id, cid, req.scope!.userId],
      ),
    ]);

    res.json(maskFields(req, { data: { ...conversation, links, messages } }));
  } catch (err) {
    handleRouteError(err, res, "inbox/conversations/get");
  }
});

// ─────────────────────── POST / ────────────────────────────────────────────

const createSchema = z.object({
  channel: sendableChannelEnum,
  participantAddress: z.string().min(1).max(300),
  participantName: z.string().max(300).optional().nullable(),
  title: z.string().max(500).optional().nullable(),
  // Optional first message — sent through sendMessage() (DLP/queue/audit).
  message: z
    .object({
      subject: z.string().max(500).optional().nullable(),
      body: z.string().min(1, "نص الرسالة مطلوب").max(20000),
      scheduledAt: z.string().datetime({ offset: true }).optional().nullable(),
    })
    .optional()
    .nullable(),
});

router.post("/", authorize({ feature: "communications", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const body = zodParse(createSchema.safeParse(req.body));
    const address = body.participantAddress.trim();
    validateAddressForChannel(body.channel, address);
    if (body.channel === "email" && body.message && !body.message.subject) {
      throw new ValidationError("عنوان البريد مطلوب", { field: "message.subject" });
    }

    // Send first (when a message is supplied) — the message_log trigger
    // creates/touches the conversation row, so the metadata upsert below
    // never races a concurrent inbound message on the same peer.
    let sendResult: Awaited<ReturnType<typeof sendMessage>> | null = null;
    if (body.message) {
      sendResult = await sendMessage({
        channel: body.channel,
        recipient: address,
        recipientName: body.participantName ?? null,
        subject: body.message.subject ?? null,
        body: body.message.body,
        scheduledAt: body.message.scheduledAt ?? null,
        companyId: scope.companyId,
        userId: scope.userId,
      });
    }

    const [conversation] = await rawQuery<{ id: number; created: boolean }>(
      `INSERT INTO conversations
         ("companyId", "channelPrimary", "participantAddress", "participantName", title,
          "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, now(), now())
       ON CONFLICT ("companyId", "channelPrimary", "participantAddress")
         WHERE "deletedAt" IS NULL
       DO UPDATE SET
         "participantName" = COALESCE(conversations."participantName", EXCLUDED."participantName"),
         title = COALESCE(EXCLUDED.title, conversations.title),
         "updatedAt" = now()
       RETURNING id, (xmax = 0) AS created`,
      [scope.companyId, body.channel, address, body.participantName ?? null, body.title ?? null],
    );
    assertInsert(conversation?.id ?? 0, "conversations");

    if (conversation.created) {
      recordConversationAction(req, {
        conversationId: conversation.id,
        eventAction: "communications.conversation.created",
        after: { channel: body.channel, participantAddress: address, title: body.title ?? null },
        details: { channel: body.channel },
      });
    }

    if (sendResult?.blocked === true) {
      // Same DLP_BLOCKED contract as POST /:id/messages — see the
      // comment there. The conversation itself was still created.
      res.status(422).json(
        maskFields(req, {
          error: sendResult.reason ?? "حُجبت الرسالة بواسطة قواعد حماية البيانات (DLP)",
          code: "DLP_BLOCKED",
          meta: { reason: sendResult.reason, dlpMatches: sendResult.dlpMatches },
          conversationId: conversation.id,
          existing: !conversation.created,
          send: sendResult,
        }),
      );
      return;
    }
    res.status(201).json(
      maskFields(req, {
        conversationId: conversation.id,
        existing: !conversation.created,
        send: sendResult,
      }),
    );
  } catch (err) {
    handleRouteError(err, res, "inbox/conversations/create");
  }
});

// ─────────────────────── POST /:id/messages ────────────────────────────────

const messageSchema = z.object({
  subject: z.string().max(500).optional().nullable(),
  body: z.string().min(1, "نص الرسالة مطلوب").max(20000),
  cc: z.string().max(1000).optional().nullable(),
  bcc: z.string().max(1000).optional().nullable(),
  scheduledAt: z.string().datetime({ offset: true }).optional().nullable(),
});

router.post("/:id/messages", authorize({ feature: "communications", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const body = zodParse(messageSchema.safeParse(req.body));
    const conversation = await loadConversation(id, scope.companyId);

    if (!["email", "whatsapp", "sms"].includes(conversation.channelPrimary)) {
      throw new ValidationError(`القناة "${conversation.channelPrimary}" لا تدعم الإرسال المباشر`);
    }

    const result = await sendMessage({
      channel: conversation.channelPrimary as "email" | "whatsapp" | "sms",
      recipient: conversation.participantAddress,
      recipientName: conversation.participantName,
      cc: body.cc ?? null,
      bcc: body.bcc ?? null,
      subject: body.subject ?? null,
      body: body.body,
      scheduledAt: body.scheduledAt ?? null,
      relatedType: conversation.participantType,
      relatedId: conversation.participantId,
      companyId: scope.companyId,
      userId: scope.userId,
    });

    // We just sent — the ball is in the other side's court. Closed
    // conversations are implicitly reopened by replying; escalated
    // ones keep their escalation flag.
    if (!result.blocked && (conversation.status === "open" || conversation.status === "closed")) {
      await rawExecute(
        `UPDATE conversations SET status = 'awaiting_reply', "updatedAt" = now()
          WHERE id = $1 AND "companyId" = $2`,
        [id, scope.companyId],
      );
    }

    if (result.blocked) {
      // 422 bodies travel to the frontend as ApiError, which only
      // surfaces { error, code, meta } — without these fields the DLP
      // reason/rules would be dropped and the UI could not render the
      // "حُجبت بواسطة DLP" state (#2138 slice 2 requirement).
      res.status(422).json(maskFields(req, {
        error: result.reason ?? "حُجبت الرسالة بواسطة قواعد حماية البيانات (DLP)",
        code: "DLP_BLOCKED",
        meta: { reason: result.reason, dlpMatches: result.dlpMatches },
        conversationId: id,
        ...result,
      }));
      return;
    }
    res.status(201).json(maskFields(req, { conversationId: id, ...result }));
  } catch (err) {
    handleRouteError(err, res, "inbox/conversations/message");
  }
});

// ─────────────────────── POST /:id/link  /:id/unlink ───────────────────────

const linkSchema = z.object({
  relatedType: relatedTypeEnum,
  relatedId: z.number().int().positive(),
});

router.post("/:id/link", authorize({ feature: "communications", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const body = zodParse(linkSchema.safeParse(req.body));
    const conversation = await loadConversation(id, scope.companyId);

    const entity = LINKABLE_ENTITIES[body.relatedType];
    const [target] = await rawQuery<{ id: number }>(entity.existsSql, [body.relatedId, scope.companyId]);
    if (!target) throw new NotFoundError("الكيان المطلوب ربطه غير موجود");

    // Revive a previously-removed link instead of stacking duplicates.
    const [revived] = await rawQuery<{ id: number }>(
      `UPDATE conversation_links SET "deletedAt" = NULL, "linkedBy" = $4, "createdAt" = now()
        WHERE "conversationId" = $1 AND "relatedType" = $2 AND "relatedId" = $3
          AND "companyId" = $5
          AND "deletedAt" IS NOT NULL
        RETURNING id`,
      [id, body.relatedType, body.relatedId, scope.userId, scope.companyId],
    );
    if (!revived) {
      await rawExecute(
        `INSERT INTO conversation_links
           ("companyId", "conversationId", "relatedType", "relatedId", "linkedBy", "createdAt")
         VALUES ($1, $2, $3, $4, $5, now())
         ON CONFLICT ("conversationId", "relatedType", "relatedId")
           WHERE "deletedAt" IS NULL
         DO NOTHING`,
        [scope.companyId, id, body.relatedType, body.relatedId, scope.userId],
      );
    }

    // A party-type link also fills the conversation's participant
    // identity when it is still unmatched.
    if (entity.partyNameSql && !conversation.participantId) {
      const [party] = await rawQuery<{ name: string | null }>(entity.partyNameSql, [
        body.relatedId,
        scope.companyId,
      ]);
      await rawExecute(
        `UPDATE conversations
            SET "participantType" = $3, "participantId" = $4,
                "participantName" = COALESCE("participantName", $5),
                "updatedAt" = now()
          WHERE id = $1 AND "companyId" = $2`,
        [id, scope.companyId, body.relatedType, body.relatedId, party?.name ?? null],
      );
    }

    recordConversationAction(req, {
      conversationId: id,
      eventAction: "communications.conversation.linked",
      after: { relatedType: body.relatedType, relatedId: body.relatedId },
      details: { relatedType: body.relatedType, relatedId: body.relatedId },
    });
    res.json(maskFields(req, { ok: true }));
  } catch (err) {
    handleRouteError(err, res, "inbox/conversations/link");
  }
});

router.post("/:id/unlink", authorize({ feature: "communications", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const body = zodParse(linkSchema.safeParse(req.body));
    await loadConversation(id, scope.companyId);

    const result = await rawExecute(
      `UPDATE conversation_links SET "deletedAt" = now()
        WHERE "conversationId" = $1 AND "companyId" = $2
          AND "relatedType" = $3 AND "relatedId" = $4 AND "deletedAt" IS NULL`,
      [id, scope.companyId, body.relatedType, body.relatedId],
    );
    if (!result.affectedRows) throw new NotFoundError("الربط غير موجود");

    recordConversationAction(req, {
      conversationId: id,
      eventAction: "communications.conversation.unlinked",
      before: { relatedType: body.relatedType, relatedId: body.relatedId },
      details: { relatedType: body.relatedType, relatedId: body.relatedId },
    });
    res.json(maskFields(req, { ok: true }));
  } catch (err) {
    handleRouteError(err, res, "inbox/conversations/unlink");
  }
});

// ─────────────────────── POST /:id/assign ──────────────────────────────────

const assignSchema = z.object({
  assignedTo: z.number().int().positive().nullable(),
});

router.post("/:id/assign", authorize({ feature: "communications", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const body = zodParse(assignSchema.safeParse(req.body));
    const conversation = await loadConversation(id, scope.companyId);

    if (body.assignedTo !== null) {
      // users carry tenancy through employee_assignments — same check
      // the rest of the codebase uses for "user belongs to my company".
      const [user] = await rawQuery<{ id: number }>(
        `SELECT u.id
           FROM users u
           JOIN employee_assignments ea
             ON ea."employeeId" = u."employeeId" AND ea."companyId" = $2
          WHERE u.id = $1 AND u."isActive" = TRUE
          LIMIT 1`,
        [body.assignedTo, scope.companyId],
      );
      if (!user) throw new NotFoundError("المستخدم المطلوب إسناده غير موجود");
    }

    await rawExecute(
      `UPDATE conversations SET "assignedTo" = $3, "updatedAt" = now()
        WHERE id = $1 AND "companyId" = $2`,
      [id, scope.companyId, body.assignedTo],
    );

    recordConversationAction(req, {
      conversationId: id,
      eventAction: "communications.conversation.assigned",
      before: { assignedTo: conversation.assignedTo },
      after: { assignedTo: body.assignedTo },
      details: { assignedTo: body.assignedTo },
    });
    res.json(maskFields(req, { ok: true, assignedTo: body.assignedTo }));
  } catch (err) {
    handleRouteError(err, res, "inbox/conversations/assign");
  }
});

// ─────────────────────── POST /:id/close /:id/reopen /:id/escalate ─────────

const reasonSchema = z.object({
  reason: z.string().max(1000).optional().nullable(),
});

router.post("/:id/close", authorize({ feature: "communications", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const body = zodParse(reasonSchema.safeParse(req.body));
    const conversation = await loadConversation(id, scope.companyId);
    if (conversation.status === "closed") {
      throw new ValidationError("المحادثة مغلقة بالفعل");
    }

    await rawExecute(
      `UPDATE conversations SET status = 'closed', "updatedAt" = now()
        WHERE id = $1 AND "companyId" = $2`,
      [id, scope.companyId],
    );
    recordConversationAction(req, {
      conversationId: id,
      eventAction: "communications.conversation.closed",
      before: { status: conversation.status },
      after: { status: "closed" },
      details: { reason: body.reason ?? null },
    });
    res.json(maskFields(req, { ok: true, status: "closed" }));
  } catch (err) {
    handleRouteError(err, res, "inbox/conversations/close");
  }
});

router.post("/:id/reopen", authorize({ feature: "communications", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const conversation = await loadConversation(id, scope.companyId);
    if (conversation.status !== "closed" && conversation.status !== "escalated") {
      throw new ValidationError("المحادثة ليست مغلقة أو مصعدة");
    }

    await rawExecute(
      `UPDATE conversations SET status = 'open', "updatedAt" = now()
        WHERE id = $1 AND "companyId" = $2`,
      [id, scope.companyId],
    );
    recordConversationAction(req, {
      conversationId: id,
      eventAction: "communications.conversation.reopened",
      before: { status: conversation.status },
      after: { status: "open" },
    });
    res.json(maskFields(req, { ok: true, status: "open" }));
  } catch (err) {
    handleRouteError(err, res, "inbox/conversations/reopen");
  }
});

const escalateSchema = z.object({
  reason: z.string().max(1000).optional().nullable(),
  priority: z.enum(["high", "urgent"]).default("high"),
});

router.post("/:id/escalate", authorize({ feature: "communications", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const body = zodParse(escalateSchema.safeParse(req.body));
    const conversation = await loadConversation(id, scope.companyId);
    if (conversation.status === "closed") {
      throw new ValidationError("لا يمكن تصعيد محادثة مغلقة — أعد فتحها أولًا");
    }

    // Escalation only ever RAISES priority — an urgent conversation
    // escalated again with priority=high stays urgent.
    const newPriority =
      conversation.priority === "urgent" ? "urgent" : body.priority;
    await rawExecute(
      `UPDATE conversations SET status = 'escalated', priority = $3, "updatedAt" = now()
        WHERE id = $1 AND "companyId" = $2`,
      [id, scope.companyId, newPriority],
    );
    recordConversationAction(req, {
      conversationId: id,
      eventAction: "communications.conversation.escalated",
      before: { status: conversation.status, priority: conversation.priority },
      after: { status: "escalated", priority: newPriority },
      details: { reason: body.reason ?? null },
    });
    res.json(maskFields(req, { ok: true, status: "escalated", priority: newPriority }));
  } catch (err) {
    handleRouteError(err, res, "inbox/conversations/escalate");
  }
});

export default router;
