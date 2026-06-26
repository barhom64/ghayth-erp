/**
 * Spec ملف 03 §تحصيل 6 مراحل (السطر 46-47):
 *   - يوم 1  → SMS وإيميل للعميل
 *   - يوم 7  → إيميل ثاني للعميل + إشعار المحاسب الداخلي
 *
 * Before this slice, dailyInvoiceOverdueEscalation only emitted in_app
 * alerts to internal staff via broadcastAlert — it never told the CLIENT
 * the invoice was overdue. This test pins the source-level wiring so a
 * regression can't silently turn it off:
 *
 *   1. The cron pulls the client's email + phone (so dispatchNotification
 *      has somewhere to send to).
 *   2. A day-1 phase ("first_reminder") exists.
 *   3. Days 1 and 7 invoke dispatchNotification with the invoice.overdue
 *      templateKey + invoice.overdue eventCategory (so the seeded routing
 *      rule + templates from migration 256/253 actually deliver).
 *   4. The internal broadcastAlert path is preserved (not regressed).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(
  join(import.meta.dirname!, "..", "..", "src", "lib", "cronScheduler.ts"),
  "utf8",
);

function section(marker: string, len = 4000): string {
  const idx = SRC.indexOf(marker);
  return idx === -1 ? "" : SRC.slice(idx, idx + len);
}

describe("Invoice overdue → client SMS/email reminders (spec ملف 03)", () => {
  const cron = section("async function dailyInvoiceOverdueEscalation");

  it("the cron handler exists", () => {
    expect(cron).toContain("dailyInvoiceOverdueEscalation");
  });

  it("imports dispatchNotification from the unified engine", () => {
    expect(SRC).toMatch(/import\s*\{[^}]*dispatchNotification[^}]*\}\s*from\s*"\.\/notificationDispatch\.js"/);
  });

  it("selects client email + phone (so the engine has somewhere to send to)", () => {
    expect(cron).toContain('c.email AS "clientEmail"');
    expect(cron).toContain('c.phone AS "clientPhone"');
  });

  it("adds a day-1 reminder phase (spec calls for SMS+email on day 1)", () => {
    expect(cron).toContain('first_reminder');
    expect(cron).toMatch(/days\s*>=\s*1/);
  });

  it("dispatches the unified notification on day 1 AND day 7", () => {
    // The condition gates the dispatch; we check both literals + the call
    expect(cron).toMatch(/days\s*===\s*1\s*\|\|\s*days\s*===\s*7/);
    expect(cron).toContain("dispatchNotification({");
  });

  it("uses the seeded invoice.overdue template + eventCategory", () => {
    expect(cron).toContain('eventCategory: "invoice.overdue"');
    expect(cron).toContain('templateKey: "invoice.overdue"');
  });

  it("passes the templateVars the seeded template expects (invoiceRef, days, amount)", () => {
    expect(cron).toContain("invoiceRef:");
    expect(cron).toContain("days:");
    expect(cron).toContain("amount:");
  });

  it("internal broadcastAlert path is preserved (no regression)", () => {
    expect(cron).toContain('broadcastAlert');
    expect(cron).toContain('"invoice_overdue"');
  });
});
