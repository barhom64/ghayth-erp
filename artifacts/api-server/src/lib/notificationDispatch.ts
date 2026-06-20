// notificationDispatch — نواة الإرسال الداخلية لمسار الإشعارات (قاموس المفاهيم §3).
// الواجهة العامة الوحيدة للإشعارات هي notificationService؛ هذا الملف آليّات
// الإرسال (القنوات، ساعات الهدوء، سلاسل fallback، القوالب، الإحصاءات) التي
// يبني عليها notificationService. أُعيد تسميته من notificationEngine لإزالة
// التباس «Engine مقابل Service» — لا نِدّ لـService، بل نواته. (مادة 5: خادم.)
import { rawQuery, rawExecute } from "./rawdb.js";
import { sendPushToCompany } from "./pushService.js";
import crypto from "node:crypto";
import { logger } from "./logger.js";
import { applyDlp, type Channel as DlpChannel } from "./communicationControl.js";

/**
 * Run the message body through the DLP scanner before queuing it. The
 * result may redact sensitive substrings, block the send entirely, or
 * pass through unchanged with informational flags. Never throws — DLP
 * failures fall closed (block) for safety on unexpected errors.
 *
 * Returns { body, blocked }: caller skips the queue insert when blocked.
 */
async function dlpGate(
  body: string,
  channel: DlpChannel,
  companyId: number,
): Promise<{ body: string; blocked: boolean; reason?: string }> {
  try {
    const r = await applyDlp(body, channel, companyId);
    if (r.matches.length > 0) {
      logger.warn(
        { channel, companyId, matches: r.matches.map((m) => m.ruleName), blocked: r.blocked },
        "[NotifEngine] DLP rule fired on outbound",
      );
    }
    return { body: r.body, blocked: r.blocked, reason: r.reason ?? undefined };
  } catch (err) {
    logger.error(err, "[NotifEngine] DLP scan failed — failing closed");
    return { body, blocked: true, reason: "DLP_SCAN_ERROR" };
  }
}

export type EngineChannel = "in_app" | "email" | "sms" | "whatsapp" | "push" | "webhook";

export interface EnginePayload {
  companyId: number;
  eventCategory: string;
  title: string;
  body: string;
  priority?: "low" | "normal" | "high" | "urgent";
  assignmentId?: number;
  targetRole?: string;
  refType?: string;
  refId?: number;
  actionUrl?: string;
  channels?: EngineChannel[];
  recipientEmail?: string;
  recipientName?: string;
  recipientPhone?: string;
  recipientWhatsApp?: string;
  recipientUserId?: number;
  clientId?: number;
  templateKey?: string;
  templateVars?: Record<string, string>;
  language?: "ar" | "en";
  fallbackChainId?: number;
  metadata?: Record<string, unknown>;
}

interface RoutingRule {
  id: number;
  eventCategory: string;
  channels: EngineChannel[];
  priority: string;
  fallbackChainId: number | null;
}

interface TemplateRow {
  id: number;
  templateKey: string;
  channel: string;
  titleTemplate: string | null;
  bodyTemplate: string;
}

interface FallbackChain {
  id: number;
  name: string;
  steps: FallbackStep[];
}

interface FallbackStep {
  channel: EngineChannel;
  waitMinutes: number;
}

interface WebhookSubscription {
  id: number;
  companyId: number;
  name: string;
  url: string;
  secret: string | null;
  events: string[];
  headers: Record<string, string>;
}

interface DeliveryLogInsert {
  companyId: number;
  notificationId?: number;
  channel: string;
  recipient: string;
  templateKey?: string;
  subject?: string;
  body: string;
  status: string;
  fallbackChainId?: number;
  fallbackStep?: number;
  parentDeliveryId?: number;
  metadata?: Record<string, unknown>;
}

function escapeHtmlForTemplate(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function interpolateTemplate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, val] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), escapeHtmlForTemplate(val));
  }
  return result;
}

async function getRoutingRule(companyId: number, eventCategory: string): Promise<RoutingRule | null> {
  const baseKey = eventCategory.split(".")[0] ?? "default";
  const rows = await rawQuery<RoutingRule>(
    `SELECT id, "eventCategory", channels::text AS channels, priority, "fallbackChainId"
     FROM notification_routing_rules
     WHERE ("companyId" = $1 OR "companyId" IS NULL)
       AND "eventCategory" = $2
       AND "isActive" = true
     ORDER BY "companyId" DESC NULLS LAST
     LIMIT 1`,
    [companyId, baseKey]
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    ...row,
    channels: typeof row.channels === "string" ? JSON.parse(row.channels) : row.channels,
  };
}

/**
 * Channels a user has explicitly opted OUT of, for a given event
 * category. Reads the row-per-channel shape the preferences UI actually
 * writes (notification_preferences: channel + category + enabled, the
 * shape the UNIQUE(userId, channel, category) constraint enforces).
 *
 * A category-specific row (e.g. category='leave') overrides the global
 * 'general' master switch the UI toggles. Returns the set of disabled
 * channel names; absence of a row means "not opted out" (default on).
 *
 * Before this, the engine read the legacy boolean columns (inApp/email/…)
 * which the UI never wrote — so every user channel toggle was silently
 * ignored. This makes the preference panel actually take effect.
 */
export interface PreferenceRow {
  channel: string;
  category: string;
  enabled: boolean;
}

/**
 * Pure reducer: given the preference rows for a user and the target
 * category, return the set of channels the user has opted out of. The
 * global 'general' master switch applies first; a category-specific row
 * then overrides it, so a per-category preference always wins.
 */
export function computeDisabledChannels(rows: PreferenceRow[], category: string): Set<string> {
  const byChannel = new Map<string, boolean>();
  for (const r of rows) if (r.category === "general") byChannel.set(r.channel, r.enabled);
  for (const r of rows) if (r.category === category) byChannel.set(r.channel, r.enabled);
  const disabled = new Set<string>();
  for (const [ch, enabled] of byChannel) if (!enabled) disabled.add(ch);
  return disabled;
}

async function getDisabledChannels(companyId: number, userId: number, category: string): Promise<Set<string>> {
  const rows = await rawQuery<PreferenceRow>(
    `SELECT channel, category, enabled
       FROM notification_preferences
      WHERE "companyId" = $1 AND "userId" = $2 AND category IN ($3, 'general')`,
    [companyId, userId, category]
  );
  return computeDisabledChannels(rows, category);
}

function applyUserPreferences(channels: EngineChannel[], disabled: Set<string>): EngineChannel[] {
  if (disabled.size === 0) return channels;
  return channels.filter((ch) => !disabled.has(ch));
}

/**
 * Pure reducer: is `now` inside the user's quiet-hours window? Handles
 * windows that wrap past midnight (e.g. 22:00 → 07:00).
 *
 * Returns false when either bound is missing — quiet hours are
 * unconfigured. Returns false when the bounds are equal — no window.
 */
export function isWithinQuietHours(start: string | null, end: string | null, now: Date): boolean {
  if (!start || !end) return false;
  const parse = (s: string) => {
    const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s);
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  };
  const s = parse(start);
  const e = parse(end);
  if (s == null || e == null || s === e) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  // Same-day window (e.g. 12:00 → 14:00): inclusive of start, exclusive of end.
  if (s < e) return cur >= s && cur < e;
  // Wrap-around window (e.g. 22:00 → 07:00): midnight is inside the window.
  return cur >= s || cur < e;
}

async function getUserQuietHours(companyId: number, userId: number): Promise<{ start: string | null; end: string | null }> {
  const rows = await rawQuery<{ quietHoursStart: string | null; quietHoursEnd: string | null }>(
    `SELECT "quietHoursStart"::text, "quietHoursEnd"::text
       FROM notification_preferences
      WHERE "companyId" = $1 AND "userId" = $2
        AND channel = 'in_app' AND category = 'general'
      LIMIT 1`,
    [companyId, userId]
  );
  return { start: rows[0]?.quietHoursStart ?? null, end: rows[0]?.quietHoursEnd ?? null };
}

async function resolveLanguage(companyId: number, payload: EnginePayload): Promise<"ar" | "en"> {
  if (payload.language) return payload.language;
  if (payload.recipientUserId) {
    const rows = await rawQuery<{ preferredLocale: string }>(
      `SELECT "preferredLocale" FROM users WHERE id = $1 LIMIT 1`,
      [payload.recipientUserId],
    );
    const loc = rows[0]?.preferredLocale;
    if (loc === "ar" || loc === "en") return loc;
  }
  return "ar";
}

async function getTemplate(companyId: number, templateKey: string, channel: string, language: "ar" | "en" = "ar"): Promise<TemplateRow | null> {
  // Order by language match first (preferred wins), then company specificity.
  // Falls back to the other language if the preferred one is missing for
  // this (companyId, templateKey, channel) tuple.
  const rows = await rawQuery<TemplateRow>(
    `SELECT id, "templateKey", channel, "titleTemplate", "bodyTemplate"
     FROM notification_templates
     WHERE ("companyId" = $1 OR "companyId" IS NULL)
       AND "templateKey" = $2
       AND channel = $3
       AND "isActive" = true
     ORDER BY (language = $4) DESC, "companyId" DESC NULLS LAST
     LIMIT 1`,
    [companyId, templateKey, channel, language]
  );
  return rows[0] ?? null;
}

async function getFallbackChain(companyId: number, chainId: number): Promise<FallbackChain | null> {
  const rows = await rawQuery<{ id: number; name: string; steps: string }>(
    `SELECT id, name, steps::text
     FROM notification_fallback_chains
     WHERE id = $1 AND ("companyId" = $2 OR "companyId" IS NULL) AND "isActive" = true
     LIMIT 1`,
    [chainId, companyId]
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    id: row.id,
    name: row.name,
    steps: typeof row.steps === "string" ? JSON.parse(row.steps) : row.steps,
  };
}

async function insertDeliveryLog(entry: DeliveryLogInsert): Promise<number> {
  const rows = await rawQuery<{ id: number }>(
    `INSERT INTO notification_delivery_log
       ("companyId", "notificationId", channel, recipient, "templateKey", subject, body, status,
        "fallbackChainId", "fallbackStep", "parentDeliveryId", metadata, "queuedAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
     RETURNING id`,
    [
      entry.companyId,
      entry.notificationId ?? null,
      entry.channel,
      entry.recipient,
      entry.templateKey ?? null,
      entry.subject ?? null,
      entry.body,
      entry.status,
      entry.fallbackChainId ?? null,
      entry.fallbackStep ?? 0,
      entry.parentDeliveryId ?? null,
      entry.metadata ? JSON.stringify(entry.metadata) : null,
    ]
  );
  return rows[0]?.id ?? 0;
}

async function updateDeliveryLog(id: number, companyId: number, status: string, extra?: { externalId?: string; errorMessage?: string; providerResponse?: unknown }): Promise<void> {
  const timeField = status === "sent" ? `"sentAt"=NOW(),` :
                    status === "delivered" ? `"deliveredAt"=NOW(),` :
                    status === "failed" || status === "bounced" ? `"failedAt"=NOW(),` : "";
  await rawExecute(
    `UPDATE notification_delivery_log
     SET status=$2, ${timeField} "externalId"=COALESCE($3,"externalId"),
         "errorMessage"=COALESCE($4,"errorMessage"),
         "providerResponse"=COALESCE($5::jsonb,"providerResponse"),
         "attemptCount"="attemptCount"+1
     WHERE id=$1 AND "companyId" = $6`,
    [id, status, extra?.externalId ?? null, extra?.errorMessage ?? null,
     extra?.providerResponse ? JSON.stringify(extra.providerResponse) : null, companyId]
  );
}

async function resolveInAppRecipients(companyId: number, assignmentId?: number, targetRole?: string): Promise<number[]> {
  if (assignmentId) return [assignmentId];
  if (targetRole) {
    const rows = await rawQuery<{ id: number }>(
      `SELECT id FROM employee_assignments WHERE "companyId" = $1 AND role = $2 AND status = 'active'`,
      [companyId, targetRole]
    );
    return rows.map((r) => r.id);
  }
  const rows = await rawQuery<{ id: number }>(
    `SELECT id FROM employee_assignments WHERE "companyId" = $1 AND status = 'active' LIMIT 100`,
    [companyId]
  );
  return rows.map((r) => r.id);
}

async function dispatchWebhooks(companyId: number, eventCategory: string, payload: EnginePayload): Promise<void> {
  const webhooks = await rawQuery<WebhookSubscription>(
    `SELECT id, "companyId", name, url, secret, events::text AS events, headers::text AS headers
     FROM notification_webhooks
     WHERE "companyId" = $1 AND "isActive" = true`,
    [companyId]
  );

  for (const wh of webhooks) {
    const events: string[] = typeof wh.events === "string" ? JSON.parse(wh.events) : wh.events;
    if (!events.includes("*") && !events.includes(eventCategory)) continue;

    try {
      const parsedUrl = new URL(wh.url);
      if (!["http:", "https:"].includes(parsedUrl.protocol)) continue;
    } catch (e) {
      logger.warn(e, `[NotifEngine] Invalid webhook URL for ${wh.name}: ${wh.url}`);
      continue;
    }

    const webhookBody = JSON.stringify({
      event: eventCategory,
      timestamp: new Date().toISOString(),
      data: {
        companyId: payload.companyId,
        title: payload.title,
        body: payload.body,
        priority: payload.priority ?? "normal",
        refType: payload.refType,
        refId: payload.refId,
        metadata: payload.metadata,
      },
    });

    const headers: Record<string, string> = typeof wh.headers === "string" ? JSON.parse(wh.headers) : (wh.headers ?? {});
    headers["Content-Type"] = "application/json";

    if (wh.secret) {
      const signature = crypto.createHmac("sha256", wh.secret).update(webhookBody).digest("hex");
      headers["X-Ghayth-Signature"] = signature;
    }

    const deliveryId = await insertDeliveryLog({
      companyId,
      channel: "webhook",
      recipient: wh.url,
      body: webhookBody,
      status: "sending",
      metadata: { webhookId: wh.id, webhookName: wh.name },
    });

    try {
      const resp = await fetch(wh.url, {
        method: "POST",
        headers,
        body: webhookBody,
        signal: AbortSignal.timeout(10000),
      });

      if (resp.ok) {
        await updateDeliveryLog(deliveryId, companyId, "delivered");
        await rawExecute(
          `UPDATE notification_webhooks SET "lastSuccessAt"=NOW(), "failCount"=0 WHERE id=$1 AND "companyId" = $2`,
          [wh.id, companyId]
        );
      } else {
        const errText = await resp.text().catch(() => "");
        await updateDeliveryLog(deliveryId, companyId, "failed", { errorMessage: `HTTP ${resp.status}: ${errText.substring(0, 500)}` });
        await rawExecute(
          `UPDATE notification_webhooks SET "lastFailureAt"=NOW(), "lastError"=$2, "failCount"="failCount"+1 WHERE id=$1 AND "companyId" = $3`,
          [wh.id, `HTTP ${resp.status}`, companyId]
        );
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn(err, `[NotifEngine] Webhook ${wh.name} (${wh.url}) delivery failed: ${errMsg}`);
      await updateDeliveryLog(deliveryId, companyId, "failed", { errorMessage: errMsg });
      await rawExecute(
        `UPDATE notification_webhooks SET "lastFailureAt"=NOW(), "lastError"=$2, "failCount"="failCount"+1 WHERE id=$1 AND "companyId" = $3`,
        [wh.id, errMsg, companyId]
      );
    }
  }
}

function resolveTitle(payload: EnginePayload, template: TemplateRow | null): string {
  if (template?.titleTemplate && payload.templateVars) {
    return interpolateTemplate(template.titleTemplate, payload.templateVars);
  }
  return payload.title;
}

function resolveBody(payload: EnginePayload, template: TemplateRow | null): string {
  if (template?.bodyTemplate && payload.templateVars) {
    return interpolateTemplate(template.bodyTemplate, payload.templateVars);
  }
  return payload.body;
}

export async function dispatchNotification(payload: EnginePayload): Promise<{ deliveryIds: number[] }> {
  const { companyId, eventCategory, priority = "normal" } = payload;
  const deliveryIds: number[] = [];

  let channels: EngineChannel[];
  let fallbackChainId: number | null = payload.fallbackChainId ?? null;

  if (payload.channels && payload.channels.length > 0) {
    channels = payload.channels;
  } else {
    const rule = await getRoutingRule(companyId, eventCategory);
    if (rule) {
      channels = rule.channels;
      if (!fallbackChainId && rule.fallbackChainId) {
        fallbackChainId = rule.fallbackChainId;
      }
    } else {
      channels = ["in_app"];
    }
  }

  if (payload.assignmentId) {
    const [userRow] = await rawQuery<{ id: number }>(
      `SELECT u.id FROM users u JOIN employee_assignments ea ON ea."employeeId" = u."employeeId" WHERE ea.id = $1 LIMIT 1`,
      [payload.assignmentId]
    );
    if (userRow) {
      const disabled = await getDisabledChannels(companyId, userRow.id, eventCategory.split(".")[0] ?? eventCategory);
      channels = applyUserPreferences(channels, disabled);

      // Quiet-hours suppression: inside the user's window, drop every
      // external channel (email/sms/whatsapp/push) so they don't get
      // pinged at 2am. in_app + webhook still fire so the record lands
      // and the user sees it when they look in the morning. `urgent`
      // priority bypasses the window — actual emergencies (sla breach,
      // security incident) cut through.
      if (priority !== "urgent") {
        const { start, end } = await getUserQuietHours(companyId, userRow.id);
        if (isWithinQuietHours(start, end, new Date())) {
          channels = channels.filter((ch) => ch === "in_app" || ch === "webhook");
        }
      }
    }
  }

  if (channels.length === 0) {
    channels = ["in_app"];
  }

  const language = await resolveLanguage(companyId, payload);

  for (const channel of channels) {
    try {
      const template = payload.templateKey
        ? await getTemplate(companyId, payload.templateKey, channel === "in_app" ? "in_app" : channel, language)
        : null;

      const title = resolveTitle(payload, template);
      const body = resolveBody(payload, template);

      if (channel === "in_app") {
        const recipients = await resolveInAppRecipients(companyId, payload.assignmentId, payload.targetRole);
        for (const aid of recipients) {
          await rawExecute(
            `INSERT INTO notifications ("companyId", "assignmentId", type, title, body, priority, "targetRole", "actionUrl", "refType", "refId", "isRead", "createdAt")
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false, NOW())`,
            [companyId, aid, eventCategory, title, body, priority, payload.targetRole ?? null, payload.actionUrl ?? null, payload.refType ?? null, payload.refId ?? null]
          );
        }
        const dlId = await insertDeliveryLog({
          companyId, channel: "in_app",
          recipient: `assignments:${recipients.join(",")}`,
          templateKey: payload.templateKey,
          subject: title, body, status: "delivered",
          metadata: payload.metadata,
        });
        deliveryIds.push(dlId);

      } else if (channel === "push") {
        if (priority === "high" || priority === "urgent") {
          const pushAssignmentId = payload.assignmentId ?? null;
          sendPushToCompany(companyId, pushAssignmentId, title, body, {
            actionUrl: payload.actionUrl,
            refType: payload.refType,
            refId: payload.refId,
          }).catch((err: unknown) => {
            logger.warn(`[NotifEngine] Push error: ${err instanceof Error ? err.message : String(err)}`);
          });
          const dlId = await insertDeliveryLog({
            companyId, channel: "push",
            recipient: pushAssignmentId ? `assignment:${pushAssignmentId}` : `company:${companyId}`,
            templateKey: payload.templateKey,
            subject: title, body, status: "sent",
            metadata: payload.metadata,
          });
          deliveryIds.push(dlId);
        }

      } else if (channel === "email" && payload.recipientEmail) {
        const dlp = await dlpGate(body, "email", companyId);
        if (dlp.blocked) {
          logger.warn({ companyId, channel: "email", reason: dlp.reason }, "[NotifEngine] email blocked by DLP");
          const dlId = await insertDeliveryLog({
            companyId, channel: "email",
            recipient: payload.recipientEmail,
            templateKey: payload.templateKey,
            subject: title, body, status: "blocked_dlp",
            fallbackChainId: fallbackChainId ?? undefined,
            metadata: { ...(payload.metadata ?? {}), dlpReason: dlp.reason },
          });
          deliveryIds.push(dlId);
        } else {
          await rawExecute(
            `INSERT INTO outbound_queue
               ("companyId", channel, recipient, "recipientName", subject, body,
                status, "refType", "refId", "createdAt", "updatedAt")
             VALUES ($1, 'email', $2, $3, $4, $5, 'pending', $6, $7, NOW(), NOW())`,
            [companyId, payload.recipientEmail, payload.recipientName ?? null, title, dlp.body, payload.refType ?? null, payload.refId ?? null]
          );
          const dlId = await insertDeliveryLog({
            companyId, channel: "email",
            recipient: payload.recipientEmail,
            templateKey: payload.templateKey,
            subject: title, body: dlp.body, status: "queued",
            fallbackChainId: fallbackChainId ?? undefined,
            metadata: payload.metadata,
          });
          deliveryIds.push(dlId);
        }

      } else if (channel === "sms" && payload.recipientPhone) {
        const dlp = await dlpGate(body, "sms", companyId);
        if (dlp.blocked) {
          logger.warn({ companyId, channel: "sms", reason: dlp.reason }, "[NotifEngine] sms blocked by DLP");
          const dlId = await insertDeliveryLog({
            companyId, channel: "sms",
            recipient: payload.recipientPhone,
            templateKey: payload.templateKey,
            subject: title, body, status: "blocked_dlp",
            fallbackChainId: fallbackChainId ?? undefined,
            metadata: { ...(payload.metadata ?? {}), dlpReason: dlp.reason },
          });
          deliveryIds.push(dlId);
        } else {
          await rawExecute(
            `INSERT INTO outbound_queue
               ("companyId", channel, recipient, body, status, "createdAt", "updatedAt")
             VALUES ($1, 'sms', $2, $3, 'pending', NOW(), NOW())`,
            [companyId, payload.recipientPhone, `${title}: ${dlp.body}`]
          );
          const dlId = await insertDeliveryLog({
            companyId, channel: "sms",
            recipient: payload.recipientPhone,
            templateKey: payload.templateKey,
            subject: title, body: dlp.body, status: "queued",
            fallbackChainId: fallbackChainId ?? undefined,
            metadata: payload.metadata,
          });
          deliveryIds.push(dlId);
        }

      } else if (channel === "whatsapp" && (payload.recipientWhatsApp || payload.recipientPhone)) {
        const phone = payload.recipientWhatsApp ?? payload.recipientPhone ?? "";
        const dlp = await dlpGate(body, "whatsapp", companyId);
        if (dlp.blocked) {
          logger.warn({ companyId, channel: "whatsapp", reason: dlp.reason }, "[NotifEngine] whatsapp blocked by DLP");
          const dlId = await insertDeliveryLog({
            companyId, channel: "whatsapp",
            recipient: phone,
            templateKey: payload.templateKey,
            subject: title, body, status: "blocked_dlp",
            fallbackChainId: fallbackChainId ?? undefined,
            metadata: { ...(payload.metadata ?? {}), dlpReason: dlp.reason },
          });
          deliveryIds.push(dlId);
          continue;
        }
        await rawExecute(
          `INSERT INTO outbound_queue
             ("companyId", channel, recipient, "recipientName", body, status, "createdAt", "updatedAt")
           VALUES ($1, 'whatsapp', $2, $3, $4, 'pending', NOW(), NOW())`,
          [companyId, phone, payload.recipientName ?? null, `${title}: ${dlp.body}`]
        );
        const dlId = await insertDeliveryLog({
          companyId, channel: "whatsapp",
          recipient: phone,
          templateKey: payload.templateKey,
          subject: title, body, status: "queued",
          fallbackChainId: fallbackChainId ?? undefined,
          metadata: payload.metadata,
        });
        deliveryIds.push(dlId);

      } else if (channel === "webhook") {
        await dispatchWebhooks(companyId, eventCategory, payload);
      }

    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn(`[NotifEngine] Channel ${channel} error: ${errMsg}`);
      const dlId = await insertDeliveryLog({
        companyId, channel,
        recipient: "error",
        body: payload.body,
        status: "failed",
        metadata: { error: errMsg },
      });
      deliveryIds.push(dlId);
    }
  }

  try {
    // Phase 4 final contract: write only to message_log. The
    // notification_log table is dropped post-soak. channels is a
    // multi-channel array; pick the first message-shaped channel
    // for the unified row.
    const firstChannel = channels.find((c) =>
      ['email','sms','whatsapp','push','in_app','internal','pbx'].includes(c)
    ) ?? 'in_app';
    await rawExecute(
      `INSERT INTO message_log
         ("companyId", channel, direction, "toAddress", subject, body,
          status, folder, "createdAt")
       VALUES ($1, $2, 'outbound', $3, $4, $5, 'sent', 'sent', NOW())`,
      [companyId, firstChannel,
       payload.recipientEmail ?? payload.recipientPhone ?? `role:${payload.targetRole ?? "all"}`,
       payload.title, payload.body]
    );
  } catch (_: unknown) { /* non-critical */ }

  return { deliveryIds };
}

export async function processFallbackChains(): Promise<string> {
  const failedDeliveries = await rawQuery<{
    id: number; companyId: number; channel: string; recipient: string;
    body: string; subject: string | null; templateKey: string | null;
    fallbackChainId: number; fallbackStep: number; metadata: string | null;
    failedAt: string;
  }>(
    `SELECT id, "companyId", channel, recipient, body, subject, "templateKey",
            "fallbackChainId", "fallbackStep", metadata::text, "failedAt"
     FROM notification_delivery_log
     WHERE status = 'failed'
       AND "fallbackChainId" IS NOT NULL
       AND "failedAt" IS NOT NULL
       AND "attemptCount" < 5
     ORDER BY "failedAt" ASC
     LIMIT 50`
  );

  if (failedDeliveries.length === 0) return "No fallback chains to process";

  let processed = 0;
  let triggered = 0;

  for (const delivery of failedDeliveries) {
    processed++;
    const chain = await getFallbackChain(delivery.companyId, delivery.fallbackChainId);
    if (!chain) continue;

    const nextStepIndex = delivery.fallbackStep + 1;
    if (nextStepIndex >= chain.steps.length) {
      await updateDeliveryLog(delivery.id, delivery.companyId, "failed", { errorMessage: "All fallback steps exhausted" });
      continue;
    }

    const nextStep = chain.steps[nextStepIndex];
    if (!nextStep) continue;

    const waitMinutes = nextStep.waitMinutes ?? 2;
    const failedAt = new Date(delivery.failedAt);
    const waitUntil = new Date(failedAt.getTime() + waitMinutes * 60 * 1000);
    if (new Date() < waitUntil) continue;

    const nextChannel = nextStep.channel;
    const meta: Record<string, unknown> = delivery.metadata ? JSON.parse(delivery.metadata) : {};

    if (nextChannel === "sms" && delivery.recipient) {
      await rawExecute(
        `INSERT INTO outbound_queue
           ("companyId", channel, recipient, body, status, "createdAt", "updatedAt")
         VALUES ($1, 'sms', $2, $3, 'pending', NOW(), NOW())`,
        [delivery.companyId, delivery.recipient, delivery.body]
      );
    } else if (nextChannel === "whatsapp" && delivery.recipient) {
      await rawExecute(
        `INSERT INTO outbound_queue
           ("companyId", channel, recipient, body, status, "createdAt", "updatedAt")
         VALUES ($1, 'whatsapp', $2, $3, 'pending', NOW(), NOW())`,
        [delivery.companyId, delivery.recipient, delivery.body]
      );
    } else if (nextChannel === "email" && delivery.recipient) {
      await rawExecute(
        `INSERT INTO outbound_queue
           ("companyId", channel, recipient, subject, body, status, "createdAt", "updatedAt")
         VALUES ($1, 'email', $2, $3, $4, 'pending', NOW(), NOW())`,
        [delivery.companyId, delivery.recipient, delivery.subject ?? null, delivery.body]
      );
    }

    await insertDeliveryLog({
      companyId: delivery.companyId,
      channel: nextChannel,
      recipient: delivery.recipient,
      templateKey: delivery.templateKey ?? undefined,
      subject: delivery.subject ?? undefined,
      body: delivery.body,
      status: "queued",
      fallbackChainId: delivery.fallbackChainId,
      fallbackStep: nextStepIndex,
      parentDeliveryId: delivery.id,
      metadata: { ...meta, fallbackFrom: delivery.channel },
    });

    await rawExecute(
      `UPDATE notification_delivery_log SET status='fallback_triggered' WHERE id=$1 AND "companyId" = $2`,
      [delivery.id, delivery.companyId]
    );

    triggered++;
  }

  return `Fallback chains: ${processed} checked, ${triggered} triggered`;
}

export async function getDeliveryStats(companyId: number, days: number = 30): Promise<{
  byChannel: Array<{ channel: string; total: number; delivered: number; failed: number; pending: number }>;
  byDay: Array<{ day: string; total: number; delivered: number; failed: number }>;
  deliveryRate: number;
  totalSent: number;
}> {
  const byChannel = await rawQuery<{ channel: string; total: number; delivered: number; failed: number; pending: number }>(
    `SELECT channel,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status IN ('sent','delivered'))::int AS delivered,
            COUNT(*) FILTER (WHERE status IN ('failed','bounced','rejected'))::int AS failed,
            COUNT(*) FILTER (WHERE status IN ('queued','sending'))::int AS pending
     FROM notification_delivery_log
     WHERE "companyId" = $1 AND "createdAt" > NOW() - INTERVAL '1 day' * $2
     GROUP BY channel
     ORDER BY total DESC`,
    [companyId, days]
  );

  const byDay = await rawQuery<{ day: string; total: number; delivered: number; failed: number }>(
    `SELECT DATE("createdAt")::text AS day,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status IN ('sent','delivered'))::int AS delivered,
            COUNT(*) FILTER (WHERE status IN ('failed','bounced','rejected'))::int AS failed
     FROM notification_delivery_log
     WHERE "companyId" = $1 AND "createdAt" > NOW() - INTERVAL '1 day' * $2
     GROUP BY DATE("createdAt")
     ORDER BY day DESC`,
    [companyId, days]
  );

  const totals = byChannel.reduce(
    (acc, r) => ({ total: acc.total + r.total, delivered: acc.delivered + r.delivered }),
    { total: 0, delivered: 0 }
  );
  const deliveryRate = totals.total > 0 ? Math.round((totals.delivered / totals.total) * 100) : 0;

  return { byChannel, byDay, deliveryRate, totalSent: totals.total };
}
