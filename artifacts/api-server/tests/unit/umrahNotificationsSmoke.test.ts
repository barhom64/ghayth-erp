import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pin the umrah outbound notification helpers. The actual SMS
 * provider is out of scope here — the queue worker in cronScheduler
 * already handles delivery + retry + failover. This module just wires
 * three operational triggers into the shared `sendMessage` seam so
 * the audit trail + DLP + tenant scoping behave identically to every
 * other outbound message.
 */
const NOTIF = readFileSync(
  join(import.meta.dirname!, "../../src/lib/umrahNotifications.ts"),
  "utf8",
);

describe("umrahNotifications — three documented trigger helpers", () => {
  it("notifyVisaExpiringSoon — Arabic body, channel sms, related to pilgrim", () => {
    expect(NOTIF).toMatch(/export async function notifyVisaExpiringSoon\(/);
    expect(NOTIF).toMatch(/channel: "sms"/);
    expect(NOTIF).toMatch(/templateKey: "umrah\.visa\.expiring"/);
    expect(NOTIF).toMatch(/eventAction: "umrah\.notifications\.visa_expiring\.sent"/);
    // Two body variants: already-expired vs days-remaining
    expect(NOTIF).toMatch(/انتهت تأشيرتك/);
    expect(NOTIF).toMatch(/تأشيرتك تنتهي بعد \$\{payload\.daysRemaining\} يوم/);
  });

  it("notifyDepartureReminder — flight + cities optional segments", () => {
    expect(NOTIF).toMatch(/export async function notifyDepartureReminder\(/);
    expect(NOTIF).toMatch(/templateKey: "umrah\.trip\.departure_reminder"/);
    expect(NOTIF).toMatch(/غدًا انطلاق رحلتك/);
    // Optional segments concatenate via array — match the construction
    // pattern rather than a brittle full-string match.
    expect(NOTIF).toMatch(/payload\.flightNumber \? `[^`]*\$\{payload\.flightNumber\}/);
  });

  it("notifyOverstayWarning — single-segment Arabic body", () => {
    expect(NOTIF).toMatch(/export async function notifyOverstayWarning\(/);
    expect(NOTIF).toMatch(/templateKey: "umrah\.pilgrim\.overstay_warning"/);
    expect(NOTIF).toMatch(/تجاوزت مدة الإقامة المسموح بها بـ\$\{payload\.daysOverstayed\} يوم/);
  });

  it("all helpers route through sendMessage (no direct queue INSERT)", () => {
    // The whole point — DLP + audit + provider failover live in
    // sendMessage. A helper that bypasses it would also bypass those.
    expect(NOTIF).toMatch(/import \{ sendMessage \} from "\.\/messageSender\.js"/);
    const sendCalls = NOTIF.match(/sendMessage\(/g) ?? [];
    expect(sendCalls.length).toBeGreaterThanOrEqual(3);
  });

  it("every helper passes companyId + relatedType = umrah_pilgrims (tenant + audit linkage)", () => {
    // Without companyId the seam rejects the send. Without relatedType
    // the inbox can't filter the resulting thread.
    expect(NOTIF.match(/companyId: target\.companyId/g)?.length).toBeGreaterThanOrEqual(3);
    expect(NOTIF.match(/relatedType: "umrah_pilgrims"/g)?.length).toBeGreaterThanOrEqual(3);
    expect(NOTIF.match(/relatedId: target\.pilgrimId/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
