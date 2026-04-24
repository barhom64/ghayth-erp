# فهرس صفحات الواجهة
# UI Page Registry

> آخر تحديث: 2026-04-24
> مرجع: [system-master-registry.md](./system-master-registry.md)

---

## طريقة القراءة

| العمود | الوصف |
|--------|-------|
| المسار | URL path في المتصفح |
| المكوّن | React component name |
| Lazy | تحميل كسول (lazy loading) |
| الوحدة | module gate المطلوب |
| المستوى | الحد الأدنى لمستوى الدور (minRoleLevel) |

---

## 1. الصفحات الأساسية (Core)

| المسار | المكوّن | Lazy | الوحدة | المستوى |
|--------|---------|------|--------|---------|
| /login | Login | لا | — | — |
| / | Dashboard | نعم | — | — |
| /dashboard | Dashboard | نعم | — | — |
| /my-space | MySpace | نعم | — | — |
| /my-requests | MyRequests | نعم | — | — |
| /my-leave-request | MyLeaveRequest | نعم | — | — |
| /my-attendance | MyAttendance | نعم | — | — |
| /my-payslip | MyPayslip | نعم | — | — |
| /my-performance | MyPerformance | نعم | — | — |
| /my-documents | MyDocuments | نعم | — | — |
| /my-loans | MyLoans | نعم | — | — |
| /my-overtime | MyOvertime | نعم | — | — |
| /action-center | ActionCenter | نعم | — | — |
| /calendar | CalendarPage | نعم | — | — |
| /notifications | Notifications | نعم | — | — |
| /activity-log | ActivityLog | نعم | — | — |

---

## 2. الموارد البشرية (HR) — 80 صفحة

| المسار | المكوّن | Lazy | المستوى |
|--------|---------|------|---------|
| /hr | HR | نعم | — |
| /employees | Employees | نعم | — |
| /employees/create | EmployeesCreate | نعم | — |
| /employees/:id | EmployeeDetail | نعم | — |
| /hr/employee-profile/:id | EmployeeProfile | نعم | — |
| /hr/employee-activation | EmployeeActivation | نعم | — |
| /hr/onboarding-review | OnboardingReview | نعم | — |
| **الحضور** | | | |
| /hr/attendance | Attendance | نعم | — |
| /hr/attendance/create | AttendanceCreate | نعم | — |
| /hr/attendance/:id | AttendanceDetail | نعم | — |
| /hr/attendance/reports | AttendanceReports | نعم | — |
| /hr/attendance/field-tracking | FieldTracking | نعم | — |
| /hr/attendance/qr-scanner | QRScanner | نعم | — |
| **الإجازات** | | | |
| /hr/leaves | Leaves | نعم | — |
| /hr/leaves/create | LeavesCreate | نعم | — |
| /hr/leaves/:id | LeaveDetail | نعم | — |
| /hr/leaves/management | LeaveManagement | نعم | — |
| /hr/leaves/approval-chains | ApprovalChains | نعم | — |
| **الرواتب** | | | |
| /hr/payroll | Payroll | نعم | — |
| /hr/payroll/create | PayrollCreate | نعم | — |
| /hr/payroll/salary-components | SalaryComponents | نعم | — |
| /hr/payroll/:id | PayrollDetail | نعم | — |
| **الأداء** | | | |
| /hr/performance | Performance | نعم | — |
| /hr/performance/create | PerformanceCreate | نعم | — |
| /hr/performance/advanced | PerformanceAdvanced | نعم | — |
| /hr/performance/:id | PerformanceDetail | نعم | — |
| **التدريب** | | | |
| /hr/training | Training | نعم | — |
| /hr/training/create | TrainingCreate | نعم | — |
| /hr/training/advanced | TrainingAdvanced | نعم | — |
| /hr/training/:id | TrainingDetail | نعم | — |
| **التنظيم** | | | |
| /hr/organization | Organization | نعم | — |
| /hr/organization/structure | OrganizationStructure | نعم | — |
| **التوظيف** | | | |
| /hr/recruitment | Recruitment | نعم | — |
| /hr/recruitment/create | RecruitmentCreate | نعم | — |
| /hr/recruitment/applicants/create | ApplicantsCreate | نعم | — |
| /hr/recruitment/applications | ApplicationList | نعم | — |
| /hr/recruitment/advanced | RecruitmentAdvanced | نعم | — |
| /hr/recruitment/jobs/:id | JobDetail | نعم | — |
| **القروض** | | | |
| /hr/loans | Loans | نعم | — |
| /hr/loans/create | LoansCreate | نعم | — |
| /hr/loans/:id | LoanDetail | نعم | — |
| **العمل الإضافي** | | | |
| /hr/overtime | Overtime | نعم | — |
| /hr/overtime/create | OvertimeCreate | نعم | — |
| /hr/overtime/:id | OvertimeDetail | نعم | — |
| **المغادرة النهائية** | | | |
| /hr/exit | ExitRequests | نعم | — |
| /hr/exit/create | ExitCreate | نعم | — |
| /hr/exit/:id | ExitDetail | نعم | — |
| **المخالفات والتأديب** | | | |
| /hr/violations | Violations | نعم | — |
| /hr/violations/create | ViolationsCreate | نعم | — |
| /hr/violations/management | ViolationsManagement | نعم | — |
| /hr/violations/penalty-escalation | PenaltyEscalation | نعم | — |
| /hr/violations/auto-detection | AutoDetection | نعم | — |
| /hr/violations/:id | ViolationDetail | نعم | — |
| /hr/discipline/regulation | DisciplineRegulation | نعم | — |
| /hr/discipline/memos | DisciplineMemos | نعم | — |
| /hr/discipline/memos/:id | DisciplineMemoDetail | نعم | — |
| **الورديات** | | | |
| /hr/shifts | Shifts | نعم | — |
| /hr/shifts/create | ShiftsCreate | نعم | — |
| /hr/shifts/management | ShiftsManagement | نعم | — |
| **تقييم 360** | | | |
| /hr/evaluation-360 | Evaluation360 | نعم | — |
| /hr/evaluation-360/create | Evaluation360Create | نعم | — |
| /hr/evaluation-360/history/:employeeId | Evaluation360History | نعم | — |
| /hr/evaluation-360/:id/peer | Evaluation360Peer | نعم | — |
| /hr/evaluation-360/:id/upward | Evaluation360Upward | نعم | — |
| /hr/evaluation-360/:id | Evaluation360Detail | نعم | — |
| **أخرى** | | | |
| /hr/public-holidays | PublicHolidays | نعم | — |
| /hr/transfers | Transfers | نعم | — |
| /hr/transfers/:id | TransferDetail | نعم | — |
| /hr/development-plans | DevelopmentPlans | نعم | — |
| /hr/idp | IDP | نعم | — |
| /hr/gratuity | Gratuity | نعم | — |
| /hr/turnover-report | TurnoverReport | نعم | — |
| /hr/expiring-documents | ExpiringDocuments | نعم | — |
| /hr/contracts | Contracts | نعم | — |
| /hr/contracts/create | ContractsCreate | نعم | — |
| /hr/contracts/:id | HrContractDetail | نعم | — |
| /hr/official-letters | OfficialLetters | نعم | — |
| /hr/excuse-requests | ExcuseRequests | نعم | — |
| /hr/excuse-requests/create | ExcuseCreate | نعم | — |
| /hr/excuse-requests/:id | ExcuseDetail | نعم | — |

---

## 3. المالية (Finance) — 65 صفحة

| المسار | المكوّن | Lazy |
|--------|---------|------|
| /finance | Dashboard | نعم |
| /finance/accounts | Accounts | نعم |
| /finance/accounts/create | AccountsCreate | نعم |
| /finance/accounts/:id/edit | AccountsEdit | نعم |
| /finance/vouchers | Vouchers | نعم |
| /finance/vouchers/create | VouchersCreate | نعم |
| /finance/vouchers/:id | VoucherDetail | نعم |
| /finance/journal | Journal | نعم |
| /finance/journal/create | JournalCreate | نعم |
| /finance/invoices | Invoices | نعم |
| /finance/invoices/create | InvoicesCreate | نعم |
| /finance/invoices/:id | InvoiceDetail | نعم |
| /finance/expenses | Expenses | نعم |
| /finance/expenses/create | ExpensesCreate | نعم |
| /finance/expenses/:id | ExpenseDetail | نعم |
| /finance/budget | Budget | نعم |
| /finance/budget/create | BudgetCreate | نعم |
| /finance/budget/:id | BudgetDetail | نعم |
| /finance/vendors | Vendors | نعم |
| /finance/vendors/create | VendorsCreate | نعم |
| /finance/vendors/:id | VendorDetail | نعم |
| /finance/purchase-orders | PurchaseOrders | نعم |
| /finance/purchase-orders/create | PurchaseOrdersCreate | نعم |
| /finance/purchase-orders/:id | PurchaseOrderDetail | نعم |
| /finance/reports | FinancialReports | نعم |
| /finance/tax | TaxSystem | نعم |
| /finance/receivables | Receivables | نعم |
| /finance/receivables/:id | ReceivableDetail | نعم |
| /finance/payments | Payments | نعم |
| /finance/commitments | Commitments | نعم |
| /finance/commitments/:id | CommitmentDetail | نعم |
| /finance/financial-requests | FinancialRequests | نعم |
| /finance/financial-requests/:id | FinancialRequestDetail | نعم |
| /finance/custodies | Custodies | نعم |
| /finance/custodies/report | CustodyAgingReport | نعم |
| /finance/custodies/:id | CustodyDetail | نعم |
| /finance/fiscal-periods | FiscalPeriods | نعم |
| /finance/salary-advances | SalaryAdvances | نعم |
| /finance/salary-advances/:id | SalaryAdvanceDetail | نعم |
| /finance/ledger/:code | Ledger | نعم |
| /finance/ar-aging | ArAging | نعم |
| /finance/ap-aging | ApAging | نعم |
| /finance/bank-reconciliation | BankReconciliation | نعم |
| /finance/bank-reconciliation/manual-match/:batchId/:rowId | BankManualMatch | نعم |
| /finance/fixed-assets | FixedAssets | نعم |
| /finance/fixed-assets/batch-depreciate | BatchDepreciate | نعم |
| /finance/fixed-assets/:id | FixedAssetDetail | نعم |
| /finance/inventory-costing | InventoryCosting | نعم |
| /finance/bank-guarantees | BankGuarantees | نعم |
| /finance/journal-manual | JournalManual | نعم |
| /finance/journal-manual/create | JournalManualCreate | نعم |
| /finance/journal-manual/:id | JournalManualDetail | نعم |
| /finance/intercompany | Intercompany | نعم |
| /finance/intercompany/consolidation/create | IntercompanyConsolidationCreate | نعم |
| /finance/cash-flow-forecast | CashFlowForecast | نعم |
| /finance/project-costing | ProjectCosting | نعم |
| /finance/project-costing/:id | ProjectCostingDetail | نعم |
| /finance/cashflow | CashflowDashboard | نعم |
| /finance/opening-balances | OpeningBalances | نعم |
| /finance/opening-balances/create | OpeningBalancesCreate | نعم |
| /finance/recurring-journals | RecurringJournals | نعم |
| /finance/recurring-journals/create | RecurringJournalsCreate | نعم |
| /finance/recurring-journals/:id | RecurringJournalDetail | نعم |
| /finance/year-end-close | YearEndClose | نعم |
| /finance/treasury | Treasury | نعم |

---

## 4. الأسطول (Fleet) — 26 صفحة

| المسار | المكوّن | Lazy |
|--------|---------|------|
| /fleet | Fleet | نعم |
| /fleet/vehicles/create | VehiclesCreate | نعم |
| /fleet/:id | VehicleDetail | نعم |
| /fleet/:id/status | VehicleStatusChange | نعم |
| /fleet/drivers | Drivers | نعم |
| /fleet/drivers/create | DriversCreate | نعم |
| /fleet/drivers/:id | DriverDetail | نعم |
| /fleet/trips | Trips | نعم |
| /fleet/trips/create | TripsCreate | نعم |
| /fleet/trips/:id | TripDetail | نعم |
| /fleet/maintenance | FleetMaintenance | نعم |
| /fleet/maintenance/create | MaintenanceCreate | نعم |
| /fleet/maintenance/:id | MaintenanceDetail | نعم |
| /fleet/fuel | Fuel | نعم |
| /fleet/fuel/create | FuelCreate | نعم |
| /fleet/fuel/:id | FuelDetail | نعم |
| /fleet/insurance | Insurance | نعم |
| /fleet/insurance/create | InsuranceCreate | نعم |
| /fleet/insurance/:id | InsuranceDetail | نعم |
| /fleet/alerts | FleetAlerts | نعم |
| /fleet/alerts/create | FleetAlertsCreate | نعم |
| /fleet/reports | FleetReports | نعم |
| /fleet/preventive-plans | PreventivePlans | نعم |
| /fleet/traffic-violations | TrafficViolations | نعم |
| /fleet/traffic-violations/:id | TrafficViolationDetail | نعم |
| /fleet/tco | TCO | نعم |

---

## 5. العقارات (Properties) — 29 صفحة

| المسار | المكوّن | Lazy |
|--------|---------|------|
| /properties | Properties | نعم |
| /properties/dashboard | PropertiesDashboard | نعم |
| /properties/create | PropertiesCreate | نعم |
| /properties/:id | UnitDetail | نعم |
| /properties/:id/status | UnitStatusChange | نعم |
| /properties/buildings | PropertiesBuildings | نعم |
| /properties/buildings/create | BuildingsCreate | نعم |
| /properties/buildings/:id | BuildingDetail | نعم |
| /properties/tenants | PropertiesTenants | نعم |
| /properties/tenants/create | TenantsCreate | نعم |
| /properties/tenants/:id | TenantDetail | نعم |
| /properties/owners | PropertiesOwners | نعم |
| /properties/owners/create | OwnersCreate | نعم |
| /properties/owners/:id | OwnerDetail | نعم |
| /properties/contracts | PropertiesContracts | نعم |
| /properties/contracts/create | ContractsCreate | نعم |
| /properties/contracts/:id | ContractDetail | نعم |
| /properties/contracts/:contractId/pay/:installmentId | PaymentRecord | نعم |
| /properties/payments | PropertiesPayments | نعم |
| /properties/payments/:id | PropertyPaymentDetail | نعم |
| /properties/payments/:paymentId/pay | PaymentRegister | نعم |
| /properties/maintenance | PropertiesMaintenance | نعم |
| /properties/maintenance/create | PropertyMaintenanceCreate | نعم |
| /properties/maintenance/:id | PropertyMaintenanceDetail | نعم |
| /properties/inspections | PropertyInspections | نعم |
| /properties/deposits | PropertyDeposits | نعم |
| /properties/occupancy-report | OccupancyReport | نعم |
| /properties/guide | PropertiesGuide | نعم |
| /guide/properties | PropertiesGuide | نعم |

---

## 6. نطاقات أخرى

### CRM (10 صفحات)
| المسار | المكوّن |
|--------|---------|
| /clients | Clients |
| /clients/create | ClientsCreate |
| /clients/:id | ClientDetail |
| /crm | CRM |
| /crm/create | CrmCreate |
| /crm/pipeline | CRM |
| /crm/activities | CrmActivities |
| /crm/leads/:id | LeadDetail |
| /crm/:id | OpportunityDetail |
| /marketing | Marketing |

### المشاريع والمهام (9 صفحات)
| المسار | المكوّن |
|--------|---------|
| /projects | Projects |
| /projects/create | ProjectsCreate |
| /projects/:id | ProjectDetail |
| /projects/tasks | Tasks |
| /projects/gantt | ProjectGantt |
| /projects/risks | ProjectRisks |
| /tasks | Tasks |
| /tasks/create | TasksCreate |
| /tasks/:id | TaskDetail |

### القانونية (13 صفحة)
| المسار | المكوّن | المستوى |
|--------|---------|---------|
| /legal | Legal | 40 |
| /legal/create | LegalCreate | 40 |
| /legal/cases | Legal | 40 |
| /legal/cases/create | LegalCasesCreate | 40 |
| /legal/cases/:id | LegalCaseDetail | 40 |
| /legal/contracts | Legal | 40 |
| /legal/contracts/:id | LegalContractDetail | 40 |
| /legal/sessions | LegalSessions | 40 |
| /legal/sessions/:id | LegalSessionDetail | 40 |
| /legal/judgments | LegalJudgments | 40 |
| /legal/judgments/:id | LegalJudgmentDetail | 40 |
| /legal/correspondence | LegalCorrespondence | 40 |
| /legal/documents | Legal | 40 |

### المستودعات (13 صفحة)
| المسار | المكوّن |
|--------|---------|
| /warehouse | Warehouse |
| /warehouse/create | WarehouseCreate |
| /warehouse/products/:id | WarehouseProductDetail |
| /warehouse/movements | Warehouse |
| /warehouse/movements/create | WarehouseMovementsCreate |
| /warehouse/movements/:id | WarehouseMovementDetail |
| /warehouse/categories | Warehouse |
| /warehouse/categories/create | WarehouseCategoriesCreate |
| /warehouse/categories/:id | WarehouseCategoryDetail |
| /warehouse/suppliers | Warehouse |
| /warehouse/suppliers/create | WarehouseSuppliersCreate |
| /warehouse/suppliers/:id | WarehouseSupplierDetail |
| /warehouse/inventory-count | InventoryCount |

### الدعم الفني (5 صفحات)
| المسار | المكوّن |
|--------|---------|
| /support | Support |
| /support/create | SupportCreate |
| /support/:id | TicketDetail |
| /support/replies | SupportReplies |
| /support/kb | KnowledgeBase |

### العمرة (23 صفحة)
| المسار | المكوّن |
|--------|---------|
| /umrah | UmrahDashboard |
| /umrah/pilgrims | UmrahPilgrims |
| /umrah/pilgrims/create | PilgrimCreate |
| /umrah/pilgrims/:id | PilgrimDetail |
| /umrah/agents | UmrahAgents |
| /umrah/agents/:id | UmrahAgentDetail |
| /umrah/seasons | UmrahSeasons |
| /umrah/seasons/:id | UmrahSeasonDetail |
| /umrah/penalties | UmrahPenalties |
| /umrah/penalties/:id | UmrahPenaltyDetail |
| /umrah/invoices | UmrahInvoices |
| /umrah/invoices/:id | UmrahInvoiceDetail |
| /umrah/packages | UmrahPackages |
| /umrah/packages/:id | UmrahPackageDetail |
| /umrah/transport | UmrahTransport |
| /umrah/import/legacy | UmrahImport |
| /umrah/import | UmrahImportWizard |
| /umrah/sub-agents | UmrahSubAgents |
| /umrah/pricing | UmrahPricing |
| /umrah/commission-plans | UmrahCommissionPlans |
| /umrah/commission-plans/new | UmrahCommissionPlanEditor |
| /umrah/commission-plans/:id/edit | UmrahCommissionPlanEditor |
| /umrah/violations | UmrahViolations |

### الحوكمة (14 صفحة — المستوى 60)
| المسار | المكوّن |
|--------|---------|
| /governance | Governance |
| /governance/policies | Governance |
| /governance/policies/create | PoliciesCreate |
| /governance/policies/:id | PolicyDetail |
| /governance/risks | Governance |
| /governance/risks/create | RisksCreate |
| /governance/risks/:id | RiskDetail |
| /governance/audits | Governance |
| /governance/audits/create | AuditsCreate |
| /governance/audits/:id | AuditDetail |
| /governance/compliance | Governance |
| /governance/compliance/create | ComplianceCreate |
| /governance/compliance/:id | ComplianceDetail |
| /governance/capa | GovernanceCapa |

### ذكاء الأعمال (9 صفحات — المستوى 40)
| المسار | المكوّن |
|--------|---------|
| /bi | BI |
| /bi/dashboards | BI |
| /bi/dashboards/create | DashboardsCreate |
| /bi/kpis | BI |
| /bi/kpis/create | KpisCreate |
| /bi/reports | BI |
| /bi/reports/create | BiReportsCreate |
| /bi/operations | BiOperations |
| /bi/admin-reports | BiAdminReports |

### المستندات (7 صفحات)
| المسار | المكوّن |
|--------|---------|
| /documents | DocumentsPage |
| /documents/create | DocumentsCreate |
| /documents/:docId/versions | VersionUpload |
| /documents/upload | DocumentsUpload |
| /documents/folders | DocumentsPage |
| /documents/templates | DocumentsTemplates |
| /documents/archive | DocumentsArchive |

### الاتصالات (6 صفحات)
| المسار | المكوّن |
|--------|---------|
| /communications | Communications |
| /communications/notification-engine | NotificationEngine |
| /communications/letters/create | LettersCreate |
| /correspondence | Correspondence |
| /correspondence/create | CorrespondenceCreate |
| /correspondence/:id | CorrespondenceDetail |

### الإدارة (15 صفحة — المستوى 90)
| المسار | المكوّن |
|--------|---------|
| /admin | Admin |
| /admin/users | AdminUsers |
| /admin/roles | AdminRoles |
| /admin/logs | AdminLogs |
| /admin/integrations | AdminIntegrations |
| /admin/monitoring | AdminMonitoring |
| /admin/violations-report | AdminViolationsReport |
| /admin/system-governor | AdminSystemGovernor |
| /admin/policy-engine | AdminPolicyEngine |
| /admin/domain-registry | AdminDomainRegistry |
| /admin/event-monitor | AdminEventMonitor |
| /admin/posting-failures | AdminPostingFailures |
| /admin/lifecycle-monitor | AdminLifecycleMonitor |
| /admin/rbac-matrix | AdminRbacMatrix |
| /admin/gl-reconciliation | AdminGlReconciliation |

### الإعدادات (6 صفحات — المستوى 70)
| المسار | المكوّن |
|--------|---------|
| /settings | Settings |
| /settings/branches | Settings |
| /settings/departments | Settings |
| /settings/companies | Settings |
| /settings/audit-log | Settings |
| /settings/rules | SettingsRules |

### لوحات متخصصة
| المسار | المكوّن | المستوى |
|--------|---------|---------|
| /exec-dashboard | ExecDashboard | 60 |
| /manager-board | ManagerBoard | 40 |
| /operations-center | OperationsCenter | 40 |
| /daily-close | DailyClose | 40 |
| /obligations | Obligations | — |
| /intelligence | Intelligence | — |
| /insights | Insights | — |
| /automation | Automation | — |
| /module-dashboards | ModuleDashboards | — |
| /reports/scheduled | ScheduledReports | — |

### المتجر (6 صفحات)
| المسار | المكوّن |
|--------|---------|
| /store | Store |
| /store/products/create | ProductsCreate |
| /store/products/:id | ProductDetail |
| /store/orders | Store |
| /store/orders/create | OrdersCreate |
| /store/orders/:id | OrderDetail |

### الطلبات (6 صفحات)
| المسار | المكوّن |
|--------|---------|
| /requests | RequestsPage |
| /requests/create | RequestsItemCreate |
| /requests/types | RequestsPage |
| /requests/types/create | RequestsTypeCreate |
| /requests/workflows | RequestsPage |
| /requests/:id | RequestDetail |

---

## 7. ملخص

| المقياس | القيمة |
|---------|--------|
| إجمالي الصفحات | 300+ |
| صفحات lazy-loaded | 298 (99%) |
| صفحات بدون lazy | 2 (Login, NotFound) |
| صفحات تتطلب مستوى 90 | 15 (Admin) |
| صفحات تتطلب مستوى 70 | 6 (Settings) |
| صفحات تتطلب مستوى 60 | 1 (ExecDashboard) |
| صفحات تتطلب مستوى 40 | 6 (BI, Legal, ManagerBoard, OpsCenter) |
| أكبر نطاق بالصفحات | HR (80 صفحة) |
| ثاني أكبر نطاق | Finance (65 صفحة) |
