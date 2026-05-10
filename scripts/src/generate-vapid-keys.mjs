#!/usr/bin/env node
// generate-vapid-keys.mjs
// ---------------------------------------------------------------------------
// Generates a VAPID key pair for Web Push notifications and prints them in
// the exact .env shape the api-server expects.
//
//   node scripts/src/generate-vapid-keys.mjs
//
// Output:
//   VAPID_PUBLIC_KEY=...
//   VAPID_PRIVATE_KEY=...
//   VAPID_SUBJECT=mailto:admin@example.com
//
// Use the result as a one-time setup for production. Replacing the keys
// invalidates every existing browser subscription, so generate ONCE and
// store securely. Repo-shipped script avoids the npx web-push round-trip.
// ---------------------------------------------------------------------------

import { generateKeyPairSync, createHash } from "node:crypto";

function urlsafeB64(buf) {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Web Push uses ECDSA over the P-256 curve (secp256r1) per RFC 8292.
// Public key: 65-byte uncompressed point (0x04 + X + Y).
// Private key: 32-byte scalar.
const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });

const pubRaw = publicKey.export({ format: "der", type: "spki" });
const privRaw = privateKey.export({ format: "der", type: "pkcs8" });

// SPKI wraps the 65-byte uncompressed point in an ASN.1 sequence; the point
// starts at byte 27 in the standard P-256 SPKI layout.
const pubPoint = pubRaw.subarray(pubRaw.length - 65);
// PKCS#8 wraps the 32-byte private scalar; locate it by its known prefix
// length. The simplest safe extraction: the last 32 bytes contain the
// private scalar followed by the optional public key copy. We read from
// the OCTET STRING marker to avoid surprises.
const octetStringStart = privRaw.indexOf(Buffer.from([0x04, 0x20])) + 2;
const privScalar = privRaw.subarray(octetStringStart, octetStringStart + 32);

const subject = process.env.VAPID_SUBJECT ?? "mailto:admin@example.com";

console.log();
console.log("# Add these to your .env (or your secret manager):");
console.log();
console.log(`VAPID_PUBLIC_KEY=${urlsafeB64(pubPoint)}`);
console.log(`VAPID_PRIVATE_KEY=${urlsafeB64(privScalar)}`);
console.log(`VAPID_SUBJECT=${subject}`);
console.log();
console.log("# Fingerprint (for audit logs):");
console.log("# " + createHash("sha256").update(pubPoint).digest("hex").slice(0, 16));
console.log();
console.log(
  "Note: replacing these keys invalidates every existing browser",
);
console.log(
  "subscription. Generate once, store securely, rotate only when",
);
console.log("the private key is compromised.");
