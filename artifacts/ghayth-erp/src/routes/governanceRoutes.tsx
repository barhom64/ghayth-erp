import { lazy } from "react";

const Governance = lazy(() => import("@/pages/governance"));
const PoliciesCreate = lazy(() => import("@/pages/create/governance/policies-create"));
const RisksCreate = lazy(() => import("@/pages/create/governance/risks-create"));
const AuditsCreate = lazy(() => import("@/pages/create/governance/audits-create"));
const ComplianceCreate = lazy(() => import("@/pages/create/governance/compliance-create"));
const GovernanceCapa = lazy(() => import("@/pages/governance/capa"));
const AuditDetail = lazy(() => import("@/pages/details/audit-detail"));
const PolicyDetail = lazy(() => import("@/pages/details/policy-detail"));
const RiskDetail = lazy(() => import("@/pages/details/risk-detail"));
const ComplianceDetail = lazy(() => import("@/pages/details/compliance-detail"));

export const governanceRoutes = [
  { path: "/governance", component: Governance },
  { path: "/governance/policies/create", component: PoliciesCreate },
  { path: "/governance/policies/:id", component: PolicyDetail },
  { path: "/governance/policies", component: Governance },
  { path: "/governance/risks/create", component: RisksCreate },
  { path: "/governance/risks/:id", component: RiskDetail },
  { path: "/governance/risks", component: Governance },
  { path: "/governance/audits/create", component: AuditsCreate },
  { path: "/governance/audits/:id", component: AuditDetail },
  { path: "/governance/audits", component: Governance },
  { path: "/governance/compliance/create", component: ComplianceCreate },
  { path: "/governance/compliance/:id", component: ComplianceDetail },
  { path: "/governance/compliance", component: Governance },
  { path: "/governance/capa", component: GovernanceCapa },
];
