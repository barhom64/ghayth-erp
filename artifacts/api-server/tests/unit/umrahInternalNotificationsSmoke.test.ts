import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pin the umrah in-app notification pivot:
 *
 *   Originally the umrah alert helpers (#1779 / #1792) shipped to SMS
 *   via Twilio. The agency owner clarified: the platform already has
 *   an in-app `notifications` table (the bell icon) and that's where
 *   these alerts belong. SMS is a separate channel; for now the
 *   pilgrim-events stay internal.
 *
 *   This test pins:
 *     1. `lib/umrahInternalNotifications.ts` — three helpers that
 *        wrap `createNotification` with sensible defaults for each
 *        umrah event type, deep-linking to the pilgrim detail page.
 *     2. Cron handlers in `lib/cronScheduler.ts` call the internal
 *        helpers, not the SMS ones.
 *     3. POST /umrah/notifications/test fires an in-app notification
 *        to the caller (not an SMS to a phone).
 *     4. The settings card copy says "إشعار" (notification), not
 *        "SMS", and the test button has no phone input.
 */
const NOTIF = readFileSync(
  join(import.meta.dirname!, "../../src/lib/umrahInternalNotifications.ts"),
  "utf8",
);
const CRON = readFileSync(
  join(import.meta.dirname!, "../../src/lib/cronScheduler.ts"),
  "utf8",
);
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah.ts"),
  "utf8",
);
const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/settings.tsx"),
  "utf8",
);

describe("umrahInternalNotifications — three documented helpers", () => {
  it("exports notifyInternalVisaExpiring routing to createNotification", () => {
    expect(NOTIF).toMatch(/export async function notifyInternalVisaExpiring\(/);
    expect(NOTIF).toMatch(/createNotification\(\{/);
    // Deep-link to the pilgrim detail page so a click opens the row.
    expect(NOTIF).toMatch(/actionUrl: `\/umrah\/pilgrims\/\$\{ctx\.pilgrimId\}`/);
  });

  it("exports notifyInternalDepartureTomorrow with the flight number in the body", () => {
    expect(NOTIF).toMatch(/export async function notifyInternalDepartureTomorrow\(/);
    expect(NOTIF).toMatch(/payload\.flightNumber \? ` على رحلة \$\{payload\.flightNumber\}`/);
  });

  it("exports notifyInternalOverstayWarning with urgent priority", () => {
    expect(NOTIF).toMatch(/export async function notifyInternalOverstayWarning\(/);
    expect(NOTIF).toMatch(/priority: "urgent"/);
  });

  it("resolveInternalRecipients collects branch manager + GM + owner", () => {
    expect(NOTIF).toMatch(/export async function resolveInternalRecipients\(/);
    expect(NOTIF).toMatch(/getManagerAssignmentId\(ctx\.companyId/);
    expect(NOTIF).toMatch(/role IN \('general_manager', 'owner'\)/);
  });

  it("each helper sets refType = umrah_pilgrims for inbox filtering", () => {
    const matches = NOTIF.match(/refType: "umrah_pilgrims"/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });
});

describe("cron handlers route through the internal helpers, not SMS", () => {
  it("visa expiry cron imports notifyInternalVisaExpiring (not notifyVisaExpiringSoon)", () => {
    // The legacy SMS import is gone; the internal helper takes over.
    // U-17-P4 added a sibling import for resolveInternalRecipients in
    // the same destructure, so the regex tolerates an optional
    // comma-separated second binding before the closing brace.
    expect(CRON).toMatch(
      /notifyInternalVisaExpiring(?:,\s*\w+)?\s*\} = await import\("\.\/umrahInternalNotifications\.js"\)/,
    );
  });

  it("departure cron renamed: umrah_departure_reminder_notify (no _sms)", () => {
    expect(CRON).toMatch(/name: "umrah_departure_reminder_notify"/);
    expect(CRON).toMatch(/notifyInternalDepartureTomorrow \} = await import/);
  });

  it("overstay cron renamed: umrah_overstay_warning_notify", () => {
    expect(CRON).toMatch(/name: "umrah_overstay_warning_notify"/);
    expect(CRON).toMatch(/notifyInternalOverstayWarning \} = await import/);
  });

  it("cron return strings use 'إشعار' not 'SMS' / 'رسالة'", () => {
    // Confirms the operator-facing log line speaks the right language.
    expect(CRON).toMatch(/تنبيهات انتهاء التأشيرات[\s\S]{0,200}أُرسل \$\{notifSent\} إشعار داخلي/);
    expect(CRON).toMatch(/تذكير الرحيل[\s\S]{0,200}أُرسل \$\{sent\} إشعار/);
    expect(CRON).toMatch(/تنبيه التجاوز[\s\S]{0,200}أُرسل \$\{sent\} إشعار/);
  });
});

describe("POST /umrah/notifications/test", () => {
  it("fires an in-app notification to the operator's own assignment (no phone)", () => {
    expect(ROUTE).toMatch(/router\.post\("\/notifications\/test"/);
    // No phone input — the test target is the caller's own
    // employee_assignment.
    expect(ROUTE).toMatch(/SELECT ea\.id FROM employee_assignments ea[\s\S]{0,200}u\.id = \$1/);
    expect(ROUTE).toMatch(/createNotification \} = await import\("\.\.\/lib\/businessHelpers\.js"\)/);
    expect(ROUTE).toMatch(/title: "🔔 إشعار تجريبي من نظام العمرة"/);
  });

  it("returns 422 when the caller has no active assignment", () => {
    expect(ROUTE).toMatch(/throw new ValidationError\("ليس لديك تكليف موظف نشط/);
  });

  it("emits umrah.notifications.test.sent for the audit trail", () => {
    expect(ROUTE).toMatch(/action: "umrah\.notifications\.test\.sent"/);
  });
});

describe("Settings page — UmrahNotificationsCard copy + UI", () => {
  it("uses 'إشعار' wording in the description, not 'SMS'", () => {
    expect(PAGE).toMatch(/إشعار للمدير قبل ٧ أيام/);
    expect(PAGE).toMatch(/إشعار للمدير مساء كل يوم/);
    expect(PAGE).toMatch(/إشعار يومي للمدير/);
    expect(PAGE).not.toMatch(/SMS للمعتمر/);
  });

  it("card title says 'إشعارات تلقائية للمدير'", () => {
    expect(PAGE).toMatch(/إشعارات تلقائية للمدير/);
  });

  it("test button calls POST /umrah/notifications/test (no phone input)", () => {
    expect(PAGE).toMatch(/apiFetch\("\/umrah\/notifications\/test", \{ method: "POST" \}\)/);
    // Phone input + test-phone testid are gone — the previous SMS flow
    // is fully removed from this card.
    expect(PAGE).not.toContain('data-testid="notify-test-phone"');
  });

  it("flag toggles still wired (no regression on the opt-in switches)", () => {
    expect(PAGE).toMatch(/key: "umrah\.notify\.visa_expiry"/);
    expect(PAGE).toMatch(/key: "umrah\.notify\.departure_reminder"/);
    expect(PAGE).toMatch(/key: "umrah\.notify\.overstay_warning"/);
    expect(PAGE).toMatch(/key: "umrah\.auto_penalty\.enabled"/);
  });

  it("doesn't link to /settings/communication-channels anymore (SMS provider not needed)", () => {
    expect(PAGE).not.toMatch(/href="\/settings\/communication-channels"/);
  });
});
