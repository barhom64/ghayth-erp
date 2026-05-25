/**
 * Webhook channel — Phase 9 of the Print Platform.
 *
 * Posts the document as multipart/form-data (or JSON+base64) to a URL
 * with an HMAC-SHA256 signature header so the receiver can verify
 * origin. Useful for integrating with downstream systems (a portal that
 * wants to mirror printed invoices, a partner's ingest API, etc.).
 *
 * Address format: the full URL to POST to.
 * Required env: PRINT_WEBHOOK_SIGNING_SECRET — when missing, channel
 * still works but signature header is absent.
 */

import crypto from "node:crypto";
import type { DeliveryChannel, DeliveryInput, DeliveryResult } from "../delivery.js";
import { logger } from "../../logger.js";

export class WebhookChannel implements DeliveryChannel {
  kind = "webhook" as const;

  constructor(private opts: { signingSecret?: string } = {}) {}

  isAvailable(): boolean {
    return true; // No external dep — the caller supplies the URL.
  }

  async send(input: DeliveryInput): Promise<DeliveryResult> {
    const recipients = Array.isArray(input.to) ? input.to : [input.to];
    const failures: string[] = [];
    const successes: string[] = [];
    for (const r of recipients) {
      const url = r.address;
      if (!/^https?:\/\//i.test(url)) {
        failures.push(`bad url: ${url}`);
        continue;
      }
      const payload = {
        jobId: input.document.jobId,
        filename: input.document.filename,
        mime: input.document.mime,
        // Bytes go base64 in JSON — keeps the webhook flat and easy to
        // verify. For very large docs (>10MB) consider a multipart fork.
        contentBase64: input.document.bytes.toString("base64"),
        subject: input.subject,
        body: input.body,
        locale: input.locale ?? "ar",
        templateCode: input.templateCode,
      };
      const bodyStr = JSON.stringify(payload);
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "User-Agent": "Ghaith-PrintPlatform/1.0",
      };
      if (this.opts.signingSecret) {
        const sig = crypto
          .createHmac("sha256", this.opts.signingSecret)
          .update(bodyStr)
          .digest("hex");
        headers["X-Ghaith-Signature"] = `sha256=${sig}`;
      }
      try {
        const ctl = AbortSignal.timeout(15_000); // 15s hard timeout
        const res = await fetch(url, { method: "POST", body: bodyStr, headers, signal: ctl });
        if (!res.ok) {
          failures.push(`${url} → HTTP ${res.status}`);
          continue;
        }
        successes.push(url);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn(`[delivery/webhook] ${url} failed: ${msg}`);
        failures.push(`${url}: ${msg}`);
      }
    }
    if (successes.length === 0) {
      return {
        channel: "webhook",
        ok: false,
        error: failures.join("; ") || "all webhooks failed",
      };
    }
    return {
      channel: "webhook",
      ok: true,
      messageId: successes.join(","),
      error: failures.length > 0 ? `partial: ${failures.join("; ")}` : undefined,
    };
  }
}
