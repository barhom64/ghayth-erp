import { rawQuery, rawExecute } from "./rawdb.js";

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
  return row || null;
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

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.headers || {}),
      },
      body: JSON.stringify({ message: body, ...(metadata || {}) }),
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
    console.log(`[Integration] No active ${channel} integration for company ${companyId}. Logged as pending #${logId}`);
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
      console.log(`[Integration] SMS to ${recipient}: ${body}`);
      result = { success: false, error: "SMS integration not yet implemented" };
      break;
    case "whatsapp":
      console.log(`[Integration] WhatsApp to ${recipient}: ${body}`);
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
      `UPDATE integrations SET "lastSuccessAt"=NOW(), "retryCount"=0 WHERE id=$1`,
      [integration.id]
    );
  } else {
    await rawExecute(
      `UPDATE integrations SET "lastFailureAt"=NOW(), "lastError"=$2, "retryCount"="retryCount"+1 WHERE id=$1`,
      [integration.id, result.error]
    );
  }

  return { success: result.success, logId, error: result.error };
}

export async function retryFailedMessages(companyId?: number): Promise<{ retried: number; succeeded: number }> {
  const conditions = [`il.status IN ('failed','pending')`, `il."retryAttempt" < COALESCE(i."maxRetries", 3)`];
  const params: any[] = [];
  if (companyId) {
    params.push(companyId);
    conditions.push(`il."companyId"=$${params.length}`);
  }

  const failedLogs = await rawQuery<any>(
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
      companyId: log.companyId,
      channel: log.channel,
      recipient: log.recipient,
      subject: log.subject,
      body: log.body,
      metadata: log.metadata,
    });

    if (result.success) succeeded++;

    await rawExecute(
      `UPDATE integration_logs SET "retryAttempt"="retryAttempt"+1, status=$2 WHERE id=$1`,
      [log.id, result.success ? "sent" : "retrying"]
    );
  }

  return { retried, succeeded };
}

export const integrationService = {
  send: sendViaIntegration,
  retryFailed: retryFailedMessages,
};
