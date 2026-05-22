/**
 * URL builder for the ZATCA Fatoora API.
 *
 * Spec reference: ZATCA Fatoora APIs Specification §3 (Endpoints).
 * The base URL differs between sandbox / simulation / production but
 * the path suffixes are identical — the same code path can target any
 * environment by switching the base.
 *
 * Note on environments:
 *   - sandbox    — for "compliance test pack" submissions during onboarding
 *                  (the seller has no production CSID yet)
 *   - simulation — half-way environment — the seller has a CSID but ZATCA
 *                  doesn't ledger the invoice. Used in the audit pack
 *                  before going live.
 *   - production — the real one. Cleared invoices count for VAT.
 *
 * For the first cut we expose just sandbox / production because that's
 * what ERP-side wiring uses; simulation is added when the audit pack
 * runner lands in week 4.
 */
import type { ZatcaEnvironment } from "./types.js";
import { config } from "../config.js";

/**
 * Resolve the base URL for the given environment. The defaults below
 * match the URLs published in the Fatoora spec at the time this
 * module was written; callers MAY override via env vars (e.g. for
 * staging clones, network testing, or contract testing with a mock
 * server).
 */
export function fatoraaBaseUrl(env: ZatcaEnvironment): string {
  const fromEnv =
    env === "production"
      ? config.zatca.prodUrl
      : config.zatca.sandboxUrl;
  if (fromEnv && fromEnv.length > 0) return stripTrailingSlash(fromEnv);

  // Spec defaults (gw-fatoora.zatca.gov.sa). Same host for both,
  // different path prefixes documented per endpoint below.
  if (env === "production") {
    return "https://gw-fatoora.zatca.gov.sa";
  }
  return "https://gw-fatoora.zatca.gov.sa";
}

/**
 * Path suffix for compliance CSID issuance (`POST` with CSR + OTP).
 * The same path is used during onboarding for both sandbox and prod
 * (the OAuth token issued is environment-scoped).
 */
export const COMPLIANCE_CSID_PATH = "/e-invoicing/core/compliance";

/**
 * Path suffix for the compliance test pack invoice check
 * (`POST` with the signed UBL XML — used to validate the seller's
 * implementation before promoting to production).
 */
export const COMPLIANCE_INVOICE_CHECK_PATH = "/e-invoicing/core/compliance/invoices";

/**
 * Path suffix for production CSID issuance
 * (`POST` after the compliance test pack passes — promotes the
 * compliance CSID into the production ledger).
 */
export const PRODUCTION_CSID_PATH = "/e-invoicing/core/production/csids";

/**
 * Path suffix for renewing an existing production CSID
 * (`PATCH` before it expires — same body shape, different verb).
 */
export const PRODUCTION_CSID_RENEW_PATH = "/e-invoicing/core/production/csids";

/**
 * Path suffix for clearing a single Standard invoice
 * (`POST` — synchronous, returns the cleared XML in the response).
 */
export const CLEARANCE_SINGLE_PATH = "/e-invoicing/core/invoices/clearance/single";

/**
 * Path suffix for reporting a single Simplified invoice
 * (`POST` — fire-and-forget from the seller's perspective; ZATCA
 * stores the report but the seller delivers the invoice to the buyer
 * immediately without waiting).
 */
export const REPORTING_SINGLE_PATH = "/e-invoicing/core/invoices/reporting/single";

/**
 * Build the full URL for a Fatoora endpoint, joining the env-specific
 * base with the spec-fixed path suffix. Pure function; no I/O.
 */
export function buildFatoraUrl(
  env: ZatcaEnvironment,
  path: string,
): string {
  const base = fatoraaBaseUrl(env);
  return `${base}${path.startsWith("/") ? path : "/" + path}`;
}

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}
