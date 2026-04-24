# فهرس مسارات الإشعارات
# Action URL Registry

> آخر تحديث: 2026-04-24
> مرجع: [system-master-registry.md](./system-master-registry.md)

---

## الغرض

كل إشعار يحتوي `actionUrl` يوجّه المستخدم لصفحة محددة عند النقر. هذا الفهرس يربط كل نوع إشعار بمساره في الواجهة ويتحقق من وجود الصفحة المقابلة.

---

## 1. إشعارات الاعتمادات وسير العمل

| نوع الإشعار | actionUrl | الصفحة المقابلة | موجودة؟ |
|-------------|-----------|-----------------|---------|
| approval_required | /requests/{id} | RequestDetail | ✅ |
| approval_reminder | /requests/{id} | RequestDetail | ✅ |
| approval_escalated | /requests/{id} | RequestDetail | ✅ |
| workflow_approved | /requests/{id} | RequestDetail | ✅ |
| workflow_rejected | /requests/{id} | RequestDetail | ✅ |
| workflow_returned | /requests/{id} | RequestDetail | ✅ |
| workflow_pending | /requests/{id} | RequestDetail | ✅ |
| workflow_escalated | /requests/{id} | RequestDetail | ✅ |
| workflow_sla_warning | /requests/{id} | RequestDetail | ✅ |
| workflow_sla_exceeded | /requests/{id} | RequestDetail | ✅ |

---

## 2. إشعارات الإجازات

| نوع الإشعار | actionUrl | الصفحة المقابلة | موجودة؟ |
|-------------|-----------|-----------------|---------|
| leave_approved | /hr/leaves/{id} | LeaveDetail | ✅ |
| leave_rejected | /hr/leaves/{id} | LeaveDetail | ✅ |
| leave_returned | /hr/leaves/{id} | LeaveDetail | ✅ |
| leave_reminder | /hr/leaves/{id} | LeaveDetail | ✅ |
| leave_warning | /hr/leaves/{id} | LeaveDetail | ✅ |
| leave_escalated | /hr/leaves/{id} | LeaveDetail | ✅ |
| leave_completed | /hr/leaves | Leaves | ✅ |
| negative_leave_balance | /hr/leaves | Leaves | ✅ |

---

## 3. إشعارات الموظفين والموارد البشرية

| نوع الإشعار | actionUrl | الصفحة المقابلة | موجودة؟ |
|-------------|-----------|-----------------|---------|
| employee_created | /employees/{id} | EmployeeDetail | ✅ |
| employee_no_assignment | /employees/{id} | EmployeeDetail | ✅ |
| employee_no_contract | /employees/{id} | EmployeeDetail | ✅ |
| contract_approved | /hr/contracts/{id} | HrContractDetail | ✅ |
| contract_expiring | /hr/contracts/{id} | HrContractDetail | ✅ |
| document_expiry | /hr/expiring-documents | ExpiringDocuments | ✅ |
| document_expiry_employee | /my-documents | MyDocuments | ✅ |
| exit_approved | /hr/exit/{id} | ExitDetail | ✅ |
| exit_rejected | /hr/exit/{id} | ExitDetail | ✅ |
| probation_alert | /employees/{id} | EmployeeDetail | ✅ |

---

## 4. إشعارات الحضور والمخالفات

| نوع الإشعار | actionUrl | الصفحة المقابلة | موجودة؟ |
|-------------|-----------|-----------------|---------|
| attendance_absent | /hr/attendance | Attendance | ✅ |
| late_arrival | /hr/attendance | Attendance | ✅ |
| early_departure | /hr/attendance | Attendance | ✅ |
| late_warning | /hr/attendance | Attendance | ✅ |
| early_departure_warning | /hr/attendance | Attendance | ✅ |
| incomplete_attendance | /hr/attendance | Attendance | ✅ |
| violation_created | /hr/violations/{id} | ViolationDetail | ✅ |
| auto_violation | /hr/violations/{id} | ViolationDetail | ✅ |
| auto_violation_manager | /hr/violations/management | ViolationsManagement | ✅ |
| safety_violation | /hr/violations/{id} | ViolationDetail | ✅ |
| policy_violation | /hr/violations/{id} | ViolationDetail | ✅ |
| traffic_violation_deducted | /fleet/traffic-violations | TrafficViolations | ✅ |

---

## 5. إشعارات المذكرات التأديبية

| نوع الإشعار | actionUrl | الصفحة المقابلة | موجودة؟ |
|-------------|-----------|-----------------|---------|
| inquiry_memo | /hr/discipline/memos/{id} | DisciplineMemoDetail | ✅ |
| inquiry_memo_appeal | /hr/discipline/memos/{id} | DisciplineMemoDetail | ✅ |
| inquiry_memo_appeal_result | /hr/discipline/memos/{id} | DisciplineMemoDetail | ✅ |
| inquiry_memo_result | /hr/discipline/memos/{id} | DisciplineMemoDetail | ✅ |

---

## 6. إشعارات القروض والعمل الإضافي

| نوع الإشعار | actionUrl | الصفحة المقابلة | موجودة؟ |
|-------------|-----------|-----------------|---------|
| loan_request | /hr/loans/{id} | LoanDetail | ✅ |
| loan_approved | /hr/loans/{id} | LoanDetail | ✅ |
| loan_rejected | /hr/loans/{id} | LoanDetail | ✅ |
| overtime_request | /hr/overtime/{id} | OvertimeDetail | ✅ |
| overtime_approved | /hr/overtime/{id} | OvertimeDetail | ✅ |
| overtime_rejected | /hr/overtime/{id} | OvertimeDetail | ✅ |
| salary_advance | /finance/salary-advances/{id} | SalaryAdvanceDetail | ✅ |

---

## 7. إشعارات المالية

| نوع الإشعار | actionUrl | الصفحة المقابلة | موجودة؟ |
|-------------|-----------|-----------------|---------|
| invoice_created | /finance/invoices/{id} | InvoiceDetail | ✅ |
| invoice_sent | /finance/invoices/{id} | InvoiceDetail | ✅ |
| invoice | /finance/invoices/{id} | InvoiceDetail | ✅ |
| unpaid_invoices | /finance/invoices | Invoices | ✅ |
| overdue_invoice_no_action | /finance/invoices | Invoices | ✅ |
| consecutive_unpaid | /clients/{id} | ClientDetail | ✅ |
| budget_variance_alert | /finance/budget | Budget | ✅ |
| budget_warning | /finance/budget | Budget | ✅ |
| payroll_reminder | /hr/payroll | Payroll | ✅ |
| monthly_closing | /finance/fiscal-periods | FiscalPeriods | ✅ |
| bad_debt_reminder | /finance/reports | FinancialReports | ✅ |
| fx_revaluation_reminder | /finance/reports | FinancialReports | ✅ |

---

## 8. إشعارات الأسطول

| نوع الإشعار | actionUrl | الصفحة المقابلة | موجودة؟ |
|-------------|-----------|-----------------|---------|
| vehicle_no_insurance | /fleet/{id} | VehicleDetail | ✅ |
| vehicle_costly | /fleet/{id} | VehicleDetail | ✅ |
| gps_out_of_range | /fleet/{id} | VehicleDetail | ✅ |
| gov_expiry_alert (fleet) | /fleet/{id} | VehicleDetail | ✅ |

---

## 9. إشعارات CRM

| نوع الإشعار | actionUrl | الصفحة المقابلة | موجودة؟ |
|-------------|-----------|-----------------|---------|
| crm_opportunity | /crm/{id} | OpportunityDetail | ✅ |
| crm_overdue | /crm/activities | CrmActivities | ✅ |
| crm_stage_change | /crm/{id} | OpportunityDetail | ✅ |
| deal_won | /crm/{id} | OpportunityDetail | ✅ |
| churn_alert | /clients/{id} | ClientDetail | ✅ |
| churn_risk_historical | /clients/{id} | ClientDetail | ✅ |
| client_overdue | /clients/{id} | ClientDetail | ✅ |
| client_portal | /clients/{id} | ClientDetail | ✅ |

---

## 10. إشعارات المهام والمشاريع

| نوع الإشعار | actionUrl | الصفحة المقابلة | موجودة؟ |
|-------------|-----------|-----------------|---------|
| task_assigned | /tasks/{id} | TaskDetail | ✅ |
| task_reassigned | /tasks/{id} | TaskDetail | ✅ |
| task_completed | /tasks/{id} | TaskDetail | ✅ |
| task_delay_alert | /tasks/{id} | TaskDetail | ✅ |
| task_unblocked | /tasks/{id} | TaskDetail | ✅ |
| project_overdue | /projects/{id} | ProjectDetail | ✅ |
| project_closed | /projects/{id} | ProjectDetail | ✅ |
| project_budget_warning | /projects/{id} | ProjectDetail | ✅ |

---

## 11. إشعارات الدعم الفني

| نوع الإشعار | actionUrl | الصفحة المقابلة | موجودة؟ |
|-------------|-----------|-----------------|---------|
| support_ticket | /support/{id} | TicketDetail | ✅ |
| ticket | /support/{id} | TicketDetail | ✅ |

---

## 12. إشعارات العقارات

| نوع الإشعار | actionUrl | الصفحة المقابلة | موجودة؟ |
|-------------|-----------|-----------------|---------|
| legal_case_assigned | /legal/cases/{id} | LegalCaseDetail | ✅ |
| legal_case_created | /legal/cases/{id} | LegalCaseDetail | ✅ |
| legal_case_closed | /legal/cases | Legal | ✅ |
| vendor_contract_expiry | /finance/vendors | Vendors | ✅ |

---

## 13. إشعارات الامتثال والالتزامات

| نوع الإشعار | actionUrl | الصفحة المقابلة | موجودة؟ |
|-------------|-----------|-----------------|---------|
| obligation_reminder | /obligations | Obligations | ✅ |
| obligation_breached | /obligations | Obligations | ✅ |

---

## 14. إشعارات العمرة

| نوع الإشعار | actionUrl | الصفحة المقابلة | موجودة؟ |
|-------------|-----------|-----------------|---------|
| umrah | /umrah | UmrahDashboard | ✅ |
| active_pilgrims | /umrah/pilgrims | UmrahPilgrims | ✅ |

---

## 15. التقارير الأسبوعية

| نوع الإشعار | actionUrl | الصفحة المقابلة | موجودة؟ |
|-------------|-----------|-----------------|---------|
| weekly_hr_report | /hr | HR | ✅ |
| weekly_fleet_report | /fleet | Fleet | ✅ |
| weekly_crm_report | /crm | CRM | ✅ |
| weekly_property_revenue | /properties/dashboard | PropertiesDashboard | ✅ |
| daily_audit | /settings/audit-log | Settings | ✅ |
| system_health_report | /admin/monitoring | AdminMonitoring | ✅ |

---

## 16. ملخص التغطية

| المقياس | القيمة |
|---------|--------|
| إجمالي أنواع الإشعارات | 180+ |
| إشعارات مع actionUrl | 100+ |
| صفحات مقابلة موجودة | ✅ 100% |
| إشعارات بدون actionUrl | ~80 (إشعارات عامة / نظامية) |
| أكثر نطاق إشعارات | HR (35+) |
| ثاني أكثر نطاق | Finance (15+) |
