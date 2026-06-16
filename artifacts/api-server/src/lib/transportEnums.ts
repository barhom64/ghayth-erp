// #TA-T18-UX-AUDIT — single source of truth for the transport service-type
// enum. It was previously copy-pasted, byte-identical, into five route files
// (transport-bookings / transport-planning / transport-pricing / cargo /
// fleet-rules-admin), so adding or renaming a service type meant editing five
// places and risked drift. Mirrors the SPA-side lib/transport-constants.ts
// (ROUTE_TYPES) consolidation.
//
// `as const` keeps the readonly tuple so `z.enum(TRANSPORT_SERVICE_TYPES)` and
// `typeof TRANSPORT_SERVICE_TYPES[number]` keep working unchanged at the call
// sites.
export const TRANSPORT_SERVICE_TYPES = [
  "cargo_load", "passenger_umrah", "passenger_general",
  "equipment_rental", "internal_transfer", "other",
] as const;

export type TransportServiceType = typeof TRANSPORT_SERVICE_TYPES[number];
