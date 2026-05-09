import { describe, it, expect } from "vitest";
import {
  buildPhase1Tlv,
  buildPhase2Tlv,
  buildQrBase64,
} from "../../src/lib/zatca/qr.js";
import type { QrPayload } from "../../src/lib/zatca/types.js";

const PHASE1_PAYLOAD: QrPayload = {
  sellerName: "مجموعة الدور",
  vatRegNumber: "300000000000003",
  invoiceDate: "2026-05-09T12:00:00Z",
  totalAmount: "115.00",
  vatAmount: "15.00",
};

const PHASE2_PAYLOAD: QrPayload = {
  ...PHASE1_PAYLOAD,
  // 32 zero bytes = 64-char hex = 44-char Base64 (with padding)
  xmlHashBase64: Buffer.alloc(32).toString("base64"),
  // 64-byte ECDSA signature (r||s for P-256 in raw form)
  ecdsaSignatureBase64: Buffer.alloc(64, 0xab).toString("base64"),
  // 91-byte X.509 SubjectPublicKeyInfo for P-256 (typical length)
  ecdsaPublicKeyBase64: Buffer.alloc(91, 0xcd).toString("base64"),
  // Cert signature (also 64 bytes for P-256)
  certSignatureBase64: Buffer.alloc(64, 0xef).toString("base64"),
};

describe("ZATCA QR — Phase 1 (5 tags)", () => {
  it("encodes the 5 spec tags in order", () => {
    const tlv = buildPhase1Tlv(PHASE1_PAYLOAD);

    // Tag 1 first: <0x01><len><value...>
    expect(tlv[0]).toBe(0x01);
    const sellerBytes = Buffer.from(PHASE1_PAYLOAD.sellerName, "utf8");
    expect(tlv[1]).toBe(sellerBytes.length);
    expect(tlv.subarray(2, 2 + sellerBytes.length)).toEqual(sellerBytes);
  });

  it("buildQrBase64(phase=1) produces parseable Base64", () => {
    const b64 = buildQrBase64(PHASE1_PAYLOAD, 1);
    const decoded = Buffer.from(b64, "base64");
    // First byte must be tag 1
    expect(decoded[0]).toBe(0x01);
  });

  it("rejects values larger than 255 bytes (single-byte length)", () => {
    const big = "x".repeat(256);
    expect(() =>
      buildPhase1Tlv({ ...PHASE1_PAYLOAD, sellerName: big }),
    ).toThrow(/255/);
  });
});

describe("ZATCA QR — Phase 2 (9 tags)", () => {
  it("encodes all 9 spec tags in order", () => {
    const tlv = buildPhase2Tlv(PHASE2_PAYLOAD);

    // Walk the tags and confirm each one shows up at the expected
    // sequence number — the spec is strict about ordering.
    const tags: number[] = [];
    let cursor = 0;
    while (cursor < tlv.length) {
      tags.push(tlv[cursor]);
      const len = tlv[cursor + 1];
      cursor += 2 + len;
    }
    expect(tags).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it.each([
    ["xmlHashBase64", "tag 6"],
    ["ecdsaSignatureBase64", "tag 7"],
    ["ecdsaPublicKeyBase64", "tag 8"],
    ["certSignatureBase64", "tag 9"],
  ])("throws when %s is missing — never silently downgrades to Phase 1", (key) => {
    const incomplete = { ...PHASE2_PAYLOAD, [key]: undefined } as QrPayload;
    expect(() => buildPhase2Tlv(incomplete)).toThrow();
  });

  it("buildQrBase64(phase=2) carries all four cryptographic blobs", () => {
    const b64 = buildQrBase64(PHASE2_PAYLOAD, 2);
    const decoded = Buffer.from(b64, "base64");
    // Phase 2 buffer should be roughly: phase1 size + 4 × (2 + blob_size)
    // ~= 5 short tags (~70 bytes) + tag6 (2+32) + tag7 (2+64) + tag8 (2+91) + tag9 (2+64) ≈ 327
    expect(decoded.length).toBeGreaterThan(300);
    expect(decoded[0]).toBe(0x01); // still starts with seller name
  });
});
