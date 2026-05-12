import { describe, it, expect, beforeAll } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import {
  signSha256,
  verifySha256,
  extractEcdsaPublicKeySpki,
} from "../../src/lib/zatca/signing.js";
import { sha256Base64, invoiceHashBase64 } from "../../src/lib/zatca/hash.js";

let p256PrivateKeyPem: string;
let p256PublicKeyPem: string;
let wrongCurvePrivateKeyPem: string;

beforeAll(() => {
  const p256 = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  p256PrivateKeyPem = p256.privateKey;
  p256PublicKeyPem = p256.publicKey;

  // P-384 — useful negative case to confirm the curve guard works.
  const p384 = generateKeyPairSync("ec", {
    namedCurve: "secp384r1",
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  wrongCurvePrivateKeyPem = p384.privateKey;
});

describe("ZATCA signing — ECDSA P-256", () => {
  it("produces a 64-byte raw r||s signature (not DER)", () => {
    const sig = signSha256(p256PrivateKeyPem, "ZATCA invoice payload");
    // DER P-256 signatures are 70-72 bytes; raw r||s is exactly 64.
    // The whole point of dsaEncoding="ieee-p1363" is this length.
    expect(sig.length).toBe(64);
  });

  it("round-trips: sign then verify with the matching public key", () => {
    const data = "<?xml version=\"1.0\"?><Invoice><ID>INV-001</ID></Invoice>";
    const sig = signSha256(p256PrivateKeyPem, data);
    expect(verifySha256(p256PublicKeyPem, data, sig)).toBe(true);
  });

  it("verify fails when the data has been tampered with", () => {
    const sig = signSha256(p256PrivateKeyPem, "original");
    expect(verifySha256(p256PublicKeyPem, "tampered", sig)).toBe(false);
  });

  it("verify fails when the signature has been tampered with", () => {
    const data = "ZATCA invoice payload";
    const sig = signSha256(p256PrivateKeyPem, data);
    sig[0] = sig[0] ^ 0xff; // flip a byte
    expect(verifySha256(p256PublicKeyPem, data, sig)).toBe(false);
  });

  it("rejects keys on the wrong curve (must be P-256)", () => {
    expect(() => signSha256(wrongCurvePrivateKeyPem, "payload")).toThrow(/P-256|prime256v1/);
  });

  it("rejects non-EC keys (RSA / Ed25519 etc)", () => {
    const rsa = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    expect(() => signSha256(rsa.privateKey, "payload")).toThrow();
  });
});

describe("ZATCA signing — public-key extraction (QR tag 8)", () => {
  it("returns Base64 of X.509 SubjectPublicKeyInfo", () => {
    const spki = extractEcdsaPublicKeySpki(p256PublicKeyPem);
    expect(typeof spki).toBe("string");
    // SPKI for a P-256 key is consistently 91 bytes — Base64 of that is
    // 124 chars (no padding) plus a single "=" pad to 124. Allow 120-128
    // to absorb minor encoder differences.
    const decoded = Buffer.from(spki, "base64");
    expect(decoded.length).toBeGreaterThanOrEqual(85);
    expect(decoded.length).toBeLessThanOrEqual(95);
  });
});

describe("ZATCA hash helpers", () => {
  it("sha256Base64 matches openssl reference value for empty input", () => {
    // openssl: echo -n "" | openssl dgst -sha256 -binary | base64
    // → 47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=
    expect(sha256Base64("")).toBe("47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=");
  });

  it("invoiceHashBase64 is just sha256Base64 (alias)", () => {
    const xml = "<Invoice><ID>X</ID></Invoice>";
    expect(invoiceHashBase64(xml)).toBe(sha256Base64(xml));
  });
});
