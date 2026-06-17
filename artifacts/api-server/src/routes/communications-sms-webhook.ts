/**
 * Public SMS inbound webhook (Twilio).
 *
 * Mounted BEFORE authMiddleware (like the CMSV6 telematics webhook) because
 * Twilio calls it with NO ERP session — security is the X-Twilio-Signature
 * HMAC check (fail closed), not a JWT. A verified inbound SMS is landed in
 * message_log (direction='inbound') so the Conversation BEFORE-INSERT
 * trigger surfaces it in /inbox, exactly like the other inbound channels.
 *
 * Operator setup: in the Twilio console, set the number's "A MESSAGE COMES
 * IN" webhook (HTTP POST) to {PUBLIC_BASE_URL}/api/communications/sms/webhook.
 *
 * Tenant + token resolution (resolveInboundSms):
 *   1. per-company system_settings keyed by the inbound AccountSid (uses
 *      that company's sms_auth_token), OR
 *   2. the platform-wide vendor_secrets 'sms' card (token), with the tenant
 *      resolved from the receiving To number.
 */
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "../lib/config.js";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { logger } from "../lib/logger.js";
import { getVendorConfig } from "../lib/vendorSettings.js";
import { emitEvent, createAuditLog } from "../lib/businessHelpers.js";

const router = Router();

// Per-IP flood guard — a forged request is rejected fast by the signature
// check, but the cap stops a flood from hammering the resolver queries.
const smsWebhookLimiter = rateLimit({
  windowMs: 60_000,
  max: 240,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Twilio canonical signed string: the full request URL followed by every
 * POST param concatenated as key+value, in alphabetical key order.
 * https://www.twilio.com/docs/usage/security#validating-requests
 */
export function computeTwilioSignature(url: string, params: Record<string, unknown>, authToken: string): string {
  let data = url;
  for (const key of Object.keys(params).sort()) data += key + String(params[key] ?? "");
  return createHmac("sha1", authToken).update(Buffer.from(data, "utf8")).digest("base64");
}

/** Constant-time verification of the X-Twilio-Signature header. */
export function verifyTwilioSignature(url: string, params: Record<string, unknown>, provided: string, authToken: string): boolean {
  if (!authToken || !provided) return false;
  const expected = computeTwilioSignature(url, params, authToken);
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(provided);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Resolve the receiving tenant + that account's Auth Token from an inbound
 * Twilio payload. Per-company system_settings creds win (keyed by the
 * inbound AccountSid); otherwise the platform-wide vendor_secrets 'sms'
 * card supplies the token and the tenant is resolved from the To number.
 * Returns null when neither path maps — the caller then drops the webhook.
 */
async function resolveInboundSms(accountSid: string, toNumber: string): Promise<{ companyId: number; authToken: string } | null> {
  if (accountSid) {
    const [byAccount] = await rawQuery<{ companyId: number }>(
      `SELECT "companyId" FROM system_settings WHERE key = 'sms_account_sid' AND value = $1 AND "companyId" IS NOT NULL LIMIT 1`,
      [accountSid],
    );
    if (byAccount?.companyId) {
      const [tok] = await rawQuery<{ value: string }>(
        `SELECT value FROM system_settings WHERE key = 'sms_auth_token' AND "companyId" = $1 LIMIT 1`,
        [byAccount.companyId],
      );
      if (tok?.value) return { companyId: byAccount.companyId, authToken: tok.value };
    }
  }
  const vendor = await getVendorConfig("sms").catch(() => null);
  const vAccount = vendor?.active ? String(vendor.config.accountSid ?? "") : "";
  const vToken = vendor?.active ? String(vendor.config.authToken ?? "") : "";
  if (vAccount && vAccount === accountSid && vToken) {
    const norm = toNumber.replace(/\D/g, "").slice(-9);
    if (norm) {
      const [byTo] = await rawQuery<{ companyId: number }>(
        `SELECT "companyId" FROM system_settings WHERE key = 'sms_from_number' AND "companyId" IS NOT NULL AND REPLACE(REPLACE(value, '+', ''), '-', '') LIKE $1 LIMIT 1`,
        [`%${norm}`],
      );
      if (byTo?.companyId) return { companyId: byTo.companyId, authToken: vToken };
      const [byCompany] = await rawQuery<{ id: number }>(
        `SELECT id FROM companies WHERE REPLACE(REPLACE(COALESCE(phone, ''), '+', ''), '-', '') LIKE $1 LIMIT 1`,
        [`%${norm}`],
      );
      if (byCompany?.id) return { companyId: byCompany.id, authToken: vToken };
    }
  }
  return null;
}

/** Best-effort link of the sender phone to a client/employee in the tenant. */
async function matchSmsSender(phone: string, companyId: number): Promise<{ type: "client" | "employee" | null; id: number | null; name: string }> {
  const norm = phone.replace(/\D/g, "").slice(-9);
  if (norm) {
    const [client] = await rawQuery<{ id: number; name: string }>(
      `SELECT id, name FROM clients WHERE "companyId" = $1 AND REPLACE(REPLACE(phone, '+', ''), '-', '') LIKE $2 AND "deletedAt" IS NULL LIMIT 1`,
      [companyId, `%${norm}`],
    );
    if (client) return { type: "client", id: client.id, name: client.name };
    const [emp] = await rawQuery<{ id: number; name: string }>(
      `SELECT e.id, e.name FROM employees e
         JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea."companyId" = $1 AND ea.status = 'active'
        WHERE e."deletedAt" IS NULL AND REPLACE(REPLACE(e.phone, '+', ''), '-', '') LIKE $2 LIMIT 1`,
      [companyId, `%${norm}`],
    );
    if (emp) return { type: "employee", id: emp.id, name: emp.name };
  }
  return { type: null, id: null, name: phone };
}

router.post("/sms/webhook", smsWebhookLimiter, async (req, res): Promise<void> => {
  try {
    const body = (req.body ?? {}) as Record<string, string>;
    const accountSid = String(body.AccountSid ?? "");
    const from = String(body.From ?? "");
    const to = String(body.To ?? "");
    const text = String(body.Body ?? "");

    const resolved = await resolveInboundSms(accountSid, to);
    if (!resolved) {
      logger.warn(`[SMS] inbound dropped — could not resolve tenant/token for AccountSid=${accountSid || "?"} To=${to || "?"}`);
      res.status(403).json({ error: "unmapped_or_unconfigured" });
      return;
    }

    const url = `${config.publicBaseUrl}${req.originalUrl}`;
    if (!verifyTwilioSignature(url, body, req.get("x-twilio-signature") ?? "", resolved.authToken)) {
      logger.warn("[SMS] dropping inbound webhook with bad/missing X-Twilio-Signature");
      res.status(403).json({ error: "invalid_signature" });
      return;
    }

    const { companyId } = resolved;
    const sender = await matchSmsSender(from, companyId);

    // Land inbound in message_log BEFORE acking Twilio (durability). The
    // Conversation BEFORE-INSERT trigger then surfaces it in /inbox.
    await rawExecute(
      `INSERT INTO message_log
         ("companyId", channel, direction, "fromAddress", "toAddress",
          subject, body, status, folder, "relatedType", "relatedId", "createdAt")
       VALUES ($1, 'sms', 'inbound', $2, $3, $4, $5, 'received', 'inbox', $6, $7, NOW())`,
      [companyId, from, to, `SMS from ${sender.name}`, text, sender.type, sender.id],
    );

    // Empty TwiML = accept, no auto-reply.
    res.status(200).type("text/xml").send("<Response></Response>");

    void emitEvent({ companyId, userId: 0, action: "communication.sms.received", entity: "message_log", entityId: 0, details: JSON.stringify({ from, senderName: sender.name, senderType: sender.type }) }).catch((e) => logger.error(e, "[SMS] inbound event"));
    void createAuditLog({ companyId, userId: 0, action: "create", entity: "message_log", entityId: 0, after: { channel: "sms", direction: "inbound", from, senderName: sender.name, senderType: sender.type } }).catch((e) => logger.error(e, "[SMS] inbound audit"));
  } catch (err) {
    logger.error(err, "[SMS] Webhook error:");
    if (!res.headersSent) res.status(200).type("text/xml").send("<Response></Response>");
  }
});

export default router;
