import { lazy } from "react";
import type { ModuleType } from "@/contexts/app-context";

const Clients = lazy(() => import("@/pages/clients"));
const ClientDetail = lazy(() => import("@/pages/client-detail"));
const ClientsCreate = lazy(() => import("@/pages/create/clients-create"));
const CustomerStatement = lazy(() => import("@/pages/finance/customer-statement"));
const CRM = lazy(() => import("@/pages/crm"));
const CrmCreate = lazy(() => import("@/pages/create/crm-create"));
const CrmActivities = lazy(() => import("@/pages/crm/activities"));
const LeadDetail = lazy(() => import("@/pages/crm/lead-detail"));
const Projects = lazy(() => import("@/pages/projects"));
const ProjectsCreate = lazy(() => import("@/pages/create/projects-create"));
const ProjectDetail = lazy(() => import("@/pages/details/project-detail"));
const Tasks = lazy(() => import("@/pages/tasks"));
const TasksCreate = lazy(() => import("@/pages/create/tasks-create"));
const TaskDetail = lazy(() => import("@/pages/details/task-detail"));
const Warehouse = lazy(() => import("@/pages/warehouse"));
const WarehouseCreate = lazy(() => import("@/pages/create/warehouse-create"));
const WarehouseMovementsCreate = lazy(() => import("@/pages/create/warehouse/movements-create"));
const WarehouseCategoriesCreate = lazy(() => import("@/pages/create/warehouse/categories-create"));
// PR-3 (#2163) — Canonical Ownership wrapper-split. The previous
// arrangement bound /warehouse/suppliers/create to the finance vendor
// page (same WHT-aware form, POSTing to /finance/vendors); a warehouse
// operator was answering finance questions and the audit lane lied
// about who made the change. After PR-3 each path has its own wrapper
// over a shared form body (`components/shared/vendor-party-form.tsx`).
// The finance and warehouse wrappers carry their own POST URL, intent
// fields, draft slot, and toast copy. The Party-master row is the
// same; the path that issues it is not.
const WarehouseSuppliersCreate = lazy(() => import("@/pages/create/warehouse/suppliers-create"));
const WarehouseProductDetail = lazy(() => import("@/pages/details/warehouse-product-detail"));
const WarehouseMovementDetail = lazy(() => import("@/pages/details/warehouse-movement-detail"));
const WarehouseCategoryDetail = lazy(() => import("@/pages/details/warehouse-category-detail"));
const WarehouseSupplierDetail = lazy(() => import("@/pages/details/warehouse-supplier-detail"));
const Support = lazy(() => import("@/pages/support"));
const SupportCreate = lazy(() => import("@/pages/create/support-create"));
const SupportReplies = lazy(() => import("@/pages/support/replies"));
const KnowledgeBase = lazy(() => import("@/pages/support/kb"));
const TicketDetail = lazy(() => import("@/pages/details/ticket-detail"));
const OpportunityDetail = lazy(() => import("@/pages/details/opportunity-detail"));
const Marketing = lazy(() => import("@/pages/marketing"));
const MarketingCreate = lazy(() => import("@/pages/create/marketing-create"));
const WhatsAppTemplates = lazy(() => import("@/pages/whatsapp-templates"));
const WhatsAppTemplateCreate = lazy(() => import("@/pages/create/whatsapp-templates-create"));
const WhatsAppTemplateEdit = lazy(() => import("@/pages/whatsapp-template-edit"));
const CampaignBroadcast = lazy(() => import("@/pages/marketing/campaign-broadcast"));
const Notifications = lazy(() => import("@/pages/notifications"));
const Intelligence = lazy(() => import("@/pages/intelligence"));
const AiWorkbench = lazy(() => import("@/pages/ai-workbench"));
const Insights = lazy(() => import("@/pages/insights"));
const Automation = lazy(() => import("@/pages/automation"));
const ActivityLog = lazy(() => import("@/pages/activity-log"));
const Services = lazy(() => import("@/pages/services"));
const MySpace = lazy(() => import("@/pages/my-space"));
const MyRequests = lazy(() => import("@/pages/my-requests"));
const MyAttendance = lazy(() => import("@/pages/my-attendance"));
const MyPayslip = lazy(() => import("@/pages/my-payslip"));
const MyPerformance = lazy(() => import("@/pages/my-performance"));
const MyDocuments = lazy(() => import("@/pages/my-documents"));
const MyLoans = lazy(() => import("@/pages/my-loans"));
const MyOvertime = lazy(() => import("@/pages/my-overtime"));
const ActionCenter = lazy(() => import("@/pages/action-center"));
const ManagerBoard = lazy(() => import("@/pages/manager-board"));
const Workspace = lazy(() => import("@/pages/workspace"));
const ManagerWorkspace = lazy(() => import("@/pages/manager-workspace"));
const WorkQueue = lazy(() => import("@/pages/my/work-queue"));
// PR-5 (#2077) — صندوق الأعمال الموحّد. New canonical inbox replaces
// the experimental /my/work-queue with a 4-section page (actions /
// tasks / important notifications / follow-ups) that matches the
// product owner's exact spec. The /my/work-queue route stays as a
// back-compat alias.
const WorkInbox = lazy(() => import("@/pages/work-inbox"));
// PR-9 (#2077) — رفيق الميدان: mobile-first field-ping companion.
const FieldCompanion = lazy(() => import("@/pages/my/field-companion"));
const ReprintApprovals = lazy(() => import("@/pages/manager-board/reprint-approvals"));
const ModuleDashboards = lazy(() => import("@/pages/module-dashboards"));
const OperationsCenter = lazy(() => import("@/pages/operations-center"));
const DailyClose = lazy(() => import("@/pages/daily-close"));
const ScheduledReports = lazy(() => import("@/pages/reports/scheduled-reports"));
const ExecDashboard = lazy(() => import("@/pages/exec-dashboard"));
const ProjectGantt = lazy(() => import("@/pages/projects/gantt"));
const ProjectRisks = lazy(() => import("@/pages/projects/risks"));
const InventoryCount = lazy(() => import("@/pages/warehouse/inventory-count"));
const WarehouseAdvanced = lazy(() => import("@/pages/warehouse-advanced"));
const Obligations = lazy(() => import("@/pages/obligations"));
const CalendarPage = lazy(() => import("@/pages/calendar"));
const Dashboard = lazy(() => import("@/pages/dashboard"));

export const miscRoutes: { path: string; component: any; module?: ModuleType; minRoleLevel?: number }[] = [
  { path: "/dashboard", component: Dashboard },
  { path: "/services", component: Services },
  { path: "/my-space", component: MySpace },
  { path: "/my-requests", component: MyRequests },
  { path: "/my-attendance", component: MyAttendance },
  { path: "/my-payslip", component: MyPayslip },
  { path: "/my-performance", component: MyPerformance },
  { path: "/my-documents", component: MyDocuments },
  { path: "/my-loans", component: MyLoans },
  { path: "/my-overtime", component: MyOvertime },
  // GAP_MATRIX P1 — role ladder: 20/30/40 don't exist; nearest real level above employee is 50.
  { path: "/action-center", component: ActionCenter, minRoleLevel: 50 },
  { path: "/workspace", component: Workspace },
  { path: "/manager-workspace", component: ManagerWorkspace, minRoleLevel: 50 },
  { path: "/my/work-queue", component: WorkQueue },
  // PR-5 (#2077) — صندوق الأعمال الموحّد (canonical).
  { path: "/work-inbox", component: WorkInbox },
  { path: "/my/field-companion", component: FieldCompanion },
  { path: "/obligations", component: Obligations, module: "operations" },
  { path: "/calendar", component: CalendarPage },
  // Agent-5 (route↔backend consistency): /api/exec-dashboard mounts with
  // requireMinLevel(70). Route gate raised from 60 → 70 to match.
  { path: "/exec-dashboard", component: ExecDashboard, minRoleLevel: 70 },
  { path: "/manager-board", component: ManagerBoard, minRoleLevel: 50 },
  { path: "/manager-board/reprint-approvals", component: ReprintApprovals, minRoleLevel: 50 },
  { path: "/operations-center", component: OperationsCenter, module: "operations", minRoleLevel: 50 },
  { path: "/daily-close", component: DailyClose, module: "operations", minRoleLevel: 50 },
  { path: "/clients", component: Clients, module: "crm" },
  { path: "/clients/create", component: ClientsCreate, module: "crm" },
  { path: "/clients/:id/statement", component: CustomerStatement, module: "crm" },
  { path: "/clients/:id", component: ClientDetail, module: "crm" },
  { path: "/crm", component: CRM, module: "crm" },
  { path: "/crm/create", component: CrmCreate, module: "crm" },
  { path: "/crm/pipeline", component: CRM, module: "crm" },
  { path: "/crm/activities", component: CrmActivities, module: "crm" },
  { path: "/crm/leads/:id", component: LeadDetail, module: "crm" },
  { path: "/crm/:id", component: OpportunityDetail, module: "crm" },
  { path: "/projects", component: Projects, module: "operations" },
  { path: "/projects/create", component: ProjectsCreate, module: "operations" },
  // "/projects/tasks" alias removed — it rendered the general operations Tasks
  // page under a projects URL (task-ownership blur). The Tasks page stays wired
  // at "/tasks" (below); per-project tasks live in the project detail page.
  { path: "/projects/gantt", component: ProjectGantt, module: "operations" },
  { path: "/projects/risks", component: ProjectRisks, module: "operations" },
  { path: "/projects/:id", component: ProjectDetail, module: "operations" },
  { path: "/warehouse", component: Warehouse, module: "warehouse" },
  { path: "/warehouse/create", component: WarehouseCreate, module: "warehouse" },
  { path: "/warehouse/movements/create", component: WarehouseMovementsCreate, module: "warehouse" },
  { path: "/warehouse/categories/create", component: WarehouseCategoriesCreate, module: "warehouse" },
  { path: "/warehouse/suppliers/create", component: WarehouseSuppliersCreate, module: "warehouse" },
  { path: "/warehouse/products/:id", component: WarehouseProductDetail, module: "warehouse" },
  { path: "/warehouse/movements/:id", component: WarehouseMovementDetail, module: "warehouse" },
  { path: "/warehouse/categories/:id", component: WarehouseCategoryDetail, module: "warehouse" },
  { path: "/warehouse/suppliers/:id", component: WarehouseSupplierDetail, module: "warehouse" },
  { path: "/warehouse/movements", component: Warehouse, module: "warehouse" },
  { path: "/warehouse/categories", component: Warehouse, module: "warehouse" },
  { path: "/warehouse/advanced", component: WarehouseAdvanced, module: "warehouse" },
  { path: "/warehouse/suppliers", component: Warehouse, module: "warehouse" },
  { path: "/warehouse/inventory-count", component: InventoryCount, module: "warehouse" },
  { path: "/support/create", component: SupportCreate, module: "support" },
  { path: "/support/replies", component: SupportReplies, module: "support" },
  { path: "/support/kb", component: KnowledgeBase, module: "support" },
  { path: "/support/:id", component: TicketDetail, module: "support" },
  { path: "/support", component: Support, module: "support" },
  { path: "/marketing/create", component: MarketingCreate, module: "marketing" },
  { path: "/marketing/whatsapp-templates/create", component: WhatsAppTemplateCreate, module: "marketing" },
  { path: "/marketing/whatsapp-templates/:id/edit", component: WhatsAppTemplateEdit, module: "marketing" },
  { path: "/marketing/whatsapp-templates", component: WhatsAppTemplates, module: "marketing" },
  { path: "/marketing/campaigns/:id/broadcast", component: CampaignBroadcast, module: "marketing" },
  { path: "/marketing", component: Marketing, module: "marketing" },
  { path: "/tasks/create", component: TasksCreate, module: "operations" },
  { path: "/tasks/:id", component: TaskDetail, module: "operations" },
  { path: "/tasks", component: Tasks, module: "operations" },
  { path: "/notifications", component: Notifications },
  { path: "/intelligence", component: Intelligence, module: "bi" },
  { path: "/intelligence/ai-workbench", component: AiWorkbench, module: "bi" },
  { path: "/insights", component: Insights, module: "bi" },
  { path: "/automation", component: Automation, module: "admin" },
  { path: "/activity-log", component: ActivityLog },
  // Multi-module shell: each tab (?tab=hr|fleet|warehouse|store|crm|support|…)
  // fetches /module-dashboards/<module>, which is server-gated per module. The
  // nav links are already gated per their own module, so gating the route by
  // "bi" only mismatched them — an hr/fleet/… manager saw their dashboard link
  // then hit 403. No route-level module gate; per-tab data perms protect it.
  { path: "/module-dashboards", component: ModuleDashboards },
  { path: "/reports/scheduled", component: ScheduledReports, module: "bi", minRoleLevel: 50 },
];
