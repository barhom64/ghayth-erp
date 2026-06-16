/**
 * Account-lifecycle email sender (#2137 slice 2).
 *
 * Renders an `auth.*` template from notification_templates and sends it
 * through the SINGLE unified seam — sendMessage() — so the message lands
 * in message_log + outbound_queue and goes out via the system SMTP
 * resolver, exactly like every other outbound message.
 *
 * dlpExempt=true is set DELIBERATELY for these messages only: they carry
 * an activation/reset LINK (a short random token) that the DLP scanner
 * could coincidentally match against a National-ID/IBAN pattern and
 * redact — which would silently break the link and lock the user out.
 * The exemption is audited by sendMessage (templateKey identifies it as
 * a system auth.* credential message). No raw password is ever sent —
 * the user always sets their own via the link.
 */
import { rawQuery } from "./rawdb.js";
import { sendMessage } from "./messageSender.js";
import { interpolateTemplate } from "./notificationEngine.js";
import { logger } from "./logger.js";

interface TemplateRow {
  titleTemplate: string | null;
  bodyTemplate: string;
}

/**
 * Resolve an email template: tenant override first, else the platform
 * default (companyId IS NULL), preferring the requested language. Mirrors
 * notificationEngine.getTemplate's selection so behaviour is consistent.
 */
async function getEmailTemplate(
  companyId: number,
  templateKey: string,
  language: "ar" | "en",
): Promise<TemplateRow | null> {
  const rows = await rawQuery<TemplateRow>(
    `SELECT "titleTemplate", "bodyTemplate"
       FROM notification_templates
      WHERE ("companyId" = $1 OR "companyId" IS NULL)
        AND "templateKey" = $2
        AND channel = 'email'
        AND "isActive" = true
      ORDER BY (language = $3) DESC, "companyId" DESC NULLS LAST
      LIMIT 1`,
    [companyId, templateKey, language],
  );
  return rows[0] ?? null;
}

export interface AuthEmailResult {
  sent: boolean;
  /** false when no template row exists (mis-seed) — caller logs, never throws at the user over a notice. */
  templateFound: boolean;
}

/**
 * Send an account auth email. Returns {sent} so a security NOTICE
 * (password-changed) can be best-effort, while a REQUIRED link
 * (reset/activation) caller can assert on the result.
 */
export async function sendAuthEmail(params: {
  companyId: number;
  userId?: number | null;
  recipientEmail: string;
  recipientName?: string | null;
  templateKey: string;
  vars: Record<string, string>;
  language?: "ar" | "en";
}): Promise<AuthEmailResult> {
  const { companyId, userId, recipientEmail, recipientName, templateKey, vars } = params;
  const language = params.language ?? "ar";

  const tpl = await getEmailTemplate(companyId, templateKey, language);
  if (!tpl) {
    logger.warn({ templateKey, companyId }, "[authNotifications] no email template found");
    return { sent: false, templateFound: false };
  }

  const subject = tpl.titleTemplate ? interpolateTemplate(tpl.titleTemplate, vars) : "نظام غيث";
  const body = interpolateTemplate(tpl.bodyTemplate, vars);

  const result = await sendMessage({
    channel: "email",
    recipient: recipientEmail,
    recipientName: recipientName ?? null,
    subject,
    body,
    companyId,
    userId: userId ?? null,
    templateKey,
    // Auth link/token — see module doc. Audited via sendMessage.
    dlpExempt: true,
  });

  return { sent: result.queued === true && result.blocked !== true, templateFound: true };
}
