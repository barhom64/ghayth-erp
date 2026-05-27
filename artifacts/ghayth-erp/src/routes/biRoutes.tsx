import { lazy } from "react";

const BI = lazy(() => import("@/pages/bi"));
const BiDashboards = lazy(() => import("@/pages/bi-dashboards"));
const BiKpis = lazy(() => import("@/pages/bi-kpis"));
const BiReports = lazy(() => import("@/pages/bi-reports"));
const DashboardsCreate = lazy(() => import("@/pages/create/bi/dashboards-create"));
const KpisCreate = lazy(() => import("@/pages/create/bi/kpis-create"));
const BiReportsCreate = lazy(() => import("@/pages/create/bi/reports-create"));
const BiOperations = lazy(() => import("@/pages/bi-operations"));
const BiAdminReports = lazy(() => import("@/pages/bi-admin-reports"));
const PrintLog = lazy(() => import("@/pages/reports/print-log"));

export const biRoutes = [
  { path: "/bi", component: BI },
  { path: "/bi/dashboards", component: BiDashboards },
  { path: "/bi/dashboards/create", component: DashboardsCreate },
  { path: "/bi/kpis", component: BiKpis },
  { path: "/bi/kpis/create", component: KpisCreate },
  { path: "/bi/reports", component: BiReports },
  { path: "/bi/reports/create", component: BiReportsCreate },
  { path: "/bi/operations", component: BiOperations },
  { path: "/bi/admin-reports", component: BiAdminReports },
  { path: "/reports/print-log", component: PrintLog },
];
