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
  // U-17-P3 — the sub-agent attached to the pilgrim event. If the
  // sub-agent (or its parent agent) has a contactEmployeeId set, that
  // operator is also added to the recipient pool so the right person
  // sees the alert without a manual hand-off.
  subAgentId?: number | null;
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
  // U-17-P3 — sub-agent + agent contact-employee expansion.
  // The contactEmployeeId column is the employee ID of the operator
  // designated to liaise with this agent/sub-agent. We need their
  // active employee_assignments id to feed createNotification, so
  // each lookup joins employee_assignments.
  if (ctx.subAgentId) {
    const subAgentContact = await rawQuery<{ assignmentId: number }>(
      `SELECT ea.id AS "assignmentId"
         FROM umrah_sub_agents sa
         JOIN employee_assignments ea
           ON ea."employeeId" = sa."contactEmployeeId"
          AND ea."companyId" = sa."companyId"
          AND ea.status = 'active'
        WHERE sa.id = $1
          AND sa."companyId" = $2
          AND sa."deletedAt" IS NULL
          AND sa."contactEmployeeId" IS NOT NULL
        LIMIT 1`,
      [ctx.subAgentId, ctx.companyId],
    );
    if (subAgentContact[0]) out.add(subAgentContact[0].assignmentId);
  }
  if (ctx.agentId) {
    const agentContact = await rawQuery<{ assignmentId: number }>(
      `SELECT ea.id AS "assignmentId"
         FROM umrah_agents a
         JOIN employee_assignments ea
           ON ea."employeeId" = a."contactEmployeeId"
          AND ea."companyId" = a."companyId"
          AND ea.status = 'active'
        WHERE a.id = $1
          AND a."companyId" = $2
          AND a."deletedAt" IS NULL
          AND a."contactEmployeeId" IS NOT NULL
        LIMIT 1`,
      [ctx.agentId, ctx.companyId],
    );
    if (agentContact[0]) out.add(agentContact[0].assignmentId);
  }
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
