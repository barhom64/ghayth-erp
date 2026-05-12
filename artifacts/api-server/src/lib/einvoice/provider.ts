// EInvoiceProvider — vendor-neutral contract for e-invoice clearance.
//
// Per docs/ZATCA_PHASE_2_DESIGN.md §4.2: every call site (finance,
// umrah, anywhere that issues a customer-facing invoice) must talk
// to this interface, never to a vendor-specific submodule. When
// Saudi Arabia rotates its API — or another jurisdiction lands
// (UAE FTA, EU PEPPOL, etc.) — the swap is a single registry entry.
//
// This file declares the abstract contract only. The wired
// implementations live under `providers/<vendor>/index.ts`.

export interface InvoiceForClearance {
  /** Internal DB id of the source invoice row (cross-module). */
  id: number;
  /** Source table — `invoices`, `umrah_sales_invoices`, etc. */
  sourceType: string;
  /** Human reference (UI label + audit trail). */
  ref: string;
  /** Company that owns the invoice (scoping + cert lookup). */
  companyId: number;
  /** Net subtotal in functional currency. */
  subtotal: number;
  /** VAT total. */
  vatAmount: number;
  /** Grand total = subtotal + vatAmount. */
  total: number;
  /** Currency code (ZATCA accepts SAR + 2 other ISO codes). */
  currency: string;
  /** Issue date — ISO 8601. */
  issueDate: string;
  /** Buyer party — name + VAT number + address. */
  buyer: {
    name: string;
    vatNumber?: string | null;
    address?: string | null;
  };
  /** Line items. Each line is a single SKU/service. */
  lines: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    vatAmount: number;
  }>;
}

export interface ClearanceResult {
  /** Final lifecycle state of the invoice after submit. */
  status: "cleared" | "reported" | "rejected" | "pending";
  /** Provider-assigned UUID — never reused on a re-submit. */
  uuid?: string | null;
  /** Provider's own reference number for audit. */
  externalRef?: string | null;
  /** Hash of the cleared XML — links into the PIH chain. */
  invoiceHash?: string | null;
  /** Base64 QR payload for the printed/PDF copy. */
  qrCodeBase64?: string | null;
  /** Provider-side warnings (cleared with warnings still counts as cleared). */
  warnings?: string[];
  /** Provider-side rejection reasons (rejected only). */
  errors?: string[];
  /** Raw provider response body — kept for audit / replay. */
  rawResponseBody?: unknown;
}

export interface OnboardingResult {
  /** Indicates the company is registered with the provider. */
  ready: boolean;
  /** CSR / cert paths (provider-specific). */
  meta?: Record<string, unknown>;
}

export interface HealthCheckResult {
  /** Provider endpoint reachable + responding within SLA. */
  ok: boolean;
  /** Last-known latency ms. */
  latencyMs?: number;
  /** Reason when ok=false. */
  reason?: string;
}

export interface EInvoiceProvider {
  /** Display name for admin UI. */
  readonly name: string;

  /** One-time per-company registration (CSR + cert exchange). */
  onboard(companyId: number): Promise<OnboardingResult>;

  /** Submit a finalised invoice for clearance / reporting. */
  submit(invoice: InvoiceForClearance): Promise<ClearanceResult>;

  /** Re-submit a previously failed invoice. Idempotent on uuid. */
  resubmit(invoice: InvoiceForClearance, uuid: string): Promise<ClearanceResult>;

  /** Sandbox/prod health probe. */
  health(): Promise<HealthCheckResult>;
}
