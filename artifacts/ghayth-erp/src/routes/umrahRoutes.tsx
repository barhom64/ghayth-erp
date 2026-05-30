import { lazy } from "react";
import type { ModuleType } from "@/contexts/app-context";

const UmrahDashboard = lazy(() => import("@/pages/umrah/dashboard"));
const UmrahPilgrims = lazy(() => import("@/pages/umrah/pilgrims"));
const UmrahAgents = lazy(() => import("@/pages/umrah/agents"));
const UmrahSeasons = lazy(() => import("@/pages/umrah/seasons"));
const UmrahPenalties = lazy(() => import("@/pages/umrah/penalties"));
const UmrahPayments = lazy(() => import("@/pages/umrah/payments"));
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
const UmrahSubAgentDetail = lazy(() => import("@/pages/details/umrah-sub-agent-detail"));
const UmrahPricing = lazy(() => import("@/pages/umrah/pricing"));
const UmrahSalesWizard = lazy(() => import("@/pages/umrah/sales-wizard"));
const UmrahCommissionPlans = lazy(() => import("@/pages/umrah/commission-plans"));
const UmrahCommissionPlanEditor = lazy(() => import("@/pages/umrah/commission-plan-editor"));
const UmrahViolations = lazy(() => import("@/pages/umrah/violations"));
const UmrahViolationCreate = lazy(() => import("@/pages/umrah/violation-create"));
const UmrahViolationDetail = lazy(() => import("@/pages/details/umrah-violation-detail"));

// Daily run-sheet — surfaces GET /umrah/reports/daily-runsheet from PR #305.
const UmrahDailyRunsheet = lazy(() => import("@/pages/umrah/daily-runsheet"));

// Reconciliation report — surfaces GET /umrah/reports/reconciliation from PR #312.
const UmrahReconciliation = lazy(() => import("@/pages/umrah/reconciliation"));

// Groups list + split / merge actions — surfaces /umrah/groups + the two POST
// endpoints from PR #312.
const UmrahGroups = lazy(() => import("@/pages/umrah/groups"));

// Standalone cross-entity attachments index. Editing is still per-entity
// via the embedded UmrahAttachmentsPanel; this page is read-only.
const UmrahAttachments = lazy(() => import("@/pages/umrah/attachments"));

// Sister page to /umrah/commission-plans — surfaces the historical
// calculations and exposes POST /commission-plans/:id/calculate as a
// dialog so a payroll admin can re-run for a given month/year.
const UmrahCommissionCalculations = lazy(() => import("@/pages/umrah/commission-calculations"));
const UmrahSettings = lazy(() => import("@/pages/umrah/settings"));

export const umrahRoutes: { path: string; component: any; module?: ModuleType }[] = [
  { path: "/umrah", component: UmrahDashboard, module: "operations" },
  // Settings registered FIRST among the umrah/<specific> entries so the
  // page is easy to find when scanning the route table. Module gate is
  // "operations" — same as the rest of umrah; per-action permissions
  // are enforced at the backend (umrah:update on PATCH).
  { path: "/umrah/settings", component: UmrahSettings, module: "operations" },
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
  { path: "/umrah/sub-agents/:id", component: UmrahSubAgentDetail, module: "operations" },
  { path: "/umrah/pricing", component: UmrahPricing, module: "operations" },
  { path: "/umrah/sales-wizard", component: UmrahSalesWizard, module: "operations" },
  { path: "/umrah/commission-plans", component: UmrahCommissionPlans, module: "operations" },
  { path: "/umrah/commission-calculations", component: UmrahCommissionCalculations, module: "operations" },
  { path: "/umrah/commission-plans/new", component: UmrahCommissionPlanEditor, module: "operations" },
  { path: "/umrah/commission-plans/:id/edit", component: UmrahCommissionPlanEditor, module: "operations" },
  { path: "/umrah/violations", component: UmrahViolations, module: "operations" },
  { path: "/umrah/violations/create", component: UmrahViolationCreate, module: "operations" },
  { path: "/umrah/violations/:id", component: UmrahViolationDetail, module: "operations" },
  { path: "/umrah/import", component: UmrahImportWizard, module: "operations" },
  { path: "/umrah/daily-runsheet", component: UmrahDailyRunsheet, module: "operations" },
  { path: "/umrah/reconciliation", component: UmrahReconciliation, module: "operations" },
  { path: "/umrah/payments", component: UmrahPayments, module: "operations" },
  { path: "/umrah/groups", component: UmrahGroups, module: "operations" },
  { path: "/umrah/attachments", component: UmrahAttachments, module: "operations" },
];
