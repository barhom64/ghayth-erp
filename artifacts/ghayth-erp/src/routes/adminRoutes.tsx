import { lazy } from "react";
import { redirectTo } from "@/components/shared/redirect-to";

const Admin = lazy(() => import("@/pages/admin"));
const AdminUsers = lazy(() => import("@/pages/admin/users"));
const AdminUserOnboarding = lazy(() => import("@/pages/admin/user-onboarding"));
// Legacy classic roles editor retired — RBAC v2 (Role Composer) is the single
// roles system. The old /admin/roles URL now serves the Composer.
const AdminLogs = lazy(() => import("@/pages/admin/logs"));
const AdminIntegrations = lazy(() => import("@/pages/admin-integrations"));
const AdminMonitoring = lazy(() => import("@/pages/admin-monitoring"));
const AdminObservability = lazy(() => import("@/pages/admin-observability"));
const AdminAiGovernance = lazy(() => import("@/pages/admin-ai-governance"));
const AdminAiPromptDetail = lazy(() => import("@/pages/admin-ai-prompt-detail"));
const AdminCommunicationControl = lazy(() => import("@/pages/admin-communication-control"));
const AdminPbxControl = lazy(() => import("@/pages/admin-pbx-control"));
const AdminMasterPlan = lazy(() => import("@/pages/admin-master-plan"));
const AdminNotificationRouting = lazy(() => import("@/pages/admin-notification-routing"));
const AdminVendorSettings = lazy(() => import("@/pages/admin-vendor-settings"));
const AdminViolationsReport = lazy(() => import("@/pages/admin-violations-report"));
const AdminSystemGovernor = lazy(() => import("@/pages/admin-system-governor"));
const AdminPolicyEngine = lazy(() => import("@/pages/admin-policy-engine"));
const AdminDomainRegistry = lazy(() => import("@/pages/admin-domain-registry"));
const AdminEventMonitor = lazy(() => import("@/pages/admin-event-monitor"));
const AdminEventOutbox = lazy(() => import("@/pages/admin-event-outbox"));
const AdminJourneys = lazy(() => import("@/pages/admin-journeys"));
const AdminPostingFailures = lazy(() => import("@/pages/admin-posting-failures"));
const AdminLifecycleMonitor = lazy(() => import("@/pages/admin-lifecycle-monitor"));
const AdminRbacMatrix = lazy(() => import("@/pages/admin-rbac-matrix"));
const RbacSimpleEditor = lazy(() => import("@/pages/admin/rbac-simple-editor"));
const AdminJobTitles = lazy(() => import("@/pages/admin/job-titles"));
const AssistantAsk = lazy(() => import("@/pages/assistant-ask"));
const AdminGlReconciliation = lazy(() => import("@/pages/admin-gl-reconciliation"));
const AdminSystemRegistry = lazy(() => import("@/pages/admin-system-registry"));
const AdminPrintTemplates = lazy(() => import("@/pages/admin/print-templates"));
const AdminPrintDiagnostics = lazy(() => import("@/pages/admin/print-diagnostics"));
const AdminApprovalOverrides = lazy(() => import("@/pages/admin/approval-overrides-report"));
const AdminPdpl = lazy(() => import("@/pages/admin-pdpl"));
const AdminDataImport = lazy(() => import("@/pages/admin-data-import"));
const AdminIntelligencePlayground = lazy(() => import("@/pages/admin-intelligence-playground"));
const AdminDigitalSignature = lazy(() => import("@/pages/admin-digital-signature"));
const AdminZatcaAudits = lazy(() => import("@/pages/admin-zatca-audits"));
const AdminIntegrationsDiagnostics = lazy(() => import("@/pages/admin-integrations-diagnostics"));
const AdminExpiringDocs = lazy(() => import("@/pages/admin/expiring-docs")); // originally PR #1128
const AdminOrgModel = lazy(() => import("@/pages/admin/org-model"));
const AdminEffectivePermissions = lazy(() => import("@/pages/admin/effective-permissions"));
// PR-3 (#2163) — was: dual-owner of /admin/attendance-categories and
// /admin/scoring-weights with the same component as the HR routes.
// Canonical-ownership decision: both are HR business policy (workforce
// categories driving attendance; weights driving evaluation /
// promotion / penalties), not platform admin setup. The admin paths
// stay reachable for bookmarks but redirect to the HR canonical so
// nobody can re-establish two equal owners.
const AdminOrgMemberships = lazy(() => import("@/pages/admin/org-memberships"));
const AdminSubscription = lazy(() => import("@/pages/admin/subscription"));
const RedirectToHrAttendanceCategories = redirectTo("/hr/attendance-categories");
const RedirectToHrScoringWeights      = redirectTo("/hr/scoring-weights");
// /admin/roles-simple rendered the SAME RbacSimpleEditor as the canonical
// /admin/roles — two identical menu entries for one editor. Kept reachable for
// bookmarks but redirected; its «مُركّب الأدوار» nav entry was removed.
const RedirectToAdminRoles            = redirectTo("/admin/roles");

export const adminRoutes = [
  { path: "/admin/expiring-docs", component: AdminExpiringDocs },
  { path: "/admin/subscription", component: AdminSubscription },
  { path: "/admin", component: Admin },
  { path: "/admin/users", component: AdminUsers },
  { path: "/admin/user-onboarding", component: AdminUserOnboarding },
  { path: "/admin/roles", component: RbacSimpleEditor },
  { path: "/admin/logs", component: AdminLogs },
  { path: "/admin/integrations", component: AdminIntegrations },
  { path: "/admin/monitoring", component: AdminMonitoring },
  { path: "/admin/observability", component: AdminObservability },
  { path: "/admin/ai-governance", component: AdminAiGovernance },
  { path: "/admin/ai-governance/prompts/:id", component: AdminAiPromptDetail },
  { path: "/admin/communication-control", component: AdminCommunicationControl },
  { path: "/admin/pbx-control", component: AdminPbxControl },
  { path: "/admin/master-plan", component: AdminMasterPlan },
  { path: "/admin/notification-routing", component: AdminNotificationRouting },
  { path: "/admin/vendor-settings", component: AdminVendorSettings },
  { path: "/admin/violations-report", component: AdminViolationsReport },
  { path: "/admin/system-governor", component: AdminSystemGovernor },
  { path: "/admin/policy-engine", component: AdminPolicyEngine },
  { path: "/admin/domain-registry", component: AdminDomainRegistry },
  { path: "/admin/event-monitor", component: AdminEventMonitor },
  { path: "/admin/outbox", component: AdminEventOutbox },
  { path: "/admin/journeys", component: AdminJourneys },
  { path: "/admin/posting-failures", component: AdminPostingFailures },
  { path: "/admin/lifecycle-monitor", component: AdminLifecycleMonitor },
  { path: "/admin/rbac-matrix", component: AdminRbacMatrix },
  { path: "/admin/roles-simple", component: RedirectToAdminRoles },
  { path: "/admin/job-titles", component: AdminJobTitles },
  { path: "/assistant", component: AssistantAsk },
  { path: "/admin/gl-reconciliation", component: AdminGlReconciliation },
  { path: "/admin/system-registry", component: AdminSystemRegistry },
  { path: "/admin/print-templates", component: AdminPrintTemplates },
  { path: "/admin/print-diagnostics", component: AdminPrintDiagnostics },
  { path: "/admin/approval-overrides", component: AdminApprovalOverrides },
  { path: "/admin/pdpl", component: AdminPdpl },
  { path: "/admin/data-import", component: AdminDataImport },
  { path: "/admin/intelligence-playground", component: AdminIntelligencePlayground },
  { path: "/admin/digital-signature", component: AdminDigitalSignature },
  { path: "/admin/zatca-audits", component: AdminZatcaAudits },
  { path: "/admin/integrations-diagnostics", component: AdminIntegrationsDiagnostics },
  { path: "/admin/org-model", component: AdminOrgModel },
  { path: "/admin/effective-permissions", component: AdminEffectivePermissions },
  // PR-3 (#2163) — these two were dual-owner with /hr/*. Now legacy
  // redirects only; the canonical owner is HR.
  { path: "/admin/attendance-categories", component: RedirectToHrAttendanceCategories },
  { path: "/admin/org-memberships", component: AdminOrgMemberships },
  { path: "/admin/scoring-weights",      component: RedirectToHrScoringWeights },
];
