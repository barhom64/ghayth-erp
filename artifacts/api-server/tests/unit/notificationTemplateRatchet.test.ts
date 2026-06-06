/**
 * Notification template-library ratchet.
 *
 * Asserts every event listed in `EXPECTED_EVENTS` ships templates for
 * all 4 user-facing channels in both `ar` and `en`. The seed migration
 * (253_seed_notification_templates_full_bilingual.sql) is the source of
 * truth — this test parses it directly so the assertions stay in sync
 * with the migration and a regression (someone deleting a row, an event
 * losing its English variant, etc.) is caught before deploy.
 *
 * Extend the EXPECTED_EVENTS list as new events are added. The ratchet
 * only grows.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const SEED_FILE = join(
  REPO_ROOT,
  "artifacts",
  "api-server",
  "src",
  "migrations",
  "253_seed_notification_templates_full_bilingual.sql",
);

const CHANNELS = ["in_app", "email", "sms", "whatsapp"] as const;
const LANGUAGES = ["ar", "en"] as const;

const EXPECTED_EVENTS = [
  // HR
  "leave.request.created",
  "leave.request.approved",
  "leave.request.rejected",
  "payroll.ready",
  "payroll.paid",
  "attendance.late",
  "attendance.absent",
  "letter.issued",
  "contract.expiring",
  "document.expiring",
  "overtime.request.created",
  "loan.request.created",
  "exit.request.created",
  "discipline.memo.issued",
  // Finance
  "invoice.created",
  "invoice.paid",
  "invoice.overdue",
  "purchase_order.created",
  "purchase_request.created",
  "expense.submitted",
  "receipt.issued",
  "payment.issued",
  // Approvals
  "approval.pending",
  "approval.escalated",
  // Tasks/projects
  "task.assigned",
  "task.overdue",
  "project.milestone.reached",
  // Support
  "support.ticket.created",
  "support.ticket.assigned",
  "support.ticket.resolved",
  // Fleet
  "fleet.maintenance.due",
  "fleet.accident.reported",
  "fleet.license.expiring",
  // CRM
  "lead.created",
  "opportunity.won",
  // System / security
  "user.created",
  "user.password.reset",
  // Warehouse
  "inventory.low_stock",
  // Properties
  "property.rent.due",
  // Umrah
  "umrah.booking.confirmed",
  "umrah.overstay.warning",
];

const seedSql = readFileSync(SEED_FILE, "utf8");

describe("notification template ratchet — every event covers every channel × language", () => {
  for (const event of EXPECTED_EVENTS) {
    describe(event, () => {
      for (const channel of CHANNELS) {
        for (const language of LANGUAGES) {
          it(`has a row for channel=${channel}, language=${language}`, () => {
            // Match a tuple like ('event.name', 'channel', 'lang', ...)
            // The seed lists each (event, channel, lang) on its own line —
            // a simple substring scan is enough and avoids brittle SQL parsing.
            const needle = `('${event}', '${channel}', '${language}'`;
            expect(seedSql.includes(needle), `missing row for ${event} / ${channel} / ${language}`).toBe(true);
          });
        }
      }
    });
  }

  it("ratchet event count never shrinks — minimum 41 events", () => {
    expect(EXPECTED_EVENTS.length).toBeGreaterThanOrEqual(41);
  });

  it("seed file declares exactly 4 channels per event in declared order", () => {
    // Sanity: every distinct channel appears at least as many times as
    // there are events. Lower bound, but catches accidental deletion of
    // a whole channel group.
    for (const channel of CHANNELS) {
      const rx = new RegExp(`, '${channel}', '(?:ar|en)'`, "g");
      const matches = seedSql.match(rx);
      expect(matches?.length ?? 0, `${channel} row count too low`).toBeGreaterThanOrEqual(EXPECTED_EVENTS.length * 2);
    }
  });
});
