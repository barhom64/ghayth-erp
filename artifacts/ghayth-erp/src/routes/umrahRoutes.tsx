import { lazy } from "react";
import type { ModuleType } from "@/contexts/app-context";

const UmrahDashboard = lazy(() => import("@/pages/umrah/dashboard"));
const UmrahPilgrims = lazy(() => import("@/pages/umrah/pilgrims"));
const UmrahAgents = lazy(() => import("@/pages/umrah/agents"));
const UmrahSeasons = lazy(() => import("@/pages/umrah/seasons"));
const UmrahPenalties = lazy(() => import("@/pages/umrah/penalties"));
const UmrahInvoices = lazy(() => import("@/pages/umrah/invoices"));
const UmrahImport = lazy(() => import("@/pages/umrah/import"));
const UmrahImportWizard = lazy(() => import("@/pages/umrah/import-wizard"));
const PilgrimCreate = lazy(() => import("@/pages/umrah/pilgrim-create"));
const PilgrimDetail = lazy(() => import("@/pages/umrah/pilgrim-detail"));
const UmrahPackages = lazy(() => import("@/pages/umrah/packages"));
const UmrahTransport = lazy(() => import("@/pages/umrah/transport"));
const UmrahTransportDetail = lazy(() => import("@/pages/details/umrah-transport-detail"));
const UmrahAgentDetail = lazy(() => import("@/pages/details/umrah-agent-detail"));
const UmrahSeasonDetail = lazy(() => import("@/pages/details/umrah-season-detail"));
const UmrahPackageDetail = lazy(() => import("@/pages/details/umrah-package-detail"));
const UmrahInvoiceDetail = lazy(() => import("@/pages/details/umrah-invoice-detail"));
const UmrahPenaltyDetail = lazy(() => import("@/pages/details/umrah-penalty-detail"));

// Wave 5 — extended module
const UmrahSubAgents = lazy(() => import("@/pages/umrah/sub-agents"));
const UmrahPricing = lazy(() => import("@/pages/umrah/pricing"));
const UmrahCommissionPlans = lazy(() => import("@/pages/umrah/commission-plans"));
const UmrahCommissionPlanEditor = lazy(() => import("@/pages/umrah/commission-plan-editor"));
const UmrahViolations = lazy(() => import("@/pages/umrah/violations"));

export const umrahRoutes: { path: string; component: any; module?: ModuleType }[] = [
  { path: "/umrah", component: UmrahDashboard, module: "operations" },
  { path: "/umrah/pilgrims", component: UmrahPilgrims, module: "operations" },
  { path: "/umrah/pilgrims/create", component: PilgrimCreate, module: "operations" },
  { path: "/umrah/pilgrims/:id", component: PilgrimDetail, module: "operations" },
  { path: "/umrah/agents", component: UmrahAgents, module: "operations" },
  { path: "/umrah/agents/:id", component: UmrahAgentDetail, module: "operations" },
  { path: "/umrah/seasons", component: UmrahSeasons, module: "operations" },
  { path: "/umrah/seasons/:id", component: UmrahSeasonDetail, module: "operations" },
  { path: "/umrah/penalties", component: UmrahPenalties, module: "operations" },
  { path: "/umrah/penalties/:id", component: UmrahPenaltyDetail, module: "operations" },
  { path: "/umrah/invoices", component: UmrahInvoices, module: "operations" },
  { path: "/umrah/invoices/:id", component: UmrahInvoiceDetail, module: "operations" },
  { path: "/umrah/packages", component: UmrahPackages, module: "operations" },
  { path: "/umrah/packages/:id", component: UmrahPackageDetail, module: "operations" },
  { path: "/umrah/transport", component: UmrahTransport, module: "operations" },
  { path: "/umrah/transport/:id", component: UmrahTransportDetail, module: "operations" },
  // Legacy import page kept for backward compat; new wizard registered below
  { path: "/umrah/import/legacy", component: UmrahImport, module: "operations" },
  // Wave 5 routes
  { path: "/umrah/sub-agents", component: UmrahSubAgents, module: "operations" },
  { path: "/umrah/pricing", component: UmrahPricing, module: "operations" },
  { path: "/umrah/commission-plans", component: UmrahCommissionPlans, module: "operations" },
  { path: "/umrah/commission-plans/new", component: UmrahCommissionPlanEditor, module: "operations" },
  { path: "/umrah/commission-plans/:id/edit", component: UmrahCommissionPlanEditor, module: "operations" },
  { path: "/umrah/violations", component: UmrahViolations, module: "operations" },
  { path: "/umrah/import", component: UmrahImportWizard, module: "operations" },
];
