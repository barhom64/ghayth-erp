/**
 * XML canonicalization (C14N) for ZATCA Phase 2 invoice signing.
 *
 * **STATUS: STUB.** The canonicalization step is the trickiest part of
 * the Phase 2 buildout because:
 *
 *   1. ZATCA requires W3C Canonical XML 1.1 (C14N 1.1) — not C14N 1.0
 *      and not Exclusive C14N. Subtle differences in how mixed
 *      namespaces are normalised will produce a different byte stream
 *      and thus a different SHA-256, and ZATCA will reject the invoice.
 *   2. Node's standard library does NOT include a C14N implementation.
 *      The choices are:
 *         - `xml-c14n` (npm) — actively maintained, BSD-2 licensed
 *         - `@xmldom/xmldom` + `xpath` + a hand-rolled C14N — only
 *           viable if you have a strong test pack to verify against
 *         - Java's javax.xml.crypto via JNI — not on the table here
 *   3. The transformations the spec demands (strip <ext:UBLExtensions>
 *      for the invoice hash, then put it back populated for clearance)
 *      need to happen on a parsed DOM, not on string regex.
 *
 * What this file ships today:
 *   ✅ The function shapes the rest of the module imports
 *   ✅ Documented placeholder behaviour: when not yet wired, the
 *      "canonicalized" output is the input verbatim, so unit tests
 *      can pass dummy inputs through and the hash chain stays
 *      mechanically correct in non-production code paths.
 *   ❌ A real C14N 1.1 implementation — added in week 2 of the rollout
 *      once the team picks the dep (recommended: `xml-c14n` ^1.0.0)
 *
 * **Refusing to ship a wrong-but-runs implementation.** The risk of a
 * hand-rolled C14N is silent rejection by ZATCA after running fine in
 * dev. Throw a clear "not implemented" error in production until a
 * real library is plugged in below.
 */

import { config } from "../config.js";

const NOT_WIRED_MESSAGE =
  "ZATCA C14N is not yet wired to a real canonicalization library. " +
  "See artifacts/api-server/src/lib/zatca/canonicalize.ts for the plan.";

const isProd = config.isProduction;

/**
 * Strip the <ext:UBLExtensions> block from the invoice XML, then
 * canonicalize. This is the input to `invoiceHashBase64` (QR tag 6).
 *
 * Until a real C14N library is wired in, the function:
 *   - Throws in production (so we never accidentally submit a wrong
 *     hash to ZATCA's clearance API)
 *   - Returns a regex-stripped version in development so tests + the
 *     sandbox simulation can keep running end-to-end
 */
export function canonicalizeInvoiceForHashing(rawXml: string): string {
  if (isProd) {
    throw new Error(NOT_WIRED_MESSAGE);
  }
  // Dev fallback: naive removal of the extensions block. NOT
  // spec-compliant. Good enough to keep the chain wiring sensible
  // in unit tests until the real library lands.
  return stripUblExtensionsByRegex(rawXml);
}

/**
 * Canonicalize the <xades:SignedProperties> element on its own —
 * needed for the XMLDSig signature value. Same status as the invoice
 * canonicalizer above.
 */
export function canonicalizeSignedProperties(signedPropsXml: string): string {
  if (isProd) {
    throw new Error(NOT_WIRED_MESSAGE);
  }
  return signedPropsXml;
}

/**
 * Reinsert the populated <ext:UBLExtensions> block (with the signature)
 * back into the invoice for delivery to the buyer. Until C14N is wired
 * in this is a string concatenation; with a real DOM-based pipeline it
 * becomes an element insertion before <cbc:ProfileID>.
 */
export function embedUblExtensions(rawXml: string, extensionsBlockXml: string): string {
  if (isProd) {
    throw new Error(NOT_WIRED_MESSAGE);
  }
  // Dev fallback: insert just after the opening <Invoice ...> tag.
  return rawXml.replace(/(<Invoice[^>]*>)/, `$1\n${extensionsBlockXml}`);
}

// ─────────────────────────────────────────────────────────────────────
// Internal regex helpers — DEV ONLY.
// ─────────────────────────────────────────────────────────────────────

function stripUblExtensionsByRegex(xml: string): string {
  // Greedy strip — fine for hand-built XML where there's at most one
  // extensions block, completely wrong for real C14N. Documented as
  // dev-only above.
  return xml.replace(/<ext:UBLExtensions[\s\S]*?<\/ext:UBLExtensions>/m, "");
}
