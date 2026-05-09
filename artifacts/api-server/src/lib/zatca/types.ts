/**
 * Type definitions for the ZATCA Phase 2 integration.
 * See docs/ZATCA_PHASE_2_DESIGN.md for the full spec.
 */

export type ZatcaEnvironment = "sandbox" | "production";

export type ZatcaInvoiceTypeCode =
  | "388"   // Standard tax invoice (B2B)
  | "381"   // Credit note
  | "383"   // Debit note
  ;

export type ZatcaTaxCategoryCode =
  | "S"  // Standard rate (15%)
  | "Z"  // Zero rated
  | "E"  // Exempt
  | "O"  // Out of scope
  ;

/**
 * Per-invoice subset of seller settings — the fields needed to build
 * the UBL XML and the QR. Pulled from `zatca_settings` for the company.
 */
export interface SellerInfo {
  organizationName: string;
  vatRegistrationNumber: string;
  streetName: string;
  buildingNumber: string;
  cityName: string;
  postalCode: string;
  countryCode: string; // 2-letter, "SA"
}

export interface BuyerInfo {
  name: string;
  vatRegistrationNumber?: string;
  /** Used for B2B simplified invoices when known. */
  identificationNumber?: string;
}

export interface InvoiceLine {
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  vatAmount: number;
}

/**
 * Inputs to the QR generator. Phase 1 needs only the first 5 fields;
 * Phase 2 needs all 9.
 */
export interface QrPayload {
  /** Tag 1 — seller name */
  sellerName: string;
  /** Tag 2 — VAT registration number */
  vatRegNumber: string;
  /** Tag 3 — invoice timestamp ISO 8601 (e.g. 2026-05-09T12:00:00Z) */
  invoiceDate: string;
  /** Tag 4 — total amount including VAT, 2dp string */
  totalAmount: string;
  /** Tag 5 — VAT amount, 2dp string */
  vatAmount: string;
  /** Tag 6 — Base64 of SHA-256 hash of canonicalized XML (Phase 2 only) */
  xmlHashBase64?: string;
  /** Tag 7 — Base64 ECDSA signature (Phase 2 only) */
  ecdsaSignatureBase64?: string;
  /** Tag 8 — Base64 ECDSA public key — X.509 SubjectPublicKeyInfo (Phase 2 only) */
  ecdsaPublicKeyBase64?: string;
  /** Tag 9 — Base64 ZATCA's signature on the seller certificate (Phase 2 only) */
  certSignatureBase64?: string;
}

/**
 * Per-company invoice counter state. Driven by the `zatca_icv_counters`
 * table; see lib/zatca/icv.ts for read/write helpers.
 */
export interface IcvState {
  companyId: number;
  lastIcv: bigint;
  /** Base64 of the previous invoice's XML hash. The spec-default for
   *  the first invoice is Base64 of SHA-256("0"). */
  lastInvoiceHash: string;
}

/**
 * Result of submitting an invoice to ZATCA Fatoora.
 */
export interface ClearanceResult {
  status: "cleared" | "reported" | "rejected" | "warning";
  /** ZATCA-issued UUID (matches the request's invoiceUuid). */
  zatcaUuid: string;
  /** Cleared XML returned by ZATCA, with the QR + signature embedded. */
  clearedXml?: string;
  /** Validation messages — warnings keep the invoice cleared,
   *  errors fail it. */
  warnings: string[];
  errors: string[];
  /** Raw response for the audit log (truncated to 5KB by the caller). */
  rawResponse: unknown;
}

/**
 * High-level API the routes consume. Implementation in api-client.ts.
 */
export interface ZatcaClient {
  /** Test the OAuth credentials work and the certificate is valid. */
  testConnection(env: ZatcaEnvironment): Promise<{ ok: boolean; message: string }>;

  /** Submit a Standard invoice for clearance (B2B). */
  clearStandardInvoice(opts: {
    xml: string;
    invoiceUuid: string;
    invoiceHashBase64: string;
    env: ZatcaEnvironment;
  }): Promise<ClearanceResult>;

  /** Submit a Simplified invoice for reporting (B2C). */
  reportSimplifiedInvoice(opts: {
    xml: string;
    invoiceUuid: string;
    invoiceHashBase64: string;
    env: ZatcaEnvironment;
  }): Promise<ClearanceResult>;

  /** Submit the 6-invoice compliance test pack. */
  runComplianceCheck(opts: {
    xmls: string[];
    env: ZatcaEnvironment;
  }): Promise<{ allPassed: boolean; perInvoice: ClearanceResult[] }>;

  /** Request a compliance CSID using the CSR + ZATCA portal OTP. */
  requestComplianceCsid(opts: {
    csrBase64: string;
    otp: string;
    env: ZatcaEnvironment;
  }): Promise<{ binarySecurityToken: string; secret: string; requestId: string }>;

  /** Promote a compliance CSID to production after the test pack passes. */
  requestProductionCsid(opts: {
    complianceRequestId: string;
    env: ZatcaEnvironment;
  }): Promise<{ binarySecurityToken: string; secret: string }>;
}
