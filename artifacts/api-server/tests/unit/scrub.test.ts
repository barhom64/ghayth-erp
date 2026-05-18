import { describe, it, expect } from "vitest";
import { scrubSensitive, isSensitiveKey } from "../../src/lib/observability/scrub.js";

describe("scrubSensitive", () => {
  it("redacts every documented secret-shaped key", () => {
    const payload = {
      password: "p",
      passwordHash: "h",
      oldPassword: "o",
      newPassword: "n",
      apiKey: "k",
      secret: "s",
      clientSecret: "cs",
      token: "t",
      accessToken: "a",
      refreshToken: "r",
      authorization: "Bearer xyz",
      cookie: "erp_access=...",
      nationalId: "1",
      iqamaNumber: "2",
      passportNumber: "3",
      iban: "SA00",
      bankAccount: "x",
      creditCard: "4111",
      cvv: "123",
    };
    const out = scrubSensitive(payload);
    for (const k of Object.keys(payload)) {
      expect((out as Record<string, unknown>)[k]).toBe("[REDACTED]");
    }
  });

  it("is case-insensitive on key names", () => {
    expect(scrubSensitive({ Password: "x", IBAN: "y" })).toEqual({
      Password: "[REDACTED]",
      IBAN: "[REDACTED]",
    });
  });

  it("recurses into nested objects and arrays", () => {
    const out = scrubSensitive({
      user: { id: 1, password: "p", profile: { iban: "SA" } },
      list: [{ token: "t" }, { ok: 1 }],
      // as-any-reason: justified-test - scrubSensitive returns unknown; test asserts on dynamic shape of nested redacted payload
    }) as any;
    expect(out.user.id).toBe(1);
    expect(out.user.password).toBe("[REDACTED]");
    expect(out.user.profile.iban).toBe("[REDACTED]");
    expect(out.list[0].token).toBe("[REDACTED]");
    expect(out.list[1].ok).toBe(1);
  });

  it("leaves non-sensitive primitives untouched", () => {
    expect(scrubSensitive({ a: 1, b: "hi", c: true, d: null })).toEqual({
      a: 1, b: "hi", c: true, d: null,
    });
  });

  it("isSensitiveKey returns true for known keys", () => {
    expect(isSensitiveKey("Password")).toBe(true);
    expect(isSensitiveKey("nationalId")).toBe(true);
    expect(isSensitiveKey("foo")).toBe(false);
  });

  it("bounds recursion depth without throwing", () => {
    const root: any = { token: "t" };
    let cur = root;
    for (let i = 0; i < 50; i++) {
      cur.next = { password: "p" };
      cur = cur.next;
    }
    const out: any = scrubSensitive(root);
    expect(out.token).toBe("[REDACTED]");
  });
});
