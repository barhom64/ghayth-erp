/**
 * ECDSA P-256 signing + verification for ZATCA Phase 2 invoices.
 *
 * Spec reference: ZATCA Security Implementation Standards §4.5 (digital
 * signature) and Annex 4 (QR tags 6-9).
 *
 * Key facts the spec pins down:
 *   - Curve: secp256r1 (NIST P-256)
 *   - Hash: SHA-256
 *   - Signature encoding: raw r||s (64 bytes total), NOT DER. Node's
 *     `crypto.sign` defaults to DER, so we pass `dsaEncoding:
 *     "ieee-p1363"` which produces the raw form ZATCA expects.
 *   - Public key embed: X.509 `SubjectPublicKeyInfo`, PEM-decoded into
 *     binary, then Base64-encoded for QR tag 8.
 *
 * What's here today:
 *   ✅ signSha256(privateKeyPem, data) → 64-byte raw r||s
 *   ✅ verifySha256(publicKeyPem, data, signature)
 *   ✅ extractEcdsaPublicKeySpki(certificateOrPublicKeyPem) — produces
 *      the Base64 SubjectPublicKeyInfo for QR tag 8
 *
 * What's NOT here (intentional — Week 2 of the rollout):
 *   ❌ The full XMLDSig <ds:Signature> block construction (lives in
 *      hash.ts + canonicalize.ts because it depends on canonicalization
 *      which needs an external library).
 *   ❌ Certificate-chain verification — handled by ZATCA's clearance
 *      response, not our problem.
 *
 * Storage: the private key PEM lives in `zatca_settings.privateKeyPem`
 * and MUST be encrypted at rest before storage (use lib/secrets.ts with
 * the FIELD_ENCRYPTION_KEY env). This module accepts a decrypted PEM
 * string as input — it never reads from settings directly.
 */
import {
  createPrivateKey,
  createPublicKey,
  sign as cryptoSign,
  verify as cryptoVerify,
  type KeyObject,
} from "node:crypto";

/** Expected curve name for the imported key. ZATCA only accepts P-256. */
const REQUIRED_CURVE = "prime256v1"; // alias of secp256r1 / P-256 in OpenSSL parlance

/**
 * Sign a UTF-8 string with the seller's ECDSA P-256 private key and
 * return the raw 64-byte r||s signature. Caller is responsible for
 * Base64-encoding when embedding in the QR (tag 7).
 *
 * Throws if the key isn't P-256 — ZATCA rejects everything else.
 */
export function signSha256(privateKeyPem: string, data: string | Buffer): Buffer {
  const key = importPrivateKey(privateKeyPem);
  return cryptoSign(
    "sha256",
    Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8"),
    { key, dsaEncoding: "ieee-p1363" },
  );
}

/**
 * Verify an r||s signature against the seller's certificate or
 * public key. Returns boolean — does not throw on invalid signature
 * (only on malformed inputs).
 */
export function verifySha256(
  publicKeyPem: string,
  data: string | Buffer,
  signature: Buffer,
): boolean {
  const key = importPublicKey(publicKeyPem);
  return cryptoVerify(
    "sha256",
    Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8"),
    { key, dsaEncoding: "ieee-p1363" },
    signature,
  );
}

/**
 * Extract the X.509 SubjectPublicKeyInfo (DER) and Base64-encode it
 * for QR tag 8. Accepts either:
 *   - a PEM-encoded ECDSA public key
 *   - a PEM-encoded X.509 certificate (will pull the public key out)
 */
export function extractEcdsaPublicKeySpki(certificateOrPublicKeyPem: string): string {
  const key = importPublicKey(certificateOrPublicKeyPem);
  // `der` + `spki` gives X.509 SubjectPublicKeyInfo encoding directly.
  const der = key.export({ format: "der", type: "spki" });
  return der.toString("base64");
}

// ─────────────────────────────────────────────────────────────────────
// Internal: PEM import helpers with curve enforcement.
// ─────────────────────────────────────────────────────────────────────

function importPrivateKey(pem: string): KeyObject {
  const key = createPrivateKey({ key: pem, format: "pem" });
  assertP256(key, "private");
  return key;
}

function importPublicKey(pem: string): KeyObject {
  // createPublicKey handles BOTH bare public keys (-----BEGIN PUBLIC KEY-----)
  // and X.509 certificates (-----BEGIN CERTIFICATE-----), pulling the
  // SubjectPublicKeyInfo out of the cert automatically.
  const key = createPublicKey({ key: pem, format: "pem" });
  assertP256(key, "public");
  return key;
}

function assertP256(key: KeyObject, kind: "public" | "private"): void {
  // asymmetricKeyType is "ec" for both EC private + public keys; the
  // curve is exposed via asymmetricKeyDetails.namedCurve.
  if (key.asymmetricKeyType !== "ec") {
    throw new Error(
      `ZATCA requires an EC ${kind} key on curve P-256; got ${key.asymmetricKeyType}`,
    );
  }
  const curve = key.asymmetricKeyDetails?.namedCurve;
  if (curve !== REQUIRED_CURVE) {
    throw new Error(
      `ZATCA requires curve ${REQUIRED_CURVE} (P-256); got ${curve ?? "unknown"}`,
    );
  }
}
