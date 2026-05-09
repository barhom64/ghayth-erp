import { rawQuery, rawExecute } from "./rawdb.js";
import { sendPushToCompany } from "./pushService.js";
import { dispatchNotification, interpolateTemplate, type EngineChannel } from "./notificationEngine.js";
import { logger } from "./logger.js";

export type NotificationChannel = "in_app" | "email" | "sms" | "whatsapp";
export type NotificationPriority = "low" | "normal" | "high" | "urgent";

export interface NotificationPayload {
  companyId: number;
  type: string;
  title: string;
  body: string;
  priority?: NotificationPriority;
  assignmentId?: number;
  targetRole?: string;
  refType?: string;
  refId?: number;
  actionUrl?: string;
  channels?: NotificationChannel[];
  recipientEmail?: string;
  recipientName?: string;
  recipientPhone?: string;
  recipientWhatsApp?: string;
  clientId?: number;
}

export async function sendNotification(payload: NotificationPayload): Promise<void> {
  try {
    await dispatchNotification({
      companyId: payload.companyId,
      eventCategory: payload.type,
      title: payload.title,
      body: payload.body,
      priority: payload.priority,
      assignmentId: payload.assignmentId,
      targetRole: payload.targetRole,
      refType: payload.refType,
      refId: payload.refId,
      actionUrl: payload.actionUrl,
      channels: payload.channels as EngineChannel[] | undefined,
      recipientEmail: payload.recipientEmail,
      recipientName: payload.recipientName,
      recipientPhone: payload.recipientPhone,
      recipientWhatsApp: payload.recipientWhatsApp,
      clientId: payload.clientId,
    });
  } catch (err: unknown) {
    logger.warn(`[NotificationService] Engine dispatch failed, using fallback: ${err instanceof Error ? err.message : String(err)}`);
    await sendNotificationLegacy(payload);
  }
}

const TYPE_CHANNEL_MAP: Record<string, NotificationChannel[]> = {
  alert: ["in_app"],
  task: ["in_app", "email"],
  payroll: ["in_app", "email"],
  leave: ["in_app", "email"],
  support: ["in_app", "email", "whatsapp"],
  crm: ["in_app", "email"],
  system: ["in_app"],
  invoice: ["in_app", "email"],
  attendance: ["in_app"],
  kpi: ["in_app"],
  maintenance: ["in_app", "whatsapp"],
  contract: ["in_app", "email"],
  // Security-relevant infra degradations: alert overnight via email too
  // (Task #177). The cron caller (cronScheduler.rateLimitFallbackAlertCheck)
  // already gates re-alerts behind a 30m cooldown, so this won't flood.
  rate_limit_fallback: ["in_app", "email"],
  rate_limit_recovered: ["in_app", "email"],
  default: ["in_app"],
};

function resolveChannels(type: string, explicit?: NotificationChannel[]): NotificationChannel[] {
  if (explicit && explicit.length > 0) return explicit;
  const key = type.split(".")[0] ?? "default";
  return TYPE_CHANNEL_MAP[key] ?? TYPE_CHANNEL_MAP["default"]!;
}

async function logNotification(
  companyId: number,
  channel: NotificationChannel,
  recipient: string,
  subject: string,
  body: string,
  status: "sent" | "queued" | "failed",
  errorMessage?: string
) {
  try {
    await rawExecute(
      `INSERT INTO notification_log ("companyId", channel, recipient, subject, body, status, "errorMessage", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [companyId, channel, recipient, subject, body, status, errorMessage ?? null]
    );
  } catch (_: unknown) { /* non-critical */ }
}

async function sendNotificationLegacy(payload: NotificationPayload): Promise<void> {
  const {
    companyId, type, title, body, priority = "normal",
    assignmentId, targetRole, refType, refId, actionUrl,
    recipientEmail, recipientName, recipientPhone, recipientWhatsApp, clientId,
  } = payload;

  const channels = resolveChannels(type, payload.channels);

  for (const channel of channels) {
    try {
      if (channel === "in_app") {
        const recipients = await resolveInAppRecipients(companyId, assignmentId, targetRole);
        for (const aid of recipients) {
          await rawExecute(
            `INSERT INTO notifications ("companyId", "assignmentId", type, title, body, priority, "targetRole", "actionUrl", "refType", "refId", "isRead", "createdAt")
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false, NOW())`,
            [companyId, aid, type, title, body, priority, targetRole ?? null, actionUrl ?? null, refType ?? null, refId ?? null]
          );
        }
        if (priority === "high" || priority === "urgent") {
          const pushAssignmentId = recipients.length === 1 ? recipients[0] : null;
          sendPushToCompany(companyId, pushAssignmentId, title, body, { actionUrl, refType, refId }).catch((err: unknown) => {
            logger.warn(`[Notification] Push dispatch error: ${err instanceof Error ? err.message : String(err)}`);
          });
        }
        await logNotification(companyId, channel, `assignment:${assignmentId ?? "broadcast"}`, title, body, "sent");
      } else if (channel === "email" && recipientEmail) {
        await rawExecute(
          `INSERT INTO email_queue ("companyId", "toEmail", "recipientName", subject, body, status, "createdAt", "refType", "refId")
           VALUES ($1, $2, $3, $4, $5, 'pending', NOW(), $6, $7)`,
          [companyId, recipientEmail, recipientName ?? "", title, body, refType ?? null, refId ?? null]
        );
        await logNotification(companyId, channel, recipientEmail, title, body, "queued");
      } else if (channel === "sms" && recipientPhone) {
        await rawExecute(
          `INSERT INTO sms_queue ("companyId", "recipientPhone", message, status, "createdAt")
           VALUES ($1, $2, $3, 'pending', NOW())`,
          [companyId, recipientPhone, `${title}: ${body}`]
        );
        await logNotification(companyId, channel, recipientPhone, title, body, "queued");
      } else if (channel === "whatsapp" && (recipientWhatsApp || recipientPhone)) {
        const phone = recipientWhatsApp ?? recipientPhone ?? "";
        await rawExecute(
          `INSERT INTO whatsapp_queue ("companyId", phone, "recipientName", "clientId", "assignmentId", message, status, "createdAt")
           VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW())`,
          [companyId, phone, recipientName ?? "", clientId ?? null, assignmentId ?? null, `${title}: ${body}`]
        );
        await logNotification(companyId, channel, phone, title, body, "queued");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await logNotification(companyId, channel, "unknown", title, body, "failed", msg);
    }
  }
}

async function resolveInAppRecipients(
  companyId: number,
  assignmentId?: number,
  targetRole?: string
): Promise<number[]> {
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

export function formatSmsTemplate(template: string, vars: Record<string, string>): string {
  return interpolateTemplate(template, vars);
}

export const SMS_TEMPLATES: Record<string, string> = {
  invoice_reminder: "عزيزي {{clientName}}، لديك فاتورة رقم {{ref}} بمبلغ {{amount}} ريال مستحقة بتاريخ {{dueDate}}. شكراً لتعاملكم معنا.",
  appointment_reminder: "تذكير: لديك موعد {{type}} بتاريخ {{date}} الساعة {{time}}. لأي استفسار تواصل معنا.",
  welcome: "أهلاً بك {{clientName}} في خدمات غيث. رقم حسابك: {{code}}. نسعد بخدمتك دائماً.",
  ticket_update: "تم تحديث تذكرة الدعم رقم {{ref}}: {{status}}. {{details}}",
  payment_received: "شكراً {{clientName}}، تم استلام دفعة بمبلغ {{amount}} ريال لفاتورة {{ref}}.",
};

export const WHATSAPP_TEMPLATES: Record<string, string> = {
  invoice_reminder: "مرحباً {{clientName}} 👋\n\nلديكم فاتورة مستحقة:\n📄 الرقم: {{ref}}\n💰 المبلغ: {{amount}} ريال\n📅 الاستحقاق: {{dueDate}}\n\nنأمل السداد في الموعد. شكراً لثقتكم.",
  welcome: "مرحباً {{clientName}} 👋\n\nتم إنشاء حسابك لدى غيث.\nرقم حسابك: {{code}}\n\nنسعد بخدمتكم دائماً 🌟",
  ticket_update: "تحديث تذكرة الدعم 🎫\n\nالرقم: {{ref}}\nالحالة: {{status}}\n{{details}}",
  appointment_reminder: "تذكير بموعدكم 📅\n\nالنوع: {{type}}\nالتاريخ: {{date}}\nالوقت: {{time}}\n\nنتطلع لخدمتكم.",
};

export const EMAIL_TEMPLATES: Record<string, { subject: string; body: string }> = {
  invoice_reminder: {
    subject: "تذكير بفاتورة مستحقة - {{ref}}",
    body: "عزيزي {{clientName}},\n\nنود تذكيركم بالفاتورة رقم {{ref}} بمبلغ {{amount}} ريال المستحقة بتاريخ {{dueDate}}.\n\nنأمل السداد في الموعد المحدد.\n\nمع أطيب التحيات,\nفريق غيث",
  },
  welcome: {
    subject: "مرحباً بك في غيث",
    body: "عزيزي {{clientName}},\n\nيسعدنا انضمامك إلينا. رقم حسابك هو: {{code}}.\n\nلا تتردد في التواصل معنا لأي استفسار.\n\nمع أطيب التحيات,\nفريق غيث",
  },
};

export async function sendTemplatedNotification(
  payload: NotificationPayload & { template?: string; templateVars?: Record<string, string> }
): Promise<void> {
  const { template, templateVars = {}, ...basePayload } = payload;

  try {
    await dispatchNotification({
      companyId: basePayload.companyId,
      eventCategory: basePayload.type,
      title: basePayload.title,
      body: basePayload.body,
      priority: basePayload.priority,
      assignmentId: basePayload.assignmentId,
      targetRole: basePayload.targetRole,
      refType: basePayload.refType,
      refId: basePayload.refId,
      actionUrl: basePayload.actionUrl,
      channels: basePayload.channels as EngineChannel[] | undefined,
      recipientEmail: basePayload.recipientEmail,
      recipientName: basePayload.recipientName,
      recipientPhone: basePayload.recipientPhone,
      recipientWhatsApp: basePayload.recipientWhatsApp,
      clientId: basePayload.clientId,
      templateKey: template,
      templateVars,
    });
    return;
  } catch (err: unknown) {
    logger.warn(`[NotificationService] Engine templated dispatch failed, using legacy: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!template || !templateVars || Object.keys(templateVars).length === 0) {
    await sendNotificationLegacy(basePayload);
    return;
  }

  const smsTemplate = SMS_TEMPLATES[template];
  const waTemplate = WHATSAPP_TEMPLATES[template];
  const emailTemplate = EMAIL_TEMPLATES[template];

  if (basePayload.recipientPhone && smsTemplate) {
    const smsPayload: NotificationPayload = { ...basePayload, recipientEmail: undefined, recipientWhatsApp: undefined };
    smsPayload.body = interpolateTemplate(smsTemplate, templateVars);
    await sendNotificationLegacy(smsPayload);
  }

  if ((basePayload.recipientWhatsApp || basePayload.recipientPhone) && waTemplate) {
    const waPayload: NotificationPayload = { ...basePayload, recipientEmail: undefined };
    waPayload.body = interpolateTemplate(waTemplate, templateVars);
    if (!waPayload.recipientWhatsApp) waPayload.recipientWhatsApp = waPayload.recipientPhone;
    waPayload.recipientPhone = undefined;
    await sendNotificationLegacy(waPayload);
  }

  if (basePayload.recipientEmail && emailTemplate) {
    const emailPayload: NotificationPayload = { ...basePayload, recipientPhone: undefined, recipientWhatsApp: undefined };
    emailPayload.title = interpolateTemplate(emailTemplate.subject, templateVars);
    emailPayload.body = interpolateTemplate(emailTemplate.body, templateVars);
    await sendNotificationLegacy(emailPayload);
  }

  const inAppPayload: NotificationPayload = { ...basePayload, recipientPhone: undefined, recipientEmail: undefined, recipientWhatsApp: undefined };
  await sendNotificationLegacy(inAppPayload);
}

export async function broadcastAlert(
  companyId: number,
  alertType: string,
  title: string,
  description: string,
  severity: "info" | "warning" | "critical" = "warning",
  relatedType?: string,
  relatedId?: number
): Promise<void> {
  try {
    await rawExecute(
      `INSERT INTO smart_alerts ("companyId", type, severity, title, description, "relatedType", "relatedId", "isRead", "isDismissed", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, false, false, NOW())`,
      [companyId, alertType, severity, title, description, relatedType ?? null, relatedId ?? null]
    );

    await sendNotification({
      companyId,
      type: "alert",
      title,
      body: description,
      priority: severity === "critical" ? "urgent" : severity === "warning" ? "high" : "normal",
      targetRole: "admin",
      refType: relatedType,
      refId: relatedId,
    });
  } catch (err) {
    logger.error(err, "broadcastAlert error:");
  }
}
