import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHmac } from "node:crypto";
import { computeTwilioSignature, verifyTwilioSignature } from "../../src/routes/communications-sms-webhook.js";

/**
 * SMS inbound webhook (Twilio) — signature verification + public wiring.
 *
 * The webhook is anonymous (Twilio carries no ERP JWT), so its only gate is
 * the X-Twilio-Signature HMAC check. These tests pin that logic and the
 * public mount so a refactor can't silently weaken either.
 */
describe("Twilio inbound signature", () => {
  const authToken = "test_auth_token_0123456789";
  const url = "https://app.example.com/api/communications/sms/webhook";
  const params = { To: "+14155550000", From: "+14155551111", Body: "مرحبا", AccountSid: "ACxxxx" };

  it("computes the canonical signature: url + params concatenated in sorted key order", () => {
    // Reference implementation per Twilio's spec, independently here.
    let data = url;
    for (const k of Object.keys(params).sort()) data += k + String((params as Record<string, unknown>)[k]);
    const expected = createHmac("sha1", authToken).update(Buffer.from(data, "utf8")).digest("base64");
    expect(computeTwilioSignature(url, params, authToken)).toBe(expected);
  });

  it("verifies a correctly-signed request", () => {
    const sig = computeTwilioSignature(url, params, authToken);
    expect(verifyTwilioSignature(url, params, sig, authToken)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const sig = computeTwilioSignature(url, params, authToken);
    const tampered = { ...params, Body: "forged" };
    expect(verifyTwilioSignature(url, tampered, sig, authToken)).toBe(false);
  });

  it("rejects a wrong auth token", () => {
    const sig = computeTwilioSignature(url, params, authToken);
    expect(verifyTwilioSignature(url, params, sig, "wrong_token")).toBe(false);
  });

  it("fails closed on a missing signature or missing token", () => {
    const sig = computeTwilioSignature(url, params, authToken);
    expect(verifyTwilioSignature(url, params, "", authToken)).toBe(false);
    expect(verifyTwilioSignature(url, params, sig, "")).toBe(false);
  });
});

describe("SMS inbound webhook wiring", () => {
  const idx = readFileSync(join(import.meta.dirname!, "../../src/routes/index.ts"), "utf8");

  it("mounts the SMS webhook router BEFORE authMiddleware (anonymous reachable)", () => {
    const mountPos = idx.indexOf("communicationsSmsWebhookRouter)");
    const authPos = idx.indexOf("router.use(authMiddleware)");
    expect(mountPos).toBeGreaterThan(-1);
    expect(authPos).toBeGreaterThan(-1);
    expect(mountPos).toBeLessThan(authPos);
  });

  it("lands inbound SMS in message_log (not communications_log) so it reaches the inbox", () => {
    const route = readFileSync(join(import.meta.dirname!, "../../src/routes/communications-sms-webhook.ts"), "utf8");
    expect(route).toContain("INSERT INTO message_log");
    expect(route).toContain("'sms', 'inbound'");
    expect(route).not.toContain("INSERT INTO communications_log");
  });
});
