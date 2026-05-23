import { rawQuery, rawExecute } from "./rawdb.js";
import { logger } from "./logger.js";
import dns from "node:dns/promises";

// RD5-01 — outbound-webhook SSRF guard. Admins configure a webhook URL
// via POST /admin/integrations, and the URL is then fetched server-side
// when notifications fire. Without validation, that URL can be set to
// http://169.254.169.254/latest/meta-data/ (EC2/GCP metadata service),
// http://127.0.0.1:9200/ (internal Elasticsearch), or any other RFC1918
// address inside the deployment VPC, turning the API server into a
// confused deputy. The gov-integrations route already has this guard
// (gov-integrations.ts:40, 289-301) — we mirror it for the generic
// webhook path. Returns null on success, or an error message on reject.
function isPrivateIP(ip: string): boolean {
  if (ip === "127.0.0.1" || ip === "::1" || ip === "0.0.0.0" || ip === "::") return true;
  const parts = ip.split(".").map(Number);
  if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
    if (parts[0] === 10) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 0 || parts[0] === 127) return true;
  }
  if (ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80")) return true;
  return false;
}
async function validateOutboundWebhookUrl(rawUrl: string): Promise<string | null> {
  let parsed: URL;
  try { parsed = new URL(rawUrl); } catch { return "Webhook URL is not a valid URL"; }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return "Webhook URL must use http(s)";
  }
  // Literal-IP / hostname pre-filter so a private address never reaches DNS.
  const host = parsed.hostname;
  if (/^(localhost|127\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|0\.|169\.254\.)/.test(host)
      || host === "::1" || host.startsWith("[")) {
    return "Webhook URL points to a private/loopback host";
  }
  // DNS lookup — reject if ANY resolved address is private. Catches
  // attacker-controlled DNS that returns 169.254.169.254 from a public
  // hostname (DNS rebinding shape).
  try {
    const [v4, v6] = await Promise.all([
      dns.resolve4(host).catch(() => []),
      dns.resolve6(host).catch(() => []),
    ]);
    const all = [...v4, ...v6];
    if (all.length === 0) return "Webhook host did not resolve";
    if (all.some(isPrivateIP)) return "Webhook host resolves to a private network";
  } catch { return "Webhook host did not resolve"; }
  return null;
}

export interface SendOptions {
  companyId: number;
  channel: "email" | "sms" | "whatsapp" | "webhook";
  recipient: string;
  subject?: string;
  body: string;
  metadata?: Record<string, any>;
}

interface Integration {
  id: number;
  companyId: number;
  type: string;
  name: string;
  config: Record<string, any>;
  status: string;
  maxRetries: number;
}

async function getActiveIntegration(companyId: number, channel: string): Promise<Integration | null> {
  const [row] = await rawQuery<Integration>(
    `SELECT * FROM integrations WHERE "companyId"=$1 AND type=$2 AND status='active' LIMIT 1`,
    [companyId, channel]
  );
  if (!row) return null;
  // RD3-04 — config rows now store sensitive fields (password, apiKey,
  // accessToken, …) under `enc-v1:…` envelopes. Decrypt them before
  // handing the object to nodemailer / fetch so legacy plaintext rows
  // (returned unchanged by decryptSecret) keep working.
  const { decryptSecret } = await import("./secrets.js");
  const SECRET_KEYS = new Set([
    "password", "apiKey", "accessToken", "secret", "authToken",
    "token", "webhookSecret", "appSecret", "clientSecret", "privateKey",
    "smtpPassword", "smsAuthToken", "key",
  ]);
  const raw = (row as unknown as { config: Record<string, unknown> | string }).config;
  const parsed = typeof raw === "string" ? JSON.parse(raw) : (raw ?? {});
  const decrypted: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed)) {
    decrypted[k] = SECRET_KEYS.has(k) && typeof v === "string" ? decryptSecret(v) : v;
  }
  (row as unknown as { config: Record<string, unknown> }).config = decrypted;
  return row;
}

async function logIntegrationAttempt(
  integrationId: number | null,
  companyId: number,
  channel: string,
  recipient: string,
  subject: string | undefined,
  body: string,
  status: "pending" | "sent" | "delivered" | "failed" | "retrying",
  errorMessage?: string,
  retryAttempt?: number,
  metadata?: Record<string, any>
): Promise<number> {
  const { insertId } = await rawExecute(
    `INSERT INTO integration_logs ("integrationId","companyId",channel,recipient,subject,body,status,"errorMessage","retryAttempt",metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      integrationId, companyId, channel, recipient,
      subject || null, body, status, errorMessage || null,
      retryAttempt || 0, metadata ? JSON.stringify(metadata) : null,
    ]
  );
  return insertId;
}

async function sendEmail(config: Record<string, any>, recipient: string, subject: string, body: string): Promise<{ success: boolean; error?: string }> {
  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.default.createTransport({
      host: config.host || "smtp.gmail.com",
      port: config.port || 587,
      secure: config.secure || false,
      auth: {
        user: config.user || config.email,
        pass: config.password || config.pass,
      },
    });

    await transporter.sendMail({
      from: config.from || config.user || config.email,
      to: recipient,
      subject,
      html: body,
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || String(err) };
  }
}

async function sendWebhook(config: Record<string, any>, body: string, metadata?: Record<string, any>): Promise<{ success: boolean; error?: string }> {
  try {
    const url = config.url;
    if (!url) return { success: false, error: "Webhook URL not configured" };

    // RD5-01 — reject the request if the URL targets the metadata
    // service, loopback, or any RFC1918 host. This catches both naive
    // misconfiguration AND DNS-rebinding shapes (public hostname →
    // private A record).
    const ssrfError = await validateOutboundWebhookUrl(url);
    if (ssrfError) {
      logger.warn({ url, error: ssrfError }, "[integrationService] webhook SSRF guard rejected URL");
      return { success: false, error: ssrfError };
    }

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.headers || {}),
      },
      body: JSON.stringify({ message: body, ...(metadata || {}) }),
      // RD5-01 — also disable redirects so a 302 to an internal host
      // can't sneak past the URL validator.
      redirect: "manual",
    });

    if (!resp.ok) {
      return { success: false, error: `HTTP ${resp.status}: ${await resp.text()}` };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || String(err) };
  }
}

export async function sendViaIntegration(options: SendOptions): Promise<{ success: boolean; logId: number; error?: string }> {
  const { companyId, channel, recipient, subject, body, metadata } = options;

  const integration = await getActiveIntegration(companyId, channel);

  if (!integration) {
    const logId = await logIntegrationAttempt(
      null, companyId, channel, recipient, subject, body,
      "pending", "No active integration configured for this channel"
    );
    logger.info({ channel, companyId, logId }, "No active integration for company — logged as pending");
    return { success: false, logId, error: "No active integration" };
  }

  let result: { success: boolean; error?: string };

  switch (channel) {
    case "email":
      result = await sendEmail(integration.config, recipient, subject || "", body);
      break;
    case "webhook":
      result = await sendWebhook(integration.config, body, metadata);
      break;
    case "sms":
      logger.info({ recipient, body }, "Integration SMS stub — not yet implemented");
      result = { success: false, error: "SMS integration not yet implemented" };
      break;
    case "whatsapp":
      logger.info({ recipient, body }, "Integration WhatsApp stub — not yet implemented");
      result = { success: false, error: "WhatsApp integration not yet implemented" };
      break;
    default:
      result = { success: false, error: `Unknown channel: ${channel}` };
  }

  const status = result.success ? "sent" : "failed";
  const logId = await logIntegrationAttempt(
    integration.id, companyId, channel, recipient, subject, body,
    status, result.error, 0, metadata
  );

  if (result.success) {
    await rawExecute(
      `UPDATE integrations SET "lastSuccessAt"=NOW(), "retryCount"=0 WHERE id=$1 AND "companyId"=$2`,
      [integration.id, companyId]
    );
  } else {
    await rawExecute(
      `UPDATE integrations SET "lastFailureAt"=NOW(), "lastError"=$2, "retryCount"="retryCount"+1 WHERE id=$1 AND "companyId"=$3`,
      [integration.id, result.error, companyId]
    );
  }

  return { success: result.success, logId, error: result.error };
}

export async function retryFailedMessages(companyId?: number): Promise<{ retried: number; succeeded: number }> {
  const conditions = [`il.status IN ('failed','pending')`, `il."retryAttempt" < COALESCE(i."maxRetries", 3)`];
  const params: unknown[] = [];
  if (companyId) {
    params.push(companyId);
    conditions.push(`il."companyId"=$${params.length}`);
  }

  const failedLogs = await rawQuery<Record<string, unknown>>(
    `SELECT il.*, i.config, i.type FROM integration_logs il
     LEFT JOIN integrations i ON i.id = il."integrationId"
     WHERE ${conditions.join(" AND ")}
     ORDER BY il."createdAt" ASC LIMIT 50`,
    params
  );

  let retried = 0, succeeded = 0;

  for (const log of failedLogs) {
    retried++;
    const result = await sendViaIntegration({
      companyId: log.companyId as number,
      channel: log.channel as "email" | "webhook" | "sms" | "whatsapp",
      recipient: log.recipient as string,
      subject: log.subject as string | undefined,
      body: log.body as string,
      metadata: log.metadata as Record<string, any> | undefined,
    });

    if (result.success) succeeded++;

    await rawExecute(
      `UPDATE integration_logs SET "retryAttempt"="retryAttempt"+1, status=$2 WHERE id=$1 AND "companyId"=$3`,
      [log.id, result.success ? "sent" : "retrying", log.companyId]
    );
  }

  return { retried, succeeded };
}

export const integrationService = {
  send: sendViaIntegration,
  retryFailed: retryFailedMessages,
};
