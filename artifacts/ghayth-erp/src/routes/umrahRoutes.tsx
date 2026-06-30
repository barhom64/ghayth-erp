import { lazy } from "react";
import type { ModuleType } from "@/contexts/app-context";

const UmrahDashboard = lazy(() => import("@/pages/umrah/dashboard"));
const UmrahPilgrims = lazy(() => import("@/pages/umrah/pilgrims"));
const UmrahAgents = lazy(() => import("@/pages/umrah/agents"));
const UmrahSeasons = lazy(() => import("@/pages/umrah/seasons"));
const UmrahAccommodations = lazy(() => import("@/pages/umrah/accommodations"));
const UmrahPenalties = lazy(() => import("@/pages/umrah/penalties"));
const UmrahRefundRequests = lazy(() => import("@/pages/umrah/refund-requests"));
const UmrahPayments = lazy(() => import("@/pages/umrah/payments"));
const UmrahInvoices = lazy(() => import("@/pages/umrah/invoices"));
const UmrahImportWizard = lazy(() => import("@/pages/umrah/import-wizard"));
const UmrahImportUnlinked = lazy(() => import("@/pages/umrah/import-unlinked"));
const PilgrimCreate = lazy(() => import("@/pages/umrah/pilgrim-create"));
const PilgrimDetail = lazy(() => import("@/pages/umrah/pilgrim-detail"));
const UmrahPackages = lazy(() => import("@/pages/umrah/packages"));
const UmrahTransport = lazy(() => import("@/pages/umrah/transport"));
const UmrahTransportDetail = lazy(() => import("@/pages/details/umrah-transport-detail"));
// U-02b M4 (#2080) — operational page for the unified Service Contract
// path (POST /umrah/groups/:id/transport-requests). Not yet linked from
// the sidebar/tabs/calendar; M5 owns that switchover.
const UmrahTransportRequests = lazy(() => import("@/pages/umrah/transport-requests"));
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
// Group detail — drill-down enriched with status breakdown, financials,
// schedule, pilgrim list. Mirrors the agent-detail pattern.
const UmrahGroupDetail = lazy(() => import("@/pages/details/umrah-group-detail"));

// Standalone cross-entity attachments index. Editing is still per-entity
// via the unified EntityDocuments panel on each detail page; this page is read-only.
const UmrahAttachments = lazy(() => import("@/pages/umrah/attachments"));

// Sister page to /umrah/commission-plans — surfaces the historical
// calculations and exposes POST /commission-plans/:id/calculate as a
// dialog so a payroll admin can re-run for a given month/year.
const UmrahCommissionCalculations = lazy(() => import("@/pages/umrah/commission-calculations"));
const UmrahSettings = lazy(() => import("@/pages/umrah/settings"));
// Compliance rollup for the overstayExempt flag (PR #1482-1484) — shows
// everyone currently exempt + the authoriser + reason in one screen.
const UmrahExemptPilgrims = lazy(() => import("@/pages/umrah/exempt-pilgrims"));
// Compliance dashboard — folds exempt + visa-expiring + overstay +
// unpaid penalties into 4 KPI tiles + drill-down links.
const UmrahCompliance = lazy(() => import("@/pages/umrah/compliance"));
const UmrahCalendar = lazy(() => import("@/pages/umrah/calendar"));
// Reports hub + new operational reports.
const UmrahReportsHub = lazy(() => import("@/pages/umrah/reports/index"));
const UmrahAgentBalancesReport = lazy(() => import("@/pages/umrah/reports/agent-balances"));
const UmrahSubAgentBalancesReport = lazy(() => import("@/pages/umrah/reports/subagent-balances"));
const UmrahPilgrimMovementsReport = lazy(() => import("@/pages/umrah/reports/pilgrim-movements"));
const UmrahGroupProfitabilityReport = lazy(() => import("@/pages/umrah/reports/profitability"));
const UmrahAgentProfitabilityReport = lazy(() => import("@/pages/umrah/reports/agent-profitability"));
const UmrahViolationsSummaryReport = lazy(() => import("@/pages/umrah/reports/violations-summary"));
const UmrahCommissionsSummaryReport = lazy(() => import("@/pages/umrah/reports/commissions-summary"));
// §11 stub → available — تقرير تكاليف العمرة (10 cost categories per dimension).
const UmrahCostsReport = lazy(() => import("@/pages/umrah/reports/umrah-costs"));
const UmrahNuskInvoicesSummaryReport = lazy(() => import("@/pages/umrah/reports/nusk-invoices-summary"));
const UmrahTransportReport = lazy(() => import("@/pages/umrah/reports/transport-requests"));
// §11 partial → available — تقرير ملخّص فواتير العملاء (KPIs + 3 breakdowns + 100 recent).
const UmrahSalesInvoicesSummaryReport = lazy(() => import("@/pages/umrah/reports/sales-invoices-summary"));
// §11 partial → available — ملخّص أخطاء الاستيراد (KPIs + 3 breakdowns + 100 recent batches).
const UmrahImportErrorsSummaryReport = lazy(() => import("@/pages/umrah/reports/import-errors-summary"));

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
  { path: "/umrah/accommodations", component: UmrahAccommodations, module: "operations" },
  { path: "/umrah/seasons/:id", component: UmrahSeasonDetail, module: "operations" },
  { path: "/umrah/penalties", component: UmrahPenalties, module: "operations" },
  { path: "/umrah/refund-requests", component: UmrahRefundRequests, module: "operations" },
  { path: "/umrah/penalties/:id", component: UmrahPenaltyDetail, module: "operations" },
  { path: "/umrah/invoices", component: UmrahInvoices, module: "operations" },
  { path: "/umrah/invoices/:id", component: UmrahInvoiceDetail, module: "operations" },
  { path: "/umrah/packages", component: UmrahPackages, module: "operations" },
  { path: "/umrah/packages/:id", component: UmrahPackageDetail, module: "operations" },
  { path: "/umrah/transport", component: UmrahTransport, module: "operations" },
  { path: "/umrah/transport/:id", component: UmrahTransportDetail, module: "operations" },
  // U-02b M4 — new operational entry for the unified contract path.
  // Reachable by URL only at this stage; sidebar/tab integration is M5.
  { path: "/umrah/transport-requests", component: UmrahTransportRequests, module: "operations" },
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
  { path: "/umrah/import/:batchId/unlinked", component: UmrahImportUnlinked, module: "operations" },
  { path: "/umrah/daily-runsheet", component: UmrahDailyRunsheet, module: "operations" },
  { path: "/umrah/exempt-pilgrims", component: UmrahExemptPilgrims, module: "operations" },
  { path: "/umrah/compliance", component: UmrahCompliance, module: "operations" },
  { path: "/umrah/calendar", component: UmrahCalendar, module: "operations" },
  { path: "/umrah/reports", component: UmrahReportsHub, module: "operations" },
  { path: "/umrah/reports/agent-balances", component: UmrahAgentBalancesReport, module: "operations" },
  { path: "/umrah/reports/subagent-balances", component: UmrahSubAgentBalancesReport, module: "operations" },
  { path: "/umrah/reports/pilgrim-movements", component: UmrahPilgrimMovementsReport, module: "operations" },
  { path: "/umrah/reports/group-profitability", component: UmrahGroupProfitabilityReport, module: "operations" },
  { path: "/umrah/reports/agent-profitability", component: UmrahAgentProfitabilityReport, module: "operations" },
  { path: "/umrah/reports/violations-summary", component: UmrahViolationsSummaryReport, module: "operations" },
  { path: "/umrah/reports/commissions-summary", component: UmrahCommissionsSummaryReport, module: "operations" },
  { path: "/umrah/reports/umrah-costs", component: UmrahCostsReport, module: "operations" },
  { path: "/umrah/reports/nusk-invoices-summary", component: UmrahNuskInvoicesSummaryReport, module: "operations" },
  { path: "/umrah/reports/transport-requests", component: UmrahTransportReport, module: "operations" },
  { path: "/umrah/reports/sales-invoices-summary", component: UmrahSalesInvoicesSummaryReport, module: "operations" },
  { path: "/umrah/reports/import-errors-summary", component: UmrahImportErrorsSummaryReport, module: "operations" },
  { path: "/umrah/reconciliation", component: UmrahReconciliation, module: "operations" },
  { path: "/umrah/payments", component: UmrahPayments, module: "operations" },
  { path: "/umrah/groups", component: UmrahGroups, module: "operations" },
  { path: "/umrah/groups/:id", component: UmrahGroupDetail, module: "operations" },
  { path: "/umrah/attachments", component: UmrahAttachments, module: "operations" },
];
