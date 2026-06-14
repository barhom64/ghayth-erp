import { lazy } from "react";

// Phase 2 wiring — advanced inventory pages (lots, serials, cycle
// counts, ABC + inventory reports). Backends already exist; these page
// files were built but never routed. Kept in their own routes file so
// the aggregation in registry.ts/App.tsx mirrors the other modules.
const Lots = lazy(() => import("@/pages/warehouse/lots"));
const Serials = lazy(() => import("@/pages/warehouse/serials"));
const CycleCounts = lazy(() => import("@/pages/warehouse/cycle-counts"));
const CycleCountDetail = lazy(() => import("@/pages/warehouse/cycle-count-detail"));
const CycleCountAccuracy = lazy(() => import("@/pages/warehouse/cycle-count-accuracy"));
const ExpiringReport = lazy(() => import("@/pages/warehouse/expiring-report"));
const LotAging = lazy(() => import("@/pages/warehouse/lot-aging"));
const AbcClassification = lazy(() => import("@/pages/warehouse/abc-classification"));

export const warehouseRoutes = [
  { path: "/warehouse/lots", component: Lots },
  { path: "/warehouse/serials", component: Serials },
  // Literal sub-route precedes the ":id" detail so it isn't captured as an id.
  { path: "/warehouse/cycle-counts", component: CycleCounts },
  { path: "/warehouse/cycle-counts/:id", component: CycleCountDetail },
  { path: "/warehouse/reports/accuracy", component: CycleCountAccuracy },
  { path: "/warehouse/reports/expiring", component: ExpiringReport },
  { path: "/warehouse/reports/lot-aging", component: LotAging },
  { path: "/warehouse/abc", component: AbcClassification },
];
