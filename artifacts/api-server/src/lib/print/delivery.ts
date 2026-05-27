/**
 * Delivery — Phase 9 of the Print Platform.
 *
 * Sends a rendered document over a non-printing channel: email, WhatsApp,
 * SMS, internal inbox, etc. This file is the CONTRACT only — the concrete
 * channel implementations need provider integrations (SES, Twilio, SMTP,
 * etc.) and are deferred until the provider choice is made.
 *
 * Why land the contract now, before any channel is implemented?
 *
 * 1. Every caller (print-button.tsx, scheduled-reports, reprint-approval
 *    notification, …) writes against `sendDocument(channel, ...)` instead
 *    of going direct to a provider. When the provider lands, only one
 *    file changes.
 * 2. The DownloadChannel is implementable today (it just returns the
 *    bytes for the SPA to surface) — proves the interface works.
 * 3. The audit row in print_jobs gets a `deliveredVia` column the moment
 *    a channel sends, regardless of which provider is wired up.
 *
 * NEXT: when an SES/SendGrid/Twilio decision is made, drop a concrete
 * EmailChannel in `delivery/emailChannel.ts`, register it in
 * `getChannel()` below, and the contract calls light up automatically.
 */

import { logger } from "../logger.js";

export type DeliveryChannelKind =
  | "download"
  | "email"
  | "whatsapp"
  | "sms"
  | "internal_inbox"
  | "webhook";

export interface DeliveryRecipient {
  /** Channel-specific address — email for email, phone for sms/whatsapp,
   *  userId for internal_inbox, URL for webhook. */
  address: string;
  /** Optional display name for the recipient. */
  name?: string;
}

export interface DeliveryInput {
  channel: DeliveryChannelKind;
  to: DeliveryRecipient | DeliveryRecipient[];
  /** The rendered document bytes from the Print Engine. */
  document: {
    bytes: Buffer;
    mime: string;
    filename: string;
    jobId: string | null;
  };
  /** Subject for email; first SMS line; WhatsApp template name. */
  subject?: string;
  /** Body text. For email this becomes the message body; for SMS it's the
   *  payload; for WhatsApp it fills the template's body variable. */
  body?: string;
  /** Locale hint for templated channels (WhatsApp templates, email
   *  signatures). Defaults to "ar". */
  locale?: string;
  /** Optional template code (Phase 3) — selects the right email/whatsapp
   *  template for the channel. */
  templateCode?: string;
}

export interface DeliveryResult {
  channel: DeliveryChannelKind;
  ok: boolean;
  messageId?: string;
  /** Provider-specific receipt url / job id (Stripe-style). */
  receipt?: string;
  error?: string;
  /** When the channel is async (queued for later send), the queue id
   *  for cancellation / retry. */
  queueId?: string;
}

/**
 * The DeliveryChannel interface every provider implements. The shape is
 * the same for synchronous (download) and asynchronous (email/SMS via
 * provider queue) channels — providers can defer the actual send and
 * return ok=true with a queueId.
 */
export interface DeliveryChannel {
  kind: DeliveryChannelKind;
  /** Returns true when the runtime is configured for this channel
   *  (env vars present, credentials valid, etc). Channels not yet
   *  registered return false here; `sendDocument()` will fail fast
   *  with `error: "CHANNEL_NOT_CONFIGURED"` instead of attempting
   *  the send. */
  isAvailable(): boolean;
  send(input: DeliveryInput): Promise<DeliveryResult>;
}

// ─── Registry ────────────────────────────────────────────────────────────

const channels = new Map<DeliveryChannelKind, DeliveryChannel>();

/** Provider implementations register themselves at startup. */
export function registerChannel(channel: DeliveryChannel): void {
  channels.set(channel.kind, channel);
}

export function getChannel(kind: DeliveryChannelKind): DeliveryChannel | null {
  return channels.get(kind) ?? null;
}

export function listAvailableChannels(): DeliveryChannelKind[] {
  return Array.from(channels.entries())
    .filter(([, ch]) => ch.isAvailable())
    .map(([k]) => k);
}

// ─── Concrete: DownloadChannel ───────────────────────────────────────────
// The one channel we can ship today — no external provider. Returns the
// document bytes wrapped in a DeliveryResult so the SPA can pop a save
// dialog. Lets the SDK's downloadDocument() route through the same
// `sendDocument(channel: "download", …)` API the email channel will use
// later.

class DownloadChannel implements DeliveryChannel {
  kind: DeliveryChannelKind = "download";
  isAvailable(): boolean {
    return true;
  }
  async send(input: DeliveryInput): Promise<DeliveryResult> {
    // No actual delivery — the caller (SPA) is expected to surface the
    // bytes via a Blob URL. We return ok=true with messageId set to the
    // jobId so the audit chain can correlate.
    return {
      channel: "download",
      ok: true,
      messageId: input.document.jobId ?? undefined,
    };
  }
}

// Auto-register the DownloadChannel since it has no config.
registerChannel(new DownloadChannel());

/**
 * Register the real channel implementations. Called once from index.ts
 * at boot so the channels join the registry before any /print/render
 * request can hit `sendDocument`. Channels whose config isn't present
 * still register — they just answer `isAvailable() === false`.
 */
export async function registerDefaultChannels(): Promise<void> {
  const { InternalInboxChannel } = await import("./delivery/internalInbox.js");
  const { WebhookChannel } = await import("./delivery/webhook.js");
  const { emailChannelFromConfig } = await import("./delivery/email.js");
  const { config } = await import("../config.js");
  registerChannel(new InternalInboxChannel());
  registerChannel(new WebhookChannel({ signingSecret: config.print.webhookSigningSecret }));
  registerChannel(emailChannelFromConfig());
  logger.info(
    `[print/delivery] channels registered: ${listAvailableChannels().join(", ") || "(only download)"}`,
  );
}

// ─── Public API ──────────────────────────────────────────────────────────

/**
 * Send a rendered document via the chosen channel.
 *
 * Today only `download` actually sends. The other channels are stubbed
 * — calling `sendDocument({ channel: "email", … })` returns
 * `{ ok: false, error: "CHANNEL_NOT_CONFIGURED" }`. Wire up a provider
 * implementation (see docs/architecture/print-platform-delivery.md)
 * and it lights up automatically.
 */
export async function sendDocument(input: DeliveryInput): Promise<DeliveryResult> {
  const channel = getChannel(input.channel);
  if (!channel) {
    return {
      channel: input.channel,
      ok: false,
      error: `Unknown channel: ${input.channel}`,
    };
  }
  if (!channel.isAvailable()) {
    return {
      channel: input.channel,
      ok: false,
      error: "CHANNEL_NOT_CONFIGURED",
    };
  }
  try {
    return await channel.send(input);
  } catch (err) {
    logger.error(err as Error, `[print/delivery] ${input.channel} send failed`);
    return {
      channel: input.channel,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
