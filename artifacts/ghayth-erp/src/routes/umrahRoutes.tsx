import { lazy } from "react";
import type { ModuleType } from "@/contexts/app-context";

const UmrahDashboard = lazy(() => import("@/pages/umrah/dashboard"));
const UmrahPilgrims = lazy(() => import("@/pages/umrah/pilgrims"));
const UmrahAgents = lazy(() => import("@/pages/umrah/agents"));
const UmrahSubAgents = lazy(() => import("@/pages/umrah/sub-agents"));
const UmrahSeasons = lazy(() => import("@/pages/umrah/seasons"));
const UmrahPenalties = lazy(() => import("@/pages/umrah/penalties"));
const UmrahViolations = lazy(() => import("@/pages/umrah/violations"));
const UmrahInvoices = lazy(() => import("@/pages/umrah/invoices"));
const UmrahImport = lazy(() => import("@/pages/umrah/import"));
const UmrahImportWizard = lazy(() => import("@/pages/umrah/import-wizard"));
const PilgrimCreate = lazy(() => import("@/pages/umrah/pilgrim-create"));
const PilgrimDetail = lazy(() => import("@/pages/umrah/pilgrim-detail"));
const UmrahPackages = lazy(() => import("@/pages/umrah/packages"));
const UmrahPricing = lazy(() => import("@/pages/umrah/pricing"));
const UmrahTransport = lazy(() => import("@/pages/umrah/transport"));
const UmrahCommissionPlans = lazy(() => import("@/pages/umrah/commission-plans"));
const UmrahCommissionPlanEditor = lazy(() => import("@/pages/umrah/commission-plan-editor"));

export const umrahRoutes: { path: string; component: any; module?: ModuleType }[] = [
  { path: "/umrah", component: UmrahDashboard, module: "operations" },
  { path: "/umrah/pilgrims", component: UmrahPilgrims, module: "operations" },
  { path: "/umrah/pilgrims/create", component: PilgrimCreate, module: "operations" },
  { path: "/umrah/pilgrims/:id", component: PilgrimDetail, module: "operations" },
  { path: "/umrah/agents", component: UmrahAgents, module: "operations" },
  { path: "/umrah/sub-agents", component: UmrahSubAgents, module: "operations" },
  { path: "/umrah/seasons", component: UmrahSeasons, module: "operations" },
  { path: "/umrah/penalties", component: UmrahPenalties, module: "operations" },
  { path: "/umrah/violations", component: UmrahViolations, module: "operations" },
  { path: "/umrah/invoices", component: UmrahInvoices, module: "operations" },
  { path: "/umrah/packages", component: UmrahPackages, module: "operations" },
  { path: "/umrah/pricing", component: UmrahPricing, module: "operations" },
  { path: "/umrah/transport", component: UmrahTransport, module: "operations" },
  { path: "/umrah/import", component: UmrahImport, module: "operations" },
  { path: "/umrah/import-wizard", component: UmrahImportWizard, module: "operations" },
  { path: "/umrah/commission-plans", component: UmrahCommissionPlans, module: "operations" },
  { path: "/umrah/commission-plans/new", component: UmrahCommissionPlanEditor, module: "operations" },
  { path: "/umrah/commission-plans/:id", component: UmrahCommissionPlanEditor, module: "operations" },
];
