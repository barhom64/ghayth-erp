import { lazy } from "react";
import type { ModuleType } from "@/contexts/app-context";

const Clients = lazy(() => import("@/pages/clients"));
const ClientDetail = lazy(() => import("@/pages/client-detail"));
const ClientsCreate = lazy(() => import("@/pages/create/clients-create"));
const CRM = lazy(() => import("@/pages/crm"));
const CrmCreate = lazy(() => import("@/pages/create/crm-create"));
const CrmActivities = lazy(() => import("@/pages/crm/activities"));
const LeadDetail = lazy(() => import("@/pages/crm/lead-detail"));
const Projects = lazy(() => import("@/pages/projects"));
const ProjectsCreate = lazy(() => import("@/pages/create/projects-create"));
const ProjectDetail = lazy(() => import("@/pages/details/project-detail"));
const Tasks = lazy(() => import("@/pages/tasks"));
const TasksCreate = lazy(() => import("@/pages/create/tasks-create"));
const Warehouse = lazy(() => import("@/pages/warehouse"));
const VendorsPage = lazy(() => import("@/pages/finance/vendors"));
const WarehouseCreate = lazy(() => import("@/pages/create/warehouse-create"));
const WarehouseMovementsCreate = lazy(() => import("@/pages/create/warehouse/movements-create"));
const WarehouseCategoriesCreate = lazy(() => import("@/pages/create/warehouse/categories-create"));
const WarehouseSuppliersCreate = lazy(() => import("@/pages/create/warehouse/suppliers-create"));
const Support = lazy(() => import("@/pages/support"));
const SupportCreate = lazy(() => import("@/pages/create/support-create"));
const SupportReplies = lazy(() => import("@/pages/support/replies"));
const KnowledgeBase = lazy(() => import("@/pages/support/kb"));
const TicketDetail = lazy(() => import("@/pages/details/ticket-detail"));
const OpportunityDetail = lazy(() => import("@/pages/details/opportunity-detail"));
const Marketing = lazy(() => import("@/pages/marketing"));
const MarketingCreate = lazy(() => import("@/pages/create/marketing-create"));
const Letters = lazy(() => import("@/pages/letters"));
const Notifications = lazy(() => import("@/pages/notifications"));
const Intelligence = lazy(() => import("@/pages/intelligence"));
const Insights = lazy(() => import("@/pages/insights"));
const Automation = lazy(() => import("@/pages/automation"));
const ActivityLog = lazy(() => import("@/pages/activity-log"));
const MySpace = lazy(() => import("@/pages/my-space"));
const MyRequests = lazy(() => import("@/pages/my-requests"));
const MyLeaveRequest = lazy(() => import("@/pages/my-leave-request"));
const MyAttendance = lazy(() => import("@/pages/my-attendance"));
const MyPayslip = lazy(() => import("@/pages/my-payslip"));
const MyPerformance = lazy(() => import("@/pages/my-performance"));
const MyDocuments = lazy(() => import("@/pages/my-documents"));
const MyLoans = lazy(() => import("@/pages/my-loans"));
const MyOvertime = lazy(() => import("@/pages/my-overtime"));
const ActionCenter = lazy(() => import("@/pages/action-center"));
const ManagerBoard = lazy(() => import("@/pages/manager-board"));
const ModuleDashboards = lazy(() => import("@/pages/module-dashboards"));
const OperationsCenter = lazy(() => import("@/pages/operations-center"));
const DailyClose = lazy(() => import("@/pages/daily-close"));
const ScheduledReports = lazy(() => import("@/pages/reports/scheduled-reports"));
const ExecDashboard = lazy(() => import("@/pages/exec-dashboard"));
const ProjectGantt = lazy(() => import("@/pages/projects/gantt"));
const ProjectRisks = lazy(() => import("@/pages/projects/risks"));
const InventoryCount = lazy(() => import("@/pages/warehouse/inventory-count"));
const Obligations = lazy(() => import("@/pages/obligations"));

export const miscRoutes: { path: string; component: any; module?: ModuleType; minRoleLevel?: number }[] = [
  { path: "/my-space", component: MySpace },
  { path: "/my-requests", component: MyRequests },
  { path: "/my-leave-request", component: MyLeaveRequest },
  { path: "/my-attendance", component: MyAttendance },
  { path: "/my-payslip", component: MyPayslip },
  { path: "/my-performance", component: MyPerformance },
  { path: "/my-documents", component: MyDocuments },
  { path: "/my-loans", component: MyLoans },
  { path: "/my-overtime", component: MyOvertime },
  { path: "/action-center", component: ActionCenter },
  { path: "/obligations", component: Obligations, module: "operations" },
  { path: "/exec-dashboard", component: ExecDashboard, minRoleLevel: 60 },
  { path: "/manager-board", component: ManagerBoard, minRoleLevel: 40 },
  { path: "/operations-center", component: OperationsCenter, module: "operations", minRoleLevel: 40 },
  { path: "/daily-close", component: DailyClose, module: "operations", minRoleLevel: 40 },
  { path: "/clients", component: Clients, module: "crm" },
  { path: "/clients/create", component: ClientsCreate, module: "crm" },
  { path: "/clients/:id", component: ClientDetail, module: "crm" },
  { path: "/crm", component: CRM, module: "crm" },
  { path: "/crm/create", component: CrmCreate, module: "crm" },
  { path: "/crm/pipeline", component: CRM, module: "crm" },
  { path: "/crm/activities", component: CrmActivities, module: "crm" },
  { path: "/crm/leads/:id", component: LeadDetail, module: "crm" },
  { path: "/crm/:id", component: OpportunityDetail, module: "crm" },
  { path: "/projects", component: Projects, module: "operations" },
  { path: "/projects/create", component: ProjectsCreate, module: "operations" },
  { path: "/projects/tasks", component: Tasks, module: "operations" },
  { path: "/projects/gantt", component: ProjectGantt, module: "operations" },
  { path: "/projects/risks", component: ProjectRisks, module: "operations" },
  { path: "/projects/:id", component: ProjectDetail, module: "operations" },
  { path: "/warehouse", component: Warehouse, module: "warehouse" },
  { path: "/warehouse/create", component: WarehouseCreate, module: "warehouse" },
  { path: "/warehouse/movements/create", component: WarehouseMovementsCreate, module: "warehouse" },
  { path: "/warehouse/categories/create", component: WarehouseCategoriesCreate, module: "warehouse" },
  { path: "/warehouse/suppliers/create", component: WarehouseSuppliersCreate, module: "warehouse" },
  { path: "/warehouse/movements", component: Warehouse, module: "warehouse" },
  { path: "/warehouse/categories", component: Warehouse, module: "warehouse" },
  { path: "/warehouse/suppliers", component: VendorsPage, module: "warehouse" },
  { path: "/warehouse/inventory-count", component: InventoryCount, module: "warehouse" },
  { path: "/support/create", component: SupportCreate, module: "support" },
  { path: "/support/replies", component: SupportReplies, module: "support" },
  { path: "/support/kb", component: KnowledgeBase, module: "support" },
  { path: "/support/:id", component: TicketDetail, module: "support" },
  { path: "/support", component: Support, module: "support" },
  { path: "/marketing", component: Marketing, module: "marketing" },
  { path: "/marketing/create", component: MarketingCreate, module: "marketing" },
  { path: "/tasks/create", component: TasksCreate, module: "operations" },
  { path: "/tasks", component: Tasks, module: "operations" },
  { path: "/letters", component: Letters },
  { path: "/notifications", component: Notifications },
  { path: "/intelligence", component: Intelligence, module: "bi" },
  { path: "/insights", component: Insights, module: "bi" },
  { path: "/automation", component: Automation, module: "admin" },
  { path: "/activity-log", component: ActivityLog },
  { path: "/module-dashboards", component: ModuleDashboards, module: "bi" },
  { path: "/reports/scheduled", component: ScheduledReports, module: "bi" },
];
