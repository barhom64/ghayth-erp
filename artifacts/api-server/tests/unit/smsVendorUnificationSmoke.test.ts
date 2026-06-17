import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * SMS provider unification into the vendor_secrets hub.
 *
 * SMS used to be configured ONLY through the per-company system_settings
 * key-value table, with no operator UI — an orphaned config path versus
 * Email + WhatsApp (which live in vendor_secrets + /admin/vendor-settings).
 * This slice adds SMS to that same hub. These source-level assertions lock
 * the wiring in so a future refactor can't silently re-orphan it.
 */
const here = dirname(fileURLToPath(import.meta.url));
const apiSrc = join(here, "..", "..", "src");
const feSrc = join(here, "..", "..", "..", "ghayth-erp", "src");
const read = (p: string) => readFileSync(p, "utf8");

describe("SMS provider unification (vendor_secrets hub)", () => {
  it("registers 'sms' as a managed vendor slug", () => {
    const s = read(join(apiSrc, "lib", "vendorSettings.ts"));
    expect(s).toMatch(/VendorSlug[\s\S]*\|\s*"sms"/);
  });

  it("boot-seed and cache-warm both include the sms slug", () => {
    const s = read(join(apiSrc, "lib", "vendorSettings.ts"));
    // ensureVendorSecretsSeed row
    expect(s).toContain("('sms', 'SMS (Twilio)'");
    // warmVendorSettingsCache slug list
    expect(s).toMatch(/warmVendorSettingsCache[\s\S]*"sms"/);
  });

  it("ships an idempotent migration seeding the sms vendor_secrets row", () => {
    const mig = join(apiSrc, "migrations", "385_seed_sms_vendor_secret.sql");
    expect(existsSync(mig)).toBe(true);
    const s = read(mig);
    expect(s).toContain("'sms'");
    expect(s).toContain("ON CONFLICT (slug) DO NOTHING");
  });

  it("SMS cron worker reads vendor_secrets as a fallback, per-company creds first", () => {
    const s = read(join(apiSrc, "lib", "cronScheduler.ts"));
    expect(s).toContain('getVendorConfig("sms")');
    // Resolves per-row creds with system_settings precedence over the vendor card.
    expect(s).toMatch(/const accountSid =[\s\S]*vendorSid/);
    expect(s).toMatch(/const authToken =[\s\S]*vendorToken/);
    expect(s).toMatch(/const fromNumber =[\s\S]*vendorFrom/);
  });

  it("admin vendor-settings UI has an SMS card", () => {
    const s = read(join(feSrc, "pages", "admin-vendor-settings.tsx"));
    expect(s).toMatch(/"sms":\s*\{/);
    expect(s).toContain('key: "accountSid"');
    expect(s).toContain('key: "authToken"');
    expect(s).toContain('key: "fromNumber"');
  });

  it("vendor-settings test endpoint has a Twilio connectivity probe for sms", () => {
    const s = read(join(apiSrc, "routes", "admin-vendor-settings.ts"));
    expect(s).toMatch(/case "sms":/);
    // Validates creds via a GET on the Account resource — never sends an SMS.
    expect(s).toContain("api.twilio.com/2010-04-01/Accounts/");
    expect(s).toContain("Account SID و Auth Token");
  });
});
