import { lazy } from "react";

const Admin = lazy(() => import("@/pages/admin"));
const AdminUsers = lazy(() => import("@/pages/admin/users"));
const AdminRoles = lazy(() => import("@/pages/admin/roles"));
const AdminLogs = lazy(() => import("@/pages/admin/logs"));
const AdminIntegrations = lazy(() => import("@/pages/admin-integrations"));
const AdminMonitoring = lazy(() => import("@/pages/admin-monitoring"));
const AdminViolationsReport = lazy(() => import("@/pages/admin-violations-report"));

export const adminRoutes = [
  { path: "/admin", component: Admin },
  { path: "/admin/users", component: AdminUsers },
  { path: "/admin/roles", component: AdminRoles },
  { path: "/admin/logs", component: AdminLogs },
  { path: "/admin/integrations", component: AdminIntegrations },
  { path: "/admin/monitoring", component: AdminMonitoring },
  { path: "/admin/violations-report", component: AdminViolationsReport },
];
