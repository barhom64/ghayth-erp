/**
 * ZATCA TLV (Tag-Length-Value) QR-code encoder for both phases.
 *
 * Phase 1 (sandbox / pre-Phase-2): tags 1-5
 * Phase 2 (Fatoora cleared invoices): tags 1-9
 *
 * Spec reference: ZATCA E-Invoicing Annex 4 / Security Implementation Standards §4.4.
 *
 * The function is pure — it takes a `QrPayload` and returns a Base64 string
 * suitable for embedding in `<cbc:EmbeddedDocumentBinaryObject>` or for
 * encoding as a QR PNG. No I/O, no DB, no time.
 */
import type { QrPayload } from "./types.js";

/**
 * Encode a single TLV triple. Length is a single byte — values larger
 * than 255 bytes are not allowed by the ZATCA spec for these tags, so
 * we throw rather than silently truncate.
 */
function encodeTlv(tag: number, value: string | Buffer): Buffer {
  const valueBytes = Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8");
  if (valueBytes.length > 255) {
    throw new Error(
      `ZATCA TLV value for tag ${tag} is ${valueBytes.length} bytes; max is 255`,
    );
  }
  const out = Buffer.alloc(2 + valueBytes.length);
  out[0] = tag;
  out[1] = valueBytes.length;
  valueBytes.copy(out, 2);
  return out;
}

/**
 * Build a Phase 1 (5-tag) TLV. Used for sandbox and pre-Phase-2 invoices.
 */
export function buildPhase1Tlv(payload: QrPayload): Buffer {
  return Buffer.concat([
    encodeTlv(1, payload.sellerName),
    encodeTlv(2, payload.vatRegNumber),
    encodeTlv(3, payload.invoiceDate),
    encodeTlv(4, payload.totalAmount),
    encodeTlv(5, payload.vatAmount),
  ]);
}

/**
 * Build a Phase 2 (9-tag) TLV. Tags 6-9 are the cryptographic
 * commitments that prove the invoice was signed by the seller's
 * production certificate and that the certificate itself was issued
 * by ZATCA.
 *
 * All four extra fields are required for clearance. If any are missing,
 * the function throws — callers should never silently fall back to
 * Phase 1 in production.
 */
export function buildPhase2Tlv(payload: QrPayload): Buffer {
  if (!payload.xmlHashBase64) throw new Error("Phase 2 QR requires xmlHashBase64 (tag 6)");
  if (!payload.ecdsaSignatureBase64) throw new Error("Phase 2 QR requires ecdsaSignatureBase64 (tag 7)");
  if (!payload.ecdsaPublicKeyBase64) throw new Error("Phase 2 QR requires ecdsaPublicKeyBase64 (tag 8)");
  if (!payload.certSignatureBase64) throw new Error("Phase 2 QR requires certSignatureBase64 (tag 9)");

  // Tags 6-9 are Base64-encoded binary in the spec, so decode before
  // putting into the TLV (the TLV value itself is binary, and the whole
  // TLV blob is Base64-encoded once at the end).
  const xmlHash = Buffer.from(payload.xmlHashBase64, "base64");
  const sig = Buffer.from(payload.ecdsaSignatureBase64, "base64");
  const pub = Buffer.from(payload.ecdsaPublicKeyBase64, "base64");
  const certSig = Buffer.from(payload.certSignatureBase64, "base64");

  return Buffer.concat([
    encodeTlv(1, payload.sellerName),
    encodeTlv(2, payload.vatRegNumber),
    encodeTlv(3, payload.invoiceDate),
    encodeTlv(4, payload.totalAmount),
    encodeTlv(5, payload.vatAmount),
    encodeTlv(6, xmlHash),
    encodeTlv(7, sig),
    encodeTlv(8, pub),
    encodeTlv(9, certSig),
  ]);
}

/**
 * Convenience: build the full QR string (Base64 of the TLV blob) for
 * the requested phase. Phase 2 falls through to Phase 1 only if the
 * caller explicitly asked for it (`phase: 1`); otherwise the missing-
 * tags guard inside `buildPhase2Tlv` will throw.
 */
export function buildQrBase64(
  payload: QrPayload,
  phase: 1 | 2 = 1,
): string {
  const tlv = phase === 2 ? buildPhase2Tlv(payload) : buildPhase1Tlv(payload);
  return tlv.toString("base64");
}
