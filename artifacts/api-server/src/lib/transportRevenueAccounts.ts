// Step 1 of transport customer-invoicing — per-service-type revenue routing.
//
// Maps a transport service type to its revenue posting account, mirroring
// financeSpecializedAccount: returns a { purpose, defaultCode, label } triple
// (never a bare code) so callers route it through
// financialEngine.resolveAccountCode(companyId, purpose, side, defaultCode) — a
// tenant that has mapped the purpose wins, everyone else inherits the seed
// default leaf. Pure + DB-free so the mapping is unit-testable in isolation.
//
// The leaves 4151/4152/4153 are seeded by migration 387 + companyBootstrap.
//
// NOTE (Step 2): this helper is INERT until Step 2 wires it into the invoice
// posting path — it is data, not a resolveAccountCode call site, so its
// defaultCodes do not trip check:postable-fallbacks yet. The residual types
// (equipment_rental / internal_transfer / other) default to the still-postable
// 4150 parent; when Step 2 flips 4150 to a non-postable rollup parent, those
// three must be revisited (point at a leaf or add a dedicated one).

import type { TransportServiceType } from "./transportEnums.js";

export interface TransportRevenueAccount {
  /** Posting-policy purpose key — what tenants remap against in accounting_mappings. */
  purpose: string;
  /** Seed default postable account code used when the purpose isn't mapped. */
  defaultCode: string;
  /** Arabic label for previews / UI hints. */
  label: string;
}

const TRANSPORT_REVENUE_BY_SERVICE_TYPE: Record<TransportServiceType, TransportRevenueAccount> = {
  passenger_umrah:   { purpose: "umrah_transport_revenue",     defaultCode: "4151", label: "إيراد نقل المعتمرين" },
  passenger_general: { purpose: "passenger_transport_revenue", defaultCode: "4152", label: "إيراد نقل الركاب" },
  cargo_load:        { purpose: "freight_revenue",             defaultCode: "4153", label: "إيراد نقل البضائع" },
  // Residuals — default to the (still-postable) 4150 parent until Step 2.
  equipment_rental:  { purpose: "fleet_rental_revenue",        defaultCode: "4150", label: "إيراد تأجير المعدات" },
  internal_transfer: { purpose: "fleet_transport_revenue",     defaultCode: "4150", label: "نقل داخلي" },
  other:             { purpose: "fleet_transport_revenue",     defaultCode: "4150", label: "إيرادات نقل أخرى" },
};

/**
 * Resolve the revenue account routing for a transport service type.
 * Falls back to the generic `other` bucket for any unrecognized value.
 */
export function resolveTransportRevenueAccount(
  serviceType: TransportServiceType,
): TransportRevenueAccount {
  return TRANSPORT_REVENUE_BY_SERVICE_TYPE[serviceType] ?? TRANSPORT_REVENUE_BY_SERVICE_TYPE.other;
}
