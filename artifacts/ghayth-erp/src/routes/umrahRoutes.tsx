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

export const umrahRoutes: { path: string; component: any; module?: ModuleType }[] = [
  { path: "/umrah", component: UmrahDashboard, module: "operations" },
  { path: "/umrah/pilgrims", component: UmrahPilgrims, module: "operations" },
  { path: "/umrah/pilgrims/create", component: PilgrimCreate, module: "operations" },
  { path: "/umrah/pilgrims/:id", component: PilgrimDetail, module: "operations" },
  { path: "/umrah/agents", component: UmrahAgents, module: "operations" },
  { path: "/umrah/seasons", component: UmrahSeasons, module: "operations" },
  { path: "/umrah/penalties", component: UmrahPenalties, module: "operations" },
  { path: "/umrah/invoices", component: UmrahInvoices, module: "operations" },
  { path: "/umrah/import", component: UmrahImport, module: "operations" },
];
