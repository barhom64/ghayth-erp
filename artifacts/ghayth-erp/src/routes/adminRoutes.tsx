import { lazy } from "react";

const Admin = lazy(() => import("@/pages/admin"));
const AdminUsers = lazy(() => import("@/pages/admin/users"));
const AdminRoles = lazy(() => import("@/pages/admin/roles"));
const AdminLogs = lazy(() => import("@/pages/admin/logs"));
const AdminIntegrations = lazy(() => import("@/pages/admin-integrations"));
const AdminMonitoring = lazy(() => import("@/pages/admin-monitoring"));
const AdminViolationsReport = lazy(() => import("@/pages/admin-violations-report"));
const AdminSystemGovernor = lazy(() => import("@/pages/admin-system-governor"));
const AdminPolicyEngine = lazy(() => import("@/pages/admin-policy-engine"));
const AdminDomainRegistry = lazy(() => import("@/pages/admin-domain-registry"));
const AdminEventMonitor = lazy(() => import("@/pages/admin-event-monitor"));
const AdminPostingFailures = lazy(() => import("@/pages/admin-posting-failures"));
const AdminLifecycleMonitor = lazy(() => import("@/pages/admin-lifecycle-monitor"));
const AdminRbacMatrix = lazy(() => import("@/pages/admin-rbac-matrix"));
const AdminGlReconciliation = lazy(() => import("@/pages/admin-gl-reconciliation"));
const AdminSystemRegistry = lazy(() => import("@/pages/admin-system-registry"));

export const adminRoutes = [
  { path: "/admin", component: Admin },
  { path: "/admin/users", component: AdminUsers },
  { path: "/admin/roles", component: AdminRoles },
  { path: "/admin/logs", component: AdminLogs },
  { path: "/admin/integrations", component: AdminIntegrations },
  { path: "/admin/monitoring", component: AdminMonitoring },
  { path: "/admin/violations-report", component: AdminViolationsReport },
  { path: "/admin/system-governor", component: AdminSystemGovernor },
  { path: "/admin/policy-engine", component: AdminPolicyEngine },
  { path: "/admin/domain-registry", component: AdminDomainRegistry },
  { path: "/admin/event-monitor", component: AdminEventMonitor },
  { path: "/admin/posting-failures", component: AdminPostingFailures },
  { path: "/admin/lifecycle-monitor", component: AdminLifecycleMonitor },
  { path: "/admin/rbac-matrix", component: AdminRbacMatrix },
  { path: "/admin/gl-reconciliation", component: AdminGlReconciliation },
  { path: "/admin/system-registry", component: AdminSystemRegistry },
];
