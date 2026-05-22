import { Router, type IRouter } from "express";
import { logger } from "../lib/logger.js";
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
import warehouseRouter from "./warehouse.js";
import propertiesRouter from "./properties.js";
import legalRouter from "./legal.js";
import projectsRouter from "./projects.js";
import supportRouter from "./support.js";
import crmRouter from "./crm.js";
import intelligenceRouter from "./intelligence.js";
import automationRouter from "./automation.js";
import communicationsRouter from "./communications.js";
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
import permissionsRouter from "./permissions.js";
import rbacV2Router from "./rbacV2.js";
import auditLogsRouter from "./auditLogs.js";
import searchRouter from "./search.js";
import activityLogRouter from "./activityLog.js";
import approvalActionsRouter from "./approvalActions.js";
import workflowsRouter from "./workflows.js";
import impactPreviewRouter from "./impactPreview.js";
import storageRouter from "./storage.js";
import activityIngestRouter from "./activityIngest.js";
import mySpaceRouter from "./mySpace.js";
import actionCenterRouter from "./actionCenter.js";
import accountingEngineRouter from "./accounting-engine.js";
import { financeAlgorithmsRouter } from "./finance-algorithms.js";
import financeHardeningRouter from "./finance-hardening.js";
import { recurringRouter } from "./finance-recurring.js";
import entityMetaRouter from "./entityMeta.js";
import umrahRouter from "./umrah.js";
import umrahEntitiesRouter from "./umrah-entities.js";
import operationsCenterRouter from "./operationsCenter.js";
import notificationEngineRouter from "./notification-engine.js";
import printRouter from "./print.js";
import { requireModule, requireMinLevel } from "../middlewares/roleGuard.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
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
import disciplineRouter from "./hr-discipline.js";
import loansRouter from "./hr-loans.js";
import overtimeRouter from "./hr-overtime.js";
import exitRouter from "./hr-exit.js";
import digitalSignatureRouter from "./digital-signature.js";
import { eventsRouter } from "./events.js";
import { execDashboardRouter } from "./execDashboard.js";
import { obligationsRouter } from "./obligations.js";
import { calendarRouter } from "./calendar.js";
import contractsRouter from "./hr-contracts.js";
import correspondenceRouter from "./correspondence.js";
import { requireGuards } from "../lib/systemGovernor.js";

const router: IRouter = Router();

router.use(healthRouter);

// Per-IP limiter for the truly anonymous surfaces. Replaces the old
// blanket /api globalLimiter that lived in app.ts and unfairly counted
// authenticated traffic. Anonymous endpoints don't have a userId to key
// off, so per-IP is the only honest option here.
//
// /api/health is excluded so liveness probes never trip the cap.
const anonymousIpLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === "production" ? 100 : 2000,
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
// /careers mixes anonymous applicant flows with authenticated ones
// behind a careers JWT. Same reasoning as /portal — don't add a
// router-wide IP cap; portalLimiter inside careersPortal.ts handles the
// anonymous traffic.
router.use("/careers", careersPortalRouter);
// /public is fully anonymous → per-IP cap is correct here.
router.use("/public", anonymousIpLimiter, publicDataRouter);
// /pdpl mixes anonymous /privacy-notice with authenticated endpoints.
// Limiters live inside pdpl.ts: per-IP on /privacy-notice, per-user
// (pdplUserLimiter) on the authenticated routes.
router.use("/pdpl", pdplRouter);

router.get("/settings/display", async (req, res) => {
  try {
    const cookieToken: string | undefined = req.cookies?.erp_access;
    const authHeader = req.headers.authorization;
    const rawToken = cookieToken || (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined);
    let companyId: number | null = null;
    if (rawToken) {
      try {
        const jwt = await import("jsonwebtoken");
        const SECRET = process.env.JWT_SECRET;
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
  if (process.env.NODE_ENV === "production") {
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

// Per-user catch-all limiter for ALL authenticated /api traffic. Replaces
// the blanket per-IP globalLimiter that used to live in app.ts. Mounted
// here so it runs after authMiddleware (req.scope is set) and BEFORE any
// module router, giving every authenticated route a baseline per-user
// budget. Module-specific limiters below stack on top with their own
// (smaller-prefix, often tighter) budgets — both must pass.
const globalUserLimiter = createPerUserLimiter({
  prefix: "api:global",
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === "production" ? 600 : 6000,
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
router.use("/clients", requireModule("crm"), clientsRouter);
// Per-user HR limiter mounted once on /hr so it runs exactly once per
// request, regardless of which sub-router handles it. See umrah notes below.
router.use("/hr", hrUserLimiter);
router.use("/hr", requireModule("hr"), hrRouter);
router.use("/hr/discipline", requireModule("hr"), disciplineRouter);
router.use("/hr", requireModule("hr"), loansRouter);
router.use("/hr", requireModule("hr"), overtimeRouter);
router.use("/hr", requireModule("hr"), exitRouter);
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
// financeRouter (finance.ts monolith) removed in Phase 7.1 — the 13
// singleton routes it still owned were migrated to finance-purchase.ts,
// finance-vendors.ts, and finance-reports.ts during canonicalisation.
router.use("/notifications", notificationsRouter);
router.use("/tasks", requireModule("operations"), tasksRouter);
router.use("/fleet", fleetUserLimiter);
router.use("/fleet", requireModule("fleet"), requireGuards("financial"), fleetRouter);
router.use("/warehouse", warehouseUserLimiter);
router.use("/warehouse", requireModule("warehouse"), requireGuards("financial"), warehouseRouter);
router.use("/properties", propertiesUserLimiter);
router.use("/properties", requireModule("property"), requireGuards("financial"), propertiesRouter);
router.use("/legal", requireModule("legal"), legalRouter);
router.use("/projects", requireModule("operations"), projectsRouter);
router.use("/support", requireModule("support"), supportRouter);
router.use("/crm", requireModule("crm"), crmRouter);
router.use("/intelligence", requireModule("bi"), intelligenceRouter);
router.use("/automation", requireModule("automation"), automationRouter);
router.use("/communications", requireModule("comms"), communicationsRouter);
router.use("/governance", requireModule("governance"), governanceRouter);
router.use("/bi", requireModule("bi"), biRouter);
router.use("/store", requireModule("store"), requireGuards("financial"), storeRouter);
router.use("/documents", requireModule("documents"), documentsRouter);
router.use("/requests", requireModule("requests"), requestsRouter);
router.use("/request-catalog", requireModule("requests"), (req, res, next) => {
  req.url = "/catalog";
  requestsRouter(req, res, next);
});
router.use("/marketing", requireModule("marketing"), marketingRouter);
router.use("/settings", requireModule("settings"), requireMinLevel(70), settingsRouter);
router.use("/rules", requireModule("settings"), requireMinLevel(70), rulesRouter);
router.use("/module-dashboards", requireModule("bi"), moduleDashboardsRouter);
router.use("/admin", requireModule("admin"), requireMinLevel(90), adminRouter);
// FND-004 — RBAC administration surfaces. permissions.ts is fully
// authorize()-guarded per route; rbacV2.ts had a few routes without one;
// gating the mount at level 90 (consistent with /admin) closes the gap
// and is defence-in-depth against any future unguarded route.
router.use("/permissions", requireMinLevel(90), permissionsRouter);
router.use("/rbac/v2", requireMinLevel(90), rbacV2Router);
router.use("/audit-logs", requireMinLevel(70), auditLogsRouter);
router.use("/search", searchRouter);
router.use("/activity-log", requireMinLevel(70), activityLogRouter);
router.use("/approval-actions", approvalActionsRouter);
router.use("/workflows", workflowsRouter);
router.use("/impact-preview", impactPreviewRouter);
router.use("/my-space", mySpaceRouter);
router.use("/action-center", actionCenterRouter);
router.use("/entity-meta", entityMetaRouter);
// Mount the umrah limiter once on the /umrah prefix so it runs exactly once per
// request, regardless of which sub-router (umrahRouter / umrahEntitiesRouter)
// ultimately handles it. Mounting it on each router would cause double-counting
// when Express falls through from the first router to the second.
router.use("/umrah", umrahUserLimiter);
router.use("/umrah", requireModule("operations"), requireGuards("financial"), umrahRouter);
router.use("/umrah", requireModule("operations"), requireGuards("financial"), umrahEntitiesRouter);
router.use("/operations-center", requireModule("operations"), requireMinLevel(40), operationsCenterRouter);
router.use("/export", requireMinLevel(30), exportRouter);
router.use("/import", requireMinLevel(50), importRouter);
router.use("/scheduled-reports", requireMinLevel(50), scheduledReportsRouter);
router.use("/notification-engine", requireModule("notifications"), notificationEngineRouter);
router.use("/gov-integrations", govIntegrationsRouter);
router.use("/digital-signature", digitalSignatureRouter);
// FND-004 / FND-005 — events.ts exposes only read-only event-log and
// event-catalog endpoints, none of which carried an authorize() check.
// Event-log access is audit-level; gate the mount at 70 (as /audit-logs).
router.use("/events", requireMinLevel(70), eventsRouter);
router.use("/exec-dashboard", requireMinLevel(70), execDashboardRouter);
router.use("/obligations", obligationsRouter);
router.use("/calendar", calendarRouter);
router.use("/hr/contracts", requireModule("hr"), contractsRouter);
router.use("/correspondence", requireModule("comms"), correspondenceRouter);
router.use("/print", printRouter);

export default router;
