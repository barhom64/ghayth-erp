/**
 * Internal inbox channel — Phase 9 of the Print Platform.
 *
 * Writes a row into `notifications` with a link to the print artifact.
 * Used for "we just printed your payslip" / "your invoice is ready"
 * notifications inside the ERP without going through email.
 *
 * Address format: numeric userId. Each recipient is looked up to the
 * user's active assignment for the `assignmentId` column on notifications.
 */

import type { DeliveryChannel, DeliveryInput, DeliveryResult } from "../delivery.js";
import { rawQuery } from "../../rawdb.js";
import { logger } from "../../logger.js";

export class InternalInboxChannel implements DeliveryChannel {
  kind = "internal_inbox" as const;

  // Always available — uses the local notifications table; no external
  // dependency, no credentials.
  isAvailable(): boolean {
    return true;
  }

  async send(input: DeliveryInput): Promise<DeliveryResult> {
    const recipients = Array.isArray(input.to) ? input.to : [input.to];
    const subject = input.subject ?? "وثيقة جديدة جاهزة";
    const body = input.body ?? `وثيقة "${input.document.filename}" جاهزة للتحميل.`;
    const messageIds: string[] = [];
    for (const r of recipients) {
      const addr = r.address;
      // Two address shapes supported:
      //   • "assignment:<id>"  → notifications.assignmentId = <id> directly
      //     (preferred — matches the notification model).
      //   • "<userId>"         → resolve to the user's primary
      //     employee_assignment via users.employeeId → employee_assignments.
      let assignment: { id: number; companyId: number } | null = null;
      const asMatch = addr.match(/^assignment:(\d+)$/);
      if (asMatch) {
        const aid = Number(asMatch[1]);
        const [row] = await rawQuery<{ id: number; companyId: number }>(
          `SELECT id, "companyId" FROM employee_assignments WHERE id = $1 LIMIT 1`,
          [aid],
        ).catch(() => [null]);
        if (row) assignment = row;
      } else {
        const userId = Number(addr);
        if (Number.isInteger(userId) && userId > 0) {
          const [row] = await rawQuery<{ id: number; companyId: number }>(
            `SELECT ea.id, ea."companyId"
               FROM users u
               JOIN employees e ON e.id = u."employeeId"
               JOIN employee_assignments ea ON ea."employeeId" = e.id
              WHERE u.id = $1
              ORDER BY ea."isPrimary" DESC NULLS LAST, ea.id DESC
              LIMIT 1`,
            [userId],
          ).catch(() => [null]);
          if (row) assignment = row;
        }
      }
      if (!assignment) {
        logger.warn(`[delivery/internal_inbox] could not resolve address ${addr} to an assignment`);
        continue;
      }
      const rows = await rawQuery<{ id: number }>(
        `INSERT INTO notifications
           ("companyId", "assignmentId", type, title, body, priority,
            "actionUrl", "createdAt", "isRead")
         VALUES ($1::integer, $2::integer, 'document.delivered',
                 $3::varchar, $4::text, 'normal',
                 $5::text, NOW(), false)
         RETURNING id`,
        [
          assignment.companyId,
          assignment.id,
          subject,
          body,
          input.document.jobId ? `/print/jobs/${input.document.jobId}/download` : null,
        ],
      ).catch((err) => {
        logger.error(err as Error, "[delivery/internal_inbox] insert failed");
        return [] as { id: number }[];
      });
      if (rows[0]) messageIds.push(String(rows[0].id));
    }
    if (messageIds.length === 0) {
      return { channel: "internal_inbox", ok: false, error: "no recipients resolved" };
    }
    return {
      channel: "internal_inbox",
      ok: true,
      messageId: messageIds.join(","),
    };
  }
}
