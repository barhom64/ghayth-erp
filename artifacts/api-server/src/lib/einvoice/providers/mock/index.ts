// Mock e-invoice provider — dev + CI default.
//
// Returns a deterministic "cleared" result without touching any
// external service. Used in three contexts:
//   * Local dev: no ZATCA sandbox creds → no network calls.
//   * CI: `pnpm test` should never hit the real ZATCA API.
//   * Companies without a configured cert: stay on mock until they
//     onboard, instead of crashing the invoice flow.
//
// To switch a company to the real provider, see
// `einvoice/registry.ts::getProvider`.

import type {
  EInvoiceProvider,
  InvoiceForClearance,
  ClearanceResult,
  OnboardingResult,
  HealthCheckResult,
} from "../../provider.js";

export const mockEInvoiceProvider: EInvoiceProvider = {
  name: "mock",

  async onboard(_companyId) {
    return {
      ready: true,
      meta: { provider: "mock", reason: "no-op; replace with real provider for production" },
    } satisfies OnboardingResult;
  },

  async submit(invoice: InvoiceForClearance): Promise<ClearanceResult> {
    // Deterministic UUID so re-submits return the same record. Real
    // providers issue a server-side UUID; the mock derives one from
    // the source row so callers can still test idempotency.
    const uuid = `mock-${invoice.sourceType}-${invoice.id}`;
    return {
      status: "cleared",
      uuid,
      externalRef: uuid,
      invoiceHash: null,
      qrCodeBase64: null,
      warnings: [],
      errors: [],
      rawResponseBody: { provider: "mock", reason: "auto-cleared in dev" },
    };
  },

  async resubmit(invoice, uuid) {
    return this.submit({ ...invoice });
    void uuid;
  },

  async health(): Promise<HealthCheckResult> {
    return { ok: true, latencyMs: 0, reason: "mock — always healthy" };
  },
};
