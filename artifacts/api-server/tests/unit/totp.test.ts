import { describe, it, expect } from "vitest";
import {
  hotp,
  totpAt,
  verifyTOTP,
  generateSecret,
  base32Encode,
  base32Decode,
  otpauthURL,
  generateBackupCodes,
  hashBackupCode,
} from "../../src/lib/totp.js";

// السرّ القياسي في RFC 4226/6238: ASCII "12345678901234567890" (20 بايت).
const RFC_SEED = Buffer.from("12345678901234567890", "ascii");

describe("HOTP (RFC 4226) — متجهات Appendix D", () => {
  // القيم القياسية لـ 6 أرقام عند العدّادات 0..9.
  const RFC4226 = [
    "755224", "287082", "359152", "969429", "338314",
    "254676", "287922", "162583", "399871", "520489",
  ];
  it.each(RFC4226.map((code, counter) => [counter, code]))(
    "hotp(counter=%i) === %s",
    (counter, code) => {
      expect(hotp(RFC_SEED, counter as number, 6)).toBe(code);
    },
  );
});

describe("TOTP (RFC 6238) — متجهات Appendix B (SHA-1، 8 أرقام)", () => {
  // الجدول الرسمي: الوقت بالثواني → الكود المتوقّع.
  const RFC6238: Array<[number, string]> = [
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ];
  it.each(RFC6238)("totpAt(t=%i) === %s", (t, code) => {
    expect(totpAt(RFC_SEED, t, 30, 8)).toBe(code);
  });
});

describe("Base32 (RFC 4648)", () => {
  it("encodes the RFC seed to the canonical Base32", () => {
    expect(base32Encode(RFC_SEED)).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  });
  it("round-trips arbitrary bytes", () => {
    const buf = Buffer.from([0, 1, 2, 250, 255, 17, 42, 99]);
    expect(base32Decode(base32Encode(buf)).equals(buf)).toBe(true);
  });
  it("tolerates spaces / lowercase / padding on decode", () => {
    const canon = base32Decode("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(base32Decode("gezd gnbv gy3t qojq gezd gnbv gy3t qojq==").equals(canon)).toBe(true);
  });
});

describe("generateSecret", () => {
  it("returns Base32 of the requested entropy (160-bit → 32 chars)", () => {
    const s = generateSecret(20);
    expect(s).toMatch(/^[A-Z2-7]+$/);
    expect(base32Decode(s).length).toBe(20);
  });
  it("is random each call", () => {
    expect(generateSecret()).not.toBe(generateSecret());
  });
});

describe("verifyTOTP — window + rejection", () => {
  const secret = base32Encode(RFC_SEED);
  const step = 30;
  const t = 1234567890_000; // ms

  it("accepts the current 6-digit code", () => {
    const code = totpAt(RFC_SEED, Math.floor(t / 1000), step, 6);
    expect(verifyTOTP(secret, code, { now: t })).toBe(true);
  });
  it("accepts ±1 step drift (clock skew tolerance)", () => {
    const prev = totpAt(RFC_SEED, Math.floor(t / 1000) - step, step, 6);
    const next = totpAt(RFC_SEED, Math.floor(t / 1000) + step, step, 6);
    expect(verifyTOTP(secret, prev, { now: t })).toBe(true);
    expect(verifyTOTP(secret, next, { now: t })).toBe(true);
  });
  it("rejects a code 2 steps away (outside window)", () => {
    const old = totpAt(RFC_SEED, Math.floor(t / 1000) - 2 * step, step, 6);
    expect(verifyTOTP(secret, old, { now: t })).toBe(false);
  });
  it("rejects garbage / wrong-length / empty", () => {
    expect(verifyTOTP(secret, "000000", { now: t })).toBe(false);
    expect(verifyTOTP(secret, "abc", { now: t })).toBe(false);
    expect(verifyTOTP(secret, "", { now: t })).toBe(false);
  });
});

describe("otpauthURL", () => {
  it("builds a scannable otpauth URI with issuer + secret + SHA1/6/30", () => {
    const url = otpauthURL({ secret: "JBSWY3DPEHPK3PXP", label: "user@x.com", issuer: "Ghayth ERP" });
    expect(url).toMatch(/^otpauth:\/\/totp\//);
    expect(url).toContain("secret=JBSWY3DPEHPK3PXP");
    expect(url).toContain("issuer=Ghayth+ERP");
    expect(url).toContain("algorithm=SHA1");
    expect(url).toContain("digits=6");
    expect(url).toContain("period=30");
  });
});

describe("backup codes", () => {
  it("generates N unique codes in xxxxx-xxxxx form", () => {
    const codes = generateBackupCodes(10);
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(c).toMatch(/^[0-9a-f]{5}-[0-9a-f]{5}$/);
  });
  it("hash is stable and ignores dashes/spaces/case", () => {
    const h = hashBackupCode("ab12c-d34ef");
    expect(h).toBe(hashBackupCode("AB12C D34EF"));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
  it("different codes hash differently", () => {
    expect(hashBackupCode("aaaaa-bbbbb")).not.toBe(hashBackupCode("ccccc-ddddd"));
  });
});
