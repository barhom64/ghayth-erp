/**
 * Email channel — Phase 9 of the Print Platform.
 *
 * Sends the document as an attachment via SMTP. Reuses the nodemailer
 * dependency that's already installed (used by integrationService for
 * outbound email integrations).
 *
 * Configuration sources (in order of preference):
 *   1. env vars (SMTP_HOST + SMTP_PORT + SMTP_USER + SMTP_PASS + SMTP_FROM)
 *   2. A row in `integrations` with type='email' for the current company
 *      (matches the pattern integrationService already uses)
 *
 * When neither is configured, `isAvailable()` returns false and
 * `sendDocument` falls through to CHANNEL_NOT_CONFIGURED.
 *
 * Address format: standard RFC-5322 email.
 */

import type { DeliveryChannel, DeliveryInput, DeliveryResult } from "../delivery.js";
import { logger } from "../../logger.js";

export interface EmailChannelConfig {
  host: string;
  port: number;
  secure?: boolean;
  user?: string;
  pass?: string;
  from: string;
}

export class EmailChannel implements DeliveryChannel {
  kind = "email" as const;

  constructor(private cfg: EmailChannelConfig | null) {}

  isAvailable(): boolean {
    return Boolean(this.cfg && this.cfg.host && this.cfg.from);
  }

  async send(input: DeliveryInput): Promise<DeliveryResult> {
    if (!this.cfg) return { channel: "email", ok: false, error: "CHANNEL_NOT_CONFIGURED" };
    const recipients = Array.isArray(input.to) ? input.to : [input.to];
    try {
      const nodemailer = await import("nodemailer");
      const transporter = nodemailer.default.createTransport({
        host: this.cfg.host,
        port: this.cfg.port,
        secure: this.cfg.secure ?? false,
        auth: this.cfg.user ? { user: this.cfg.user, pass: this.cfg.pass ?? "" } : undefined,
      });
      const info = await transporter.sendMail({
        from: this.cfg.from,
        to: recipients.map((r) => (r.name ? `"${r.name}" <${r.address}>` : r.address)),
        subject: input.subject ?? `وثيقة من Ghaith ERP — ${input.document.filename}`,
        html:
          input.body
          ?? `<div style="font-family:Tahoma,sans-serif;direction:rtl"><p>تجدون المستند مرفقاً.</p><p style="color:#94a3b8;font-size:11pt">مستند رقم ${input.document.jobId ?? "—"}.</p></div>`,
        attachments: [
          {
            filename: input.document.filename,
            content: input.document.bytes,
            contentType: input.document.mime,
          },
        ],
      });
      return {
        channel: "email",
        ok: true,
        messageId: info.messageId,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(err as Error, "[delivery/email] send failed");
      return { channel: "email", ok: false, error: msg };
    }
  }
}

/**
 * Build the EmailChannel from the typed config object (FND-003 — env
 * vars are validated in lib/config.ts). Returns an EmailChannel with
 * cfg=null when SMTP isn't configured; isAvailable() then reports
 * false so sendDocument falls through cleanly.
 */
export function emailChannelFromConfig(): EmailChannel {
  // Imported lazily to avoid the lib/config.ts cycle at module init.
  // The function-level import is only paid once per process.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { config } = require("../../config.js") as typeof import("../../config.js");
  const { host, port, user, pass, from, secure } = config.smtp;
  const effectiveFrom = from ?? user;
  if (!host || !effectiveFrom) return new EmailChannel(null);
  return new EmailChannel({
    host,
    port,
    secure,
    user,
    pass,
    from: effectiveFrom,
  });
}
