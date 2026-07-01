import { lazy } from "react";
import { redirectTo } from "@/components/shared/redirect-to";

const HR = lazy(() => import("@/pages/hr"));
const HrServices = lazy(() => import("@/pages/hr/services"));
const Employees = lazy(() => import("@/pages/employees"));
const EmployeeDetail = lazy(() => import("@/pages/employee-detail"));
const EmployeesCreate = lazy(() => import("@/pages/create/employees-create"));
const EmployeeEdit = lazy(() => import("@/pages/create/hr/employee-edit"));
const EmployeeQuickCreate = lazy(() => import("@/pages/create/hr/employee-quick-create"));
const Attendance = lazy(() => import("@/pages/hr/attendance"));
const AttendanceCreate = lazy(() => import("@/pages/create/hr/attendance-create"));
const Leaves = lazy(() => import("@/pages/hr/leaves"));
const LeavesCreate = lazy(() => import("@/pages/create/hr/leaves-create"));
const LeaveDetail = lazy(() => import("@/pages/details/leave-detail"));
const Payroll = lazy(() => import("@/pages/hr/payroll"));
const PayrollCreate = lazy(() => import("@/pages/create/hr/payroll-create"));
const Performance = lazy(() => import("@/pages/hr/performance"));
const PerformanceCreate = lazy(() => import("@/pages/create/hr/performance-create"));
const Training = lazy(() => import("@/pages/hr/training"));
const TrainingDetail = lazy(() => import("@/pages/hr/training-detail"));
const TrainingCreate = lazy(() => import("@/pages/create/hr/training-create"));
// HR-REV-2 (ADR-HR-02) — `org-tree` هو الهيكل التنظيمي الموحّد القانوني؛
// /hr/organization و /hr/organization/structure أُبقِيا redirect إليه (لا 404
// للروابط القديمة). صفحتا العرض المكرّرتان (مجرّد KPIs وبطاقات) أُزيلتا
// (retire) لأن org-tree يُغنيهما، وaudit:routes يمنع الصفحات اليتيمة.
const Recruitment = lazy(() => import("@/pages/hr/recruitment"));
const RecruitmentCreate = lazy(() => import("@/pages/create/hr/recruitment-create"));
const JobDetail = lazy(() => import("@/pages/hr/job-detail"));
const ApplicantsCreate = lazy(() => import("@/pages/create/hr/applicants-create"));
const Loans = lazy(() => import("@/pages/hr/loans"));
const LoanDetail = lazy(() => import("@/pages/hr/loan-detail"));
const LoansCreate = lazy(() => import("@/pages/create/hr/loans-create"));
const Overtime = lazy(() => import("@/pages/hr/overtime"));
const OvertimeDetail = lazy(() => import("@/pages/hr/overtime-detail"));
const OvertimeCreate = lazy(() => import("@/pages/create/hr/overtime-create"));
const ExitRequests = lazy(() => import("@/pages/hr/exit-requests"));
const ExitDetail = lazy(() => import("@/pages/hr/exit-detail"));
const ExitCreate = lazy(() => import("@/pages/create/hr/exit-create"));
const WpsRuns = lazy(() => import("@/pages/hr/wps-runs"));
const WpsRunDetail = lazy(() => import("@/pages/hr/wps-run-detail"));
const Saudization = lazy(() => import("@/pages/hr/saudization"));
const SaudiCompliance = lazy(() => import("@/pages/hr/saudi-compliance"));
const Violations = lazy(() => import("@/pages/hr/violations"));
const ViolationDetail = lazy(() => import("@/pages/hr/violation-detail"));
const ViolationsCreate = lazy(() => import("@/pages/create/hr/violations-create"));
const Shifts = lazy(() => import("@/pages/hr/shifts"));
const ShiftsCreate = lazy(() => import("@/pages/create/hr/shifts-create"));
const ShiftDetail = lazy(() => import("@/pages/details/shift-detail"));

const AttendanceReports = lazy(() => import("@/pages/hr/attendance-reports"));
// (LeaveManagement أُزيل — أرصدة/أنواع الإجازات صارت تبويبات في صفحة الإجازات
// الموحّدة، و/hr/leaves/management يُعاد توجيهه إليها. HR-REV-2)
const ApprovalChains = lazy(() => import("@/pages/hr/approval-chains"));
const FieldTracking = lazy(() => import("@/pages/hr/field-tracking"));
const TrackingPolicies = lazy(() => import("@/pages/hr/tracking-policies"));
const QRScanner = lazy(() => import("@/pages/hr/qr-scanner"));
const PenaltyEscalation = lazy(() => import("@/pages/hr/penalty-escalation"));
const SalaryComponents = lazy(() => import("@/pages/hr/salary-components"));
const DriverPayRates = lazy(() => import("@/pages/hr/driver-pay-rates")); // معدّلات أجر السائق — الدفعة 2
const EmployeeActivation = lazy(() => import("@/pages/hr/employee-activation"));
const OnboardingReview = lazy(() => import("@/pages/hr/onboarding-review"));
const ActivationBoard = lazy(() => import("@/pages/hr/activation-board"));
const SelfOnboardingReview = lazy(() => import("@/pages/hr/self-onboarding-review"));
// (OrganizationStructure أُزيل استيراده — المسار يُعاد توجيهه إلى org-tree، ADR-HR-02)
// (PerformanceAdvanced أُزيل — توزيع التقييمات + أفضل ١٠ صارا تبويب «التحليلات»
// في /hr/performance، والمسار /hr/performance/advanced يُعاد توجيهه إليها. HR-REV)
// (RecruitmentAdvanced أُزيل — كان عرضًا تحليليًّا مكرّرًا مشمولًا بالكامل في
// /hr/recruitment، والمسار /hr/recruitment/advanced يُعاد توجيهه إليها. HR-REV)
// (TrainingAdvanced أُزيل — «البرامج حسب الحالة» صار قسمًا في تبويب البرامج بصفحة
// /hr/training، والمسار /hr/training/advanced يُعاد توجيهه إليها. HR-REV)
// (ViolationsManagement أُزيل — قائمة المخالفات الخام + الاعتماد + التحليل صارت
// تبويب «المخالفات الخام» داخل /hr/violations، و/hr/violations/management يُعاد
// توجيهه إليها. HR-REV-7)
// (ShiftsManagement أُزيل — نموذج إسناد الموظف لوردية صار في تبويب «التعيينات»
// بصفحة /hr/shifts (كان التبويب للعرض فقط)، والمسار /hr/shifts/management يُعاد
// توجيهه إليها. HR-REV)
const ApplicationList = lazy(() => import("@/pages/hr/application-list"));
const Evaluation360 = lazy(() => import("@/pages/hr/evaluation-360"));
const Evaluation360Create = lazy(() => import("@/pages/create/hr/evaluation-360-create"));
const Evaluation360Detail = lazy(() => import("@/pages/hr/evaluation-360-detail"));
const Evaluation360Peer = lazy(() => import("@/pages/hr/evaluation-360-peer"));
const Evaluation360Upward = lazy(() => import("@/pages/hr/evaluation-360-upward"));
const Evaluation360History = lazy(() => import("@/pages/hr/evaluation-360-history"));
const PublicHolidays = lazy(() => import("@/pages/hr/public-holidays"));
const AttendancePolicy = lazy(() => import("@/pages/hr/attendance-policy"));
// PR-3 (#2077) — per-category attendance overrides. Page module already
// existed under /admin (HR-015) but was only reachable by admins; mount
// it under /hr too so the HR Manager can manage policies without
// crossing into the admin module. The /admin route stays as a back-
// compat alias for any bookmark/print/notification deep-link.
const AttendanceCategoriesHr = lazy(() => import("@/pages/admin/attendance-categories"));
// PR-4 (#2077) — institutional scoring detail page (NEW) + scoring-weights
// admin page mirrored under /hr so the HR Manager can edit weights
// without crossing the /admin/* boundary. The engine + cron already
// exist (lib/employeeScoringEngine.ts + cronScheduler.ts); PR-4 only
// adds the HTTP entry points for on-demand recompute/history and this
// detail page that visualizes them.
const EmployeeScore = lazy(() => import("@/pages/hr/employee-score"));
const ScoringWeightsHr = lazy(() => import("@/pages/admin/scoring-weights"));
// PR-7 (#2077) — unified org tree page (شركة → فرع → إدارة → قسم → فريق).
const OrgTree = lazy(() => import("@/pages/hr/org-tree"));
const Delegations = lazy(() => import("@/pages/hr/delegations"));
const Accruals = lazy(() => import("@/pages/hr/accruals"));
const Transfers = lazy(() => import("@/pages/hr/transfers"));
const IDP = lazy(() => import("@/pages/hr/idp"));
const Gratuity = lazy(() => import("@/pages/hr/gratuity"));
const TurnoverReport = lazy(() => import("@/pages/hr/turnover-report"));
const ExpiringDocuments = lazy(() => import("@/pages/hr/expiring-documents"));
const AutoDetection = lazy(() => import("@/pages/hr/auto-detection"));
const DisciplineRegulation = lazy(() => import("@/pages/hr/discipline-regulation"));
const ApprovalInbox = lazy(() => import("@/pages/hr/approval-inbox"));
const HrDocuments = lazy(() => import("@/pages/hr/documents"));
const DisciplineMemoDetail = lazy(() => import("@/pages/hr/discipline-memo-detail"));
const OfficialLetters = lazy(() => import("@/pages/hr/official-letters"));
const Contracts = lazy(() => import("@/pages/hr/contracts"));
const ContractsCreate = lazy(() => import("@/pages/create/hr/contracts-create"));
const ExcuseRequests = lazy(() => import("@/pages/hr/excuse-requests"));
const ExcuseCreate = lazy(() => import("@/pages/create/hr/excuse-create"));
const AttendanceDetail = lazy(() => import("@/pages/details/attendance-detail"));
const ExcuseDetail = lazy(() => import("@/pages/details/excuse-detail"));
const HrContractDetail = lazy(() => import("@/pages/details/hr-contract-detail"));
const TransferDetail = lazy(() => import("@/pages/details/transfer-detail"));
const PayrollDetail = lazy(() => import("@/pages/details/payroll-detail"));
const PerformanceDetail = lazy(() => import("@/pages/details/performance-detail"));
const TransfersEdit = lazy(() => import("@/pages/create/hr/transfers-edit"));
const AttendanceEdit = lazy(() => import("@/pages/create/hr/attendance-edit"));
const ExcuseEdit = lazy(() => import("@/pages/create/hr/excuse-edit"));
const LeavesEdit = lazy(() => import("@/pages/create/hr/leaves-edit"));
const ContractsEdit = lazy(() => import("@/pages/create/hr/contracts-edit"));
// Phase 2 wiring — orphan pages with existing backends.
const WpsSettings = lazy(() => import("@/pages/hr/saudi-compliance/wps/settings"));

export const hrRoutes = [
  // RBAC-REV-STD — مركز HR لوحة إدارية بلا subKey؛ minRoleLevel:25 يحرس
  // الوصول المباشر بالرابط (لا الواجهة فقط) فلا يصله الاستاندر (10)/السائق (15).
  { path: "/hr", component: HR, minRoleLevel: 25 },
  // HR-010 / #1799 priority #4 — Services Catalog landing page.
  { path: "/hr/services", component: HrServices, subKey: "services" },
  { path: "/employees", component: Employees, subKey: "employees" },
  { path: "/employees/create", component: EmployeesCreate, subKey: "employees" },
  { path: "/employees/quick-create", component: EmployeeQuickCreate, subKey: "employees" },
  { path: "/employees/:id/edit", component: EmployeeEdit, subKey: "employees" },
  { path: "/employees/:id", component: EmployeeDetail, subKey: "employees" },
  { path: "/hr/attendance", component: Attendance, subKey: "attendance" },
  { path: "/hr/attendance/create", component: AttendanceCreate, subKey: "attendance" },
  // Literal sub-routes must precede "/hr/attendance/:id": wouter <Switch>
  // renders the first match, so an earlier ":id" would capture "reports",
  // "field-tracking" and "qr-scanner" as an id and shadow these pages.
  { path: "/hr/attendance/reports", component: AttendanceReports, subKey: "attendance" },
  { path: "/hr/attendance/field-tracking", component: FieldTracking, subKey: "attendance" },
  { path: "/hr/attendance/tracking-policies", component: TrackingPolicies, subKey: "attendance" },
  { path: "/hr/attendance/qr-scanner", component: QRScanner, subKey: "attendance" },
  // ":id/edit" precedes ":id" — defensive ordering (see route-shadowing fix).
  { path: "/hr/attendance/:id/edit", component: AttendanceEdit, subKey: "attendance" },
  { path: "/hr/attendance/:id", component: AttendanceDetail, subKey: "attendance" },
  { path: "/hr/leaves", component: Leaves, subKey: "leaves" },
  { path: "/hr/leaves/create", component: LeavesCreate, subKey: "leaves" },
  // Literal sub-routes must precede "/hr/leaves/:id" (see attendance above).
  // GAP_MATRIX P1 — redirect /management until merged as tab inside base page.
  { path: "/hr/leaves/management", component: redirectTo("/hr/leaves"), subKey: "leaves" },
  { path: "/hr/leaves/approval-chains", component: ApprovalChains, subKey: "leaves" },
  { path: "/hr/leaves/:id/edit", component: LeavesEdit, subKey: "leaves" },
  { path: "/hr/leaves/:id", component: LeaveDetail, subKey: "leaves" },
  { path: "/hr/payroll", component: Payroll, subKey: "payroll" },
  { path: "/hr/payroll/create", component: PayrollCreate, subKey: "payroll" },
  { path: "/hr/payroll/salary-components", component: SalaryComponents, subKey: "payroll" },
  { path: "/hr/driver-pay-rates", component: DriverPayRates, subKey: "payroll" },
  { path: "/hr/payroll/:id", component: PayrollDetail, subKey: "payroll" },
  { path: "/hr/performance", component: Performance, subKey: "performance" },
  { path: "/hr/performance/create", component: PerformanceCreate, subKey: "performance" },
  // GAP_MATRIX P1 — redirect /advanced until merged as analytics tab inside base page.
  { path: "/hr/performance/advanced", component: redirectTo("/hr/performance"), subKey: "performance" },
  { path: "/hr/performance/:id", component: PerformanceDetail, subKey: "performance" },
  { path: "/hr/training", component: Training, subKey: "training" },
  { path: "/hr/training/create", component: TrainingCreate, subKey: "training" },
  { path: "/hr/training/advanced", component: redirectTo("/hr/training"), subKey: "training" },
  { path: "/hr/training/:id", component: TrainingDetail, subKey: "training" },
  { path: "/hr/organization", component: redirectTo("/hr/org-tree"), subKey: "organization" },
  { path: "/hr/organization/structure", component: redirectTo("/hr/org-tree"), subKey: "organization" },
  { path: "/hr/recruitment", component: Recruitment, subKey: "recruitment" },
  { path: "/hr/recruitment/create", component: RecruitmentCreate, subKey: "recruitment" },
  { path: "/hr/recruitment/applicants/create", component: ApplicantsCreate, subKey: "recruitment" },
  { path: "/hr/recruitment/applications", component: ApplicationList, subKey: "recruitment" },
  { path: "/hr/recruitment/advanced", component: redirectTo("/hr/recruitment"), subKey: "recruitment" },
  { path: "/hr/recruitment/jobs/:id", component: JobDetail, subKey: "recruitment" },
  { path: "/hr/loans", component: Loans, subKey: "payroll" },
  { path: "/hr/loans/create", component: LoansCreate, subKey: "payroll" },
  { path: "/hr/loans/:id", component: LoanDetail, subKey: "payroll" },
  { path: "/hr/overtime", component: Overtime, subKey: "attendance" },
  { path: "/hr/overtime/create", component: OvertimeCreate, subKey: "attendance" },
  { path: "/hr/overtime/:id", component: OvertimeDetail, subKey: "attendance" },
  { path: "/hr/exit", component: ExitRequests, subKey: "employees" },
  { path: "/hr/exit/create", component: ExitCreate, subKey: "employees" },
  { path: "/hr/exit/:id", component: ExitDetail, subKey: "employees" },
  { path: "/hr/violations", component: Violations, subKey: "violations" },
  { path: "/hr/violations/create", component: ViolationsCreate, subKey: "violations" },
  // GAP_MATRIX P1 — redirect /management until merged as tab inside base page.
  { path: "/hr/violations/management", component: redirectTo("/hr/violations"), subKey: "violations" },
  { path: "/hr/violations/penalty-escalation", component: PenaltyEscalation, subKey: "violations" },
  { path: "/hr/violations/auto-detection", component: AutoDetection, subKey: "violations" },
  { path: "/hr/violations/:id", component: ViolationDetail, subKey: "violations" },
  { path: "/hr/discipline/regulation", component: DisciplineRegulation, subKey: "violations" },
  { path: "/hr/approvals", component: ApprovalInbox },
  { path: "/hr/documents", component: HrDocuments },
  { path: "/hr/discipline/memos/:id", component: DisciplineMemoDetail, subKey: "violations" },
  { path: "/hr/shifts", component: Shifts, subKey: "shifts" },
  { path: "/hr/shifts/create", component: ShiftsCreate, subKey: "shifts" },
  { path: "/hr/shifts/management", component: redirectTo("/hr/shifts"), subKey: "shifts" },
  { path: "/hr/shifts/:id", component: ShiftDetail, subKey: "shifts" },
  { path: "/hr/employee-activation", component: EmployeeActivation, subKey: "employees" },
  { path: "/hr/activation-board", component: ActivationBoard, subKey: "employees" },
  { path: "/hr/self-onboarding-review", component: SelfOnboardingReview, subKey: "employees" },
  { path: "/hr/onboarding-review", component: OnboardingReview, subKey: "employees" },
  { path: "/hr/evaluation-360/create", component: Evaluation360Create, subKey: "performance" },
  { path: "/hr/evaluation-360/history/:employeeId", component: Evaluation360History, subKey: "performance" },
  { path: "/hr/evaluation-360", component: Evaluation360, subKey: "performance" },
  { path: "/hr/evaluation-360/:id/peer", component: Evaluation360Peer, subKey: "performance" },
  { path: "/hr/evaluation-360/:id/upward", component: Evaluation360Upward, subKey: "performance" },
  { path: "/hr/evaluation-360/:id", component: Evaluation360Detail, subKey: "performance" },
  { path: "/hr/public-holidays", component: PublicHolidays, subKey: "leaves" },
  { path: "/hr/attendance-policy", component: AttendancePolicy, subKey: "attendance" },
  // PR-3 (#2077) — per-category overrides. Same component as the legacy
  // /admin/attendance-categories route; just exposed under /hr so HR
  // managers can reach it via the HR navigation.
  { path: "/hr/attendance-categories", component: AttendanceCategoriesHr, subKey: "attendance" },
  // PR-4 (#2077) — institutional score for one employee + scoring-weights
  // editor mirrored under /hr. The /admin route for weights stays as a
  // back-compat alias just like /admin/attendance-categories did.
  { path: "/hr/employees/:id/score", component: EmployeeScore, subKey: "performance" },
  { path: "/hr/scoring-weights", component: ScoringWeightsHr, subKey: "performance" },
  // PR-7 (#2077) — الشجرة التنظيمية الموحّدة.
  { path: "/hr/org-tree", component: OrgTree, subKey: "employees" },
  { path: "/hr/delegations", component: Delegations, subKey: "employees" },
  { path: "/hr/accruals", component: Accruals, subKey: "payroll" },
  // /hr/accruals already previews AND posts the same POST /hr/accruals/monthly;
  // the standalone run-only page was a functional duplicate (CROSS_MODULE audit 🔴).
  { path: "/hr/accruals/monthly", component: redirectTo("/hr/accruals"), subKey: "payroll" },
  { path: "/hr/transfers", component: Transfers, subKey: "employees" },
  { path: "/hr/transfers/:id/edit", component: TransfersEdit, subKey: "employees" },
  { path: "/hr/transfers/:id", component: TransferDetail, subKey: "employees" },
  { path: "/hr/idp", component: IDP, subKey: "performance" },
  { path: "/hr/gratuity", component: Gratuity, subKey: "payroll" },
  { path: "/hr/turnover-report", component: TurnoverReport, subKey: "performance" },
  { path: "/hr/expiring-documents", component: ExpiringDocuments, subKey: "employees" },
  { path: "/hr/contracts", component: Contracts, subKey: "employees" },
  { path: "/hr/contracts/create", component: ContractsCreate, subKey: "employees" },
  { path: "/hr/contracts/:id/edit", component: ContractsEdit, subKey: "employees" },
  { path: "/hr/contracts/:id", component: HrContractDetail, subKey: "employees" },
  { path: "/hr/official-letters", component: OfficialLetters, subKey: "employees" },
  { path: "/hr/excuse-requests", component: ExcuseRequests, subKey: "attendance" },
  { path: "/hr/excuse-requests/create", component: ExcuseCreate, subKey: "attendance" },
  { path: "/hr/excuse-requests/:id/edit", component: ExcuseEdit, subKey: "attendance" },
  { path: "/hr/excuse-requests/:id", component: ExcuseDetail, subKey: "attendance" },
  { path: "/hr/wps", component: WpsRuns, subKey: "payroll" },
  { path: "/hr/wps/:id", component: WpsRunDetail, subKey: "payroll" },
  { path: "/hr/saudization", component: Saudization, subKey: "employees" },
  { path: "/hr/saudi-compliance", component: SaudiCompliance, subKey: "payroll" },
  { path: "/hr/saudi-compliance/wps/settings", component: WpsSettings, subKey: "payroll" },
];
