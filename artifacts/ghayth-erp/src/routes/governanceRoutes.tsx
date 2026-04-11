import { lazy } from "react";

const Governance = lazy(() => import("@/pages/governance"));
const PoliciesCreate = lazy(() => import("@/pages/create/governance/policies-create"));
const RisksCreate = lazy(() => import("@/pages/create/governance/risks-create"));
const AuditsCreate = lazy(() => import("@/pages/create/governance/audits-create"));
const ComplianceCreate = lazy(() => import("@/pages/create/governance/compliance-create"));

export const governanceRoutes = [
  { path: "/governance", component: Governance },
  { path: "/governance/policies", component: Governance },
  { path: "/governance/policies/create", component: PoliciesCreate },
  { path: "/governance/risks", component: Governance },
  { path: "/governance/risks/create", component: RisksCreate },
  { path: "/governance/audits", component: Governance },
  { path: "/governance/audits/create", component: AuditsCreate },
  { path: "/governance/compliance", component: Governance },
  { path: "/governance/compliance/create", component: ComplianceCreate },
];
