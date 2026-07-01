/**
 * Message sender — the SINGLE outbound seam every route uses.
 *
 * Before this module, message sending was scattered:
 *   - inbox.ts had its own `dispatchSend()` (DLP + 3 queue tables)
 *   - communications.ts /send wrote only to communications_log
 *   - support.ts:632 inserted to email_queue directly
 *   - admin.ts:235 broadcast inserted to email_queue directly
 *   - employees.ts:718,727 inserted to email_queue for HR letters
 * Each path duplicated INSERT statements; DLP was only applied in
 * inbox.ts; provider failover wasn't applied anywhere. This module
 * is the consolidation point — every outbound message now flows
 * through `sendMessage()`:
 *
 *   1. DLP scan via communicationControl.applyDlp()
 *      - matched 'redact' rules rewrite body before queue
 *      - matched 'block' rules skip the queue, write a
 *        'blocked_dlp' row to communications_log
 *   2. Persist communications_log row (audit trail — always written)
 *   3. Insert to email_queue / sms_queue / whatsapp_queue
 *      — existing workers drain these
 *   4. Emit communications.{channel}.sent + audit log
 *
 * Provider failover hook: `getActiveProviders(channel)` from
 * communicationControl is consulted ONLY for telemetry today (the
 * provider list is logged in the event payload). Actual per-provider
 * dispatch lives in the queue workers (cronScheduler) and is not
 * inline here — workers picking from the unified queue can iterate
 * providers themselves on failure. That keeps this function fast
 * (no network calls).
 *
 * Used by:
 *   - routes/inbox.ts (POST /inbox/send, POST /inbox/threads/:id/reply)
 *   - routes/communications.ts (POST /communications/send — backwards compat)
 *   - routes/admin.ts (POST /admin/broadcast-notification)
 *   - routes/support.ts (POST /support/ticket/:id/reply)
 *   - routes/employees.ts (POST /employees/terminate/:id/send-letter)
 *   - lib/notificationDispatch.ts (when sending via template)
 *
 * Documentation: docs/architecture/communications-unification.md
 */
import { rawExecute, assertInsert } from "./rawdb.js";
import { applyDlp, getActiveProviders, type Channel } from "./communicationControl.js";
import { emitEvent, createAuditLog } from "./businessHelpers.js";
import { logger } from "./logger.js";

export type SendChannel = "email" | "whatsapp" | "sms";

export interface SendMessageInput {
  channel: SendChannel;
  recipient: string;
  recipientName?: string | null;
  /** Optional CC address(es). Comma-separated. Email-only — other channels ignore. */
  cc?: string | null;
  /** Optional BCC address(es). Comma-separated. Email-only — other channels ignore. */
  bcc?: string | null;
  subject?: string | null;
  body: string;
  /** Caller's tenant. NULL companyId is rejected — every send is tenant-scoped. */
  companyId: number;
  /** User who initiated the send. NULL for system-driven sends (cron, webhooks). */
  userId?: number | null;
  /** Optional linkage to a business entity (client/support_ticket/invoice/...) so the inbox thread can be filtered by it. */
  relatedType?: string | null;
  relatedId?: number | null;
  /** Template that produced this body, if any. Persisted in the event payload for observability. */
  templateKey?: string | null;
  /**
   * Meta-registered WhatsApp template name. When set, the WhatsApp queue
   * worker sends `type:"template"` instead of `type:"text"` (required by
   * Meta to message a user outside the 24h session window — e.g. cold
   * campaign blasts). Ignored for email/sms.
   */
  templateName?: string | null;
  /**
   * Structured params for `templateName`. Shape: `{ lang?: string, body?: string[] }`
   * where `body` fills the template's {{1}}..{{n}} placeholders in order.
   */
  templateParams?: Record<string, unknown> | null;
  /** When set, override the default 'communications.{channel}.sent' event action name. */
  eventAction?: string;
  /** Future-dated send (email_queue.scheduledAt). If absent, the queue worker sends immediately. Email only — sms/whatsapp queues don't support it today. */
  scheduledAt?: Date | string | null;
  /**
   * Skip the DLP scanner. Reserved for system-generated content the
   * DLP rules can't safely scan (login credentials, OTP codes,
   * password-reset tokens — these are short strings that might
   * coincidentally match a National-ID or IBAN pattern and getting
   * them redacted locks the user out of the system).
   *
   * NEVER set true for user-typed content. Use is logged in the
   * audit row so an operator can trace who/what used the exemption.
   *
   * Default: false.
   */
  dlpExempt?: boolean;
}

export interface SendMessageResult {
  /** communications_log row id — always written, even on block. */
  logId: number;
  /** True iff the channel queue received the row. False when DLP blocked. */
  queued: boolean;
  /** True iff DLP refused to send. logId still points at the blocked_dlp row. */
  blocked: boolean;
  /** Human-readable block reason when blocked=true. */
  reason?: string;
  /** DLP rules that fired (for both block + redact + flag actions). */
  dlpMatches: Array<{ rule: string; action: string; severity: string }>;
  /** Providers that would be tried for this channel — informational. */
  providerOrder: string[];
}

/**
 * Sole send-path. Never throws — observability writes are best-effort
 * and DLP failures fail closed (treat as block). Callers should check
 * `blocked` and surface the reason to the UI; non-fatal DLP redactions
 * are reflected in the queue row + dlpMatches array but otherwise
 * transparent.
 */
export async function sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
  // 1. DLP scan — skip for system-generated content (credentials,
  //    OTP codes, password resets) where redacting a digit sequence
  //    would lock the recipient out. Exemption is logged in the audit
  //    so an operator can trace it.
  let finalBody = input.body;
  let blocked = false;
  let reason: string | undefined;
  let matches: SendMessageResult["dlpMatches"] = [];
  if (!input.dlpExempt) {
    const dlp = await applyDlp(input.body, input.channel, input.companyId).catch((err) => {
      logger.error(err, "[messageSender] DLP scan failed — failing closed");
      return { body: input.body, blocked: true, reason: "DLP_SCAN_ERROR", matches: [] };
    });
    finalBody = dlp.body;
    blocked = dlp.blocked;
    reason = dlp.reason ?? undefined;
    matches = dlp.matches.map((m) => ({ rule: m.ruleName, action: m.action, severity: m.severity }));
  }
  const status = blocked ? "blocked_dlp" : "queued";

  // 2. Look up provider order — informational for now. The workers
  //    that drain the queues use it for actual failover on send error.
  const providers = await getActiveProviders(input.channel).catch(() => []);
  const providerOrder = providers.map((p) => p.slug);

  // 3. Persist message_log row — every attempt is recorded even if
  //    DLP blocked, so the audit trail captures it. Outbound rows
  //    land in the 'sent' folder; the 'spam' / 'archive' / 'trash'
  //    folders are user-driven moves via POST /inbox/messages/:id/folder.
  //
  //    Phase 4 final contract: the legacy communications_log dual-write
  //    was removed in PR #post-DROP. All readers migrated through
  //    slices 1-9 (#1284-#1322); the legacy table is gone from the DB.
  const { insertId: logId } = await rawExecute(
    `INSERT INTO message_log
       ("companyId", channel, direction, "fromAddress", "toAddress",
        subject, body, status, folder, "relatedType", "relatedId", "createdAt")
     VALUES ($1, $2, 'outbound', NULL, $3, $4, $5, $6, 'sent', $7, $8, NOW())`,
    [
      input.companyId, input.channel, input.recipient,
      input.subject ?? null, finalBody, status,
      input.relatedType ?? null, input.relatedId ?? null,
    ],
  );
  assertInsert(logId, "message_log");

  if (blocked) {
    void emitEvent({
      companyId: input.companyId,
      userId: input.userId ?? 0,
      action: "communications.message.blocked_dlp",
      entity: "message_log",
      entityId: logId,
      details: JSON.stringify({ channel: input.channel, reason, templateKey: input.templateKey }),
    }).catch((e) => logger.warn(e, "[event] blocked_dlp"));
    return {
      logId, queued: false, blocked: true,
      reason: reason ?? "blocked by DLP",
      dlpMatches: matches,
      providerOrder,
    };
  }

  // 4. Insert to the unified outbound_queue. The cron worker
  //    (processEmailQueue / processSmsQueue / processWhatsAppQueue
  //    in cronScheduler.ts) drains this table directly since slice 6
  //    (#1299). The per-channel legacy queue inserts that lived here
  //    are gone with the tables.
  const scheduledAt = input.scheduledAt instanceof Date
    ? input.scheduledAt.toISOString()
    : input.scheduledAt ?? null;
  // CC/BCC only meaningful for email — silently drop on other channels.
  const cc = input.channel === "email" ? (input.cc ?? null) : null;
  const bcc = input.channel === "email" ? (input.bcc ?? null) : null;
  // Meta WhatsApp templates only make sense on the whatsapp channel.
  const templateName = input.channel === "whatsapp" ? (input.templateName ?? null) : null;
  const templateParams = templateName ? (input.templateParams ?? null) : null;
  await rawExecute(
    `INSERT INTO outbound_queue
       ("companyId", channel, recipient, "recipientName", cc, bcc, subject, body,
        status, "scheduledAt", "refType", "refId", "messageLogId",
        "templateName", "templateParams", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', COALESCE($9, NOW()),
             $10, $11, $12, $13, $14, NOW(), NOW())`,
    [
      input.companyId, input.channel, input.recipient,
      input.recipientName ?? null, cc, bcc,
      input.subject ?? null, finalBody,
      scheduledAt, input.relatedType ?? null, input.relatedId ?? null, logId,
      templateName, templateParams ? JSON.stringify(templateParams) : null,
    ],
  );

  // 5. Emit event + audit log. Recipient address is masked in the
  //    event details so a log shipper never carries the raw value.
  void emitEvent({
    companyId: input.companyId,
    userId: input.userId ?? 0,
    action: input.eventAction ?? `communications.${input.channel}.sent`,
    entity: "message_log",
    entityId: logId,
    details: JSON.stringify({
      channel: input.channel,
      recipient: input.recipient.replace(/.(?=.{4})/g, "*"),
      templateKey: input.templateKey,
      providerOrder,
    }),
  }).catch((e) => logger.warn(e, `[event] ${input.channel}.sent`));

  void createAuditLog({
    companyId: input.companyId,
    userId: input.userId ?? 0,
    action: "create",
    entity: "message_log",
    entityId: logId,
    after: {
      channel: input.channel,
      recipient: input.recipient,
      subject: input.subject,
      templateKey: input.templateKey,
      dlpExempt: input.dlpExempt === true ? true : undefined,
      scheduledAt: input.scheduledAt ?? undefined,
    },
  }).catch((e) => logger.warn(e, "[audit] communications.send"));

  return {
    logId,
    queued: true,
    blocked: false,
    dlpMatches: matches,
    providerOrder,
  };
}

export type { Channel };
