import { Router, type IRouter, type RequestHandler } from "express";
import { logger } from "../lib/logger.js";
import { config } from "../lib/config.js";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import dashboardRouter from "./dashboard.js";
import employeesRouter from "./employees.js";
import clientsRouter from "./clients.js";
import hrRouter from "./hr.js";
// finance.ts monolith removed in Phase 7.1 — all its routes now live in the
// per-domain split files below (finance-vendors, finance-accounts,
// finance-budget, finance-collection, finance-custodies, finance-hardening,
// finance-recurring, finance-purchase, finance-invoices, finance-journal,
// finance-reports, finance-algorithms, accounting-engine, zatca). There is
// no more /finance fallback router.
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
import fleetInspectionsRouter from "./fleet-inspections.js";
import fleetTelematicsRouter from "./fleet-telematics.js";
import fleetTelematicsWebhookRouter from "./fleet-telematics-webhook.js";
import cargoRouter from "./cargo.js";
import siteRouter from "./site.js";
import warehouseRouter from "./warehouse.js";
import { warehouseCycleCountsRouter } from "./warehouse-cycle-counts.js";
import { warehouseAdvancedRouter } from "./warehouse-advanced.js";
import propertiesRouter from "./properties.js";
import legalRouter from "./legal.js";
import projectsRouter from "./projects.js";
import supportRouter from "./support.js";
import crmRouter from "./crm.js";
import intelligenceRouter from "./intelligence.js";
import automationRouter from "./automation.js";
import communicationsRouter from "./communications.js";
import { publicWebhookRouter as communicationsPublicWebhookRouter } from "./communications.js";
import communicationsSmsWebhookRouter from "./communications-sms-webhook.js";
import inboxRouter from "./inbox.js";
import inboxConversationsRouter from "./inboxConversations.js";
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
import storageRouter from "./storage.js";
import activityIngestRouter from "./activityIngest.js";
import mySpaceRouter from "./mySpace.js";
import myFieldTrackingRouter from "./myFieldTracking.js";
import realtimeRouter from "./realtime.js";
import employeeTrackingPolicyRouter from "./employeeTrackingPolicy.js";
import meInsightsRouter from "./meInsights.js";
import actionCenterRouter from "./actionCenter.js";
import workspaceRouter from "./workspace.js";
import accountingEngineRouter from "./accounting-engine.js";
import { financeAlgorithmsRouter } from "./finance-algorithms.js";
import financeHardeningRouter from "./finance-hardening.js";
import { recurringRouter } from "./finance-recurring.js";
import { recurringInvoicesRouter } from "./finance-recurring-invoices.js";
import { cashInTransitRouter } from "./finance-cash-in-transit.js";
import { financeMemoryRouter } from "./finance-memory.js";
import { financeAmortizationRouter } from "./finance-amortization.js";
import { financeDeferredRevenueRouter } from "./finance-deferred-revenue.js";
import { financeInsuranceRouter } from "./finance-insurance.js";
import { transportBillingCandidatesRouter } from "./transport-billing-candidates.js";
import { transportBookingsRouter } from "./transport-bookings.js";
import { vehicleProfileRouter } from "./vehicle-profile.js";
import { transportPricingRouter } from "./transport-pricing.js";
import { transportPlanningRouter } from "./transport-planning.js";
import { fleetDriverHoursRouter } from "./fleet-driver-hours.js"; // أجر السائق بالساعة — الدفعة 1
import { fleetMovementBonusesRouter } from "./fleet-movement-bonuses.js"; // مكافآت حركات النقل — الدفعة أ
import { transportCalendarRouter } from "./transport-calendar.js"; // TR-022
import { fleetOptimizerRouter } from "./fleet-optimizer.js"; // TA-T18-VRP Phase 2
import { transportIntegrationRouter } from "./transport-integration.js";
import { transportRoutePatternsRouter } from "./transport-route-patterns.js";
import { fleetRulesAdminRouter } from "./fleet-rules-admin.js";
import entityMetaRouter from "./entityMeta.js";
import umrahRouter from "./umrah.js";
import umrahEntitiesRouter from "./umrah-entities.js";
// U-07 Phase 1 split: imported here so routeInfrastructure coverage passes.
// The router is mounted as a sub-router via umrah-entities.ts (router.use).
// A dead-code wiring-scanner mount lives below the `router` declaration so
// the FE↔BE wiring audit can discover the routes inside this file.
import journeyReportsRouter from "./umrah-journey-reports.js";
// U-07 Phase 2 — families CRUD split; imported for the wiring-scanner hint
// below. Mounted at runtime via umrah-entities.ts (router.use(familiesRouter)).
import familiesRouter from "./umrah-families.js";
// U-07 Phase 4 — accommodation (hotels/room-blocks/allocations) split; imported
// for the wiring-scanner hint below. Mounted via umrah-entities.ts.
import accommodationRouter from "./umrah-accommodation.js";
// U-07 Phase 5 — commission plans/calculations split; imported for the
// wiring-scanner hint below. Mounted via umrah-entities.ts.
import commissionRouter from "./umrah-commission.js";
// U-07 Phase 6 — sub-agents (CRUD + linking) split; imported for the
// wiring-scanner hint below. Mounted via umrah-entities.ts.
import subAgentsRouter from "./umrah-sub-agents.js";
// U-07 Phase 7 — pricing (CRUD) split; imported for the wiring-scanner
// hint below. Mounted via umrah-entities.ts.
import umrahPricingRouter from "./umrah-pricing.js";
// U-07 Phase 8 — import-batches (listing + unlinked-rows recovery) split;
// imported for the wiring-scanner hint below. Mounted via umrah-entities.ts.
import umrahImportBatchesRouter from "./umrah-import-batches.js";
// U-07 Phase 9 — sub-agent statements (JSON + PDF) split; imported for the
// wiring-scanner hint below. Mounted via umrah-entities.ts.
import umrahStatementsRouter from "./umrah-statements.js";
// U-07 Phase 10 — attachments (polymorphic document storage) split; imported
// for the wiring-scanner hint below. Mounted via umrah-entities.ts.
import umrahAttachmentsRouter from "./umrah-attachments.js";
// U-07 Phase 11 — operational reports (daily-runsheet, reconciliation,
// exempt-pilgrims, group/season portfolio) split; imported for the
// wiring-scanner hint below. Mounted via umrah-entities.ts.
import umrahReportsRouter from "./umrah-reports.js";
// U-07 Phase 12 — letters (PDF + dispatch) split; imported for the
// wiring-scanner hint below. Mounted via umrah-entities.ts.
import umrahLettersRouter from "./umrah-letters.js";
// U-07 Phase 14 — refund requests split; imported for the wiring-scanner hint
// below. Mounted via umrah-entities.ts.
import umrahRefundsRouter from "./umrah-refunds.js";
// U-07 Phase 15 — operational calendar split; imported for the wiring-scanner
// hint below. Mounted via umrah-entities.ts.
import umrahCalendarRouter from "./umrah-calendar.js";
// U-07 Phase 18 — settings policies split; imported for the wiring-scanner hint
// below. Mounted via umrah-entities.ts.
import umrahSettingsRouter from "./umrah-settings.js";
// U-07 Phase 19 — nusk invoices split; imported for the wiring-scanner hint
// below. Mounted via umrah-entities.ts.
import umrahNuskInvoicesRouter from "./umrah-nusk-invoices.js";
// U-07 Phase 20 — payments + revenue reclassification split; imported for the
// wiring-scanner hint below. Mounted via umrah-entities.ts.
import umrahPaymentsRouter from "./umrah-payments.js";
// U-07 Phase 21 — sales-invoices split; imported for the wiring-scanner hint
// below. Mounted via umrah-entities.ts.
import umrahInvoicesRouter from "./umrah-invoices.js";
// U-07 Phase 22 — groups CRUD split; imported for the wiring-scanner hint
// below. Mounted via umrah-entities.ts.
import umrahGroupsRouter from "./umrah-groups.js";
// U-07 Phase 23 — group service-contract (transport + cost-breakdown) split;
// imported for the wiring-scanner hint below. Mounted via umrah-entities.ts.
import umrahGroupTransportRouter from "./umrah-group-transport.js";
// U-07 Phase 24 — employee-assignments split; imported for the wiring-scanner
// hint below. Mounted via umrah-entities.ts.
import umrahEmployeeAssignmentsRouter from "./umrah-employee-assignments.js";
import operationsCenterRouter from "./operationsCenter.js";
import {
  warehouseStubsRouter,
  hrStubsRouter,
  financeStubsRouter,
  adminStubsRouter,
  wiringScopeErrorHandler,
} from "./wiring-stubs.js";
import pricingRouter from "./finance-pricing.js";
import notificationEngineRouter from "./notification-engine.js";
import printRouter from "./print.js";
import printVerifyRouter from "./printVerify.js";
import { requireModule, requireMinLevel } from "../middlewares/roleGuard.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { subscriptionGate } from "../middlewares/subscriptionGate.js";
import { csrfMiddleware } from "../middlewares/csrfMiddleware.js";
import rateLimit from "express-rate-limit";
import { createPerUserLimiter } from "../lib/perUserRateLimit.js";
import { makeRateLimitStore } from "../lib/rateLimitStore.js";
import { rawQuery } from "../lib/rawdb.js";
import clientPortalRouter from "./clientPortal.js";
import publicDataRouter from "./publicData.js";
import careersPortalRouter from "./careersPortal.js";
import { exportRouter } from "./export.js";
import importRouter from "./import.js";
import { scheduledReportsRouter } from "./scheduled-reports.js";
import { govIntegrationsRouter } from "./gov-integrations.js";
import pdplRouter from "./pdpl.js";
import { collectionRouter } from "./finance-collection.js";
import { budgetRouter } from "./finance-budget.js";
import { accountsRouter } from "./finance-accounts.js";
import { vendorsRouter } from "./finance-vendors.js";
import { vendorContractsRouter } from "./finance-vendor-contracts.js";
import { costCentersRouter } from "./finance-cost-centers.js";
import { financeDatafixRouter } from "./finance-datafix.js";
import disciplineRouter from "./hr-discipline.js";
import orgRouter from "./org.js";
import loansRouter from "./hr-loans.js";
import overtimeRouter from "./hr-overtime.js";
import driverPayRouter from "./hr-driver-pay.js"; // معدّلات أجر السائق — الدفعة 2
import exitRouter from "./hr-exit.js";
import wpsRouter from "./hr-wps.js";
import complianceRouter from "./hr-compliance.js";
import digitalSignatureRouter from "./digital-signature.js";
import { eventsRouter } from "./events.js";
import { execDashboardRouter } from "./execDashboard.js";
import assistantRouter from "./assistant.js";
import { obligationsRouter } from "./obligations.js";
import { calendarRouter } from "./calendar.js";
import { customFieldsRouter } from "./customFields.js";
import contractsRouter from "./hr-contracts.js";
import correspondenceRouter from "./correspondence.js";
import numberingRouter from "./numbering.js";
import { requireGuards } from "../lib/systemGovernor.js";

const router: IRouter = Router();

// U-19-P7 follow-up: the FE↔BE wiring scanner only discovers routes that are
// mounted directly in routes/index.ts (regex on `router.use(`). Routes inside
// `umrah-journey-reports.ts` are mounted via the umrah-entities.ts sub-router
// chain, which the scanner doesn't follow, so the FE call to
// /umrah/reports/recovery-hub looks like an orphan. The mount below is dead
// code at runtime (the false-guard short-circuits), but the scanner picks it
// up as a route-bearing mount on /umrah, so the FE call resolves correctly.
// Real handling still happens through the umrahEntitiesRouter sub-mount, with
// the full requireModule + requireGuards chain.
const __WIRING_SCANNER_HINT__: boolean = false;
if (__WIRING_SCANNER_HINT__) {
  router.use("/umrah", journeyReportsRouter);
  router.use("/umrah", familiesRouter);
  router.use("/umrah", accommodationRouter);
  router.use("/umrah", commissionRouter);
  router.use("/umrah", subAgentsRouter);
  router.use("/umrah", umrahPricingRouter);
  router.use("/umrah", umrahImportBatchesRouter);
  router.use("/umrah", umrahStatementsRouter);
  router.use("/umrah", umrahAttachmentsRouter);
  router.use("/umrah", umrahReportsRouter);
  router.use("/umrah", umrahLettersRouter);
  router.use("/umrah", umrahRefundsRouter);
  router.use("/umrah", umrahCalendarRouter);
  router.use("/umrah", umrahSettingsRouter);
  router.use("/umrah", umrahNuskInvoicesRouter);
  router.use("/umrah", umrahPaymentsRouter);
  router.use("/umrah", umrahInvoicesRouter);
  router.use("/umrah", umrahGroupsRouter);
  router.use("/umrah", umrahGroupTransportRouter);
  router.use("/umrah", umrahEmployeeAssignmentsRouter);
}

router.use(healthRouter);

// Per-IP limiter for the truly anonymous surfaces. Replaces the old
// blanket /api globalLimiter that lived in app.ts and unfairly counted
// authenticated traffic. Anonymous endpoints don't have a userId to key
// off, so per-IP is the only honest option here.
//
// /api/health is excluded so liveness probes never trip the cap.
const anonymousIpLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: config.isProduction ? 100 : 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "تم تجاوز الحد الأقصى للطلبات. يرجى المحاولة لاحقاً" },
  validate: { ip: false, trustProxy: false },
  store: makeRateLimitStore("anon:ip"),
});

router.use(storageRouter);
router.use(activityIngestRouter);
// /auth is special: it mixes anonymous endpoints (/login, /register,
// /refresh) with authenticated ones (/me, /logout, /switch-assignment,
// /change-password). We deliberately do NOT mount anonymousIpLimiter on
// the whole /auth router — that would throw an IP cap on the
// authenticated endpoints too. Instead, the anonymous endpoints inside
// auth.ts each have their own per-IP limiter (loginLimiter, refreshLimiter,
// registerLimiter), and the authenticated ones use per-user limiters
// (authedUserLimiter / changePasswordLimiter) declared inside auth.ts.
router.use("/auth", authRouter);
// /portal mixes anonymous login with authenticated portal API. The
// router applies loginLimiter per-IP on /login and a portal JWT
// middleware on the rest, so adding a router-wide IP limiter here would
// double-cap authenticated portal users. Skip it.
router.use("/portal", clientPortalRouter);
// /driver-portal retired (#1354). Driver self-service now lives at
// /api/fleet/me/* under the regular ERP auth + RBAC plumbing — the
// "driver" role on the user's employee_assignment unlocks the
// fleet.trips.my / fleet.cargo.my / fleet.driver.me features that
// power /me/driver in the SPA.
// /careers mixes anonymous applicant flows with authenticated ones
// behind a careers JWT. Same reasoning as /portal — don't add a
// router-wide IP cap; portalLimiter inside careersPortal.ts handles the
// anonymous traffic.
router.use("/careers", careersPortalRouter);
// /public is fully anonymous → per-IP cap is correct here.
router.use("/public", anonymousIpLimiter, publicDataRouter);
// Print verify is anonymous so couriers/customers can scan a printed
// QR without an ERP account. Mounted as /print/verify (before the
// authMiddleware below) so the URL embedded in QRs stays
// /api/print/verify/:jobId. The authenticated printRouter mounts later
// and never sees these requests.
router.use("/print/verify", printVerifyRouter);
// /pdpl mixes anonymous /privacy-notice with authenticated endpoints.
// Limiters live inside pdpl.ts: per-IP on /privacy-notice, per-user
// (pdplUserLimiter) on the authenticated routes.
router.use("/pdpl", pdplRouter);
// #1354 — CMSV6 telematics webhook. Anonymous surface, HMAC-signed via
// the integration's webhookSecret. Mounted BEFORE authMiddleware so the
// vendor doesn't need an ERP JWT. The router enforces per-IP rate limit,
// timestamp window, and timing-safe signature compare inside.
router.use("/webhooks/cmsv6", fleetTelematicsWebhookRouter);

// SMS inbound webhook (Twilio). Anonymous surface, X-Twilio-Signature-verified
// inside the router. Mounted BEFORE authMiddleware so Twilio (which carries no
// ERP JWT) can reach it; only POST /communications/sms/webhook is defined here,
// every other /communications/* path falls through to the authenticated
// communicationsRouter mounted later.
router.use("/communications", communicationsSmsWebhookRouter);

// WhatsApp + PBX inbound webhooks. Same rationale as the SMS webhook above:
// Meta / the PBX vendor carry no ERP JWT, and each handler verifies its own
// signature, so these must be reachable BEFORE authMiddleware. Previously they
// were registered on the authenticated communications router and got 401'd —
// inbound WhatsApp messages and PBX call events never reached the system.
router.use("/communications", communicationsPublicWebhookRouter);

// Realtime SSE stream. Mounted BEFORE authMiddleware because EventSource can't
// send an Authorization header, so the route authenticates itself from a query
// token (native) / cookie (web) / Bearer. It pushes live change-events so the
// web and native app stay in sync without a manual refresh.
router.use("/realtime", realtimeRouter);

router.get("/settings/display", async (req, res) => {
  try {
    const cookieToken: string | undefined = req.cookies?.erp_access;
    const authHeader = req.headers.authorization;
    const rawToken = cookieToken || (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined);
    let companyId: number | null = null;
    if (rawToken) {
      try {
        const jwt = await import("jsonwebtoken");
        const SECRET = config.jwtSecret;
        const payload: any = jwt.default.verify(rawToken, SECRET!, { algorithms: ["HS256"] });
        if (payload?.companyId && payload?.type !== "client_portal") companyId = payload.companyId;
      } catch (e) { logger.debug(e, "public-settings JWT decode (optional)"); }
    }
    const rows = await rawQuery<{ key: string; value: string }>(
      companyId
        ? `SELECT key, value FROM system_settings WHERE key IN ('currency','timezone','companyName') AND ("companyId" IS NULL OR "companyId" = $1) AND "branchId" IS NULL`
        : `SELECT key, value FROM system_settings WHERE key IN ('currency','timezone','companyName') AND "companyId" IS NULL AND "branchId" IS NULL`,
      companyId ? [companyId] : []
    );
    const result: Record<string, string> = {};
    for (const row of rows) result[row.key] = row.value;
    res.json({ data: result });
  } catch (e) {
    logger.warn(e, "failed to load system settings, using defaults");
    res.json({ data: { currency: "SAR", timezone: "Asia/Riyadh", companyName: "" } });
  }
});

// Route discovery endpoint — disabled in production, admin-only otherwise.
router.get("/_routes", (req, res, next): void => {
  if (config.isProduction) {
    res.status(404).json({ error: "المسار غير موجود" });
    return;
  }
  next();
}, (_req, res) => {
  const found: { method: string; path: string }[] = [];
  const walk = (stack: any[], prefix: string): void => {
    for (const layer of stack ?? []) {
      if (layer.route) {
        const methods = Object.keys(layer.route.methods ?? {})
          .filter((m) => m !== "_all")
          .map((m) => m.toUpperCase());
        for (const method of methods) {
          found.push({ method, path: prefix + layer.route.path });
        }
      } else if (layer.name === "router" && layer.handle?.stack) {
        const match = layer.regexp?.source?.match(/^\^\\\/([^\\]+)/);
        const mountPoint = match ? `/${match[1]}` : "";
        walk(layer.handle.stack, prefix + mountPoint);
      }
    }
  };
  walk(router.stack, "/api");
  found.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
  res.json({ count: found.length, routes: found });
});

router.use(authMiddleware);
router.use(csrfMiddleware);

// B2 subscription gate. Mounted after authMiddleware so req.scope is
// set, before any module router so an expired tenant gets blocked at
// the edge instead of inside per-domain code. Owners always pass to
// reach /admin/subscription and pay — non-owners get a 402.
router.use(subscriptionGate);

// Website CMS (multi-tenant). Per-route RBAC (feature "website") + CSRF; no
// requireModule gate so owner/GM reach it without a module subscription key.
router.use("/site", siteRouter);

// Per-user catch-all limiter for ALL authenticated /api traffic. Replaces
// the blanket per-IP globalLimiter that used to live in app.ts. Mounted
// here so it runs after authMiddleware (req.scope is set) and BEFORE any
// module router, giving every authenticated route a baseline per-user
// budget. Module-specific limiters below stack on top with their own
// (smaller-prefix, often tighter) budgets — both must pass.
const globalUserLimiter = createPerUserLimiter({
  prefix: "api:global",
  windowMs: 60 * 1000,
  max: config.isProduction ? 600 : 6000,
  message: "تم تجاوز الحد الأقصى للطلبات. يرجى المحاولة لاحقاً",
});
router.use(globalUserLimiter);

// ─────────────────────────────────────────────────────────────────────────────
// Per-user rate limiters for heavy modules.
//
// Same shape as the umrah limiter below: mounted AFTER authMiddleware,
// keyed off req.scope.userId, owner/admin roles exempt. The cap is generous
// (300/min — ~5/sec sustained, well above any realistic human pace) so a
// normal session is never throttled, but a runaway loop or misbehaving
// client is still capped. Each module has its own prefix so a finance-heavy
// session doesn't eat into a fleet click's budget.
//
// Anonymous traffic can never reach these — authMiddleware rejects it first
// — and the global /api limiter in app.ts still covers anonymous abuse.
// ─────────────────────────────────────────────────────────────────────────────
const umrahUserLimiter = createPerUserLimiter({
  prefix: "umrah",
  windowMs: 60 * 1000,
  max: 300,
  message: "تم تجاوز الحد الأقصى لطلبات العمرة. يرجى المحاولة لاحقاً",
});
const financeUserLimiter = createPerUserLimiter({
  prefix: "finance",
  windowMs: 60 * 1000,
  max: 300,
  message: "تم تجاوز الحد الأقصى لطلبات المالية. يرجى المحاولة لاحقاً",
});
const propertiesUserLimiter = createPerUserLimiter({
  prefix: "properties",
  windowMs: 60 * 1000,
  max: 300,
  message: "تم تجاوز الحد الأقصى لطلبات العقارات. يرجى المحاولة لاحقاً",
});
const fleetUserLimiter = createPerUserLimiter({
  prefix: "fleet",
  windowMs: 60 * 1000,
  max: 300,
  message: "تم تجاوز الحد الأقصى لطلبات الأسطول. يرجى المحاولة لاحقاً",
});
const warehouseUserLimiter = createPerUserLimiter({
  prefix: "warehouse",
  windowMs: 60 * 1000,
  max: 300,
  message: "تم تجاوز الحد الأقصى لطلبات المستودع. يرجى المحاولة لاحقاً",
});
const hrUserLimiter = createPerUserLimiter({
  prefix: "hr",
  windowMs: 60 * 1000,
  max: 300,
  message: "تم تجاوز الحد الأقصى لطلبات الموارد البشرية. يرجى المحاولة لاحقاً",
});

router.use("/dashboard", dashboardRouter);
router.use("/employees", requireModule("hr"), employeesRouter);
// #2134 — clients are the finance counterparty master data: the invoice and
// voucher forms (finance module) read this list for their client picker, so a
// finance-module user must reach it without holding the CRM module. The
// per-route authorize (crm.clients) still gates every action.
router.use("/clients", requireModule("crm", "finance"), clientsRouter);
// Per-user HR limiter mounted once on /hr so it runs exactly once per
// request, regardless of which sub-router handles it. See umrah notes below.
router.use("/hr", hrUserLimiter);
// Mount the tracking-policy router BEFORE hrRouter: hr.ts defines a generic
// GET/PATCH "/attendance/:id" that would otherwise shadow the more specific
// "/attendance/tracking-policies" list/create routes (parsing "tracking-policies"
// as an :id → 422). Specific router first wins.
router.use("/hr", requireModule("hr"), employeeTrackingPolicyRouter);
router.use("/hr", requireModule("hr"), hrRouter);
router.use("/hr/discipline", requireModule("hr"), disciplineRouter);
router.use("/hr", requireModule("hr"), loansRouter);
router.use("/hr", requireModule("hr"), overtimeRouter);
router.use("/hr", requireModule("hr"), driverPayRouter); // معدّلات أجر السائق — الدفعة 2
router.use("/hr", requireModule("hr"), exitRouter);
router.use("/hr", requireModule("hr"), wpsRouter);
router.use("/hr", requireModule("hr"), complianceRouter);
router.use("/hr/training", requireModule("hr"), trainingRouter);
router.use("/hr/recruitment", requireModule("hr"), recruitmentRouter);
// نموذج المؤسسة التشغيلي — مرفق تحت /org، يتطلب صلاحية HR (نفس family).
router.use("/org", requireModule("hr"), orgRouter);
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
// قوالب الفوترة المتكررة للعملاء (#كلها). CRUD غير دفتري؛ التوليد دفعة لاحقة.
router.use("/finance", requireModule("finance"), requireGuards("financial"), recurringInvoicesRouter);
// النقد في الطريق (#2714). طوران يُرحَّلان عبر postJournalEntry القائم.
router.use("/finance", requireModule("finance"), requireGuards("financial"), cashInTransitRouter);
router.use("/finance", requireModule("finance"), requireGuards("financial"), financeMemoryRouter);
router.use("/finance", requireModule("finance"), requireGuards("financial"), financeAmortizationRouter);
router.use("/finance", requireModule("finance"), requireGuards("financial"), financeDeferredRevenueRouter);
router.use("/finance", requireModule("finance"), requireGuards("financial"), financeInsuranceRouter);
router.use("/finance", requireModule("finance"), requireGuards("financial"), costCentersRouter);
// #2090 FIN-DATAFIX — READ-ONLY misparented-subsidiary inventory (report only,
// no mutation endpoint). Gated at requireMinLevel(70) + finance.accounts view
// inside the router; mounted here so URLs are /finance/datafix/*.
router.use("/finance", requireModule("finance"), requireGuards("financial"), financeDatafixRouter);
// #1733 — Transport-to-finance handoff queue. Lives under /finance because
// only finance-side roles see it (transport NEVER materialises JEs).
router.use("/finance", requireModule("finance"), requireGuards("financial"), transportBillingCandidatesRouter);
// financeRouter (finance.ts monolith) removed in Phase 7.1 — the 13
// singleton routes it still owned were migrated to finance-purchase.ts,
// finance-vendors.ts, and finance-reports.ts during canonicalisation.
router.use("/notifications", notificationsRouter);
router.use("/tasks", requireModule("operations"), tasksRouter);
router.use("/fleet", fleetUserLimiter);
router.use("/fleet", requireModule("fleet"), requireGuards("financial"), fleetRouter);
// Vehicle inspections + photos (متابعة النقل بالصور). Same /fleet module gate.
router.use("/fleet", requireModule("fleet"), requireGuards("financial"), fleetInspectionsRouter);
// Telematics surface (#1354). Mounted under /fleet so it inherits the same
// module + financial guard + per-user limiter as the rest of the fleet
// module, and so URLs stay /fleet/telematics/* in the SPA.
router.use("/fleet", requireModule("fleet"), requireGuards("financial"), fleetTelematicsRouter);
// Cargo / freight (#1354). Same fleet module gate + financial guard.
// URLs stay /cargo/* at the top level (not /fleet/cargo/*) because
// cargo is its own RBAC feature (fleet.cargo) and its own SPA tab.
router.use("/cargo", requireModule("fleet"), requireGuards("financial"), cargoRouter);
// #1733/#1812 Booking/Dispatch/VehicleProfile/Pricing/Planning/Integration/
// RoutePatterns/Rules routers carry their OWN absolute paths (/transport/* and
// /fleet/*), so they mount WITHOUT a prefix.
//
// CRITICAL (#1959): the fleet-module + financial guards must be applied BY PATH,
// not as a path-less `router.use(requireModule("fleet"), …)`. A path-less
// requireModule runs for EVERY later request and 403'd every NON-OWNER user out
// of every module mounted after this point (projects / crm / legal / properties
// / support / …) — owner short-circuits requireModule, so only non-admins hit
// it (admin-passes / non-admin-fails). `transportPathGate` is path-CONDITIONAL
// with NO mount path (so Express never strips the prefix — requireGuards reads
// the real req.path), and gates ONLY /transport + /fleet; every route in these 7
// routers lives under those two prefixes (verified: 56 /transport + 14 /fleet,
// zero others). PR-5a (#2077) hit the SAME bug for HR's صندوق الأعمال
// and merged into main's #1959 solution.
const fleetModuleGate = requireModule("fleet");
const transportFinancialGate = requireGuards("financial");
const transportPathGate: RequestHandler = (req, res, next) => {
  if (req.path.startsWith("/transport") || req.path.startsWith("/fleet")) {
    fleetModuleGate(req, res, (err?: unknown) => (err ? next(err as Error) : transportFinancialGate(req, res, next)));
    return;
  }
  next();
};
router.use(transportPathGate);
router.use(transportBookingsRouter);
router.use(vehicleProfileRouter);
router.use(transportPricingRouter);
router.use(transportPlanningRouter);
router.use(fleetDriverHoursRouter);  // أجر السائق بالساعة — ساعات العمل (الدفعة 1)
router.use(fleetMovementBonusesRouter); // مكافآت حركات النقل (الدفعة أ)
router.use(transportCalendarRouter); // TR-022 unified transport calendar
router.use(fleetOptimizerRouter);    // TA-T18-VRP Phase 2 batch optimizer
router.use(transportIntegrationRouter);
router.use(transportRoutePatternsRouter);
router.use(fleetRulesAdminRouter);
router.use("/warehouse", warehouseUserLimiter);
router.use("/warehouse", requireModule("warehouse"), requireGuards("financial"), warehouseRouter);
router.use("/warehouse", requireModule("warehouse"), requireGuards("financial"), warehouseCycleCountsRouter);
router.use("/warehouse", requireModule("warehouse"), requireGuards("financial"), warehouseAdvancedRouter);
router.use("/properties", propertiesUserLimiter);
router.use("/properties", requireModule("property"), requireGuards("financial"), propertiesRouter);
// GAP_MATRIX P1 — role ladder: 40 is not a real role level; nearest real
// level above employee (10) is department_manager (50). Floor raised to 50.
router.use("/legal", requireModule("legal"), requireMinLevel(50), legalRouter);
router.use("/projects", requireModule("operations"), projectsRouter);
router.use("/support", requireModule("support"), supportRouter);
router.use("/crm", requireModule("crm"), crmRouter);
router.use("/intelligence", requireModule("bi"), intelligenceRouter);
// Agent 7 — sidebar shows الأتمتة only at level 60 + admin:update; the
// mount used to be module-only. Floor at 60 so direct-URL traffic
// GAP_MATRIX P1 — "automation" is not in CANONICAL_MODULES so no role gets it
// by default; frontend nav gates the entry under module="admin". Align the
// backend mount to module="admin" so admin-granted users can actually reach
// the API. Per-route authorize() inside automationRouter uses admin:list /
// admin:update on every call.
router.use("/automation", requireModule("admin"), requireMinLevel(60), automationRouter);
// GAP_MATRIX P1 — role ladder: 40 not a real role level; raised to 50
// (department_manager+). Per-route authorize() still applies inside.
router.use("/communications", requireModule("comms"), requireMinLevel(50), communicationsRouter);
// User-facing inbox: compose/send + thread view + call log. Lives next
// to /communications (read-only logs) so the SPA can navigate between
// them without crossing module boundaries.
// /inbox/conversations is the persisted Conversation canon (#2138,
// migration 335) — mounted before the legacy /inbox router so its
// paths win; the computed /inbox/threads view keeps serving the
// current UI until the conversation-first frontend slice lands.
router.use("/inbox/conversations", requireModule("comms"), inboxConversationsRouter);
router.use("/inbox", requireModule("comms"), inboxRouter);
router.use("/mailboxes", requireModule("comms"), mailboxesRouter);
// Agent 7 — sidebar gates الحوكمة والامتثال at level 60 and ذكاء الأعمال
// at level 40; mounts used to be module-only. Floor both at the sidebar
// level so direct-URL access matches what the menu shows.
router.use("/governance", requireModule("governance"), requireMinLevel(60), governanceRouter);
// GAP_MATRIX P1 — role ladder: 40 not a real role level; raised to 50.
router.use("/bi", requireModule("bi"), requireMinLevel(50), biRouter);
router.use("/store", requireModule("store"), requireGuards("financial"), storeRouter);
router.use("/documents", requireModule("documents"), documentsRouter);
router.use("/requests", requireModule("requests"), requestsRouter);
router.use("/request-catalog", requireModule("requests"), (req, res, next) => {
  req.url = "/catalog";
  requestsRouter(req, res, next);
});
router.use("/marketing", requireModule("marketing"), marketingRouter);
router.use("/settings", requireModule("settings"), requireMinLevel(70), settingsRouter);
// #2719 — الحقول المخصّصة لكل شركة: تعريفات + قيم EAV (هجرة 394). إدارة المخطط
// عبر صلاحية settings؛ القيم تُحفظ في جدولها فقط (لا مساس بجداول الكيانات).
router.use("/custom-fields", requireModule("settings"), requireMinLevel(50), customFieldsRouter);
// Numbering center (Issue #1141): admin surface for the central numbering
// authority. authMiddleware is applied inside the router (it carries
// per-route authorize() guards on `settings.numbering[.override|.reset|.audit]`).
router.use("/numbering", requireModule("settings"), requireMinLevel(70), numberingRouter);
router.use("/rules", requireModule("settings"), requireMinLevel(70), rulesRouter);
// PR-1 / #2163 — decouple /module-dashboards/* from requireModule("bi").
// Each tab endpoint inside moduleDashboardsRouter (/hr, /finance, /fleet,
// /crm, /store, /support, /legal, /properties, /projects, /tasks,
// /warehouse) already carries its own `authorize({ feature: "<module>",
// action: "list" })` per-route gate. The mount-level requireModule("bi")
// was an over-reach (FU-2 from #2077, PR-0 §7 of #2163): it blocked
// every manager that owned their own module but not BI — e.g. مدير HR
// couldn't open «لوحة الموارد البشرية» despite holding the hr module.
// The per-route authorize() is the canonical gate; the mount stays
// auth-only.
router.use("/module-dashboards", moduleDashboardsRouter);
router.use("/admin", requireModule("admin"), requireMinLevel(90), adminRouter);
// Observability operator pane (#1139 §5). Mounted under /admin/observability
// so the same module + minLevel guards apply; each endpoint inside also
// calls authorize() to stay consistent with the rest of admin.
router.use("/admin/observability", requireModule("admin"), requireMinLevel(90), adminObservabilityRouter);
// AI Governance surface (#1139 §4 — provider registry + prompt catalog +
// review center). Same gating as the rest of /admin.
router.use("/admin/ai-governance", requireModule("admin"), requireMinLevel(90), adminAiGovernanceRouter);
// Communication Control Plane (#1139 §3 — provider failover + DLP +
// unified inbox).
router.use("/admin/communication-control", requireModule("admin"), requireMinLevel(90), adminCommControlRouter);
// PBX/IVR/Recording control plane (#1139 §3 — voice side).
router.use("/admin/pbx-control", requireModule("admin"), requireMinLevel(90), adminPbxControlRouter);
// Master Plan dashboard (#1139 §6 — "كل شيء قابل للتحكم من الواجهة")
router.use("/admin/master-plan", requireModule("admin"), requireMinLevel(90), adminMasterPlanRouter);
// Notification Routing rules + fallback chains UI (existing tables;
// new admin surface to fulfil #1139 §6 "كل شيء قابل للتحكم من الواجهة").
router.use("/admin/notification-routing", requireModule("admin"), requireMinLevel(90), adminNotificationRoutingRouter);
// Vendor Settings hub — every external integration (PBX webhook, WhatsApp,
// SMTP, VAPID, SIEM, ZATCA) editable from the UI, secrets encrypted at rest.
router.use("/admin/vendor-settings", requireModule("admin"), requireMinLevel(90), adminVendorSettingsRouter);
// FND-004 — RBAC administration surfaces. permissions.ts is fully
// authorize()-guarded per route; rbacV2.ts had a few routes without one;
// gating the mount at level 90 (consistent with /admin) closes the gap
// and is defence-in-depth against any future unguarded route.
// PR-10 (#2077) — pre-existing FND-004 (#866) over-reach: the guard
// was added when this router only carried admin endpoints, but the
// only route here today is /permissions/my, the self-introspection
// surface that drives sidebar/button gating for EVERY user. The route
// file's own comment is explicit: «self-introspection endpoint that
// every authenticated user must be able to call regardless of role».
// Without dropping this gate, hr_manager / department_manager /
// payroll_officer would silently lose all perm-gated UI because their
// /permissions/my call 403s and `apiData.permissions` stays empty —
// exactly the symptom PR-10's nav gate hit. The route is scoped to
// the caller (scope.userId/companyId) — no admin surface exposed.
router.use("/permissions", permissionsRouter);
router.use("/rbac/v2", requireMinLevel(90), rbacV2Router);
// GAP_MATRIX item #16 — sidebar advertises this with perm=audit:read but
// the mount only checked level≥70. Add requirePermission so direct-URL
// access matches what the sidebar promises and lift the level to 90 to
// align with /admin/* policy.
router.use("/audit-logs", requireMinLevel(90), requirePermission("audit:read"), auditLogsRouter);
router.use("/search", searchRouter);
// Party / master-data identity registry (slice 1). Read-only 360 view +
// resolve + operator-triggered backfill. See lib/partyService.ts.
router.use("/parties", partiesRouter);
router.use("/activity-log", requireMinLevel(70), activityLogRouter);
router.use("/approval-actions", approvalActionsRouter);
router.use("/workflows", workflowsRouter);
router.use("/impact-preview", impactPreviewRouter);
router.use("/my-space", mySpaceRouter);
// PR-9 (#2077) — self-service field tracking. Same lane as /my-space:
// authMiddleware + per-route authorize (hr.attendance.checkin is
// selfService:true), NO module gate — plain employees (field workers,
// drivers) don't carry the hr module but must reach their own ping
// endpoint. The category policy inside fieldTrackingService stays the
// single authority on WHO is trackable.
router.use("/my/field", myFieldTrackingRouter);
// IGOC-006 — /me/proactive-insights aggregates 9 role-adaptive categories
// (my docs/iqama, my pending requests, team approvals, company iqama/journals/
// invoices/obligations, critical notifications). Same surface for every role,
// different CONTENT — gates inside the handler filter by scope.role. The
// underlying queries are already scope-protected (companyId / assignmentId /
// employeeId), so no extra requireMinLevel floor is needed.
router.use("/me", meInsightsRouter);
// GAP_MATRIX P1 — role ladder: 20 not a real role level; raised to 50
// (department_manager+) to block employee-level (10) direct-URL access.
router.use("/action-center", requireMinLevel(50), actionCenterRouter);
router.use("/workspace", workspaceRouter);
router.use("/entity-meta", entityMetaRouter);
// Mount the umrah limiter once on the /umrah prefix so it runs exactly once per
// request, regardless of which sub-router (umrahRouter / umrahEntitiesRouter)
// ultimately handles it. Mounting it on each router would cause double-counting
// when Express falls through from the first router to the second.
router.use("/umrah", umrahUserLimiter);
// GAP_MATRIX P1 — frontend checks module="umrah"; backend was "operations" only.
// Accept either so umrah-granted users (who may not carry operations) can reach the API.
router.use("/umrah", requireModule("operations", "umrah"), requireGuards("financial"), umrahRouter);
router.use("/umrah", requireModule("operations", "umrah"), requireGuards("financial"), umrahEntitiesRouter);
// GAP_MATRIX P1 — role ladder: 40 not a real role level; raised to 50.
router.use("/operations-center", requireModule("operations"), requireMinLevel(50), operationsCenterRouter);
// Wiring stubs — fills the 42 frontend↔backend orphans surfaced by
// scripts/src/check-frontend-backend-wiring.mjs. Mounted at /api root because
// the routes carry their full domain prefix internally.
// GAP_MATRIX item #17 — wiring stubs return canned envelopes for routes
// the frontend is wired to but the backend hasn't fully implemented yet.
// Floor at level 10 (any authenticated employee) — stubs are read-only
// stand-ins; real implementations carry their own authorize/requireMinLevel.
// GAP_MATRIX P1 — role ladder: 20 not a real role level; corrected to 10.
router.use("/warehouse", requireModule("warehouse"), requireMinLevel(10), warehouseStubsRouter);
// /documents OCR stubs نُقِلت إلى routes/documents.ts بتنفيذ حقيقي (م٢-ج) — لا stub متبقٍّ.
router.use("/hr", requireModule("hr"), requireMinLevel(10), hrStubsRouter);
// Pricing rules — real CRUD + engine preview (migration 171). Mounted BEFORE
// financeStubsRouter so /finance/pricing/* resolves to the real handlers (the
// 6 stubs were removed from wiring-stubs.ts). Carries its own authMiddleware +
// per-route authorize({feature:"finance.invoices"}).
router.use("/finance", requireModule("finance"), requireMinLevel(10), pricingRouter);
router.use("/finance", requireModule("finance"), requireMinLevel(10), financeStubsRouter);
router.use("/admin", requireModule("admin"), requireMinLevel(90), adminStubsRouter);
router.use(wiringScopeErrorHandler);
// GAP_MATRIX P1 — role ladder: 30 not a real role level; raised to 50.
router.use("/export", requireMinLevel(50), exportRouter);
router.use("/import", requireMinLevel(50), importRouter);
router.use("/scheduled-reports", requireMinLevel(50), scheduledReportsRouter);
router.use("/notification-engine", requireModule("notifications"), notificationEngineRouter);
// GAP_MATRIX item #18 — both mounts handle government / security data
// (ZATCA, GOSI, Absher endpoints + digital signing). The sidebar advertises
// these at admin role-level (90); the routes themselves had no min-level
// floor, so a misconfigured perm grant could expose them. Floor at 70 as
// defence-in-depth (lower than 90 because some non-admin tenants legitimately
// use ZATCA submission flows).
router.use("/gov-integrations", requireMinLevel(70), govIntegrationsRouter);
router.use("/digital-signature", requireMinLevel(70), digitalSignatureRouter);
// FND-004 / FND-005 — events.ts exposes only read-only event-log and
// event-catalog endpoints, none of which carried an authorize() check.
// Event-log access is audit-level; gate the mount at 70 (as /audit-logs).
router.use("/events", requireMinLevel(70), eventsRouter);
router.use("/exec-dashboard", requireMinLevel(70), execDashboardRouter);
// Smart assistant — curated Arabic owner questions → vetted parameterized
// queries (no NL→SQL). Exec-only (cross-domain data). See routes/assistant.ts.
router.use("/assistant", requireMinLevel(70), assistantRouter);
// GAP_MATRIX P1 — role ladder: 30 and 20 are not real role levels.
// Obligations and calendar are employee-accessible pages; floor at 10
// (any authenticated user). The module-gated sidebar already filters by
// permissions; the API relies on per-route authorize() inside each router.
router.use("/obligations", requireMinLevel(10), obligationsRouter);
router.use("/calendar", requireMinLevel(10), calendarRouter);
router.use("/hr/contracts", requireModule("hr"), contractsRouter);
router.use("/correspondence", requireModule("comms"), correspondenceRouter);
router.use("/print", printRouter);

export default router;
