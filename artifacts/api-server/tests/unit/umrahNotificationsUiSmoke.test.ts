import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pin the SMS notification opt-in + provider config UI:
 *
 *   1. cronScheduler.ts — three umrah SMS handlers wired to the
 *      existing `notifyVisaExpiringSoon` / `notifyDepartureReminder` /
 *      `notifyOverstayWarning` helpers (#1779). Each gated by a
 *      per-company setting so a fresh tenant doesn't auto-blast SMS.
 *
 *   2. POST /umrah/notifications/test-sms — operator can verify the
 *      Twilio config from the settings page without forcing a real
 *      pilgrim row through the pipeline.
 *
 *   3. Settings page card — toggles for the three notify flags + the
 *      auto-penalty flag + a test-SMS form. Links to the existing
 *      communication-channels page where the operator configures the
 *      Twilio credentials.
 */
const CRON = readFileSync(
  join(import.meta.dirname!, "../../src/lib/cronScheduler.ts"),
  "utf8",
);
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah.ts"),
  "utf8",
);
const SETTINGS_PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/settings.tsx"),
  "utf8",
);

describe("cron — umrah SMS triggers", () => {
  it("visa-expiry cron calls notifyVisaExpiringSoon when opt-in flag is set", () => {
    expect(CRON).toMatch(/notifyVisaExpiringSoon \} = await import\("\.\/umrahNotifications\.js"\)/);
    expect(CRON).toMatch(/resolveSettings\("umrah\.notify\.visa_expiry", c\.id\)/);
    expect(CRON).toMatch(/await notifyVisaExpiringSoon\(/);
  });

  it("departure reminder cron exists + opt-in + 18:00 daily schedule", () => {
    expect(CRON).toMatch(/async function umrahDepartureReminderSms\(\): Promise<string>/);
    expect(CRON).toMatch(/resolveSettings\("umrah\.notify\.departure_reminder", c\.id\)/);
    expect(CRON).toMatch(/name: "umrah_departure_reminder_sms"[\s\S]{0,200}schedule: "0 18 \* \* \*"/);
    // Tomorrow's arrivals — pending pilgrims with phone + arrivalDate
    // exactly tomorrow.
    expect(CRON).toMatch(/p\."arrivalDate" = CURRENT_DATE \+ INTERVAL '1 day'/);
  });

  it("overstay warning cron exists + opt-in + honours overstayExempt", () => {
    expect(CRON).toMatch(/async function umrahOverstayWarningSms\(\): Promise<string>/);
    expect(CRON).toMatch(/resolveSettings\("umrah\.notify\.overstay_warning", c\.id\)/);
    expect(CRON).toMatch(/AND NOT COALESCE\(p\."overstayExempt", false\)/);
    expect(CRON).toMatch(/name: "umrah_overstay_warning_sms"/);
  });

  it("all three crons share the truthy-flag pattern (no false-positive enable)", () => {
    // Each opt-in compares against `true`, `"true"`, or `1` only.
    // Other values (default `undefined`) keep the cron silent — the
    // same backward-compat guarantee the auto-penalty cron uses.
    expect(CRON).toMatch(/flag = flagRaw === true \|\| flagRaw === "true" \|\| flagRaw === 1/);
  });
});

describe("POST /umrah/notifications/test-sms", () => {
  it("validates phone length + sends via the shared sendMessage seam", () => {
    expect(ROUTE).toMatch(/router\.post\("\/notifications\/test-sms"/);
    expect(ROUTE).toMatch(/phone: z\.string\(\)\.min\(5, "رقم الهاتف غير صحيح"\)/);
    expect(ROUTE).toMatch(/sendMessage \} = await import\("\.\.\/lib\/messageSender\.js"\)/);
    expect(ROUTE).toMatch(/channel: "sms"/);
  });

  it("emits a distinct event so the audit trail surfaces test sends separately", () => {
    expect(ROUTE).toMatch(/eventAction: "umrah\.notifications\.test_sms\.sent"/);
    expect(ROUTE).toMatch(/templateKey: "umrah\.test_sms"/);
  });

  it("response surfaces blocked + reason so the UI can show DLP rejections", () => {
    expect(ROUTE).toMatch(/blocked: result\.blocked/);
    expect(ROUTE).toMatch(/reason: result\.reason/);
  });
});

describe("Settings page — UmrahNotificationsCard", () => {
  it("declares the four toggle keys with Arabic labels", () => {
    expect(SETTINGS_PAGE).toMatch(/key: "umrah\.notify\.visa_expiry"/);
    expect(SETTINGS_PAGE).toMatch(/key: "umrah\.notify\.departure_reminder"/);
    expect(SETTINGS_PAGE).toMatch(/key: "umrah\.notify\.overstay_warning"/);
    expect(SETTINGS_PAGE).toMatch(/key: "umrah\.auto_penalty\.enabled"/);
    expect(SETTINGS_PAGE).toMatch(/تنبيه انتهاء التأشيرة/);
    expect(SETTINGS_PAGE).toMatch(/تذكير الرحيل غدًا/);
    expect(SETTINGS_PAGE).toMatch(/تنبيه تجاوز مدة الإقامة/);
  });

  it("reads each flag via /settings/resolve + writes via PUT /settings", () => {
    expect(SETTINGS_PAGE).toMatch(/\/settings\/resolve\?key=/);
    expect(SETTINGS_PAGE).toMatch(/apiFetch\("\/settings",\s*\{\s*method: "PUT"/);
  });

  it("links the operator to the existing communication-channels page", () => {
    expect(SETTINGS_PAGE).toMatch(/href="\/settings\/communication-channels"/);
    expect(SETTINGS_PAGE).toMatch(/إعدادات قنوات الاتصال/);
  });

  it("test-SMS input + button wire to /umrah/notifications/test-sms", () => {
    expect(SETTINGS_PAGE).toContain('data-testid="notify-test-phone"');
    expect(SETTINGS_PAGE).toContain('data-testid="notify-test-send"');
    expect(SETTINGS_PAGE).toMatch(/\/umrah\/notifications\/test-sms/);
  });

  it("each row has stable testids for e2e (one per setting key)", () => {
    expect(SETTINGS_PAGE).toMatch(/data-testid=\{`notify-toggle-\$\{k\.key\}`\}/);
    expect(SETTINGS_PAGE).toMatch(/data-testid=\{`notify-row-\$\{k\.key\}`\}/);
  });
});
