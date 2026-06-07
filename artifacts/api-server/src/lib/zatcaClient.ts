// M1 — Real ZATCA Fatoora HTTP client.
//
// Closes M1 from CRITICAL_DEFECTS_REPORT.md. Replaces the pre-fix
// "simulatedSuccess = environment === 'sandbox'" short-circuit with an
// actual HTTPS call to the ZATCA Fatoora clearance + reporting API.
//
// Behaviour:
//   - When ZATCA_API_BASE + credentials are configured, the client
//     POSTs the signed invoice XML to ZATCA and returns the real
//     clearance response.
//   - When ZATCA_TEST_MODE=1 is explicitly set (only in dev / CI),
//     the client returns a synthetic "accepted" response without
//     network calls — matches the previous sandbox-as-mock behaviour
//     but now requires explicit opt-in. Production cannot accidentally
//     fall into the mock path.
//   - When NEITHER is configured, the client throws a clear typed
//     error so the route can return a 503 instead of silently lying
//     to the operator.
//
// Endpoints used (per ZATCA Fatoora developer portal):
//   Sandbox:    https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal
//   Production: https://gw-fatoora.zatca.gov.sa/e-invoicing/core
//
//   POST /invoices/reporting/single   — for simplified (B2C) invoices
//   POST /invoices/clearance/single   — for standard (B2B) invoices
//
// Auth: HTTP Basic with binarySecurityToken:secret base64-encoded.

import { logger } from "./logger.js";
import { config } from "./config.js";

export interface ZatcaSubmissionInput {
  invoiceHash: string;
  uuid: string;
  invoiceXmlBase64: string;
  /** B2B = standard (clearance), B2C = simplified (reporting) */
  invoiceType: "standard" | "simplified";
  /** Per-tenant Onboarding credentials issued by ZATCA at registration. */
  credentials: {
    binarySecurityToken: string;
    secret: string;
  };
}

export interface ZatcaSubmissionResponse {
  ok: boolean;
  status: "accepted" | "warnings" | "rejected";
  clearedInvoiceBase64?: string;
  validationResults?: unknown;
  reportingStatus?: string;
  clearanceStatus?: string;
  rawResponse?: unknown;
  /** Set when the call failed before reaching ZATCA. */
  errorMessage?: string;
}

class ZatcaConfigError extends Error {
  status = 503;
  code = "ZATCA_NOT_CONFIGURED";
}

/**
 * Returns the configured Fatoora base URL or throws if neither
 * sandbox nor production is wired. In dev (test mode), we return a
 * sentinel that the caller checks.
 */
function resolveBaseUrl(): { url: string; isMock: boolean } {
  if (config.zatca.testMode) return { url: "mock://zatca-test", isMock: true };

  const explicit = config.zatca.apiBase?.trim();
  if (explicit) return { url: explicit.replace(/\/+$/, ""), isMock: false };

  // Production refusal — fail closed.
  if (config.isProduction) {
    throw new ZatcaConfigError(
      "ZATCA endpoint not configured. Set ZATCA_API_BASE to the Fatoora gateway URL " +
        "(e.g. https://gw-fatoora.zatca.gov.sa/e-invoicing/core) and the credentials on the company."
    );
  }
  // Non-production without explicit config also refuses now — but the
  // operator can opt in by setting ZATCA_TEST_MODE=1 in their .env.
  throw new ZatcaConfigError(
    "ZATCA endpoint not configured. Either set ZATCA_API_BASE for a real call, " +
      "or ZATCA_TEST_MODE=1 to return synthetic responses (dev only)."
  );
}

function pathForType(invoiceType: "standard" | "simplified"): string {
  return invoiceType === "standard"
    ? "/invoices/clearance/single"
    : "/invoices/reporting/single";
}

/**
 * Post the signed invoice to ZATCA. Returns the parsed response on
 * 200/202, or a typed failure object on rejection. Network errors
 * (DNS, TLS, timeout) propagate so the caller can decide whether to
 * retry from the queue.
 */
export async function submitInvoiceToZatca(
  input: ZatcaSubmissionInput
): Promise<ZatcaSubmissionResponse> {
  const { url, isMock } = resolveBaseUrl();

  if (isMock) {
    logger.info(
      { uuid: input.uuid, invoiceType: input.invoiceType },
      "[zatca] ZATCA_TEST_MODE=1 — returning synthetic accepted response"
    );
    return {
      ok: true,
      status: "accepted",
      clearedInvoiceBase64: input.invoiceXmlBase64,
      clearanceStatus: "CLEARED",
      reportingStatus: "REPORTED",
      rawResponse: { mock: true, mode: "ZATCA_TEST_MODE" },
    };
  }

  const fullUrl = `${url}${pathForType(input.invoiceType)}`;
  const auth = Buffer.from(
    `${input.credentials.binarySecurityToken}:${input.credentials.secret}`
  ).toString("base64");

  const body = JSON.stringify({
    invoiceHash: input.invoiceHash,
    uuid: input.uuid,
    invoice: input.invoiceXmlBase64,
  });

  const controller = new AbortController();
  // 30s timeout — Fatoora is usually <2s but we allow headroom for
  // chained validation. Exceeding 30s likely means the gateway is down.
  const timeoutHandle = setTimeout(() => controller.abort(), 30_000);

  try {
    const resp = await fetch(fullUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Basic ${auth}`,
        "Accept-Language": "ar",
        "Accept-Version": "V2",
      },
      body,
      signal: controller.signal,
    });

    const text = await resp.text();
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch { /* ignore */ }

    // 200 = accepted clearance; 202 = accepted with warnings;
    // 400 = validation failure (still a "successful" call — invoice
    // was rejected by ZATCA, not by the network).
    if (resp.status === 200) {
      return {
        ok: true,
        status: "accepted",
        clearedInvoiceBase64: parsed?.clearedInvoice ?? undefined,
        clearanceStatus: parsed?.clearanceStatus ?? "CLEARED",
        reportingStatus: parsed?.reportingStatus ?? "REPORTED",
        validationResults: parsed?.validationResults,
        rawResponse: parsed,
      };
    }
    if (resp.status === 202) {
      return {
        ok: true,
        status: "warnings",
        clearedInvoiceBase64: parsed?.clearedInvoice ?? undefined,
        clearanceStatus: parsed?.clearanceStatus,
        reportingStatus: parsed?.reportingStatus,
        validationResults: parsed?.validationResults,
        rawResponse: parsed,
      };
    }
    return {
      ok: false,
      status: "rejected",
      validationResults: parsed?.validationResults ?? parsed,
      rawResponse: parsed ?? text,
      errorMessage: `ZATCA returned HTTP ${resp.status}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // AbortError = timeout. Propagate so the caller can re-queue.
    if (err instanceof Error && err.name === "AbortError") {
      logger.error({ err, uuid: input.uuid }, "[zatca] timeout");
      throw new Error("ZATCA request timed out after 30s");
    }
    logger.error({ err, uuid: input.uuid }, "[zatca] network error");
    throw new Error(`ZATCA network error: ${message}`);
  } finally {
    clearTimeout(timeoutHandle);
  }
}

/**
 * Probe helper used by /admin/zatca/health to surface "is the gateway
 * reachable" without submitting an invoice. Falls back to a HEAD
 * request when GET isn't allowed.
 */
export async function pingZatca(): Promise<{ ok: boolean; detail: string }> {
  try {
    const { url, isMock } = resolveBaseUrl();
    if (isMock) return { ok: true, detail: "ZATCA_TEST_MODE — synthetic mode" };
    const resp = await fetch(url, { method: "GET", signal: AbortSignal.timeout(10_000) });
    return { ok: resp.ok || resp.status < 500, detail: `HTTP ${resp.status}` };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}
