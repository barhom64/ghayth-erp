/**
 * Public surface of the ZATCA Phase 2 module.
 *
 * Today this is mostly types + pure helpers (QR encoding, ICV / PIH
 * counters). The signing, API client, and retry worker land in the
 * later weeks of the rollout (see docs/ZATCA_PHASE_2_DESIGN.md).
 *
 * The Phase 1 sandbox simulation in
 *   artifacts/api-server/src/routes/finance-zatca.ts
 * keeps using its own inlined helpers for now to avoid breaking the
 * existing flow during the Phase 2 build-out. As each Phase 2 piece
 * lands, the route handler will swap inline calls for imports from
 * here.
 */

export * from "./types.js";
export * from "./qr.js";
export { reserveNextIcv, currentIcv } from "./icv.js";
export { readNextPih, advancePih, PIH_CHAIN_HEAD } from "./pih.js";
export { signSha256, verifySha256, extractEcdsaPublicKeySpki } from "./signing.js";
export { sha256Base64, invoiceHashBase64, signedPropertiesHashBase64 } from "./hash.js";
export {
  canonicalizeInvoiceForHashing,
  canonicalizeSignedProperties,
  embedUblExtensions,
} from "./canonicalize.js";
export type { CsrInput, GeneratedCsr } from "./csr.js";
export { generateCsr } from "./csr.js";
export {
  fatoraaBaseUrl,
  buildFatoraUrl,
  COMPLIANCE_CSID_PATH,
  COMPLIANCE_INVOICE_CHECK_PATH,
  PRODUCTION_CSID_PATH,
  PRODUCTION_CSID_RENEW_PATH,
  CLEARANCE_SINGLE_PATH,
  REPORTING_SINGLE_PATH,
} from "./endpoints.js";
export type { ZatcaCredentials } from "./auth.js";
export { basicAuthHeader, commonFatoraHeaders } from "./auth.js";
export { parseClearanceResponse } from "./response.js";
export type { InvoiceSubmission } from "./client.js";
export {
  clearStandardInvoice,
  reportSimplifiedInvoice,
  requestComplianceCsid,
  complianceInvoiceCheck,
  requestProductionCsid,
  ZatcaTransportError,
} from "./client.js";
export type { RetryRow } from "./retry.js";
export {
  enqueueRetry,
  readDueRetries,
  recordSuccess,
  recordFailure,
  requeue,
  queueStats,
} from "./retry.js";
export type { WorkerOutcome } from "./worker.js";
export { drainOnce, zatcaRetryDrain } from "./worker.js";
export type {
  TestPackInvoiceKind,
  TestPackTemplate,
  RunOptions as TestPackRunOptions,
  RunOutcome as TestPackRunOutcome,
} from "./test-pack.js";
export { buildTestPackTemplates, runComplianceTestPack } from "./test-pack.js";
