// Domain-router mount calls extracted from routes/index.ts as part of P3
// (modularise the central router).
//
// Why: routes/index.ts used to be a 529-line monolith holding 120
// router.use(...) calls. Any wrong mount order broke paths, and adding a
// new domain meant touching the orchestrator. Per the senior
// architectural review (finding #4), the central file should be a thin
// orchestrator that delegates the bulk-mount work to a single function.
//
// Order matters — Express resolves routes in registration order, and the
// wiring-stubs error handler MUST sit after the last stub router. Don't
// re-order without reading the existing comments line by line.
//
// This file is a pure side-effect-on-router function: pass in the
// central router and the call mounts all 100+ domain routers in the
// exact same order routes/index.ts used to.

import type { IRouter } from "express";

import dashboardRouter from "./dashboard.js";
import employeesRouter from "./employees.js";
import clientsRouter from "./clients.js";
import hrRouter from "./hr.js";
import { invoicesRouter } from "./finance-invoices.js";
import { journalRouter } from "./finance-journal.js";
import { glHelpersRouter } from "./finance-gl-helpers.js";
import { purchaseRouter } from "./finance-purchase.js";
import { reportsRouter } from "./finance-reports.js";
import { custodiesRouter } from "./finance-custodies.js";
import { zatcaRouter } from "./finance-zatca.js";
import notificationsRouter from "./notifications.js";
import tasksRouter from "./tasks.js";
import fleetRouter from "./fleet.js";
import fleetTelematicsRouter from "./fleet-telematics.js";
import cargoRouter from "./cargo.js";
import warehouseRouter from "./warehouse.js";
import propertiesRouter from "./properties.js";
import legalRouter from "./legal.js";
import projectsRouter from "./projects.js";
import supportRouter from "./support.js";
import crmRouter from "./crm.js";
import intelligenceRouter from "./intelligence.js";
import automationRouter from "./automation.js";
import communicationsRouter from "./communications.js";
import inboxRouter from "./inbox.js";
import mailboxesRouter from "./mailboxes.js";
import governanceRouter from "./governance.js";
import biRouter from "./bi.js";
import storeRouter from "./store.js";
import documentsRouter from "./documents.js";
import requestsRouter from "./requests.js";
import trainingRouter from "./training.js";
import recruitmentRouter from "./recruitment.js";
import marketingRouter from "./marketing.js";
import settingsRouter from "./settings.js";
import rulesRouter from "./rules.js";
import moduleDashboardsRouter from "./moduleDashboards.js";
import adminRouter from "./admin.js";
import adminObservabilityRouter from "./admin-observability.js";
import adminSubscriptionFeaturesRouter from "./admin-subscription-features.js";
import adminAiGovernanceRouter from "./admin-ai-governance.js";
import adminCommControlRouter from "./admin-communication-control.js";
import adminPbxControlRouter from "./admin-pbx-control.js";
import adminMasterPlanRouter from "./admin-master-plan.js";
import adminNotificationRoutingRouter from "./admin-notification-routing.js";
import adminVendorSettingsRouter from "./admin-vendor-settings.js";
import permissionsRouter from "./permissions.js";
import rbacV2Router from "./rbacV2.js";
import auditLogsRouter from "./auditLogs.js";
import searchRouter from "./search.js";
import partiesRouter from "./parties.js";
import activityLogRouter from "./activityLog.js";
import approvalActionsRouter from "./approvalActions.js";
import workflowsRouter from "./workflows.js";
import impactPreviewRouter from "./impactPreview.js";
import mySpaceRouter from "./mySpace.js";
import actionCenterRouter from "./actionCenter.js";
import workspaceRouter from "./workspace.js";
import accountingEngineRouter from "./accounting-engine.js";
import { financeAlgorithmsRouter } from "./finance-algorithms.js";
import financeHardeningRouter from "./finance-hardening.js";
import { recurringRouter } from "./finance-recurring.js";
import entityMetaRouter from "./entityMeta.js";
import umrahRouter from "./umrah.js";
import umrahEntitiesRouter from "./umrah-entities.js";
import operationsCenterRouter from "./operationsCenter.js";
import {
  warehouseStubsRouter,
  documentsStubsRouter,
  hrStubsRouter,
  financeStubsRouter,
  adminStubsRouter,
  wiringScopeErrorHandler,
} from "./wiring-stubs.js";
import notificationEngineRouter from "./notification-engine.js";
import printRouter from "./print.js";
import { exportRouter } from "./export.js";
import importRouter from "./import.js";
import { scheduledReportsRouter } from "./scheduled-reports.js";
import { govIntegrationsRouter } from "./gov-integrations.js";
import { collectionRouter } from "./finance-collection.js";
import { budgetRouter } from "./finance-budget.js";
import { accountsRouter } from "./finance-accounts.js";
import { vendorsRouter } from "./finance-vendors.js";
import { vendorContractsRouter } from "./finance-vendor-contracts.js";
import { costCentersRouter } from "./finance-cost-centers.js";
import disciplineRouter from "./hr-discipline.js";
import loansRouter from "./hr-loans.js";
import overtimeRouter from "./hr-overtime.js";
import exitRouter from "./hr-exit.js";
import wpsRouter from "./hr-wps.js";
import complianceRouter from "./hr-compliance.js";
import digitalSignatureRouter from "./digital-signature.js";
import { eventsRouter } from "./events.js";
import { execDashboardRouter } from "./execDashboard.js";
import { obligationsRouter } from "./obligations.js";
import { calendarRouter } from "./calendar.js";
import contractsRouter from "./hr-contracts.js";
import correspondenceRouter from "./correspondence.js";
import numberingRouter from "./numbering.js";

import { requireModule, requireMinLevel } from "../middlewares/roleGuard.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import { requireGuards } from "../lib/systemGovernor.js";

import {
  umrahUserLimiter,
  financeUserLimiter,
  propertiesUserLimiter,
  fleetUserLimiter,
  warehouseUserLimiter,
  hrUserLimiter,
} from "./_limiters.js";
// P4 — per-feature subscription gate. Mounted once per module prefix
// (e.g. router.use("/fleet", featureGate("fleet.access"))) so every
// sub-router beneath that prefix inherits the 402-on-not-subscribed
// behaviour without each mount having to declare it.
import { featureGate } from "../middlewares/featureGate.js";

/**
 * Mounts every domain router onto the central router in the precise
 * order routes/index.ts used to. Side-effect only; no return value.
 *
 * Call this AFTER the central router has authMiddleware + csrfMiddleware
 * + subscriptionGate + globalUserLimiter applied — those run before
 * every domain mount below.
 */
export function mountDomainRouters(router: IRouter): void {
  router.use("/dashboard", dashboardRouter);
  router.use("/employees", requireModule("hr"), employeesRouter);
  router.use("/clients", requireModule("crm"), clientsRouter);
  // Per-user HR limiter mounted once on /hr so it runs exactly once per
  // request, regardless of which sub-router handles it.
  router.use("/hr", hrUserLimiter);
  // P4 — HR product gate. Mounted once on /hr so every /hr/* sub-router
  // below inherits the entitlement check.
  router.use("/hr", featureGate("hr.access"));
  router.use("/hr", requireModule("hr"), hrRouter);
  router.use("/hr/discipline", requireModule("hr"), disciplineRouter);
  router.use("/hr", requireModule("hr"), loansRouter);
  router.use("/hr", requireModule("hr"), overtimeRouter);
  router.use("/hr", requireModule("hr"), exitRouter);
  router.use("/hr", requireModule("hr"), wpsRouter);
  router.use("/hr", requireModule("hr"), complianceRouter);
  router.use("/hr/training", requireModule("hr"), trainingRouter);
  router.use("/hr/recruitment", requireModule("hr"), recruitmentRouter);
  // Per-user finance limiter — mounted once on /finance so the dozen+
  // finance sub-routers below share a single per-user budget.
  router.use("/finance", financeUserLimiter);
  router.use("/finance", requireModule("finance"), requireGuards("financial"), invoicesRouter);
  router.use("/finance", requireModule("finance"), requireGuards("financial"), journalRouter);
  router.use("/finance", requireModule("finance"), requireGuards("financial"), glHelpersRouter);
  router.use("/finance", requireModule("finance"), requireGuards("financial"), purchaseRouter);
  router.use("/finance", requireModule("finance"), requireGuards("financial"), reportsRouter);
  router.use("/finance", requireModule("finance"), requireGuards("financial"), custodiesRouter);
  router.use("/finance", requireModule("finance"), requireGuards("financial"), zatcaRouter);
  router.use("/finance", requireModule("finance"), requireGuards("financial"), accountingEngineRouter);
  router.use("/finance", requireModule("finance"), requireGuards("financial"), financeAlgorithmsRouter);
  router.use("/finance", requireModule("finance"), requireGuards("financial"), collectionRouter);
  router.use("/finance", requireModule("finance"), requireGuards("financial"), budgetRouter);
  router.use("/finance", requireModule("finance"), requireGuards("financial"), accountsRouter);
  router.use("/finance", requireModule("finance"), requireGuards("financial"), vendorsRouter);
  router.use("/finance", requireModule("finance"), requireGuards("financial"), vendorContractsRouter);
  router.use("/finance", requireModule("finance"), requireGuards("financial"), financeHardeningRouter);
  router.use("/finance", requireModule("finance"), requireGuards("financial"), recurringRouter);
  router.use("/finance", requireModule("finance"), requireGuards("financial"), costCentersRouter);
  router.use("/notifications", notificationsRouter);
  router.use("/tasks", requireModule("operations"), tasksRouter);
  router.use("/fleet", fleetUserLimiter);
  // P4 — fleet product gate. Same prefix-mount pattern as /hr above.
  router.use("/fleet", featureGate("fleet.access"));
  router.use("/fleet", requireModule("fleet"), requireGuards("financial"), fleetRouter);
  // Telematics surface mounted under /fleet so it inherits the module +
  // financial guard + per-user limiter; URLs stay /fleet/telematics/*.
  router.use("/fleet", requireModule("fleet"), requireGuards("financial"), fleetTelematicsRouter);
  // Cargo / freight under fleet module + financial guard. URLs stay
  // /cargo/* (own RBAC feature fleet.cargo).
  router.use("/cargo", requireModule("fleet"), requireGuards("financial"), cargoRouter);
  router.use("/warehouse", warehouseUserLimiter);
  router.use("/warehouse", requireModule("warehouse"), requireGuards("financial"), warehouseRouter);
  router.use("/properties", propertiesUserLimiter);
  router.use("/properties", requireModule("property"), requireGuards("financial"), propertiesRouter);
  // Agent 7 — /legal floor at 40 mirrors sidebar promise.
  router.use("/legal", requireModule("legal"), requireMinLevel(40), legalRouter);
  router.use("/projects", requireModule("operations"), projectsRouter);
  router.use("/support", requireModule("support"), supportRouter);
  router.use("/crm", requireModule("crm"), crmRouter);
  router.use("/intelligence", requireModule("bi"), intelligenceRouter);
  // Agent 7 — sidebar shows automation at level 60; floor here matches.
  router.use("/automation", requireModule("automation"), requireMinLevel(60), automationRouter);
  // Agent 7 — comms management floored at 40.
  router.use("/communications", requireModule("comms"), requireMinLevel(40), communicationsRouter);
  router.use("/inbox", requireModule("comms"), inboxRouter);
  router.use("/mailboxes", requireModule("comms"), mailboxesRouter);
  // Agent 7 — governance floor 60, BI floor 40 (sidebar parity).
  router.use("/governance", requireModule("governance"), requireMinLevel(60), governanceRouter);
  router.use("/bi", requireModule("bi"), requireMinLevel(40), biRouter);
  router.use("/store", requireModule("store"), requireGuards("financial"), storeRouter);
  router.use("/documents", requireModule("documents"), documentsRouter);
  router.use("/requests", requireModule("requests"), requestsRouter);
  router.use("/request-catalog", requireModule("requests"), (req, res, next) => {
    req.url = "/catalog";
    requestsRouter(req, res, next);
  });
  router.use("/marketing", requireModule("marketing"), marketingRouter);
  router.use("/settings", requireModule("settings"), requireMinLevel(70), settingsRouter);
  // Numbering center (Issue #1141): admin surface for the central
  // numbering authority. Per-route authorize() inside the router.
  router.use("/numbering", requireModule("settings"), requireMinLevel(70), numberingRouter);
  router.use("/rules", requireModule("settings"), requireMinLevel(70), rulesRouter);
  router.use("/module-dashboards", requireModule("bi"), moduleDashboardsRouter);
  router.use("/admin", requireModule("admin"), requireMinLevel(90), adminRouter);
  router.use("/admin/observability", requireModule("admin"), requireMinLevel(90), adminObservabilityRouter);
  // P4 — per-feature entitlement admin. Mounted at level 90 (owner /
  // admin / GM) so the upsert + delete actions sit behind the same gate
  // as the rest of /admin.
  router.use("/admin/subscription-features", requireModule("admin"), requireMinLevel(90), adminSubscriptionFeaturesRouter);
  router.use("/admin/ai-governance", requireModule("admin"), requireMinLevel(90), adminAiGovernanceRouter);
  router.use("/admin/communication-control", requireModule("admin"), requireMinLevel(90), adminCommControlRouter);
  router.use("/admin/pbx-control", requireModule("admin"), requireMinLevel(90), adminPbxControlRouter);
  router.use("/admin/master-plan", requireModule("admin"), requireMinLevel(90), adminMasterPlanRouter);
  router.use("/admin/notification-routing", requireModule("admin"), requireMinLevel(90), adminNotificationRoutingRouter);
  router.use("/admin/vendor-settings", requireModule("admin"), requireMinLevel(90), adminVendorSettingsRouter);
  // FND-004 — RBAC administration surfaces at level 90.
  router.use("/permissions", requireMinLevel(90), permissionsRouter);
  router.use("/rbac/v2", requireMinLevel(90), rbacV2Router);
  // GAP_MATRIX #16 — audit:read + level 90 matches sidebar.
  router.use("/audit-logs", requireMinLevel(90), requirePermission("audit:read"), auditLogsRouter);
  router.use("/search", searchRouter);
  router.use("/parties", partiesRouter);
  router.use("/activity-log", requireMinLevel(70), activityLogRouter);
  router.use("/approval-actions", approvalActionsRouter);
  router.use("/workflows", workflowsRouter);
  router.use("/impact-preview", impactPreviewRouter);
  router.use("/my-space", mySpaceRouter);
  // Agent 7 — action-center floor at 20 (sidebar parity).
  router.use("/action-center", requireMinLevel(20), actionCenterRouter);
  router.use("/workspace", workspaceRouter);
  router.use("/entity-meta", entityMetaRouter);
  // Umrah limiter mounted once on /umrah prefix so it runs exactly once
  // even when Express falls through to umrahEntitiesRouter.
  router.use("/umrah", umrahUserLimiter);
  // P4 — umrah product gate. Same prefix-mount pattern as /hr + /fleet.
  router.use("/umrah", featureGate("umrah.access"));
  router.use("/umrah", requireModule("operations"), requireGuards("financial"), umrahRouter);
  router.use("/umrah", requireModule("operations"), requireGuards("financial"), umrahEntitiesRouter);
  router.use("/operations-center", requireModule("operations"), requireMinLevel(40), operationsCenterRouter);
  // Wiring stubs — GAP_MATRIX #17. Floor at 20 (employee+). The order
  // is critical: each stubs router mounts BEFORE wiringScopeErrorHandler.
  router.use("/warehouse", requireModule("warehouse"), requireMinLevel(20), warehouseStubsRouter);
  router.use("/documents", requireModule("documents"), requireMinLevel(20), documentsStubsRouter);
  router.use("/hr", requireModule("hr"), requireMinLevel(20), hrStubsRouter);
  router.use("/finance", requireModule("finance"), requireMinLevel(20), financeStubsRouter);
  router.use("/admin", requireModule("admin"), requireMinLevel(90), adminStubsRouter);
  router.use(wiringScopeErrorHandler);
  router.use("/export", requireMinLevel(30), exportRouter);
  router.use("/import", requireMinLevel(50), importRouter);
  router.use("/scheduled-reports", requireMinLevel(50), scheduledReportsRouter);
  router.use("/notification-engine", requireModule("notifications"), notificationEngineRouter);
  // GAP_MATRIX #18 — gov + digital-signature floor at 70.
  router.use("/gov-integrations", requireMinLevel(70), govIntegrationsRouter);
  router.use("/digital-signature", requireMinLevel(70), digitalSignatureRouter);
  // FND-004/005 — events log + audit access at level 70.
  router.use("/events", requireMinLevel(70), eventsRouter);
  router.use("/exec-dashboard", requireMinLevel(70), execDashboardRouter);
  // Agent 7 — obligations floor 30, calendar floor 20 (sidebar parity).
  router.use("/obligations", requireMinLevel(30), obligationsRouter);
  router.use("/calendar", requireMinLevel(20), calendarRouter);
  router.use("/hr/contracts", requireModule("hr"), contractsRouter);
  router.use("/correspondence", requireModule("comms"), correspondenceRouter);
  router.use("/print", printRouter);
}
