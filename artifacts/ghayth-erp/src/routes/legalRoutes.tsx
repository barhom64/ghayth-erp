import { lazy } from "react";

const Legal = lazy(() => import("@/pages/legal"));
const LegalCreate = lazy(() => import("@/pages/create/legal-create"));
const LegalCasesCreate = lazy(() => import("@/pages/create/legal-cases-create"));
const LegalCaseDetail = lazy(() => import("@/pages/legal-case-detail"));

export const legalRoutes = [
  { path: "/legal", component: Legal },
  { path: "/legal/create", component: LegalCreate },
  { path: "/legal/contracts", component: Legal },
  { path: "/legal/cases", component: Legal },
  { path: "/legal/cases/create", component: LegalCasesCreate },
  { path: "/legal/cases/:id", component: LegalCaseDetail },
  { path: "/legal/documents", component: Legal },
];
