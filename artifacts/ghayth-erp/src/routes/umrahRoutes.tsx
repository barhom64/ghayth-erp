import { lazy } from "react";
import type { ModuleType } from "@/contexts/app-context";

const UmrahDashboard = lazy(() => import("@/pages/umrah/dashboard"));
const UmrahPilgrims = lazy(() => import("@/pages/umrah/pilgrims"));
const UmrahAgents = lazy(() => import("@/pages/umrah/agents"));
const UmrahSeasons = lazy(() => import("@/pages/umrah/seasons"));
const UmrahPenalties = lazy(() => import("@/pages/umrah/penalties"));
const UmrahInvoices = lazy(() => import("@/pages/umrah/invoices"));
const UmrahImport = lazy(() => import("@/pages/umrah/import"));
const PilgrimCreate = lazy(() => import("@/pages/umrah/pilgrim-create"));
const PilgrimDetail = lazy(() => import("@/pages/umrah/pilgrim-detail"));
const UmrahPackages = lazy(() => import("@/pages/umrah/packages"));
const UmrahTransport = lazy(() => import("@/pages/umrah/transport"));
const UmrahAgentDetail = lazy(() => import("@/pages/details/umrah-agent-detail"));
const UmrahSeasonDetail = lazy(() => import("@/pages/details/umrah-season-detail"));
const UmrahPackageDetail = lazy(() => import("@/pages/details/umrah-package-detail"));
const UmrahInvoiceDetail = lazy(() => import("@/pages/details/umrah-invoice-detail"));
const UmrahPenaltyDetail = lazy(() => import("@/pages/details/umrah-penalty-detail"));

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
  { path: "/umrah/import", component: UmrahImport, module: "operations" },
];
