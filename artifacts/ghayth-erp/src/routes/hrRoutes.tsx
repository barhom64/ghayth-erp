import { lazy } from "react";

const HR = lazy(() => import("@/pages/hr"));
const Employees = lazy(() => import("@/pages/employees"));
const EmployeeDetail = lazy(() => import("@/pages/employee-detail"));
const EmployeesCreate = lazy(() => import("@/pages/create/employees-create"));
const Attendance = lazy(() => import("@/pages/hr/attendance"));
const AttendanceCreate = lazy(() => import("@/pages/create/hr/attendance-create"));
const Leaves = lazy(() => import("@/pages/hr/leaves"));
const LeavesCreate = lazy(() => import("@/pages/create/hr/leaves-create"));
const Payroll = lazy(() => import("@/pages/hr/payroll"));
const PayrollCreate = lazy(() => import("@/pages/create/hr/payroll-create"));
const Performance = lazy(() => import("@/pages/hr/performance"));
const PerformanceCreate = lazy(() => import("@/pages/create/hr/performance-create"));
const Training = lazy(() => import("@/pages/hr/training"));
const TrainingCreate = lazy(() => import("@/pages/create/hr/training-create"));
const Organization = lazy(() => import("@/pages/hr/organization"));
const Recruitment = lazy(() => import("@/pages/hr/recruitment"));
const RecruitmentCreate = lazy(() => import("@/pages/create/hr/recruitment-create"));
const JobDetail = lazy(() => import("@/pages/hr/job-detail"));
const ApplicantsCreate = lazy(() => import("@/pages/create/hr/applicants-create"));
const Violations = lazy(() => import("@/pages/hr/violations"));
const ViolationsCreate = lazy(() => import("@/pages/create/hr/violations-create"));
const Shifts = lazy(() => import("@/pages/hr/shifts"));
const ShiftsCreate = lazy(() => import("@/pages/create/hr/shifts-create"));

const EmployeeProfile = lazy(() => import("@/pages/hr/employee-profile"));
const AttendanceReports = lazy(() => import("@/pages/hr/attendance-reports"));
const LeaveManagement = lazy(() => import("@/pages/hr/leave-management"));
const ApprovalChains = lazy(() => import("@/pages/hr/approval-chains"));
const FieldTracking = lazy(() => import("@/pages/hr/field-tracking"));
const QRScanner = lazy(() => import("@/pages/hr/qr-scanner"));
const PenaltyEscalation = lazy(() => import("@/pages/hr/penalty-escalation"));
const SalaryComponents = lazy(() => import("@/pages/hr/salary-components"));
const EmployeeActivation = lazy(() => import("@/pages/hr/employee-activation"));
const OnboardingReview = lazy(() => import("@/pages/hr/onboarding-review"));
const OrganizationStructure = lazy(() => import("@/pages/hr/organization-structure"));
const PerformanceAdvanced = lazy(() => import("@/pages/hr/performance-advanced"));
const RecruitmentAdvanced = lazy(() => import("@/pages/hr/recruitment-advanced"));
const TrainingAdvanced = lazy(() => import("@/pages/hr/training-advanced"));
const ViolationsManagement = lazy(() => import("@/pages/hr/violations-management"));
const ShiftsManagement = lazy(() => import("@/pages/hr/shifts-management"));
const ApplicationList = lazy(() => import("@/pages/hr/application-list"));
const Evaluation360 = lazy(() => import("@/pages/hr/evaluation-360"));
const Evaluation360Create = lazy(() => import("@/pages/create/hr/evaluation-360-create"));
const Evaluation360Detail = lazy(() => import("@/pages/hr/evaluation-360-detail"));
const Evaluation360Peer = lazy(() => import("@/pages/hr/evaluation-360-peer"));
const Evaluation360Upward = lazy(() => import("@/pages/hr/evaluation-360-upward"));
const Evaluation360History = lazy(() => import("@/pages/hr/evaluation-360-history"));
const PublicHolidays = lazy(() => import("@/pages/hr/public-holidays"));
const Transfers = lazy(() => import("@/pages/hr/transfers"));
const DevelopmentPlans = lazy(() => import("@/pages/hr/development-plans"));
const IDP = lazy(() => import("@/pages/hr/idp"));
const Gratuity = lazy(() => import("@/pages/hr/gratuity"));
const TurnoverReport = lazy(() => import("@/pages/hr/turnover-report"));
const ExpiringDocuments = lazy(() => import("@/pages/hr/expiring-documents"));
const DisciplineRegulation = lazy(() => import("@/pages/hr/discipline-regulation"));
const DisciplineMemos = lazy(() => import("@/pages/hr/discipline-memos"));
const DisciplineMemoDetail = lazy(() => import("@/pages/hr/discipline-memo-detail"));

export const hrRoutes = [
  { path: "/hr", component: HR },
  { path: "/employees", component: Employees, subKey: "employees" },
  { path: "/employees/create", component: EmployeesCreate, subKey: "employees" },
  { path: "/employees/:id", component: EmployeeDetail, subKey: "employees" },
  { path: "/hr/attendance", component: Attendance, subKey: "attendance" },
  { path: "/hr/attendance/create", component: AttendanceCreate, subKey: "attendance" },
  { path: "/hr/attendance/reports", component: AttendanceReports, subKey: "attendance" },
  { path: "/hr/attendance/field-tracking", component: FieldTracking, subKey: "attendance" },
  { path: "/hr/attendance/qr-scanner", component: QRScanner, subKey: "attendance" },
  { path: "/hr/leaves", component: Leaves, subKey: "leaves" },
  { path: "/hr/leaves/create", component: LeavesCreate, subKey: "leaves" },
  { path: "/hr/leaves/management", component: LeaveManagement, subKey: "leaves" },
  { path: "/hr/leaves/approval-chains", component: ApprovalChains, subKey: "leaves" },
  { path: "/hr/payroll", component: Payroll, subKey: "payroll" },
  { path: "/hr/payroll/create", component: PayrollCreate, subKey: "payroll" },
  { path: "/hr/payroll/salary-components", component: SalaryComponents, subKey: "payroll" },
  { path: "/hr/performance", component: Performance, subKey: "performance" },
  { path: "/hr/performance/create", component: PerformanceCreate, subKey: "performance" },
  { path: "/hr/performance/advanced", component: PerformanceAdvanced, subKey: "performance" },
  { path: "/hr/training", component: Training, subKey: "training" },
  { path: "/hr/training/create", component: TrainingCreate, subKey: "training" },
  { path: "/hr/training/advanced", component: TrainingAdvanced, subKey: "training" },
  { path: "/hr/organization", component: Organization, subKey: "organization" },
  { path: "/hr/organization/structure", component: OrganizationStructure, subKey: "organization" },
  { path: "/hr/recruitment", component: Recruitment, subKey: "recruitment" },
  { path: "/hr/recruitment/create", component: RecruitmentCreate, subKey: "recruitment" },
  { path: "/hr/recruitment/applicants/create", component: ApplicantsCreate, subKey: "recruitment" },
  { path: "/hr/recruitment/applications", component: ApplicationList, subKey: "recruitment" },
  { path: "/hr/recruitment/advanced", component: RecruitmentAdvanced, subKey: "recruitment" },
  { path: "/hr/recruitment/jobs/:id", component: JobDetail, subKey: "recruitment" },
  { path: "/hr/violations", component: Violations, subKey: "violations" },
  { path: "/hr/violations/create", component: ViolationsCreate, subKey: "violations" },
  { path: "/hr/violations/management", component: ViolationsManagement, subKey: "violations" },
  { path: "/hr/violations/penalty-escalation", component: PenaltyEscalation, subKey: "violations" },
  { path: "/hr/discipline/regulation", component: DisciplineRegulation, subKey: "violations" },
  { path: "/hr/discipline/memos", component: DisciplineMemos, subKey: "violations" },
  { path: "/hr/discipline/memos/:id", component: DisciplineMemoDetail, subKey: "violations" },
  { path: "/hr/shifts", component: Shifts, subKey: "shifts" },
  { path: "/hr/shifts/create", component: ShiftsCreate, subKey: "shifts" },
  { path: "/hr/shifts/management", component: ShiftsManagement, subKey: "shifts" },
  { path: "/hr/employee-profile/:id", component: EmployeeProfile, subKey: "employees" },
  { path: "/hr/employee-activation", component: EmployeeActivation, subKey: "employees" },
  { path: "/hr/onboarding-review", component: OnboardingReview, subKey: "employees" },
  { path: "/hr/evaluation-360/create", component: Evaluation360Create, subKey: "performance" },
  { path: "/hr/evaluation-360", component: Evaluation360, subKey: "performance" },
  { path: "/hr/evaluation-360/:id", component: Evaluation360Detail, subKey: "performance" },
  { path: "/hr/evaluation-360/:id/peer", component: Evaluation360Peer, subKey: "performance" },
  { path: "/hr/evaluation-360/:id/upward", component: Evaluation360Upward, subKey: "performance" },
  { path: "/hr/evaluation-360/history/:employeeId", component: Evaluation360History, subKey: "performance" },
  { path: "/hr/public-holidays", component: PublicHolidays, subKey: "leaves" },
  { path: "/hr/transfers", component: Transfers, subKey: "employees" },
  { path: "/hr/development-plans", component: DevelopmentPlans, subKey: "performance" },
  { path: "/hr/idp", component: IDP, subKey: "performance" },
  { path: "/hr/gratuity", component: Gratuity, subKey: "payroll" },
  { path: "/hr/turnover-report", component: TurnoverReport, subKey: "performance" },
  { path: "/hr/expiring-documents", component: ExpiringDocuments, subKey: "employees" },
];
