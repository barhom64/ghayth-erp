// Umrah internal in-app notifications.
//
// Pilgrims aren't system users — they have no inbox, no notifications
// panel. Operational alerts that USED to leave the system as SMS now
// route through the platform's existing in-app notification seam
// (`createNotification`) so the operator sees them in the bell icon
// and the agent sees them in their dashboard. Cleaner than SMS for
// the agency side: no provider account, no per-message cost, audit
// trail by default.
//
// SMS to the actual pilgrim is a separate outbound channel — kept
// in `umrahNotifications.ts` for callers that want it. This module
// is the AGENCY-INTERNAL flow.

import { rawQuery } from "./rawdb.js";
import { createNotification, emitEvent, getManagerAssignmentId } from "./businessHelpers.js";
import { logger } from "./logger.js";

export interface InternalNotifyContext {
  companyId: number;
  branchId: number | null;
  pilgrimId: number;
  pilgrimName: string | null;
  agentId: number | null;
}

/**
 * Collect every operator assignment that should hear about this
 * pilgrim event. Returns at minimum the branch manager; adds any
 * additional admins/managers for the company. Deduplicates by id.
 *
 * Empty result is silently OK — the caller logs the event but skips
 * the notification, mirroring the legacy `getManagerAssignmentId`
 * single-recipient behaviour without crashing when the company has
 * no configured manager yet.
 */
/**
 * U-17-P5 — pilgrim opt-out check.
 *
 * Returns true when the pilgrim is flagged `notifications_opt_out = true`.
 * Null (the default) is treated as "no opt-out" so the existing pilgrim
 * population behaves identically.
 */
async function isPilgrimOptedOut(
  companyId: number,
  pilgrimId: number,
): Promise<boolean> {
  const rows = await rawQuery<{ optedOut: boolean | null }>(
    `SELECT notifications_opt_out AS "optedOut"
       FROM umrah_pilgrims
      WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
    [pilgrimId, companyId],
  );
  return rows[0]?.optedOut === true;
}

export async function resolveInternalRecipients(
  ctx: InternalNotifyContext,
): Promise<number[]> {
  const out = new Set<number>();
  // Branch manager — same lookup the existing crons use.
  const mgr = await getManagerAssignmentId(ctx.companyId, ctx.branchId ?? 0);
  if (mgr) out.add(mgr);
  // GM/owner for the company — catches alerts even when the branch
  // manager is null. Same role filter pattern as
  // `getManagerAssignmentId`, scoped only by companyId.
  const gms = await rawQuery<{ id: number }>(
    `SELECT ea.id FROM employee_assignments ea
      WHERE ea."companyId" = $1
        AND ea.role IN ('general_manager', 'owner')
        AND ea.status = 'active'`,
    [ctx.companyId],
  );
  for (const r of gms) out.add(r.id);
  return [...out];
}

/**
 * In-app notification: visa expiring. Goes to the branch manager +
 * GM; deep-links to the pilgrim's detail page so a click opens the
 * exact record.
 */
export async function notifyInternalVisaExpiring(
  ctx: InternalNotifyContext,
  daysRemaining: number,
): Promise<number> {
  // §10 of #1870 — overstay-risk is the predictive companion event
  // to umrah.pilgrim.overstayed. Listeners (dashboard, automation
  // rules) want to react BEFORE the actual overstay so they can
  // queue a follow-up call to the agent. Fires regardless of
  // recipient count so the event stream stays usable even when
  // the manager hierarchy isn't seeded.
  emitEvent({
    companyId: ctx.companyId,
    userId: 0,
    action: "umrah.pilgrim.overstay_risk",
    entity: "umrah_pilgrims",
    entityId: ctx.pilgrimId,
    after: { daysRemaining, reason: "visa_expiring" },
  }).catch((e) => logger.error(e, "[umrah internal notify] overstay_risk emit failed"));

  // U-17-P5 — pilgrim opt-out gate. The risk event still fires
  // because downstream automations may need to react regardless;
  // we only suppress the operator NOTIFICATION dispatch.
  if (await isPilgrimOptedOut(ctx.companyId, ctx.pilgrimId)) return 0;
  const recipients = await resolveInternalRecipients(ctx);
  if (recipients.length === 0) return 0;
  const title = daysRemaining <= 0
    ? "⚠️ تأشيرة معتمر منتهية"
    : `⏰ تأشيرة معتمر تنتهي بعد ${daysRemaining} يوم`;
  const body = `${ctx.pilgrimName ?? "معتمر #" + ctx.pilgrimId}: ${daysRemaining <= 0 ? "انتهت" : "تنتهي بعد " + daysRemaining + " يوم"}. تواصل مع الوكيل لتنسيق المغادرة.`;
  let sent = 0;
  for (const assignmentId of recipients) {
    try {
      await createNotification({
        companyId: ctx.companyId,
        assignmentId,
        type: "umrah",
        title,
        body,
        priority: daysRemaining <= 0 ? "urgent" : "high",
        refType: "umrah_pilgrims",
        refId: ctx.pilgrimId,
        actionUrl: `/umrah/pilgrims/${ctx.pilgrimId}`,
      });
      sent++;
    } catch (e) {
      logger.error(e, "[umrah internal notify] visa expiring failed");
    }
  }
  return sent;
}

/**
 * In-app notification: pilgrim departing tomorrow. Reminds the agency
 * to confirm transport + the meeting point.
 */
export async function notifyInternalDepartureTomorrow(
  ctx: InternalNotifyContext,
  payload: { tripDate: string; flightNumber: string | null },
): Promise<number> {
  // U-17-P5 — pilgrim opt-out gate.
  if (await isPilgrimOptedOut(ctx.companyId, ctx.pilgrimId)) return 0;
  const recipients = await resolveInternalRecipients(ctx);
  if (recipients.length === 0) return 0;
  const flightSeg = payload.flightNumber ? ` على رحلة ${payload.flightNumber}` : "";
  const title = `✈️ معتمر يصل غدًا — ${ctx.pilgrimName ?? "#" + ctx.pilgrimId}`;
  const body = `${ctx.pilgrimName ?? "المعتمر #" + ctx.pilgrimId} مقرر وصوله غدًا (${payload.tripDate})${flightSeg}. تأكد من تأمين النقل ونقطة الاستلام.`;
  let sent = 0;
  for (const assignmentId of recipients) {
    try {
      await createNotification({
        companyId: ctx.companyId,
        assignmentId,
        type: "umrah",
        title,
        body,
        priority: "high",
        refType: "umrah_pilgrims",
        refId: ctx.pilgrimId,
        actionUrl: `/umrah/pilgrims/${ctx.pilgrimId}`,
      });
      sent++;
    } catch (e) {
      logger.error(e, "[umrah internal notify] departure failed");
    }
  }
  return sent;
}

/**
 * In-app notification: overstay warning. The pilgrim has passed
 * their permitted departure date; the agency needs to chase them.
 */
export async function notifyInternalOverstayWarning(
  ctx: InternalNotifyContext,
  daysOverstayed: number,
): Promise<number> {
  // U-17-P5 — pilgrim opt-out gate.
  if (await isPilgrimOptedOut(ctx.companyId, ctx.pilgrimId)) return 0;
  const recipients = await resolveInternalRecipients(ctx);
  if (recipients.length === 0) return 0;
  const title = `🚨 معتمر متجاوز — ${ctx.pilgrimName ?? "#" + ctx.pilgrimId}`;
  const body = `${ctx.pilgrimName ?? "المعتمر #" + ctx.pilgrimId} تجاوز موعد المغادرة بـ${daysOverstayed} يوم. تواصل معه قبل تحويل الحالة إلى مخالف.`;
  let sent = 0;
  for (const assignmentId of recipients) {
    try {
      await createNotification({
        companyId: ctx.companyId,
        assignmentId,
        type: "umrah",
        title,
        body,
        priority: "urgent",
        refType: "umrah_pilgrims",
        refId: ctx.pilgrimId,
        actionUrl: `/umrah/pilgrims/${ctx.pilgrimId}`,
      });
      sent++;
    } catch (e) {
      logger.error(e, "[umrah internal notify] overstay failed");
    }
  }
  return sent;
}
