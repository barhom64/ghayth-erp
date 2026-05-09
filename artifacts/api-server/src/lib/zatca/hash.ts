/**
 * Invoice hashing helpers for ZATCA Phase 2.
 *
 * Per the spec there are TWO hashes that matter:
 *
 *   1. **Invoice hash** = SHA-256 of the canonicalized UBL invoice
 *      WITHOUT the <ext:UBLExtensions> block (because that's where the
 *      signature itself goes — chicken-and-egg). This is what gets
 *      Base64'd into QR tag 6 and stored in `zatcaHash`.
 *
 *   2. **Signed Properties hash** = SHA-256 of the <xades:SignedProperties>
 *      block once it's filled in (with the signing time + cert digest).
 *      This is referenced from inside the <ds:SignatureValue> block.
 *
 * Both hashes are Base64 in the spec, NOT hex.
 *
 * What's here today:
 *   ✅ sha256Base64(buffer | string) — convenience wrapper
 *   ✅ invoiceHashBase64(canonicalizedXml) — the QR tag 6 input
 *
 * What's stubbed (waits on canonicalize.ts):
 *   ⚠️ signedPropertiesHashBase64() — depends on a real C14N
 *      implementation, which today is a stub. The function is here
 *      with the right signature so the rest of the module can call it.
 */
import { createHash } from "node:crypto";

/**
 * SHA-256 → Base64 in one call. Uses Node's built-in crypto, no
 * external dep.
 */
export function sha256Base64(input: string | Buffer): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, "utf8");
  return createHash("sha256").update(buf).digest("base64");
}

/**
 * Hash the canonicalized invoice XML for QR tag 6 / `zatcaHash`. The
 * caller MUST pass the canonicalized XML already (lib/zatca/canonicalize.ts),
 * with the <ext:UBLExtensions> block stripped out before canonicalization.
 *
 * If you pass the raw XML (with extensions), ZATCA will reject the
 * clearance because the recomputed hash on their side won't match.
 */
export function invoiceHashBase64(canonicalizedXmlWithoutExtensions: string): string {
  return sha256Base64(canonicalizedXmlWithoutExtensions);
}

/**
 * Hash the canonicalized <xades:SignedProperties> element. Used inside
 * the XMLDSig signature to prove the signing time + cert digest.
 *
 * Until lib/zatca/canonicalize.ts is wired to a real C14N library, the
 * caller can pass the pre-canonicalized string directly.
 */
export function signedPropertiesHashBase64(canonicalizedSignedProperties: string): string {
  return sha256Base64(canonicalizedSignedProperties);
}
