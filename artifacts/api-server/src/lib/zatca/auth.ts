/**
 * HTTP authentication helpers for the ZATCA Fatoora API.
 *
 * Spec reference: ZATCA Fatoora APIs Specification §4 (Authentication).
 *
 * ZATCA uses HTTP Basic auth, but the username / password are NOT a
 * normal pair:
 *
 *   - **username** = the Base64 of the seller's compliance/production
 *     certificate (issued by ZATCA, returned as `binarySecurityToken`
 *     when the CSID was created).
 *   - **password** = the `secret` returned alongside that CSID.
 *
 * The certificate Base64 already contains line breaks and headers —
 * we strip those so the resulting string is one continuous Base64
 * value before forming the `username:password` pair.
 *
 * Some endpoints (notably `POST /compliance` for issuing a compliance
 * CSID) are anonymous — the CSR + OTP travel in the request body
 * instead. This module exposes a guard for that case so callers don't
 * accidentally send a half-built Authorization header.
 */

export interface ZatcaCredentials {
  /**
   * The `binarySecurityToken` value returned by ZATCA when the CSID
   * was issued. Already Base64-encoded; we keep whatever the seller
   * stored without re-encoding.
   */
  binarySecurityToken: string;
  /** The `secret` returned alongside the binarySecurityToken. */
  secret: string;
}

/**
 * Build the `Authorization: Basic …` header value from a stored CSID.
 * Returns the full header value (including the `Basic ` prefix) so
 * callers can plug it directly into a Headers object.
 *
 * Throws when either field is empty — production must never silently
 * send malformed credentials.
 */
export function basicAuthHeader(creds: ZatcaCredentials): string {
  if (!creds.binarySecurityToken) {
    throw new Error("ZATCA Basic auth requires a binarySecurityToken");
  }
  if (!creds.secret) {
    throw new Error("ZATCA Basic auth requires a secret");
  }
  // The token might arrive with PEM armor / line breaks if it was
  // round-tripped through some storage layer — collapse to a single
  // Base64 string before pairing.
  const username = stripBase64Whitespace(creds.binarySecurityToken);
  const pair = `${username}:${creds.secret}`;
  return `Basic ${Buffer.from(pair, "utf8").toString("base64")}`;
}

/**
 * Common headers every Fatoora request needs. Pulls in the
 * `Accept-Language` value the spec mandates (`en` is the API's default;
 * Arabic responses are gated by `ar` but the field names are still
 * English).
 */
export function commonFatoraHeaders(): Record<string, string> {
  return {
    "Accept-Language": "en",
    "Accept-Version": "V2",
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

function stripBase64Whitespace(value: string): string {
  return value.replace(/-----BEGIN [^-]+-----|-----END [^-]+-----|\s+/g, "");
}
