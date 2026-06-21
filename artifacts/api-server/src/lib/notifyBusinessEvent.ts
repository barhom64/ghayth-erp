/**
 * Thin wrapper over `dispatchNotification` that fires a notification
 * for a business event with template + recipient resolution.
 *
 * Before this helper, each event listener wrote in-app notifications
 * directly via `createNotification` — which never fanned out to email,
 * SMS, or WhatsApp. This wrapper routes through `dispatchNotification`
 * so the channel matrix (in_app + email + sms + whatsapp) is owned by
 * the engine + notification_routing_rules + user preferences, and the
 * notification body comes from a template (with language picked from
 * user preferredLocale).
 *
 * Used by: lib/eventListeners.ts hooks.
 */
import { dispatchNotification, type EngineChannel } from "./notificationDispatch.js";
import { resolveRecipient, shouldCcPersonalEmail, type ResolvableEntity } from "./recipientResolver.js";
import { logger } from "./logger.js";

export interface NotifyBusinessEventInput {
  /** Tenant — required. */
  companyId: number;
  /** templateKey from notification_templates (seeded by migration 253). */
  templateKey: string;
  /** Mustache-style variables interpolated into title + body. */
  templateVars: Record<string, string>;
  /** Fallback title if no template row matches (defensive). */
  fallbackTitle: string;
  /** Fallback body if no template row matches (defensive). */
  fallbackBody: string;
  /** Manager / approver assignment receiving the in-app notification (optional). */
  assignmentId?: number;
  /** Direct user to receive the notification + the addressed email (looked up via recipientResolver). */
  recipientUser?: { type: ResolvableEntity; id: number };
  /** Override channel list (skip routing rule). */
  channels?: EngineChannel[];
  priority?: "low" | "normal" | "high" | "urgent";
  refType?: string;
  refId?: number;
  actionUrl?: string;
  /** Event category for routing rule lookup — defaults to templateKey. */
  eventCategory?: string;
}

/**
 * Fires a notification for a business event. Never throws — failures
 * are logged so the caller (event listener) is safe to await without a
 * try/catch.
 */
export async function notifyBusinessEvent(input: NotifyBusinessEventInput): Promise<void> {
  try {
    let recipientEmail: string | undefined;
    let recipientPhone: string | undefined;
    let recipientWhatsApp: string | undefined;
    let recipientName: string | undefined;
    let recipientUserId: number | undefined;
    let language: "ar" | "en" | undefined;
    let cc: string | undefined;

    if (input.recipientUser) {
      const ccEnabled = await shouldCcPersonalEmail(input.companyId);
      // Resolve once per channel kind — email + phone + whatsapp may
      // come from different columns on the same entity.
      const emailRes = await resolveRecipient(input.recipientUser.type, input.recipientUser.id, "email", {
        companyId: input.companyId, ccPersonalEmail: ccEnabled,
      });
      const phoneRes = await resolveRecipient(input.recipientUser.type, input.recipientUser.id, "sms", {
        companyId: input.companyId,
      });
      const waRes = await resolveRecipient(input.recipientUser.type, input.recipientUser.id, "whatsapp", {
        companyId: input.companyId,
      });
      recipientEmail = emailRes?.primary ?? undefined;
      cc = emailRes?.cc ?? undefined;
      recipientPhone = phoneRes?.primary ?? undefined;
      recipientWhatsApp = waRes?.primary ?? undefined;
      recipientName = emailRes?.displayName ?? phoneRes?.displayName ?? undefined;
      language = emailRes?.language ?? phoneRes?.language ?? undefined;
      if (input.recipientUser.type === "user") {
        recipientUserId = input.recipientUser.id;
      }
    }

    await dispatchNotification({
      companyId: input.companyId,
      eventCategory: input.eventCategory ?? input.templateKey,
      title: input.fallbackTitle,
      body: input.fallbackBody,
      priority: input.priority ?? "normal",
      assignmentId: input.assignmentId,
      refType: input.refType,
      refId: input.refId,
      actionUrl: input.actionUrl,
      channels: input.channels,
      recipientEmail,
      recipientPhone,
      recipientWhatsApp,
      recipientName,
      recipientUserId,
      templateKey: input.templateKey,
      templateVars: input.templateVars,
      language,
      metadata: cc ? { cc } : undefined,
    });
  } catch (err) {
    logger.warn(err, `[notifyBusinessEvent] dispatch failed for ${input.templateKey}`);
  }
}
