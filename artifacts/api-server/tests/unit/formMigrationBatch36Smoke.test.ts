// regression guard for batch36 — originally PR #479
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Batch 36 — settings/communication-channels-tab (SMS + WhatsApp +
 * Push notifications). 52 of ~280 forms now on FormShell + zod.
 *
 * Three independent FormShells in the same tab, each with its own
 * save flow against PUT /settings/channels. This batch introduces:
 *   - Generic BooleanToggle<TForm> bound via useFormContext+useWatch
 *     so each tab's checkbox lives next to its CardTitle without
 *     breaking the per-section schema.
 *   - SecretField<TForm> wrapping FormTextField with the
 *     "__configured__" sentinel: empty value + configured flag =
 *     server preserves existing token.
 *   - z.boolean() schema fields with string<->boolean coercion at
 *     the API boundary (server stores "true"/"false" strings).
 *
 * §3.4 compliant (inline Cards, no modal).
 */
const ROOT = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src/pages");
const SRC = readFileSync(join(ROOT, "settings/communication-channels-tab.tsx"), "utf8");
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("settings/communication-channels-tab — 3 FormShells on the same tab", () => {
  it("imports the FormShell stack + useFormContext + useWatch", () => {
    expect(SRC).toContain('from "@/components/form-shell"');
    expect(SRC).toContain("FormShell");
    expect(SRC).toContain("FormTextField");
    expect(SRC).toContain("useFormContext, useWatch");
  });

  it("declares three schemas (SMS / WhatsApp / Push) with z.boolean toggles", () => {
    expect(SRC).toContain("smsSchema = z.object(");
    expect(SRC).toContain("whatsappSchema = z.object(");
    expect(SRC).toContain("pushSchema = z.object(");
    expect(SRC).toMatch(/^\s*sms_enabled:\s*z\.boolean\(\)/m);
    expect(SRC).toMatch(/^\s*whatsapp_enabled:\s*z\.boolean\(\)/m);
    expect(SRC).toMatch(/^\s*push_enabled:\s*z\.boolean\(\)/m);
  });

  it("PRESERVE_TOKEN_SENTINEL gates the secret-token retain path", () => {
    expect(SRC).toContain('PRESERVE_TOKEN_SENTINEL = "__configured__"');
    expect(SRC).toMatch(/if \(!values\[key\] && smsTokenConfigured\) payload\[key\] = PRESERVE_TOKEN_SENTINEL/);
    expect(SRC).toMatch(/if \(!values\[key\] && waTokenConfigured\) payload\[key\] = PRESERVE_TOKEN_SENTINEL/);
  });

  it("BooleanToggle is a generic subcomponent reused by all 3 sections", () => {
    // After PR #471's typed-queries cleanup, callers no longer pass
    // the type parameter explicitly — TypeScript infers it from the
    // surrounding FormShell. Verify the generic definition + 3 call
    // sites (each with the right `name` prop).
    expect(SRC).toContain("function BooleanToggle<TForm");
    expect(SRC).toContain('<BooleanToggle name="sms_enabled" />');
    expect(SRC).toContain('<BooleanToggle name="whatsapp_enabled" />');
    expect(SRC).toContain('<BooleanToggle name="push_enabled" />');
  });

  it("SecretField wraps FormTextField with configured-sentinel UX", () => {
    expect(SRC).toContain("function SecretField<TForm");
    expect(SRC).toContain('configured && !value');
    // Both forms (SMS + WhatsApp) use SecretField — names identify
    // which schema each call belongs to.
    expect(SRC).toContain('name="sms_auth_token"');
    expect(SRC).toContain('name="whatsapp_access_token"');
  });

  it("save() normalises booleans to 'true'/'false' strings for the server", () => {
    expect(SRC).toMatch(/typeof v === "boolean" \? \(v \? "true" : "false"\)/);
  });

  it("removes the useEffect → setForm hydration round-trip", () => {
    expect(stripComments(SRC)).not.toMatch(/useEffect\(\(\) => \{\s*if \(settings\)/);
    expect(stripComments(SRC)).not.toMatch(/useState\(\{\s*sms_account_sid:\s*""/);
    expect(stripComments(SRC)).not.toMatch(/setSmsTokenConfigured\(/);
  });

  it("each FormShell uses a stable remount key tied to its defaults", () => {
    expect(SRC).toMatch(/key=\{`sms-\$\{JSON\.stringify\(smsDefaults\)\}`\}/);
    expect(SRC).toMatch(/key=\{`wa-\$\{JSON\.stringify\(waDefaults\)\}`\}/);
    expect(SRC).toMatch(/key=\{`push-\$\{JSON\.stringify\(pushDefaults\)\}`\}/);
  });

  it("Input + Save imports DROPPED — FormShell renders submit + inputs", () => {
    expect(SRC).not.toContain('from "@/components/ui/input"');
    expect(SRC).not.toMatch(/import \{[^}]*\bSave\b/);
  });

  it("stays inline Cards — §3.4 (no modal)", () => {
    expect(SRC).not.toMatch(/<Dialog\b/);
  });
});
