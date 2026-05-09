/**
 * Parse the response body returned by ZATCA's clearance / reporting
 * endpoints into the `ClearanceResult` shape the rest of the module
 * consumes.
 *
 * Spec reference: ZATCA Fatoora APIs §6 (Clearance) and §7 (Reporting).
 *
 * The API returns JSON with this rough shape:
 *
 *   {
 *     "validationResults": {
 *       "infoMessages":    [{...}],
 *       "warningMessages": [{...}],
 *       "errorMessages":   [{...}],
 *       "status": "PASS" | "WARNING" | "ERROR"
 *     },
 *     "clearanceStatus": "CLEARED" | "NOT_CLEARED" | "REPORTED" | "NOT_REPORTED",
 *     "clearedInvoice":  "<base64-encoded UBL XML with QR + signature>"
 *   }
 *
 * The `validationResults.status` is the safer signal than HTTP code:
 *   PASS    → cleared / reported  (no validation issues)
 *   WARNING → cleared / reported  (passes but the seller should fix
 *                                   the warning before it becomes an
 *                                   error in a future spec rev)
 *   ERROR   → not cleared, not reported — surface to the user
 *
 * This file is pure logic — no fetch, no DB. The HTTP wrapper in
 * `client.ts` parses the response body and hands it here.
 */
import type { ClearanceResult } from "./types.js";

interface ZatcaValidationMessage {
  type?: string;
  code?: string;
  category?: string;
  message?: string;
}

interface ZatcaResponseBody {
  validationResults?: {
    infoMessages?: ZatcaValidationMessage[];
    warningMessages?: ZatcaValidationMessage[];
    errorMessages?: ZatcaValidationMessage[];
    status?: string;
  };
  clearanceStatus?: string;
  reportingStatus?: string;
  clearedInvoice?: string;
}

/**
 * Convert a ZATCA response body into the canonical `ClearanceResult`.
 * Caller must pass the parsed JSON; this function never inspects the
 * HTTP status code (the wrapper does that and decides whether to call
 * us at all).
 */
export function parseClearanceResponse(
  body: ZatcaResponseBody,
  /** Echo of the UUID the caller submitted — ZATCA doesn't echo it. */
  invoiceUuid: string,
): ClearanceResult {
  const warnings = (body.validationResults?.warningMessages ?? [])
    .map(formatMessage)
    .filter(Boolean);
  const errors = (body.validationResults?.errorMessages ?? [])
    .map(formatMessage)
    .filter(Boolean);

  const validationStatus = (body.validationResults?.status ?? "").toUpperCase();
  const clearanceStatus = (body.clearanceStatus ?? body.reportingStatus ?? "").toUpperCase();

  let status: ClearanceResult["status"];
  if (validationStatus === "ERROR" || clearanceStatus === "NOT_CLEARED" || clearanceStatus === "NOT_REPORTED") {
    status = "rejected";
  } else if (validationStatus === "WARNING" || warnings.length > 0) {
    status = "warning";
  } else if (clearanceStatus === "REPORTED") {
    status = "reported";
  } else if (clearanceStatus === "CLEARED" || validationStatus === "PASS") {
    status = "cleared";
  } else {
    // Unknown status string — treat as warning so the operator sees it
    // in the audit log but the invoice isn't silently dropped.
    status = "warning";
    warnings.push(`Unrecognised ZATCA status: validation=${validationStatus} clearance=${clearanceStatus}`);
  }

  // The spec returns the cleared XML as Base64 — decode it for storage
  // so the audit screen and the buyer-facing email can render the
  // human-readable form without a second decode step.
  let clearedXml: string | undefined;
  if (body.clearedInvoice) {
    try {
      clearedXml = Buffer.from(body.clearedInvoice, "base64").toString("utf8");
    } catch {
      warnings.push("clearedInvoice was returned in a non-Base64 form; storing raw");
      clearedXml = body.clearedInvoice;
    }
  }

  return {
    status,
    zatcaUuid: invoiceUuid,
    clearedXml,
    warnings,
    errors,
    rawResponse: body,
  };
}

function formatMessage(m: ZatcaValidationMessage): string {
  const code = m.code ?? "—";
  const cat = m.category ?? m.type ?? "general";
  const msg = m.message ?? "(no message)";
  return `[${cat}/${code}] ${msg}`;
}
