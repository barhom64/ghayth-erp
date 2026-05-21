// E-invoice provider registry — config-driven dispatch.
//
// Per docs/ZATCA_PHASE_2_DESIGN.md §4.3, every caller looks up the
// provider by companyId. Today the default is `mock` everywhere
// (PR #310 design landed; live ZATCA implementation deferred until
// sandbox credentials + CSR/cert flow are wired up).
//
// To enable real ZATCA for a company:
//   1. Implement `providers/zatca/index.ts` against the design doc.
//   2. Add a row to `system_settings` (key='einvoice.provider',
//      companyId=<x>, value='zatca') OR set the env override
//      `EINVOICE_DEFAULT_PROVIDER=zatca`.
//   3. Onboard the company via `provider.onboard(companyId)`.

import type { EInvoiceProvider } from "./provider.js";
import { mockEInvoiceProvider } from "./providers/mock/index.js";
import { config } from "../config.js";

// Static registry. Add new entries here when a real provider lands.
// The map is intentionally tiny because the only caller is the
// `getProvider()` function below — there's no UI knob exposing this
// list yet (admin would need a future settings tab).
const PROVIDERS: Record<string, EInvoiceProvider> = {
  mock: mockEInvoiceProvider,
  // zatca: zatcaEInvoiceProvider,    // ← wire when implementation lands
};

/**
 * Resolve the e-invoice provider for a given company.
 *
 * Resolution order:
 *   1. company-level override (system_settings.key='einvoice.provider')
 *      — not yet read (future work; today returns env default)
 *   2. env override (config.zatca.defaultProvider — EINVOICE_DEFAULT_PROVIDER)
 *   3. hard-coded fallback: "mock"
 *
 * The function is intentionally synchronous-feeling so callers can
 * `const p = await getProvider(companyId); await p.submit(...)` in
 * one breath without a separate config lookup. companyId is taken
 * but ignored by the mock — real providers WILL use it to pick the
 * right cert.
 */
export async function getProvider(companyId: number): Promise<EInvoiceProvider> {
  void companyId; // referenced by real providers; mock ignores
  const envOverride = config.zatca.defaultProvider ?? "";
  const key = envOverride || "mock";
  return PROVIDERS[key] ?? PROVIDERS.mock!;
}

/** Diagnostic: list every registered provider name (admin UI). */
export function listProviderNames(): string[] {
  return Object.keys(PROVIDERS);
}
