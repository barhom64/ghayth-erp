import { rawQuery, rawExecute } from "./rawdb.js";
import { sendPushToCompany } from "./pushService.js";
import crypto from "crypto";

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
  clientId?: number;
  templateKey?: string;
  templateVars?: Record<string, string>;
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

interface UserPreference {
  category: string;
  inApp: boolean;
  email: boolean;
  sms: boolean;
  whatsapp: boolean;
  push: boolean;
  webhook: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
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

export function interpolateTemplate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, val] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), val);
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

async function getUserPreferences(companyId: number, userId: number, category: string): Promise<UserPreference | null> {
  const rows = await rawQuery<UserPreference>(
    `SELECT category, "inApp", email, sms, whatsapp, push, webhook, "quietHoursStart"::text, "quietHoursEnd"::text
     FROM notification_preferences
     WHERE "companyId" = $1 AND "userId" = $2 AND category = $3
     LIMIT 1`,
    [companyId, userId, category]
  );
  return rows[0] ?? null;
}

function applyUserPreferences(channels: EngineChannel[], prefs: UserPreference | null): EngineChannel[] {
  if (!prefs) return channels;
  return channels.filter((ch) => {
    switch (ch) {
      case "in_app": return prefs.inApp;
      case "email": return prefs.email;
      case "sms": return prefs.sms;
      case "whatsapp": return prefs.whatsapp;
      case "push": return prefs.push;
      case "webhook": return prefs.webhook;
      default: return true;
    }
  });
}

async function getTemplate(companyId: number, templateKey: string, channel: string): Promise<TemplateRow | null> {
  const rows = await rawQuery<TemplateRow>(
    `SELECT id, "templateKey", channel, "titleTemplate", "bodyTemplate"
     FROM notification_templates
     WHERE ("companyId" = $1 OR "companyId" IS NULL)
       AND "templateKey" = $2
       AND channel = $3
       AND "isActive" = true
     ORDER BY "companyId" DESC NULLS LAST
     LIMIT 1`,
    [companyId, templateKey, channel]
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

async function updateDeliveryLog(id: number, status: string, extra?: { externalId?: string; errorMessage?: string; providerResponse?: unknown }): Promise<void> {
  const timeField = status === "sent" ? `"sentAt"=NOW(),` :
                    status === "delivered" ? `"deliveredAt"=NOW(),` :
                    status === "failed" || status === "bounced" ? `"failedAt"=NOW(),` : "";
  await rawExecute(
    `UPDATE notification_delivery_log
     SET status=$2, ${timeField} "externalId"=COALESCE($3,"externalId"),
         "errorMessage"=COALESCE($4,"errorMessage"),
         "providerResponse"=COALESCE($5::jsonb,"providerResponse"),
         "attemptCount"="attemptCount"+1
     WHERE id=$1`,
    [id, status, extra?.externalId ?? null, extra?.errorMessage ?? null,
     extra?.providerResponse ? JSON.stringify(extra.providerResponse) : null]
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
    } catch {
      console.warn(`[NotifEngine] Invalid webhook URL for ${wh.name}: ${wh.url}`);
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
        await updateDeliveryLog(deliveryId, "delivered");
        await rawExecute(
          `UPDATE notification_webhooks SET "lastSuccessAt"=NOW(), "failCount"=0 WHERE id=$1`,
          [wh.id]
        );
      } else {
        const errText = await resp.text().catch(() => "");
        await updateDeliveryLog(deliveryId, "failed", { errorMessage: `HTTP ${resp.status}: ${errText.substring(0, 500)}` });
        await rawExecute(
          `UPDATE notification_webhooks SET "lastFailureAt"=NOW(), "lastError"=$2, "failCount"="failCount"+1 WHERE id=$1`,
          [wh.id, `HTTP ${resp.status}`]
        );
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await updateDeliveryLog(deliveryId, "failed", { errorMessage: errMsg });
      await rawExecute(
        `UPDATE notification_webhooks SET "lastFailureAt"=NOW(), "lastError"=$2, "failCount"="failCount"+1 WHERE id=$1`,
        [wh.id, errMsg]
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
      const prefs = await getUserPreferences(companyId, userRow.id, eventCategory.split(".")[0] ?? eventCategory);
      channels = applyUserPreferences(channels, prefs);
    }
  }

  if (channels.length === 0) {
    channels = ["in_app"];
  }

  for (const channel of channels) {
    try {
      const template = payload.templateKey
        ? await getTemplate(companyId, payload.templateKey, channel === "in_app" ? "in_app" : channel)
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
            console.warn("[NotifEngine] Push error:", err instanceof Error ? err.message : String(err));
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
        await rawExecute(
          `INSERT INTO email_queue ("companyId", "toEmail", "recipientName", subject, body, status, "createdAt", "refType", "refId")
           VALUES ($1, $2, $3, $4, $5, 'pending', NOW(), $6, $7)`,
          [companyId, payload.recipientEmail, payload.recipientName ?? "", title, body, payload.refType ?? null, payload.refId ?? null]
        );
        const dlId = await insertDeliveryLog({
          companyId, channel: "email",
          recipient: payload.recipientEmail,
          templateKey: payload.templateKey,
          subject: title, body, status: "queued",
          fallbackChainId: fallbackChainId ?? undefined,
          metadata: payload.metadata,
        });
        deliveryIds.push(dlId);

      } else if (channel === "sms" && payload.recipientPhone) {
        await rawExecute(
          `INSERT INTO sms_queue ("companyId", "recipientPhone", message, status, "createdAt")
           VALUES ($1, $2, $3, 'pending', NOW())`,
          [companyId, payload.recipientPhone, `${title}: ${body}`]
        );
        const dlId = await insertDeliveryLog({
          companyId, channel: "sms",
          recipient: payload.recipientPhone,
          templateKey: payload.templateKey,
          subject: title, body, status: "queued",
          fallbackChainId: fallbackChainId ?? undefined,
          metadata: payload.metadata,
        });
        deliveryIds.push(dlId);

      } else if (channel === "whatsapp" && (payload.recipientWhatsApp || payload.recipientPhone)) {
        const phone = payload.recipientWhatsApp ?? payload.recipientPhone ?? "";
        await rawExecute(
          `INSERT INTO whatsapp_queue ("companyId", phone, "recipientName", "clientId", "assignmentId", message, status, "createdAt")
           VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW())`,
          [companyId, phone, payload.recipientName ?? "", payload.clientId ?? null, payload.assignmentId ?? null, `${title}: ${body}`]
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
      console.warn(`[NotifEngine] Channel ${channel} error:`, errMsg);
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
    await rawExecute(
      `INSERT INTO notification_log ("companyId", channel, recipient, subject, body, status, "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [companyId, channels.join(","), payload.recipientEmail ?? payload.recipientPhone ?? `role:${payload.targetRole ?? "all"}`,
       payload.title, payload.body, "sent"]
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
      await updateDeliveryLog(delivery.id, "failed", { errorMessage: "All fallback steps exhausted" });
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
        `INSERT INTO sms_queue ("companyId", "recipientPhone", message, status, "createdAt")
         VALUES ($1, $2, $3, 'pending', NOW())`,
        [delivery.companyId, delivery.recipient, delivery.body]
      );
    } else if (nextChannel === "whatsapp" && delivery.recipient) {
      await rawExecute(
        `INSERT INTO whatsapp_queue ("companyId", phone, message, status, "createdAt")
         VALUES ($1, $2, $3, 'pending', NOW())`,
        [delivery.companyId, delivery.recipient, delivery.body]
      );
    } else if (nextChannel === "email" && delivery.recipient) {
      await rawExecute(
        `INSERT INTO email_queue ("companyId", "toEmail", subject, body, status, "createdAt")
         VALUES ($1, $2, $3, $4, 'pending', NOW())`,
        [delivery.companyId, delivery.recipient, delivery.subject ?? "", delivery.body]
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
      `UPDATE notification_delivery_log SET status='fallback_triggered' WHERE id=$1`,
      [delivery.id]
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
