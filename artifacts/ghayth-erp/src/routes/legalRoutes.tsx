import { lazy } from "react";

const Legal = lazy(() => import("@/pages/legal"));
const LegalCreate = lazy(() => import("@/pages/create/legal-create"));
const LegalCasesCreate = lazy(() => import("@/pages/create/legal-cases-create"));
const LegalCaseDetail = lazy(() => import("@/pages/legal-case-detail"));
const LegalSessions = lazy(() => import("@/pages/legal/sessions"));
const LegalJudgments = lazy(() => import("@/pages/legal/judgments"));
const LegalCorrespondence = lazy(() => import("@/pages/legal/correspondence"));
const LegalContractDetail = lazy(() => import("@/pages/details/legal-contract-detail"));

export const legalRoutes = [
  { path: "/legal", component: Legal },
  { path: "/legal/create", component: LegalCreate },
  { path: "/legal/contracts", component: Legal },
  { path: "/legal/contracts/:id", component: LegalContractDetail },
  { path: "/legal/sessions", component: LegalSessions },
  { path: "/legal/judgments", component: LegalJudgments },
  { path: "/legal/correspondence", component: LegalCorrespondence },
  { path: "/legal/cases", component: Legal },
  { path: "/legal/cases/create", component: LegalCasesCreate },
  { path: "/legal/cases/:id", component: LegalCaseDetail },
  { path: "/legal/documents", component: Legal },
];
