// ─── SLA escalation — single source of truth ────────────────────────────
// Before this module four code paths wrote support_tickets.slaBreached /
// priority / escalationLevel with DIFFERENT rules — the check-sla
// endpoint, a late reply, the hourly cron and the daily cron — which
// raced each other and disagreed on the outcome. They now all funnel
// through escalateSla(), so a breach is escalated exactly one way.

import { rawQuery } from "./rawdb.js";
import { createNotification } from "./businessHelpers.js";
import { broadcastAlert } from "./notificationService.js";
import { logger } from "./logger.js";

export interface EscalatedTicket {
  id: number;
  ref: string;
  title: string;
  priority: string;
  assigneeId: number | null;
}

/**
 * Atomically escalate breached tickets. A ticket is escalated when it is
 * in a non-terminal state (open/in_progress/field_visit), its SLA
 * deadline has passed, and it has not been breached yet. The breach is
 * flagged, escalationLevel is bumped and priority is raised to critical.
 *
 * Gating on `slaBreached = false` makes the UPDATE idempotent and
 * race-free — whichever caller runs first wins, the rest no-op. Pass a
 * ticketId to escalate just that ticket. Returns the rows escalated by
 * THIS call so the caller can notify.
 */
async function escalateSlaBreaches(
  companyId: number,
  ticketId?: number,
): Promise<EscalatedTicket[]> {
  const params: unknown[] = [companyId];
  let idFilter = "";
  if (ticketId !== undefined) {
    params.push(ticketId);
    idFilter = " AND id = $2";
  }
  return rawQuery<EscalatedTicket>(
    `UPDATE support_tickets
        SET "slaBreached" = true,
            "escalationLevel" = COALESCE("escalationLevel", 0) + 1,
            priority = 'critical',
            "updatedAt" = NOW()
      WHERE "companyId" = $1${idFilter}
        AND status IN ('open','in_progress','field_visit')
        AND "slaBreached" = false
        AND "slaDeadline" IS NOT NULL
        AND "slaDeadline" < NOW()
        AND "deletedAt" IS NULL
      RETURNING id, ref, title, priority, "assigneeId"`,
    params,
  );
}

/** Notify the assignee and raise a smart alert for one escalated ticket. */
async function notifySlaEscalation(
  companyId: number,
  ticket: EscalatedTicket,
): Promise<void> {
  try {
    if (ticket.assigneeId) {
      const [asgn] = await rawQuery<{ id: number }>(
        `SELECT id FROM employee_assignments WHERE "employeeId" = $1 AND "companyId" = $2 AND status = 'active' LIMIT 1`,
        [ticket.assigneeId, companyId],
      );
      if (asgn) {
        await createNotification({
          companyId,
          assignmentId: asgn.id,
          type: "alert",
          title: `SLA خرق: ${ticket.ref}`,
          body: `التذكرة "${ticket.title}" تجاوزت SLA — تم تصعيد الأولوية إلى حرجة`,
          priority: "high",
          refType: "support_tickets",
          refId: ticket.id,
        });
      }
    }
    await broadcastAlert(
      companyId,
      "sla_breach",
      `خرق SLA: ${ticket.ref}`,
      `التذكرة "${ticket.title}" تجاوزت SLA — تم تصعيد الأولوية إلى حرجة`,
      "critical",
      "support_ticket",
      ticket.id,
    );
  } catch (err) {
    logger.error(err, `[sla] escalation notification failed for ticket ${ticket.id}:`);
  }
}

/**
 * Unified SLA escalation entry point. Escalates every breached ticket of
 * a company (or just `ticketId`) and notifies. Returns the tickets that
 * were escalated by this call.
 */
export async function escalateSla(
  companyId: number,
  ticketId?: number,
): Promise<EscalatedTicket[]> {
  const escalated = await escalateSlaBreaches(companyId, ticketId);
  for (const ticket of escalated) {
    await notifySlaEscalation(companyId, ticket);
  }
  return escalated;
}

/** Sweep every company — used by the SLA cron jobs. Returns the count escalated. */
export async function escalateSlaAllCompanies(): Promise<number> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let total = 0;
  for (const company of companies) {
    total += (await escalateSla(company.id)).length;
  }
  return total;
}
