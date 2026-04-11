import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import dashboardRouter from "./dashboard.js";
import employeesRouter from "./employees.js";
import clientsRouter from "./clients.js";
import hrRouter from "./hr.js";
import financeRouter from "./finance.js";
import { invoicesRouter } from "./finance-invoices.js";
import { journalRouter } from "./finance-journal.js";
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
import entityMetaRouter from "./entityMeta.js";
import umrahRouter from "./umrah.js";
import operationsCenterRouter from "./operationsCenter.js";
import notificationEngineRouter from "./notification-engine.js";
import { requireModule, requireMinLevel } from "../middlewares/roleGuard.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { rawQuery } from "../lib/rawdb.js";
import clientPortalRouter from "./clientPortal.js";
import publicDataRouter from "./publicData.js";
import careersPortalRouter from "./careersPortal.js";
import { exportRouter } from "./export.js";
import { scheduledReportsRouter } from "./scheduled-reports.js";
import { govIntegrationsRouter } from "./gov-integrations.js";
import pdplRouter from "./pdpl.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(storageRouter);
router.use(activityIngestRouter);
router.use("/auth", authRouter);
router.use("/portal", clientPortalRouter);
router.use("/public", publicDataRouter);
router.use("/careers", careersPortalRouter);
router.use("/pdpl", pdplRouter);

router.get("/settings/display", async (req, res) => {
  try {
    const auth = req.headers.authorization;
    let companyId: number | null = null;
    if (auth?.startsWith("Bearer ")) {
      try {
        const jwt = await import("jsonwebtoken");
        const SECRET = process.env.JWT_SECRET;
        const payload: any = jwt.default.verify(auth.slice(7), SECRET!);
        if (payload?.companyId && payload?.type !== "client_portal") companyId = payload.companyId;
      } catch {}
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
  } catch {
    res.json({ data: { currency: "SAR", timezone: "Asia/Riyadh", companyName: "" } });
  }
});

router.use(authMiddleware);

router.use("/dashboard", dashboardRouter);
router.use("/employees", requireModule("hr"), employeesRouter);
router.use("/clients", requireModule("crm"), clientsRouter);
router.use("/hr", requireModule("hr"), hrRouter);
router.use("/hr/training", requireModule("hr"), trainingRouter);
router.use("/hr/recruitment", requireModule("hr"), recruitmentRouter);
router.use("/finance", requireModule("finance"), invoicesRouter);
router.use("/finance", requireModule("finance"), journalRouter);
router.use("/finance", requireModule("finance"), purchaseRouter);
router.use("/finance", requireModule("finance"), reportsRouter);
router.use("/finance", requireModule("finance"), custodiesRouter);
router.use("/finance", requireModule("finance"), zatcaRouter);
router.use("/finance", requireModule("finance"), accountingEngineRouter);
router.use("/finance", requireModule("finance"), financeAlgorithmsRouter);
router.use("/finance", requireModule("finance"), financeRouter);
router.use("/notifications", notificationsRouter);
router.use("/tasks", requireModule("operations"), tasksRouter);
router.use("/fleet", requireModule("fleet"), fleetRouter);
router.use("/warehouse", requireModule("warehouse"), warehouseRouter);
router.use("/properties", requireModule("property"), propertiesRouter);
router.use("/legal", requireModule("legal"), legalRouter);
router.use("/projects", requireModule("operations"), projectsRouter);
router.use("/support", requireModule("support"), supportRouter);
router.use("/crm", requireModule("crm"), crmRouter);
router.use("/intelligence", requireModule("bi"), intelligenceRouter);
router.use("/automation", automationRouter);
router.use("/communications", requireModule("comms"), communicationsRouter);
router.use("/governance", requireModule("governance"), governanceRouter);
router.use("/bi", requireModule("bi"), biRouter);
router.use("/store", requireModule("store"), storeRouter);
router.use("/documents", requireModule("documents"), documentsRouter);
router.use("/requests", requireModule("requests"), requestsRouter);
router.use("/request-catalog", requireModule("requests"), (req, res, next) => {
  req.url = "/catalog";
  requestsRouter(req, res, next);
});
router.use("/training", requireModule("hr"), trainingRouter);
router.use("/recruitment", requireModule("hr"), recruitmentRouter);
router.use("/marketing", requireModule("marketing"), marketingRouter);
router.use("/settings", requireModule("settings"), requireMinLevel(70), settingsRouter);
router.use("/rules", requireModule("settings"), requireMinLevel(70), rulesRouter);
router.use("/module-dashboards", requireModule("bi"), moduleDashboardsRouter);
router.use("/admin", requireModule("admin"), requireMinLevel(90), adminRouter);
router.use("/permissions", permissionsRouter);
router.use("/audit-logs", requireMinLevel(70), auditLogsRouter);
router.use("/search", searchRouter);
router.use("/activity-log", requireMinLevel(70), activityLogRouter);
router.use("/approval-actions", approvalActionsRouter);
router.use("/workflows", workflowsRouter);
router.use("/impact-preview", impactPreviewRouter);
router.use("/my-space", mySpaceRouter);
router.use("/action-center", actionCenterRouter);
router.use("/entity-meta", entityMetaRouter);
router.use("/umrah", requireModule("operations"), umrahRouter);
router.use("/operations-center", requireModule("operations"), requireMinLevel(40), operationsCenterRouter);
router.use("/export", requireMinLevel(30), exportRouter);
router.use("/scheduled-reports", requireMinLevel(50), scheduledReportsRouter);
router.use("/notification-engine", notificationEngineRouter);
router.use("/gov-integrations", govIntegrationsRouter);

export default router;
