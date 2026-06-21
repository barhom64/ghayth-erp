import { handleRouteError, ValidationError, NotFoundError, ForbiddenError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { Router } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import { logger } from "../lib/logger.js";
import { config } from "../lib/config.js";
import { getCachedVendorConfigSync } from "../lib/vendorSettings.js";
import { enqueueTranscription } from "../lib/pbxControl.js";
import { z } from "zod";
import { rawQuery, rawExecute, withTransaction, assertInsert } from "../lib/rawdb.js";
import { internalTechRef } from "../lib/internalRef.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { issueNumber } from "../lib/numberingService.js";
import { sendNotification } from "../lib/notificationService.js";
import { createAuditLog, emitEvent } from "../lib/businessHelpers.js";
import { sendMessage } from "../lib/messageSender.js";
import { aiEngine } from "../lib/aiEngine.js";
import { sendPushToCompany, getVapidPublicKey } from "../lib/pushService.js";
import { encryptPushEndpoint, hashPushEndpoint, decryptPushEndpoint } from "../lib/pushCrypto.js";

export { decryptPushEndpoint as decryptEndpoint };

/* ── Zod Schemas ───────────────────────────────────────────────── */

const sendCommunicationSchema = z.object({
  channel: z.string({ required_error: "قناة المراسلة مطلوبة" }).min(1, "قناة المراسلة مطلوبة"),
  toNumber: z.string().optional(),
  toEmail: z.string().optional(),
  body: z.string({ required_error: "محتوى الرسالة مطلوب" }).min(1, "محتوى الرسالة مطلوب"),
  fromNumber: z.string().optional(),
  subject: z.string().optional(),
  relatedType: z.string().optional(),
  relatedId: z.coerce.number().optional(),
  attachments: z.array(z.any()).optional(),
});

const convertLogSchema = z.object({
  targetType: z.enum(["task", "ticket", "request"], { required_error: "نوع التحويل مطلوب", invalid_type_error: "نوع التحويل غير صالح. المتاح: task, ticket, request" }),
  reason: z.string().max(500).optional(),
});

const pushSubscribeSchema = z.object({
  endpoint: z.string({ required_error: "رابط الاشتراك مطلوب" }).min(1, "رابط الاشتراك مطلوب"),
  keys: z.object({
    p256dh: z.string({ required_error: "مفتاح p256dh مطلوب" }).min(1, "مفتاح p256dh مطلوب"),
    auth: z.string({ required_error: "مفتاح auth مطلوب" }).min(1, "مفتاح auth مطلوب"),
  }, { required_error: "مفاتيح الاشتراك مطلوبة" }),
});

const updateLogSchema = z.object({
  body: z.string().optional(),
  content: z.string().optional(),
  subject: z.string().optional(),
  direction: z.string().optional(),
  status: z.string().optional(),
});

const pbxIncomingSchema = z.object({
  callerNumber: z.string().optional(),
  from: z.string().optional(),
  calledNumber: z.string().optional(),
  to: z.string().optional(),
  callId: z.string().optional(),
  CallSid: z.string().optional(),
  direction: z.string().optional(),
});

const pbxCompletedSchema = z.object({
  callId: z.string().optional(),
  CallSid: z.string().optional(),
  duration: z.coerce.number().optional(),
  CallDuration: z.coerce.number().optional(),
  status: z.string().optional(),
  recordingUrl: z.string().optional(),
  RecordingUrl: z.string().optional(),
});

const pbxStatusSchema = z.object({
  callId: z.string({ required_error: "callId مطلوب" }).min(1, "callId مطلوب"),
  status: z.string().optional(),
  answeredBy: z.string().nullable().optional(),
});

const pushUnsubscribeSchema = z.object({
  endpoint: z.string({ required_error: "endpoint مطلوب" }).min(1, "endpoint مطلوب"),
});

const router = Router();

// Inbound webhooks (WhatsApp + PBX) are ANONYMOUS — the external provider
// (Meta / the PBX vendor) carries no ERP JWT, so these handlers verify their
// own signatures and must be mounted BEFORE authMiddleware. They register on
// this separate router (helpers below stay in scope) which index.ts mounts on
// the public surface; the default `router` keeps the authenticated routes.
// Before this split they sat behind authMiddleware and were unreachable —
// every inbound WhatsApp message / PBX call event got 401'd at the door.
export const publicWebhookRouter = Router();

// WhatsApp credentials — env values used as the initial cached value;
// the live read in the route bodies goes through getCachedVendorConfigSync
// so a UI-driven update via /admin/vendor-settings takes effect after the
// next cache warm (60s TTL).
const WA_VERIFY_TOKEN_ENV = config.whatsapp.verifyToken ?? "ghayth_erp_verify";
const WA_ACCESS_TOKEN = config.whatsapp.accessToken ?? "";
const WA_PHONE_ID = config.whatsapp.phoneId ?? "";
const WA_APP_SECRET = config.whatsapp.appSecret ?? "";

/**
 * Resolve the PBX webhook secret — DB first (vendor_secrets.pbx-webhook
 * via the cached sync read), env fallback. Lets the operator rotate
 * the secret from /admin/vendor-settings without a redeploy.
 */
function getPbxWebhookSecret(): string {
  const vc = getCachedVendorConfigSync("pbx-webhook");
  const fromDb = typeof vc.config.webhookSecret === "string" ? vc.config.webhookSecret : "";
  return fromDb || config.pbx.webhookSecret || "";
}

// RD3-01 — PBX webhook auth. PBX providers (3CX, Twilio, Asterisk
// connectors, etc.) typically sign callbacks with HMAC-SHA256 over the
// raw body. We support either a `x-pbx-signature: sha256=<hex>` header
// (HMAC-SHA256) OR a bearer token `Authorization: Bearer <secret>` to
// match the simpler shared-secret schemes some on-prem PBXs use.
// Without verification, any attacker could forge a POST to /pbx/* and
// fabricate calls / chat_messages / tasks. Fails closed when no
// secret is configured (in DB or env).
function verifyPbxSignature(req: import("express").Request): boolean {
  const pbxSecret = getPbxWebhookSecret();
  if (!pbxSecret) return false;
  const auth = req.get("authorization") ?? "";
  if (auth.startsWith("Bearer ")) {
    const provided = auth.slice("Bearer ".length).trim();
    if (provided.length === pbxSecret.length) {
      try {
        return timingSafeEqual(Buffer.from(provided), Buffer.from(pbxSecret));
      } catch { return false; }
    }
    return false;
  }
  const header = req.get("x-pbx-signature") ?? "";
  if (!header.startsWith("sha256=")) return false;
  const raw = (req as unknown as { rawBody?: Buffer }).rawBody;
  if (!raw) return false;
  const expected = createHmac("sha256", pbxSecret).update(raw).digest("hex");
  const provided = header.slice("sha256=".length);
  if (expected.length !== provided.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(provided, "hex"));
  } catch { return false; }
}

// NF-COMM-01 — Meta signs every inbound webhook with X-Hub-Signature-256
// using the app secret. Without verification, anyone with our public
// webhook URL could forge messages that hit `matchSenderToEntity` /
// automation rules. Returns true when the signature matches the raw
// JSON body that express captured via the `verify` callback in app.ts.
function verifyWhatsAppSignature(req: import("express").Request): boolean {
  if (!WA_APP_SECRET) return false;
  const header = req.get("x-hub-signature-256") ?? "";
  if (!header.startsWith("sha256=")) return false;
  const raw = (req as unknown as { rawBody?: Buffer }).rawBody;
  if (!raw) return false;
  const expected = createHmac("sha256", WA_APP_SECRET).update(raw).digest("hex");
  const provided = header.slice("sha256=".length);
  if (expected.length !== provided.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(provided, "hex"));
  } catch {
    return false;
  }
}

async function matchSenderToEntity(phone: string, companyId: number): Promise<{ type: "client" | "employee" | "unknown"; id: number | null; name: string }> {
  const normalizedPhone = phone.replace(/\D/g, "").slice(-9);

  const clients = await rawQuery<{ id: number; name: string }>(
    `SELECT id, name FROM clients WHERE "companyId"=$1 AND REPLACE(REPLACE(phone,'+',''),'-','') LIKE $2 AND "deletedAt" IS NULL`,
    [companyId, `%${normalizedPhone}`]
  );
  if (clients.length > 0) {
    return { type: "client", id: clients[0]!.id, name: clients[0]!.name };
  }

  const employees = await rawQuery<{ id: number; name: string }>(
    `SELECT e.id, e.name FROM employees e
     JOIN employee_assignments ea ON ea."employeeId"=e.id AND ea."companyId"=$1 AND ea.status='active'
     WHERE e."deletedAt" IS NULL AND REPLACE(REPLACE(e.phone,'+',''),'-','') LIKE $2
     LIMIT 5`,
    [companyId, `%${normalizedPhone}`]
  );
  if (employees.length > 0) {
    return { type: "employee", id: employees[0]!.id, name: employees[0]!.name };
  }

  return { type: "unknown", id: null, name: phone };
}

async function sendWhatsAppMessage(to: string, message: string): Promise<boolean> {
  if (!WA_ACCESS_TOKEN || !WA_PHONE_ID) {
    logger.info({ to, message }, "WhatsApp stub — no credentials configured");
    return false;
  }

  try {
    const resp = await fetch(
      `https://graph.facebook.com/v18.0/${WA_PHONE_ID}/messages`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${WA_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: message },
        }),
      }
    );
    return resp.ok;
  } catch (err) {
    logger.error(err, "[WhatsApp] Send error:");
    return false;
  }
}

publicWebhookRouter.get("/whatsapp/webhook", (req, res) => {
  try {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === WA_VERIFY_TOKEN_ENV) {
      res.status(200).send(challenge);
    } else {
      throw new ForbiddenError("Verification failed");
    }
  } catch (err) { handleRouteError(err, res, "WhatsApp webhook verify error:"); }
});

publicWebhookRouter.post("/whatsapp/webhook", async (req, res): Promise<void> => {
  try {
    // NF-COMM-01 — reject forged inbound payloads before any processing.
    // Meta retries on non-2xx so we still need to respond 200 to *valid*
    // requests; for invalid ones we 403 so an attacker can't keep
    // flooding processing logic. When WHATSAPP_APP_SECRET is unset we
    // fail closed (refusing every webhook) — tenants must configure the
    // secret to enable WhatsApp ingestion.
    if (!verifyWhatsAppSignature(req)) {
      logger.warn("[WhatsApp] dropping webhook with bad/missing X-Hub-Signature-256");
      res.status(403).json({ error: "invalid_signature" });
      return;
    }

    res.status(200).json({ status: "ok" });

    const body = req.body;
    if (body.object !== "whatsapp_business_account") return;

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (!value?.messages) return;

    for (const message of value.messages) {
      const from = message.from as string;
      const msgId = message.id as string;
      const msgType = message.type as string;
      const msgText = msgType === "text" ? (message.text?.body as string) : "[media message]";
      const timestamp = new Date(Number(message.timestamp) * 1000).toISOString();

      const metaPhoneId = value.metadata?.phone_number_id as string | undefined;
      let companyId: number | undefined;
      if (metaPhoneId) {
        const byPhoneId = await rawQuery<{ id: number }>(
          `SELECT "companyId" AS id FROM integrations
           WHERE type='whatsapp' AND (config->>'phoneNumberId')=$1 AND status='active' LIMIT 1`,
          [metaPhoneId]
        );
        if (byPhoneId.length > 0) companyId = byPhoneId[0]!.id;
      }
      if (!companyId) {
        const displayPhone = value.metadata?.display_phone_number as string | undefined;
        if (displayPhone) {
          const normalized = displayPhone.replace(/\D/g, "").slice(-9);
          const byDisplayPhone = await rawQuery<{ id: number }>(
            `SELECT id FROM companies WHERE REPLACE(REPLACE(COALESCE(phone,''),'+',''),'-','') LIKE $1 LIMIT 1`,
            [`%${normalized}`]
          );
          if (byDisplayPhone.length > 0) companyId = byDisplayPhone[0]!.id;
        }
      }
      if (!companyId) {
        logger.warn(`[WhatsApp] Could not resolve companyId for phone_number_id=${metaPhoneId ?? "unknown"} display=${value.metadata?.display_phone_number ?? "unknown"} — message from ${from} dropped (unmapped tenant)`);
        continue;
      }

      const sender = await matchSenderToEntity(from, companyId);

      // Phase 4 final contract: write to message_log only.
      await rawExecute(
        `INSERT INTO message_log
           ("companyId", channel, direction, "fromAddress", "toAddress",
            subject, body, status, folder, "relatedType", "relatedId", "createdAt")
         VALUES ($1, 'whatsapp', 'inbound', $2, '', $3, $4, 'received', 'inbox', $5, $6, NOW())`,
        [companyId, from, `WhatsApp from ${sender.name}`, msgText, sender.type !== "unknown" ? sender.type : null, sender.id]
      );

      const categorized = await aiEngine.receptionCategorize(msgText, `Sender: ${sender.name} (${sender.type})`, { companyId });

      let relatedType: string | null = null;
      let relatedId: number | null = null;

      if (categorized.category === "support" || categorized.priority === "urgent") {
        const { insertId } = await rawExecute(
          `INSERT INTO support_tickets ("companyId",title,description,status,priority,"createdAt")
           VALUES ($1,$2,$3,'open',$4,NOW())`,
          [companyId, `WhatsApp: ${msgText.substring(0, 100)}`, `${msgText}\n\nمن: ${sender.name} (${from})`, categorized.priority]
        );
        assertInsert(insertId, "support_tickets");
        relatedType = "support_ticket";
        relatedId = insertId;
      } else if (sender.type === "unknown" && categorized.category === "crm") {
        const { insertId } = await rawExecute(
          `INSERT INTO crm_opportunities ("companyId",title,stage,status,"createdAt")
           VALUES ($1,$2,'lead','active',NOW())`,
          [companyId, `WhatsApp Lead: ${sender.name}`]
        );
        assertInsert(insertId, "crm_opportunities");
        relatedType = "crm_opportunity";
        relatedId = insertId;
      }

      const ackMessage = `مرحباً ${sender.name !== from ? sender.name : ""}، شكراً لتواصلك معنا. سنقوم بالرد عليك في أقرب وقت ممكن. رقم طلبك: WA-${msgId.substring(0, 8)}`;
      await sendWhatsAppMessage(from, ackMessage);

      await rawExecute(
        `INSERT INTO outbound_queue
           ("companyId", channel, recipient, "recipientName", body, status,
            "sentAt", "createdAt", "updatedAt")
         VALUES ($1, 'whatsapp', $2, $3, $4, 'sent', NOW(), NOW(), NOW())`,
        [companyId, from, sender.name, ackMessage]
      );

      if (relatedType && relatedId) {
        await sendNotification({
          companyId,
          type: "support",
          title: `رسالة واتساب جديدة من ${sender.name}`,
          body: msgText.substring(0, 200),
          priority: categorized.priority === "urgent" ? "urgent" : "high",
          targetRole: "admin",
          refType: relatedType,
          refId: relatedId,
        });
      }

      emitEvent({ companyId, userId: 0, action: "communication.whatsapp.received", entity: "communication_logs", entityId: 0, details: JSON.stringify({ from, msgType, senderName: sender.name, senderType: sender.type }) }).catch((e) => logger.error(e, "communications background task failed"));
      createAuditLog({ companyId, userId: 0, action: "create", entity: "communication_logs", entityId: 0, after: { channel: "whatsapp", direction: "inbound", from, senderName: sender.name, senderType: sender.type } }).catch((e) => logger.error(e, "communications background task failed"));
    }
  } catch (err) {
    logger.error(err, "[WhatsApp] Webhook error:");
  }
});

publicWebhookRouter.post("/pbx/incoming", async (req, res): Promise<void> => {
  try {
    // RD3-01 — reject forged inbound payloads before any processing.
    if (!verifyPbxSignature(req)) {
      logger.warn("[PBX] dropping /pbx/incoming with bad/missing signature");
      res.status(403).json({ error: "invalid_signature" });
      return;
    }
    const b = zodParse(pbxIncomingSchema.safeParse(req.body ?? {}));
    const callerNumber = b.callerNumber ?? b.from ?? "";
    const calledNumber = b.calledNumber ?? b.to ?? "";
    // PBX correlation id — internal tech ref, NOT a customer-visible
    // document number. The PBX vendor supplies one (callId / CallSid)
    // in the normal path; this fallback covers self-hosted PBXes that
    // don't issue one. Routed through internalTechRef (lib/internalRef.ts)
    // so the inline-date-now-as-ref lint rule stays clean.
    const callId = b.callId ?? b.CallSid ?? internalTechRef("CALL");
    const direction = b.direction ?? "inbound";

    const normalizedCalledNumber = calledNumber.replace(/\D/g, "").slice(-9);
    let pbxCompanyId: number | undefined;
    if (normalizedCalledNumber) {
      const byDid = await rawQuery<{ id: number }>(
        `SELECT "companyId" AS id FROM integrations
         WHERE (config->>'did') LIKE $1 AND status='active' LIMIT 1`,
        [`%${normalizedCalledNumber}`]
      );
      if (byDid.length > 0) pbxCompanyId = byDid[0]!.id;
    }
    if (!pbxCompanyId) {
      const byCompanyPhone = await rawQuery<{ id: number }>(
        `SELECT id FROM companies WHERE REPLACE(REPLACE(COALESCE(phone,''),'+',''),'-','') LIKE $1 LIMIT 1`,
        [`%${normalizedCalledNumber}`]
      );
      if (byCompanyPhone.length > 0) pbxCompanyId = byCompanyPhone[0]!.id;
    }
    if (!pbxCompanyId) {
      logger.warn(`[PBX] Could not resolve companyId for calledNumber=${calledNumber} — call from ${callerNumber} dropped (unmapped tenant)`);
      res.status(200).json({ status: "ok", warning: "company not mapped to this DID" });
      return;
    }
    const companyId = pbxCompanyId;

    const sender = await matchSenderToEntity(callerNumber, companyId);

    let pbxId!: number;
    await withTransaction(async (client) => {
      const result = await client.query(
        `INSERT INTO pbx_calls ("companyId","callId","callerNumber","calledNumber",direction,status,"createdAt")
         VALUES ($1,$2,$3,$4,$5,'ringing',NOW()) RETURNING id`,
        [companyId, callId, callerNumber, calledNumber, direction]
      );
      pbxId = result.rows[0].id;
      // Phase 4 final contract: write to message_log only.
      await client.query(
        `INSERT INTO message_log
           ("companyId", channel, direction, "fromAddress", "toAddress",
            subject, body, status, folder, "relatedType", "relatedId", "createdAt")
         VALUES ($1, 'pbx', $2, $3, $4, $5, $6, 'received', 'inbox', 'pbx_call', $7, NOW())`,
        [companyId, direction, callerNumber, calledNumber, `PBX Call from ${sender.name}`, `Incoming call from ${callerNumber} identified as ${sender.name} (${sender.type})`, pbxId]
      );
    });

    await sendNotification({
      companyId,
      type: "system",
      title: `مكالمة واردة من ${sender.name}`,
      body: `${callerNumber} يتصل بـ ${calledNumber}`,
      priority: "high",
      targetRole: "admin",
      refType: "pbx_call",
      refId: pbxId,
    });

    emitEvent({ companyId, userId: 0, action: "communication.pbx.incoming", entity: "communication_logs", entityId: pbxId, details: JSON.stringify({ callId, callerNumber, calledNumber, direction, senderName: sender.name, senderType: sender.type }) }).catch((e) => logger.error(e, "communications background task failed"));
    createAuditLog({ companyId, userId: 0, action: "create", entity: "communication_logs", entityId: pbxId, after: { channel: "pbx", direction, callId, callerNumber, calledNumber, senderName: sender.name } }).catch((e) => logger.error(e, "communications background task failed"));

    res.status(200).json({
      status: "ok",
      callId,
      pbxLogId: pbxId,
      callerInfo: {
        phone: callerNumber,
        name: sender.name,
        type: sender.type,
        id: sender.id,
      },
      action: "route_to_agent",
    });
  } catch (err) {
    handleRouteError(err, res, "[PBX] Incoming error:");
  }
});

publicWebhookRouter.post("/pbx/completed", async (req, res): Promise<void> => {
  try {
    // RD3-01 — same signature gate as /pbx/incoming.
    if (!verifyPbxSignature(req)) {
      logger.warn("[PBX] dropping /pbx/completed with bad/missing signature");
      res.status(403).json({ error: "invalid_signature" });
      return;
    }
    const b = zodParse(pbxCompletedSchema.safeParse(req.body ?? {}));
    const callId = b.callId ?? b.CallSid ?? "";
    const duration = b.duration ?? b.CallDuration ?? 0;
    const status = b.status ?? (duration > 0 ? "completed" : "no_answer");
    const recordingUrl = b.recordingUrl ?? b.RecordingUrl ?? null;

    const [call] = await rawQuery<{ id: number; callerNumber: string; companyId: number }>(
      `SELECT id, "callerNumber", "companyId" FROM pbx_calls WHERE "callId"=$1`,
      [callId]
    );
    if (!call) { res.status(200).json({ status: "ok" }); return; }
    const companyId = call.companyId;

    await rawExecute(
      `UPDATE pbx_calls SET status=$1, duration=$2, "recordingUrl"=$3 WHERE id=$4 AND "companyId"=$5 AND status != 'completed'`,
      [status, duration, recordingUrl, call.id, companyId]
    );

    // Auto-queue the recording for transcription. The STT worker
    // (cron: stt_queue_drain) picks it up; lib/pbxControl resolves
    // an active STT provider from ai_providers (capability='stt')
    // and falls back to a clear failed state if none is configured.
    // Persist a pbx_call_recordings row in the same step so the
    // operator UI has retention metadata.
    if (recordingUrl && (status === "completed" || duration > 0)) {
      void rawExecute(
        `INSERT INTO pbx_call_recordings ("callId", "companyId", "recordingUrl", "durationMs", status)
         VALUES ($1, $2, $3, $4, 'active')
         ON CONFLICT ("callId") DO UPDATE
           SET "recordingUrl" = EXCLUDED."recordingUrl",
               "durationMs"   = EXCLUDED."durationMs",
               status         = 'active'`,
        [call.id, companyId, recordingUrl, (duration ?? 0) * 1000],
      ).catch((e) => logger.warn(e, "[PBX] recording metadata upsert failed (non-fatal)"));
      void enqueueTranscription(call.id, companyId, "ar")
        .catch((e) => logger.warn(e, "[PBX] auto-enqueue STT failed (non-fatal)"));
    }

    if (status === "no_answer" || duration === 0) {
      const sender = await matchSenderToEntity(call.callerNumber, companyId);
      await rawExecute(
        `INSERT INTO tasks ("companyId",title,description,type,status,priority,"createdAt")
         VALUES ($1,$2,$3,'follow_up','pending','high',NOW())`,
        [
          companyId,
          `رد على مكالمة من ${sender.name}`,
          `اتصل ${sender.name} (${call.callerNumber}) ولم يتم الرد. يرجى الاتصال مرة أخرى.\nمعرف المكالمة: ${callId}`,
        ]
      );

      await sendNotification({
        companyId,
        type: "system",
        title: `مكالمة فائتة من ${sender.name}`,
        body: `${call.callerNumber} اتصل ولم يتم الرد - تم إنشاء مهمة للمتابعة`,
        priority: "high",
        targetRole: "admin",
        refType: "pbx_call",
        refId: call.id,
      });
    }

    emitEvent({ companyId, userId: 0, action: "communication.pbx.completed", entity: "communication_logs", entityId: call.id, details: JSON.stringify({ callId, duration, status }) }).catch((e) => logger.error(e, "communications background task failed"));
    createAuditLog({ companyId, userId: 0, action: "create", entity: "communication_logs", entityId: call.id, after: { channel: "pbx", callId, duration, status, recordingUrl } }).catch((e) => logger.error(e, "communications background task failed"));

    res.status(200).json({ status: "ok", callId, duration, callStatus: status });
  } catch (err) {
    handleRouteError(err, res, "[PBX] Completed error:");
  }
});

publicWebhookRouter.post("/pbx/status", async (req, res): Promise<void> => {
  try {
    // RD3-01 — same signature gate as /pbx/incoming.
    if (!verifyPbxSignature(req)) {
      logger.warn("[PBX] dropping /pbx/status with bad/missing signature");
      res.status(403).json({ error: "invalid_signature" });
      return;
    }
    const { callId, status, answeredBy } = zodParse(pbxStatusSchema.safeParse(req.body ?? {}));

    const [call] = await rawQuery<Record<string, unknown>>(
      `SELECT id, "companyId" FROM pbx_calls WHERE "callId"=$1 AND status != 'completed' LIMIT 1`,
      [callId]
    );
    if (!call) {
      res.status(404).json({ error: "Call not found or already completed" });
      return;
    }
    await rawExecute(
      `UPDATE pbx_calls SET status=$1, "answeredBy"=$2 WHERE id=$3`,
      [status ?? "in_progress", answeredBy ?? null, call.id]
    );

    emitEvent({ companyId: (call.companyId as number | null) ?? 0, userId: 0, action: "communication.pbx.status", entity: "communication_logs", entityId: call.id as number, details: JSON.stringify({ callId, status: status ?? "in_progress", answeredBy }) }).catch((e) => logger.error(e, "communications background task failed"));
    createAuditLog({ companyId: (call.companyId as number | null) ?? 0, userId: 0, action: "create", entity: "communication_logs", entityId: call.id as number, after: { channel: "pbx", callId, status: status ?? "in_progress", answeredBy } }).catch((e) => logger.error(e, "communications background task failed"));

    res.status(200).json({ status: "ok" });
  } catch (err) {
    handleRouteError(err, res, "[PBX] Status update error:");
  }
});

router.get("/log", authorize({ feature: "communications", action: "list" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const { channel, direction, limit: lim, offset: off, page } = req.query as Record<string, string | undefined>;
    const pageLimit = Math.min(Number(lim) || 50, 200);
    // COM-011 — the log tabs page with ?page=N; accept it (and still accept
    // an explicit ?offset=) so paging past the first page actually works.
    const pageOffset = off != null ? (Number(off) || 0) : (Math.max(1, Number(page) || 1) - 1) * pageLimit;
    const conditions = [`"companyId" = $1`, `"deletedAt" IS NULL`];
    const params: unknown[] = [scope.companyId];
    if (channel) { params.push(channel); conditions.push(`channel = $${params.length}`); }
    if (direction) { params.push(direction); conditions.push(`direction = $${params.length}`); }
    const where = conditions.join(" AND ");
    // Phase 4 contract step 2: read from v_message_log_all. The view
    // aliases fromAddress/toAddress columns back to fromNumber/toNumber
    // in the explicit projection so the frontend `<DataTable>` columns
    // ("من" / "إلى") keep resolving against the same keys.
    const [countRow] = await rawQuery<Record<string, unknown>>(`SELECT COUNT(*) AS total FROM v_message_log_all WHERE ${where}`, params);
    params.push(pageLimit, pageOffset);
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT id, "companyId", channel, direction,
              "fromAddress" AS "fromNumber", "toAddress" AS "toNumber",
              subject, body, status, folder, "isStarred",
              "relatedType", "relatedId", "createdAt", "deletedAt"
         FROM v_message_log_all WHERE ${where}
        ORDER BY "createdAt" DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    res.json(maskFields(req, { data: rows, total: Number(countRow?.total ?? 0), limit: pageLimit, offset: pageOffset }));
  } catch (err) { handleRouteError(err, res, "Communications log error:"); }
});

router.post("/send", authorize({ feature: "communications", action: "create" }), async (req, res): Promise<void> => {
  try {
    const b = zodParse(sendCommunicationSchema.safeParse(req.body ?? {}));
    const scope = req.scope!;

    const validChannels = ["whatsapp", "sms", "email", "call", "push"];
    const channel = b.channel.toLowerCase();
    if (!(validChannels as readonly string[]).includes(channel)) {
      throw new ValidationError(`قناة غير مدعومة: ${b.channel}`, {
        field: "channel",
        fix: `اختر قناة من: ${validChannels.join(", ")}`,
      });
    }
    if (!b.toNumber && !b.toEmail) {
      throw new ValidationError("المستلم مطلوب", {
        field: "toNumber",
        fix: "أدخل رقم المستلم أو بريده الإلكتروني",
      });
    }
    const recipient = b.toEmail ?? b.toNumber ?? "";

    // Phase 4 contract slice 3: real sends (email/sms/whatsapp) now
    // route through messageSender — same path as /inbox/send. That
    // gives us DLP enforcement, provider failover telemetry, and
    // dual-write to message_log / outbound_queue for free. The
    // /communications/send endpoint stays as a back-compat shim.
    //
    // 'call' and 'push' aren't real outbound messages — call is just
    // an audit row, push goes through pushService — so those keep the
    // legacy direct-INSERT path until their own seams land.
    if (channel === "email" || channel === "sms" || channel === "whatsapp") {
      const result = await sendMessage({
        channel,
        recipient,
        subject: b.subject ?? null,
        body: b.body.trim(),
        relatedType: b.relatedType ?? null,
        relatedId: b.relatedId ?? null,
        companyId: scope.companyId,
        userId: scope.userId,
        eventAction: "communications.message.sent",
      });
      // Read the freshly-written row back from the unified view so the
      // shape matches the legacy response (which the admin UI consumes).
      const [row] = await rawQuery<Record<string, unknown>>(
        `SELECT id, "companyId", channel, direction,
                "fromAddress" AS "fromNumber", "toAddress" AS "toNumber",
                subject, body, status, folder, "isStarred",
                "relatedType", "relatedId", "createdAt", "deletedAt"
           FROM v_message_log_all
          WHERE id = $1 AND "companyId" = $2`,
        [result.logId, scope.companyId],
      );
      res.status(result.blocked ? 422 : 201).json(row ?? result);
      return;
    }

    // Audit-only channels (call / push): write directly to message_log
    // — these are book-keeping rows, not actual sends, and don't need
    // DLP or queue dispatch. Phase 4 contract final cleanup: was
    // previously writing to communications_log; switched so the row
    // survives the deferred legacy DROP and matches the id semantics
    // used by /convert/:id + the soft-delete endpoint below.
    const { insertId } = await rawExecute(
      `INSERT INTO message_log
         ("companyId", channel, direction, "fromAddress", "toAddress",
          subject, body, status, folder, "relatedType", "relatedId", "createdAt")
       VALUES ($1, $2, 'outbound', $3, $4, $5, $6, 'queued', 'sent', $7, $8, NOW())`,
      [scope.companyId, channel, b.fromNumber ?? null, recipient, b.subject ?? null, b.body.trim(), b.relatedType ?? null, b.relatedId ?? null],
    );
    assertInsert(insertId, "message_log");
    const [row] = await rawQuery<Record<string, unknown>>(
      `SELECT id, "companyId", channel, direction,
              "fromAddress" AS "fromNumber", "toAddress" AS "toNumber",
              subject, body, status, folder, "isStarred",
              "relatedType", "relatedId", "createdAt", "deletedAt"
         FROM message_log WHERE id=$1 AND "companyId"=$2`,
      [insertId, scope.companyId],
    );
    if (!row) throw new NotFoundError("فشل في استرجاع السجل");
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "message_log", entityId: insertId, after: { channel, toNumber: recipient } }).catch((e) => logger.error(e, "communications background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "communications.message.sent",
      entity: "message_log",
      entityId: insertId,
      details: JSON.stringify({ channel, toNumber: recipient }),
    }).catch((e) => logger.error(e, "communications background task failed"));
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Send communication error:"); }
});

router.get("/whatsapp", authorize({ feature: "communications", action: "list" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const { status, limit: lim, offset: off, page } = req.query as Record<string, string | undefined>;
    const pageLimit = Math.min(Number(lim) || 50, 200);
    // COM-011 — the log tabs page with ?page=N; accept it (and still accept
    // an explicit ?offset=) so paging past the first page actually works.
    const pageOffset = off != null ? (Number(off) || 0) : (Math.max(1, Number(page) || 1) - 1) * pageLimit;
    const conditions = [`"companyId" = $1`];
    const params: unknown[] = [scope.companyId];
    if (status) { params.push(status); conditions.push(`status = $${params.length}`); }
    const where = `${conditions.join(" AND ")} AND channel = 'whatsapp'`;
    // Phase 4 contract slice 5: read from outbound_queue. After slice 4
    // (#1293), the worker mirrors status / externalId back into this
    // table, so the admin monitor sees the same lifecycle it always did.
    // recipient → phone / recipientPhone aliases keep the frontend
    // <DataTable> columns resolving against the same keys.
    const [countRow] = await rawQuery<Record<string, unknown>>(`SELECT COUNT(*) AS total FROM outbound_queue WHERE ${where}`, params);
    params.push(pageLimit, pageOffset);
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT id, "companyId", recipient AS phone, recipient AS "recipientPhone",
              "recipientName", body AS message, "templateName", "templateParams",
              status, "externalId", "sentAt", "deliveredAt", "scheduledAt",
              attempts AS "attemptCount", "errorMessage", "createdAt", "updatedAt"
         FROM outbound_queue WHERE ${where}
        ORDER BY "createdAt" DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    res.json(maskFields(req, { data: rows, total: Number(countRow?.total ?? 0), limit: pageLimit, offset: pageOffset }));
  } catch (err) { handleRouteError(err, res, "WhatsApp queue error:"); }
});

router.get("/sms", authorize({ feature: "communications", action: "list" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const { status, limit: lim, offset: off, page } = req.query as Record<string, string | undefined>;
    const pageLimit = Math.min(Number(lim) || 50, 200);
    // COM-011 — the log tabs page with ?page=N; accept it (and still accept
    // an explicit ?offset=) so paging past the first page actually works.
    const pageOffset = off != null ? (Number(off) || 0) : (Math.max(1, Number(page) || 1) - 1) * pageLimit;
    const conditions = [`"companyId" = $1`];
    const params: unknown[] = [scope.companyId];
    if (status) { params.push(status); conditions.push(`status = $${params.length}`); }
    const where = `${conditions.join(" AND ")} AND channel = 'sms'`;
    // Phase 4 contract slice 5: read from outbound_queue (see /whatsapp).
    const [countRow] = await rawQuery<Record<string, unknown>>(`SELECT COUNT(*) AS total FROM outbound_queue WHERE ${where}`, params);
    params.push(pageLimit, pageOffset);
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT id, "companyId", recipient AS "recipientPhone", body AS message,
              status, "externalId", "sentAt", attempts AS "attemptCount",
              "errorMessage", "createdAt", "updatedAt"
         FROM outbound_queue WHERE ${where}
        ORDER BY "createdAt" DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    res.json(maskFields(req, { data: rows, total: Number(countRow?.total ?? 0), limit: pageLimit, offset: pageOffset }));
  } catch (err) { handleRouteError(err, res, "SMS queue error:"); }
});

router.get("/pbx", authorize({ feature: "communications", action: "list" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const { limit: lim, offset: off, page } = req.query as Record<string, string | undefined>;
    const pageLimit = Math.min(Number(lim) || 50, 200);
    // COM-011 — the log tabs page with ?page=N; accept it (and still accept
    // an explicit ?offset=) so paging past the first page actually works.
    const pageOffset = off != null ? (Number(off) || 0) : (Math.max(1, Number(page) || 1) - 1) * pageLimit;
    const [countRow] = await rawQuery<Record<string, unknown>>(`SELECT COUNT(*) AS total FROM pbx_calls WHERE "companyId"=$1`, [scope.companyId]);
    const rows = await rawQuery<Record<string, unknown>>(`SELECT * FROM pbx_calls WHERE "companyId"=$1 ORDER BY "createdAt" DESC LIMIT $2 OFFSET $3`, [scope.companyId, pageLimit, pageOffset]);
    res.json(maskFields(req, { data: rows, total: Number(countRow?.total ?? 0), limit: pageLimit, offset: pageOffset }));
  } catch (err) { handleRouteError(err, res, "PBX calls error:"); }
});

router.patch("/log/:id", authorize({ feature: "communications", action: "update" }), async (req, res): Promise<void> => {
  try {
    const parsed = zodParse(updateLogSchema.safeParse(req.body ?? {}));
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { body, content, subject, direction, status } = parsed;
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    const finalBody = body ?? content;
    if (finalBody !== undefined) { sets.push(`body = $${idx++}`); params.push(finalBody); }
    if (subject !== undefined) { sets.push(`subject = $${idx++}`); params.push(subject); }
    if (direction !== undefined) { sets.push(`direction = $${idx++}`); params.push(direction); }
    if (status !== undefined) { sets.push(`status = $${idx++}`); params.push(status); }
    if (sets.length === 0) { throw new ValidationError("لا توجد بيانات"); }
    params.push(id, scope.companyId);
    const [row] = await rawQuery<Record<string, unknown>>(
      `UPDATE message_log SET ${sets.join(", ")} WHERE id = $${idx++} AND "companyId" = $${idx} AND "deletedAt" IS NULL RETURNING *`,
      params
    );
    if (!row) { throw new NotFoundError("السجل غير موجود"); }
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "message_log", entityId: id }).catch((e) => logger.error(e, "communications background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "communications.log.updated",
      entity: "communications_log",
      entityId: id,
    }).catch((e) => logger.error(e, "communications background task failed"));
    res.json(row);
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
});

router.post("/log/:id/convert", authorize({ feature: "communications", action: "create" }), async (req, res): Promise<void> => {
  try {
    const parsed = zodParse(convertLogSchema.safeParse(req.body ?? {}));
    const scope = req.scope!;
    const logId = parseId(req.params.id, "id");
    const { targetType } = parsed;

    // Phase 4 contract final cleanup: read from v_message_log_all so
    // the id resolves to the same row /threads + /log return.
    const [logEntry] = await rawQuery<Record<string, unknown>>(
      `SELECT id, "companyId", channel, direction,
              "fromAddress" AS "fromNumber", "toAddress" AS "toNumber",
              subject, body, status, "relatedType", "relatedId", "createdAt"
         FROM v_message_log_all WHERE id=$1 AND "companyId"=$2`,
      [logId, scope.companyId]
    );
    if (!logEntry) { throw new NotFoundError("سجل الاتصال غير موجود"); }

    let createdId: number | null = null;
    let targetPath = "";

    const commTitle = logEntry.subject || `اتصال ${logEntry.channel} من ${logEntry.fromNumber || "مجهول"}`;
    const commDesc = logEntry.body || logEntry.subject || "";

    const prefixMap: Record<string, string> = { task: "متابعة", ticket: "دعم", request: "طلب" };
    const fullTitle = `${prefixMap[targetType]}: ${commTitle}`;
    const fullDesc = `مصدر: ${logEntry.channel} — من: ${logEntry.fromNumber || "-"}\n${commDesc}`;

    await withTransaction(async (client) => {
      if (targetType === "task") {
        const result = await client.query(
          `INSERT INTO tasks ("companyId", title, description, type, status, priority)
           VALUES ($1, $2, $3, 'follow_up', 'pending', 'medium') RETURNING id`,
          [scope.companyId, fullTitle, fullDesc]
        );
        createdId = result.rows[0].id;
        targetPath = "/tasks";
      } else if (targetType === "ticket") {
        // Numbering center (Issue #1141) — comm-linked ticket gets a real
        // support_ticket ref so the ticket page and the audit log line up.
        const issuedTk = await issueNumber({
          companyId: scope.companyId,
          branchId: scope.branchId ?? null,
          moduleKey: "support",
          entityKey: "support_ticket",
          entityTable: "support_tickets",
          actorId: scope.userId,
          metadata: { source: "communications", logId },
          expectedTiming: "on_draft",
        });
        const result = await client.query(
          `INSERT INTO support_tickets ("companyId", title, description, status, priority, ref)
           VALUES ($1, $2, $3, 'open', 'medium', $4) RETURNING id`,
          [scope.companyId, fullTitle, fullDesc, issuedTk.number]
        );
        createdId = result.rows[0].id;
        await client.query(
          `UPDATE numbering_assignments SET "entityId" = $1 WHERE id = $2`,
          [createdId, issuedTk.assignmentId]
        );
        targetPath = "/support/tickets";
      } else {
        // Numbering center (Issue #1141) — comm-linked request gets a real
        // general_request ref so it threads with the regular requests inbox.
        const issuedReq = await issueNumber({
          companyId: scope.companyId,
          branchId: scope.branchId ?? null,
          moduleKey: "requests",
          entityKey: "general_request",
          entityTable: "requests",
          actorId: scope.userId,
          metadata: { source: "communications", logId },
          expectedTiming: "on_draft",
        });
        const result = await client.query(
          `INSERT INTO requests ("companyId", title, description, status, priority, "requesterName", ref)
           VALUES ($1, $2, $3, 'pending', 'medium', $4, $5) RETURNING id`,
          [scope.companyId, fullTitle, fullDesc, logEntry.fromNumber || "من اتصال", issuedReq.number]
        );
        createdId = result.rows[0].id;
        await client.query(
          `UPDATE numbering_assignments SET "entityId" = $1 WHERE id = $2`,
          [createdId, issuedReq.assignmentId]
        );
        targetPath = "/requests";
      }
      await client.query(
        `UPDATE message_log SET "relatedType"=$1, "relatedId"=$2 WHERE id=$3 AND "companyId"=$4 AND "deletedAt" IS NULL`,
        [targetType, createdId, logId, scope.companyId]
      );

      // N11 fix: append hop to message_referrals so multi-step routing
      // history survives. hopNumber = current max + 1 so a later forward
      // doesn't overwrite this one. The whole table is optional — if the
      // 240 migration hasn't run yet, the INSERT errors and the outer
      // catch logs without breaking the conversion.
      try {
        const [{ next: nextHop } = { next: 1 }] = await client.query<{ next: number }>(
          `SELECT COALESCE(MAX("hopNumber"), 0) + 1 AS next
             FROM message_referrals
            WHERE "companyId" = $1 AND "sourceLogId" = $2`,
          [scope.companyId, logId]
        ).then(r => r.rows as Array<{ next: number }>);
        await client.query(
          `INSERT INTO message_referrals
             ("companyId", "sourceLogId", "hopNumber", "fromUserId", "targetType", "targetId", reason)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [scope.companyId, logId, nextHop, scope.userId, targetType, createdId, parsed.reason ?? null]
        );
      } catch (chainErr) {
        // Soft-fail: chain history is a visibility feature, not part of
        // the conversion contract. Log and move on.
        // eslint-disable-next-line no-console
        console.warn("[message_referrals] failed to record hop:", chainErr);
      }
    });

    const typeLabels: Record<string, string> = { task: "مهمة متابعة", ticket: "تذكرة دعم", request: "طلب داخلي" };
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: targetType, entityId: createdId!, after: { sourceLogId: logId, targetType } }).catch((e) => logger.error(e, "communications background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "communications.log.converted",
      entity: "communications_log",
      entityId: logId,
      details: JSON.stringify({ targetType, createdId }),
    }).catch((e) => logger.error(e, "communications background task failed"));
    res.json({
      success: true,
      message: `تم تحويل الاتصال إلى ${typeLabels[targetType]}`,
      createdId,
      targetType,
      targetPath,
    });
  } catch (err) { handleRouteError(err, res, "Communication convert error:"); }
});

router.delete("/log/:id", authorize({ feature: "communications", action: "delete" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    // Phase 4 contract final cleanup: soft-delete now targets
    // message_log (the unified table the frontend reads from).
    const [before] = await rawQuery<Record<string, unknown>>(
      `SELECT id, "companyId", channel, direction, subject, status, "createdAt"
         FROM message_log WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId],
    );
    const [row] = await rawQuery<Record<string, unknown>>(
      `UPDATE message_log SET "deletedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL RETURNING id`,
      [id, scope.companyId]
    );
    if (!row) { throw new NotFoundError("السجل غير موجود"); }
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "delete", entity: "message_log", entityId: id, before }).catch((e) => logger.error(e, "communications background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "communications.log.deleted",
      entity: "communications_log",
      entityId: id,
    }).catch((e) => logger.error(e, "communications background task failed"));
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
});

router.get("/stats", authorize({ feature: "communications", action: "list" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const [[comm], [wa], [sms]] = await Promise.all([
      // Phase 4 contract step 2: counts come from the unified view —
      // legacy + new rows in one COUNT, no UNION needed.
      rawQuery<Record<string, unknown>>(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE channel='whatsapp') as whatsapp, COUNT(*) FILTER (WHERE channel='sms') as sms, COUNT(*) FILTER (WHERE channel='email') as email, COUNT(*) FILTER (WHERE channel='pbx') as pbx FROM v_message_log_all WHERE "companyId"=$1 AND "deletedAt" IS NULL`, [cid]),
      // Phase 4 contract slice 5: pending counts from outbound_queue
      // (channel-filtered) — same data as before but one table query
      // resolves both with COUNT FILTER.
      rawQuery<Record<string, unknown>>(`SELECT COUNT(*) as pending FROM outbound_queue WHERE "companyId"=$1 AND channel='whatsapp' AND status='pending'`, [cid]),
      rawQuery<Record<string, unknown>>(`SELECT COUNT(*) as pending FROM outbound_queue WHERE "companyId"=$1 AND channel='sms' AND status='pending'`, [cid]),
    ]);
    res.json(maskFields(req, {
      total: Number(comm.total),
      whatsapp: Number(comm.whatsapp),
      sms: Number(comm.sms),
      email: Number(comm.email),
      pbx: Number(comm.pbx),
      pendingWhatsApp: Number(wa.pending),
      pendingSms: Number(sms.pending),
    }));
  } catch (err) { handleRouteError(err, res, "Communications stats error:"); }
});

router.get("/queue-stats", authorize({ feature: "communications", action: "list" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const { dateFrom, dateTo } = req.query as { dateFrom?: string; dateTo?: string };

    const buildDateFilter = (alias: string, params: unknown[]): string => {
      const conditions: string[] = [];
      if (dateFrom) { params.push(dateFrom); conditions.push(`${alias}."createdAt" >= $${params.length}::date`); }
      if (dateTo) { params.push(dateTo); conditions.push(`${alias}."createdAt" < ($${params.length}::date + INTERVAL '1 day')`); }
      return conditions.length ? " AND " + conditions.join(" AND ") : "";
    };

    type StatusCount = { status: string; count: string };
    type QueueRow = { id: number; recipient: string; message: string; status: string; attemptCount: number | null; errorMessage: string | null; createdAt: string; sentAt: string | null };

    // Phase 4 contract slice 5: all three queue tabs now read from
    // outbound_queue, channel-filtered. The buildDateFilter helper
    // qualifies the column with the alias (here always "oq"), so we
    // pass that and append the channel predicate after.
    const smsParams: unknown[] = [cid];
    const smsDateFilter = buildDateFilter("oq", smsParams);
    const waParams: unknown[] = [cid];
    const waDateFilter = buildDateFilter("oq", waParams);
    const emailParams: unknown[] = [cid];
    const emailDateFilter = buildDateFilter("oq", emailParams);

    const [smsStats, waStats, emailStats, pushCount, recentSms, recentWa] = await Promise.all([
      rawQuery<StatusCount>(
        `SELECT status, COUNT(*) as count FROM outbound_queue oq WHERE oq."companyId"=$1 AND oq.channel='sms'${smsDateFilter} GROUP BY status`,
        smsParams
      ),
      rawQuery<StatusCount>(
        `SELECT status, COUNT(*) as count FROM outbound_queue oq WHERE oq."companyId"=$1 AND oq.channel='whatsapp'${waDateFilter} GROUP BY status`,
        waParams
      ),
      rawQuery<StatusCount>(
        `SELECT status, COUNT(*) as count FROM outbound_queue oq WHERE oq."companyId"=$1 AND oq.channel='email'${emailDateFilter} GROUP BY status`,
        emailParams
      ),
      rawQuery<{ count: string }>(
        `SELECT COUNT(*) as count FROM push_subscriptions WHERE "companyId"=$1`,
        [cid]
      ),
      rawQuery<QueueRow>(
        `SELECT id, recipient, body AS message, status, attempts AS "attemptCount",
                "errorMessage", "createdAt", "sentAt"
           FROM outbound_queue WHERE "companyId"=$1 AND channel='sms'
          ORDER BY "createdAt" DESC LIMIT 20`,
        [cid]
      ),
      rawQuery<QueueRow>(
        `SELECT id, recipient, body AS message, status, attempts AS "attemptCount",
                "errorMessage", "createdAt", "sentAt"
           FROM outbound_queue WHERE "companyId"=$1 AND channel='whatsapp'
          ORDER BY "createdAt" DESC LIMIT 20`,
        [cid]
      ),
    ]);

    const toMap = (rows: StatusCount[]): Record<string, number> => {
      const m: Record<string, number> = {};
      for (const r of rows) m[r.status] = Number(r.count);
      return m;
    };

    res.json(maskFields(req, {
      sms: toMap(smsStats),
      whatsapp: toMap(waStats),
      email: toMap(emailStats),
      pushSubscribers: Number(pushCount[0]?.count ?? 0),
      recentSms,
      recentWhatsapp: recentWa,
    }));
  } catch (err) { handleRouteError(err, res, "Queue stats error:"); }
});

router.get("/push/vapid-key", async (_req, res): Promise<void> => {
  try {
    const key = getVapidPublicKey();
    // VAPID keys are optional infra config. When unset, browser push is simply
    // disabled — that is NOT a 502 integration failure, so return a 200 the
    // client can branch on (publicKey:null) instead of a noisy server error.
    res.json({ publicKey: key, configured: key !== null });
  } catch (err) { handleRouteError(err, res, "VAPID key error:"); }
});

router.post("/push/subscribe", authorize({ feature: "communications", action: "create" }), async (req, res): Promise<void> => {
  try {
    const parsed = zodParse(pushSubscribeSchema.safeParse(req.body ?? {}));
    const scope = req.scope!;
    const { endpoint, keys } = parsed;

    const userAgent = req.headers["user-agent"]?.substring(0, 200) ?? null;
    const { encrypted: encryptedEndpoint, success: isEncrypted } = encryptPushEndpoint(endpoint);
    const endpointHash = hashPushEndpoint(endpoint);

    await rawExecute(
      `INSERT INTO push_subscriptions ("companyId", "assignmentId", endpoint, "endpointHash", "p256dh", auth, "userAgent", "endpointEncrypted", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
       ON CONFLICT ("companyId", "endpointHash") DO UPDATE SET
         "assignmentId" = EXCLUDED."assignmentId",
         endpoint = EXCLUDED.endpoint,
         "p256dh" = EXCLUDED."p256dh",
         auth = EXCLUDED.auth,
         "endpointEncrypted" = EXCLUDED."endpointEncrypted",
         "updatedAt" = NOW()`,
      [scope.companyId, scope.activeAssignmentId ?? null, encryptedEndpoint, endpointHash, keys.p256dh, keys.auth, userAgent, isEncrypted]
    );

    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "push_subscriptions", entityId: 0 }).catch((e) => logger.error(e, "communications background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "communications.push.subscribed",
      entity: "push_subscriptions",
      entityId: 0,
    }).catch((e) => logger.error(e, "communications background task failed"));
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "Push subscribe error:"); }
});

router.delete("/push/unsubscribe", authorize({ feature: "communications", action: "delete" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const { endpoint } = zodParse(pushUnsubscribeSchema.safeParse(req.body ?? {}));

    const endpointHash = hashPushEndpoint(endpoint);
    await rawExecute(
      `DELETE FROM push_subscriptions
       WHERE "companyId" = $1 AND ("endpointHash" = $2 OR (endpoint = $3 AND "endpointHash" IS NULL))`,
      [scope.companyId, endpointHash, endpoint]
    );

    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "delete", entity: "push_subscriptions", entityId: 0 }).catch((e) => logger.error(e, "communications background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "communications.push.unsubscribed",
      entity: "push_subscriptions",
      entityId: 0,
    }).catch((e) => logger.error(e, "communications background task failed"));
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "Push unsubscribe error:"); }
});

router.post("/push/test", authorize({ feature: "communications", action: "create" }), async (req, res): Promise<void> => {
  try {
    const parsed = zodParse(z.object({}).safeParse(req.body));
    const scope = req.scope!;
    const result = await sendPushToCompany(
      scope.companyId,
      scope.activeAssignmentId ?? null,
      "اختبار الإشعارات",
      "تم تفعيل إشعارات المتصفح بنجاح! ستصلك الإشعارات حتى بدون فتح التطبيق.",
      { type: "test" }
    );
    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "communications.push.test", entity: "push_subscriptions", entityId: 0 }).catch((e) => logger.error(e, "communications background task failed"));
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "push_notifications", entityId: 0, after: { type: "test" } }).catch((e) => logger.error(e, "communications background task failed"));
    res.json({ success: true, ...result });
  } catch (err) { handleRouteError(err, res, "Push test error:"); }
});

// N11 fix: per-message referral chain history. Returns every hop a
// message was routed through, including any reason text the routing
// user provided. Gated by the same feature key as the inbox list
// because reading the chain reveals nothing not already in the inbox.
router.get("/log/:id/referral-chain", authorize({ feature: "communications", action: "list" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const logId = parseId(req.params.id, "id");
    const rows = await rawQuery(
      `SELECT r.id, r."hopNumber", r."fromUserId", u_from.email AS "fromEmail",
              e_from.name AS "fromName",
              r."toUserId", u_to.email AS "toEmail", e_to.name AS "toName",
              r."toRoleHint", r."targetType", r."targetId", r.reason, r."createdAt"
         FROM message_referrals r
         LEFT JOIN users u_from ON u_from.id = r."fromUserId"
         LEFT JOIN employees e_from ON e_from.id = u_from."employeeId" AND e_from."deletedAt" IS NULL
         LEFT JOIN users u_to ON u_to.id = r."toUserId"
         LEFT JOIN employees e_to ON e_to.id = u_to."employeeId" AND e_to."deletedAt" IS NULL
        WHERE r."companyId" = $1 AND r."sourceLogId" = $2
        ORDER BY r."hopNumber" ASC`,
      [scope.companyId, logId]
    ).catch(() => []);
    res.json({ data: rows, total: rows.length, logId });
  } catch (err) { handleRouteError(err, res, "Get referral chain error:"); }
});

/* ── Employee provisioning helpers ─────────────────────────────────
 * These power the "real" integration on the employee-create form: when
 * a mailbox / domain is connected, the form offers a domain dropdown +
 * auto-suggested local part instead of free text; when a PBX is
 * connected, it offers an extension picker instead of nothing.
 *
 * Both endpoints are tenant-scoped and read-only — the actual binding
 * happens inside the employee-create transaction (routes/employees.ts).
 */

// GET /communications/provisioning/email-domains?name=أحمد علي
// Returns the email domains the company can issue internal addresses on
// (derived from connected mailbox_accounts + active email integrations)
// plus a suggested local-part transliterated/slugified from the name.
router.get("/provisioning/email-domains", authorize({ feature: "communications", action: "list" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    // Domains from connected mailboxes (the real, authenticated inboxes).
    const mailboxRows = await rawQuery<{ emailAddress: string }>(
      `SELECT DISTINCT "emailAddress" FROM mailbox_accounts
        WHERE "companyId" = $1 AND "deletedAt" IS NULL AND "emailAddress" LIKE '%@%'`,
      [scope.companyId]
    ).catch(() => [] as { emailAddress: string }[]);

    // Domains from active email integrations (smtp/email `from` address).
    const integrationRows = await rawQuery<{ config: unknown }>(
      `SELECT config FROM integrations
        WHERE "companyId" = $1 AND type IN ('email','smtp') AND status = 'active'`,
      [scope.companyId]
    ).catch(() => [] as { config: unknown }[]);

    const domains = new Set<string>();
    for (const m of mailboxRows) {
      const at = m.emailAddress.lastIndexOf("@");
      if (at > 0) domains.add(m.emailAddress.slice(at + 1).toLowerCase());
    }
    for (const row of integrationRows) {
      const cfg = (row.config ?? {}) as { from?: string; fromEmail?: string; domain?: string };
      const from = cfg.from ?? cfg.fromEmail ?? null;
      if (from && from.includes("@")) domains.add(from.slice(from.lastIndexOf("@") + 1).toLowerCase());
      else if (cfg.domain) domains.add(cfg.domain.toLowerCase());
    }

    // Slugify the name into a candidate local part. Arabic names get a
    // best-effort transliteration; anything non-ascii falls back to the
    // employee number being appended later by the form.
    const name = String(req.query.name ?? "").trim();
    const suggestion = slugifyLocalPart(name);

    res.json({
      data: {
        domains: Array.from(domains).sort(),
        suggestedLocalPart: suggestion,
        // When no domains are connected the form keeps the free-text input.
        hasConnectedDomains: domains.size > 0,
      },
    });
  } catch (err) { handleRouteError(err, res, "Email-domains provisioning error:"); }
});

// GET /communications/provisioning/extensions
// Returns the PBX extensions available to assign to a new employee
// (unassigned + active) plus the next free extension number to mint.
router.get("/provisioning/extensions", authorize({ feature: "communications", action: "list" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const hasPbx = await rawQuery<{ id: number }>(
      `SELECT id FROM integrations WHERE "companyId" = $1 AND type = 'pbx' AND status = 'active' LIMIT 1`,
      [scope.companyId]
    ).catch(() => [] as { id: number }[]);

    const available = await rawQuery<{ id: number; extension: string; name: string }>(
      `SELECT id, extension, name FROM pbx_extensions
        WHERE "companyId" = $1 AND status = 'active' AND "employeeId" IS NULL
        ORDER BY extension ASC`,
      [scope.companyId]
    ).catch(() => [] as { id: number; extension: string; name: string }[]);

    // Suggest the next numeric extension above the current max (3-digit
    // floor of 100 to match common PBX dial plans).
    const [maxRow] = await rawQuery<{ maxExt: string | null }>(
      `SELECT MAX(extension) AS "maxExt" FROM pbx_extensions WHERE "companyId" = $1`,
      [scope.companyId]
    ).catch(() => [{ maxExt: null }]);
    const maxNum = maxRow?.maxExt && /^\d+$/.test(maxRow.maxExt) ? parseInt(maxRow.maxExt, 10) : 99;
    const nextExtension = String(Math.max(maxNum + 1, 100));

    res.json({
      data: {
        pbxConnected: hasPbx.length > 0,
        available,
        nextExtension,
      },
    });
  } catch (err) { handleRouteError(err, res, "Extensions provisioning error:"); }
});

/**
 * POST /communications/click-to-call
 *
 * Body: { target: string }  — either a PBX extension ("101") or a full
 * phone number ("+966500000000"). When a `target` is an extension we
 * resolve the bound employee to enrich the audit row.
 *
 * Two outcomes:
 *   - PBX integration is active AND exposes a click-to-call endpoint
 *     (config.clickToCallUrl) → call it (POST originate-style) and log
 *     the attempt as an outbound pbx row in message_log + pbx_calls.
 *   - No integration / no endpoint configured → return `mode: 'tel'`
 *     with the dial string so the UI falls back to a `tel:` link. The
 *     attempt is still logged so the operator sees who tried to call.
 *
 * Never throws on network errors — they're reported as `mode: 'tel'`
 * with the failure reason so the user can still place the call manually.
 */
const clickToCallSchema = z.object({
  target: z.string().trim().min(1).max(40),
  relatedType: z.string().optional(),
  relatedId: z.coerce.number().int().positive().optional(),
});

router.post("/click-to-call", authorize({ feature: "communications", action: "create" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const body = zodParse(clickToCallSchema.safeParse(req.body));

    // Find the caller's own extension (if any) so the originate call
    // can pair it with the target. The bare-extension case (3-4 digits)
    // also looks up the bound employee for the audit row.
    const [callerExt] = await rawQuery<{ extension: string }>(
      `SELECT pe.extension
         FROM pbx_extensions pe
         JOIN users u ON u."employeeId" = pe."employeeId"
        WHERE u.id = $1 AND pe."companyId" = $2 AND pe.status = 'active'
        LIMIT 1`,
      [scope.userId, scope.companyId],
    ).catch(() => []);

    let targetEmployeeId: number | null = null;
    const looksLikeExtension = /^\d{2,6}$/.test(body.target);
    if (looksLikeExtension) {
      const [bound] = await rawQuery<{ employeeId: number | null }>(
        `SELECT "employeeId" FROM pbx_extensions
          WHERE "companyId" = $1 AND extension = $2 AND status = 'active'
          LIMIT 1`,
        [scope.companyId, body.target],
      ).catch(() => []);
      targetEmployeeId = bound?.employeeId ?? null;
    }

    const [pbxIntegration] = await rawQuery<{ config: unknown }>(
      `SELECT config FROM integrations
        WHERE "companyId" = $1 AND type = 'pbx' AND status = 'active'
        ORDER BY id DESC LIMIT 1`,
      [scope.companyId],
    ).catch(() => []);
    const pbxConfig = (pbxIntegration?.config ?? {}) as {
      clickToCallUrl?: string;
      apiKey?: string;
    };

    const callId = `click-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let mode: "pbx" | "tel" = "tel";
    let detail = "no PBX integration with clickToCallUrl configured";
    let originatedHttpStatus: number | null = null;

    if (pbxConfig.clickToCallUrl) {
      try {
        const resp = await fetch(pbxConfig.clickToCallUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(pbxConfig.apiKey ? { Authorization: `Bearer ${pbxConfig.apiKey}` } : {}),
          },
          body: JSON.stringify({
            callerExtension: callerExt?.extension ?? null,
            target: body.target,
            callId,
            companyId: scope.companyId,
          }),
        });
        originatedHttpStatus = resp.status;
        if (resp.ok) {
          mode = "pbx";
          detail = "originate accepted by PBX";
        } else {
          detail = `PBX originate returned ${resp.status}`;
        }
      } catch (e) {
        detail = e instanceof Error ? `PBX originate failed: ${e.message}` : "PBX originate failed";
      }
    }

    // Always log the attempt — the operator should see who tried what
    // even when the backend gracefully fell back to a tel: link. The call
    // log + its message_log mirror are written atomically so a logged call
    // can never be missing from the unified thread view.
    const callPk = await withTransaction(async () => {
      const { insertId } = await rawExecute(
        `INSERT INTO pbx_calls
           ("companyId", "callId", "callerNumber", "calledNumber", direction, duration, status, "createdAt")
         VALUES ($1, $2, $3, $4, 'outbound', 0, $5, NOW())`,
        [scope.companyId, callId, callerExt?.extension ?? `user:${scope.userId}`, body.target, mode === "pbx" ? "initiated" : "pending"],
      );
      assertInsert(insertId, "pbx_calls");

      await rawExecute(
        `INSERT INTO message_log
           ("companyId", channel, direction, "fromAddress", "toAddress",
            body, status, folder, "relatedType", "relatedId", "createdAt")
         VALUES ($1, 'pbx', 'outbound', $2, $3, $4, 'logged', 'sent', $5, $6, NOW())`,
        [
          scope.companyId,
          callerExt?.extension ?? `user:${scope.userId}`,
          body.target,
          `click-to-call · mode=${mode} · ${detail}`,
          body.relatedType ?? (targetEmployeeId ? "employees" : null),
          body.relatedId ?? targetEmployeeId,
        ],
      );
      return insertId;
    });

    void emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "communications.call.click_to_call",
      entity: "pbx_calls", entityId: callPk,
      details: JSON.stringify({ mode, target: body.target, originatedHttpStatus }),
    }).catch((e) => logger.warn(e, "[event] click_to_call"));

    res.json({
      data: {
        mode,
        callId,
        detail,
        // `tel:` URI for the UI to open as a hyperlink when mode='tel'.
        // We don't strip non-digits — phone apps handle "+" and "*".
        telUri: `tel:${body.target.replace(/[^0-9+*#]/g, "")}`,
      },
    });
  } catch (err) { handleRouteError(err, res, "Click-to-call error:"); }
});

// Best-effort Arabic→latin local-part slug. Keeps ascii letters/digits,
// maps common Arabic letters, collapses the rest to dots. Returns "" when
// nothing usable remains (the form then falls back to the employee number).
export function slugifyLocalPart(name: string): string {
  if (!name) return "";
  const map: Record<string, string> = {
    "ا": "a", "أ": "a", "إ": "a", "آ": "a", "ب": "b", "ت": "t", "ث": "th",
    "ج": "j", "ح": "h", "خ": "kh", "د": "d", "ذ": "th", "ر": "r", "ز": "z",
    "س": "s", "ش": "sh", "ص": "s", "ض": "d", "ط": "t", "ظ": "z", "ع": "a",
    "غ": "gh", "ف": "f", "ق": "q", "ك": "k", "ل": "l", "م": "m", "ن": "n",
    "ه": "h", "و": "w", "ي": "y", "ى": "a", "ة": "h", "ء": "",
  };
  const latin = Array.from(name.toLowerCase())
    .map((ch) => (/[a-z0-9]/.test(ch) ? ch : map[ch] ?? (ch === " " ? "." : "")))
    .join("");
  return latin.replace(/\.+/g, ".").replace(/^\.|\.$/g, "");
}

export default router;
