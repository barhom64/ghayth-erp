import { lazy } from "react";
import { redirectTo } from "@/components/shared/redirect-to";

const BI = lazy(() => import("@/pages/bi"));
const DashboardsCreate = lazy(() => import("@/pages/create/bi/dashboards-create"));
const KpisCreate = lazy(() => import("@/pages/create/bi/kpis-create"));
const BiReportsCreate = lazy(() => import("@/pages/create/bi/reports-create"));
const BiOperations = lazy(() => import("@/pages/bi-operations"));
const BiAdminReports = lazy(() => import("@/pages/bi-admin-reports"));
const PrintLog = lazy(() => import("@/pages/reports/print-log"));

export const biRoutes = [
  { path: "/bi", component: BI },
  // GAP_MATRIX P1 — bi.tsx already has in-page tabs; the wrapper pages
  // (bi-dashboards/bi-kpis/bi-reports) created a dual-nav structure.
  // Redirect sub-paths to /bi (canonical) until the tabs are merged.
  { path: "/bi/dashboards", component: redirectTo("/bi") },
  { path: "/bi/dashboards/create", component: DashboardsCreate },
  { path: "/bi/kpis", component: redirectTo("/bi") },
  { path: "/bi/kpis/create", component: KpisCreate },
  { path: "/bi/reports", component: redirectTo("/bi") },
  { path: "/bi/reports/create", component: BiReportsCreate },
  { path: "/bi/operations", component: BiOperations },
  { path: "/bi/admin-reports", component: BiAdminReports },
  { path: "/reports/print-log", component: PrintLog },
];
