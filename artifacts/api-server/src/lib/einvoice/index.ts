// Public surface of the e-invoice module. Callers should ONLY import
// from this file — never from `provider.ts`, `registry.ts`, or any
// vendor-specific subfolder. The import boundary is enforced by the
// future CI guardrail described in docs/ZATCA_PHASE_2_DESIGN.md §4.1.

export type {
  EInvoiceProvider,
  InvoiceForClearance,
  ClearanceResult,
  OnboardingResult,
  HealthCheckResult,
} from "./provider.js";

export { getProvider, listProviderNames } from "./registry.js";
