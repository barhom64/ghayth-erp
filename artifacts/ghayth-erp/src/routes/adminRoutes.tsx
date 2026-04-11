import { lazy } from "react";

const Admin = lazy(() => import("@/pages/admin"));
const AdminIntegrations = lazy(() => import("@/pages/admin-integrations"));
const AdminMonitoring = lazy(() => import("@/pages/admin-monitoring"));
const AdminViolationsReport = lazy(() => import("@/pages/admin-violations-report"));

export const adminRoutes = [
  { path: "/admin", component: Admin },
  { path: "/admin/users", component: Admin },
  { path: "/admin/roles", component: Admin },
  { path: "/admin/logs", component: Admin },
  { path: "/admin/integrations", component: AdminIntegrations },
  { path: "/admin/monitoring", component: AdminMonitoring },
  { path: "/admin/violations-report", component: AdminViolationsReport },
];
