# مصفوفة الإجراءات والكيانات
# Entity–Action Matrix

> آخر تحديث: 2026-04-24
> مرجع: [system-master-registry.md](./system-master-registry.md)

---

## طريقة القراءة

| العمود | الوصف |
|--------|-------|
| الكيان | اسم الجدول |
| الإجراء | create / read / update / delete / approve / reject / return / transition |
| المسار (API) | HTTP method + full path |
| الصلاحية | Permission string المطلوبة |
| Lifecycle | هل يستخدم applyTransition |
| Audit | emitEvent + createAuditLog |
| إشعار | هل يُنشئ إشعار |

✅ = مدعوم | — = غير مطلوب

---

## 1. الموارد البشرية (HR) — `/hr`, `/employees`

### employees

| الإجراء | المسار | الصلاحية | Lifecycle | Audit | إشعار |
|---------|--------|----------|-----------|-------|-------|
| create | POST /employees | hr:create | — | ✅ | ✅ |
| read | GET /employees, GET /employees/:id | hr:read | — | — | — |
| update | PATCH /employees/:id | hr:update | — | ✅ | — |
| delete (terminate) | DELETE /employees/:id | hr:delete | — | ✅ | ✅ |

### hr_leave_requests

| الإجراء | المسار | الصلاحية | Lifecycle | Audit | إشعار |
|---------|--------|----------|-----------|-------|-------|
| create | POST /hr/leave-requests | hr:create | — | ✅ | ✅ |
| read | GET /hr/leave-requests, GET /hr/leave-requests/:id | hr:read | — | — | — |
| approve | PATCH /hr/leave-requests/:id/approve | hr:approve | ✅ | ✅ | ✅ |
| reject | PATCH /hr/leave-requests/:id/reject | hr:approve | ✅ | ✅ | ✅ |
| escalate | PATCH /hr/leave-requests/:id/escalate | hr:approve | ✅ | ✅ | ✅ |

### attendance

| الإجراء | المسار | الصلاحية | Lifecycle | Audit | إشعار |
|---------|--------|----------|-----------|-------|-------|
| check-in | POST /hr/check-in | hr:self | — | ✅ | — |
| check-out | POST /hr/check-out | hr:self | — | ✅ | — |
| read | GET /hr/attendance | hr:read | — | — | — |

### shifts

| الإجراء | المسار | الصلاحية | Lifecycle | Audit | إشعار |
|---------|--------|----------|-----------|-------|-------|
| create | POST /hr/shifts | hr:create | — | ✅ | — |
| read | GET /hr/shifts | hr:read | — | — | — |
| update | PATCH /hr/shifts/:id | hr:update | — | ✅ | — |
| delete | DELETE /hr/shifts/:id | hr:delete | — | ✅ | — |

### payroll_runs

| الإجراء | المسار | الصلاحية | Lifecycle | Audit | إشعار |
|---------|--------|----------|-----------|-------|-------|
| create | POST /hr/payroll | hr:create | — | ✅ | — |
| read | GET /hr/payroll, GET /hr/payroll/:id | hr:read | — | — | — |
| process | POST /hr/payroll/:id/process | hr:approve | — | ✅ | ✅ |
| delete | DELETE /hr/payroll/:id | hr:delete | — | ✅ | — |

### performance_reviews

| الإجراء | المسار | الصلاحية | Lifecycle | Audit | إشعار |
|---------|--------|----------|-----------|-------|-------|
| create | POST /hr/performance | hr:create | — | ✅ | ✅ |
| read | GET /hr/performance, GET /hr/performance/:id | hr:read | — | — | — |
| update | PATCH /hr/performance/:id | hr:update | — | ✅ | — |

### employee_violations

| الإجراء | المسار | الصلاحية | Lifecycle | Audit | إشعار |
|---------|--------|----------|-----------|-------|-------|
| create | POST /hr/violations | hr:create | — | ✅ | ✅ |
| read | GET /hr/violations, GET /hr/violations/:id | hr:read | — | — | — |
| delete | DELETE /hr/violations/:id | hr:delete | — | ✅ | — |
| approve | PATCH /hr/violations/:id/approve | hr:approve | — | ✅ | ✅ |
| reject | PATCH /hr/violations/:id/reject | hr:approve | — | ✅ | ✅ |
| return | PATCH /hr/violations/:id/return | hr:approve | — | ✅ | ✅ |

### hr_inquiry_memos (discipline)

| الإجراء | المسار | الصلاحية | Lifecycle | Audit | إشعار |
|---------|--------|----------|-----------|-------|-------|
| create | POST /hr/discipline/memos | hr:discipline:create | ✅ | ✅ | ✅ |
| justify | PATCH /hr/discipline/memos/:id/justify | hr:discipline:update | ✅ | ✅ | — |
| recommendation | PATCH /hr/discipline/memos/:id/recommendation | hr:discipline:approve | ✅ | ✅ | — |
| gm-decision | PATCH /hr/discipline/memos/:id/gm-decision | hr:discipline:approve | ✅ | ✅ | ✅ |
| cancel | PATCH /hr/discipline/memos/:id/cancel | hr:discipline:update | ✅ | ✅ | — |
| appeal | POST /hr/discipline/memos/:id/appeal | hr:self | ✅ | ✅ | ✅ |
| appeal-decision | PATCH /hr/discipline/memos/:id/appeal-decision | hr:discipline:approve | ✅ | ✅ | ✅ |
| close | PATCH /hr/discipline/memos/:id/close | hr:discipline:approve | ✅ | ✅ | — |

### hr_employee_loans

| الإجراء | المسار | الصلاحية | Lifecycle | Audit | إشعار |
|---------|--------|----------|-----------|-------|-------|
| create | POST /hr/loans | hr:create | — | ✅ | ✅ |
| read | GET /hr/loans, GET /hr/loans/:id | hr:read | — | — | — |
| approve | PATCH /hr/loans/:id/approve | hr:approve | — | ✅ | ✅ |

### hr_overtime_requests

| الإجراء | المسار | الصلاحية | Lifecycle | Audit | إشعار |
|---------|--------|----------|-----------|-------|-------|
| create | POST /hr/overtime | hr:create | — | ✅ | ✅ |
| approve | PATCH /hr/overtime/:id/approve | hr:approve | — | ✅ | ✅ |

### hr_exit_requests

| الإجراء | المسار | الصلاحية | Lifecycle | Audit | إشعار |
|---------|--------|----------|-----------|-------|-------|
| create | POST /hr/exit | hr:create | ✅ | ✅ | ✅ |
| approve | PATCH /hr/exit/:id/approve | hr:approve | ✅ | ✅ | ✅ |
| reject | PATCH /hr/exit/:id/reject | hr:approve | ✅ | ✅ | ✅ |

### employee_transfers

| الإجراء | المسار | الصلاحية | Lifecycle | Audit | إشعار |
|---------|--------|----------|-----------|-------|-------|
| create | POST /hr/transfers | hr:create | — | ✅ | ✅ |
| approve | PATCH /hr/transfers/:id/approve | hr:approve | — | ✅ | ✅ |
| receive | PATCH /hr/transfers/:id/receive | hr:update | — | ✅ | ✅ |

### training_programs

| الإجراء | المسار | الصلاحية | Lifecycle | Audit | إشعار |
|---------|--------|----------|-----------|-------|-------|
| create | POST /hr/training | hr:create | — | ✅ | ✅ |
| read | GET /hr/training | hr:read | — | — | — |
| update | PATCH /hr/training/:id | hr:update | — | ✅ | — |
| delete | DELETE /hr/training/:id | hr:delete | — | ✅ | — |
| enroll | POST /hr/training/:id/enroll | hr:create | — | ✅ | ✅ |

### employee_contracts

| الإجراء | المسار | الصلاحية | Lifecycle | Audit | إشعار |
|---------|--------|----------|-----------|-------|-------|
| create | POST /hr/contracts | hr:create | — | ✅ | — |
| read | GET /hr/contracts | hr:read | — | — | — |
| update | PATCH /hr/contracts/:id | hr:update | — | ✅ | — |

---

## 2. المالية والمحاسبة (Finance) — `/finance`

### invoices

| الإجراء | المسار | الصلاحية | Lifecycle | Audit | إشعار |
|---------|--------|----------|-----------|-------|-------|
| create | POST /finance/invoices | finance:create | ✅ | ✅ | ✅ |
| read | GET /finance/invoices, GET /finance/invoices/:id | finance:read | — | — | — |
| update | PATCH /finance/invoices/:id | finance:update | — | ✅ | — |
| delete | DELETE /finance/invoices/:id | finance:delete | ✅ | ✅ | — |
| approve | PATCH /finance/invoices/:id/approve | finance:approve | ✅ | ✅ | ✅ |
| send | PATCH /finance/invoices/:id/send | finance:update | ✅ | ✅ | ✅ |
| collect | POST /finance/invoices/:id/collect | finance:create | ✅ | ✅ | ✅ |
| cancel | PATCH /finance/invoices/:id/cancel | finance:update | ✅ | ✅ | — |

### journal_entries

| الإجراء | المسار | الصلاحية | Lifecycle | Audit | إشعار |
|---------|--------|----------|-----------|-------|-------|
| create | POST /finance/journals | finance:create | ✅ | ✅ | — |
| read | GET /finance/journals, GET /finance/journals/:id | finance:read | — | — | — |
| update | PATCH /finance/journals/:id | finance:update | — | ✅ | — |
| delete | DELETE /finance/journals/:id | finance:delete | ✅ | ✅ | — |
| post | PATCH /finance/journals/:id/post | finance:approve | ✅ | ✅ | — |
| reverse | POST /finance/journals/:id/reverse | finance:create | ✅ | ✅ | — |
| batch | POST /finance/journals/batch | finance:create | — | ✅ | — |

### chart_of_accounts

| الإجراء | المسار | الصلاحية | Lifecycle | Audit | إشعار |
|---------|--------|----------|-----------|-------|-------|
| create | POST /finance/accounts | finance:create | — | ✅ | — |
| read | GET /finance/accounts | finance:read | — | — | — |
| update | PATCH /finance/accounts/:id | finance:update | — | ✅ | — |
| delete | DELETE /finance/accounts/:id | finance:delete | — | ✅ | — |

### purchase_orders

| الإجراء | المسار | الصلاحية | Lifecycle | Audit | إشعار |
|---------|--------|----------|-----------|-------|-------|
| create | POST /finance/purchase-orders | finance:create | ✅ | ✅ | ✅ |
| read | GET /finance/purchase-orders | finance:read | — | — | — |
| update | PATCH /finance/purchase-orders/:id | finance:update | — | ✅ | — |
| approve | PATCH /finance/purchase-orders/:id/approve | finance:approve | ✅ | ✅ | ✅ |
| receive | POST /finance/purchase-orders/:id/receive | finance:create | ✅ | ✅ | — |

### purchase_requests

| الإجراء | المسار | الصلاحية | Lifecycle | Audit | إشعار |
|---------|--------|----------|-----------|-------|-------|
| create | POST /finance/purchase-requests | finance:create | ✅ | ✅ | ✅ |
| approve | PATCH /finance/purchase-requests/:id/approve | finance:approve | ✅ | ✅ | ✅ |
| reject | PATCH /finance/purchase-requests/:id/reject | finance:approve | ✅ | ✅ | ✅ |

### budgets

| الإجراء | المسار | الصلاحية | Lifecycle | Audit | إشعار |
|---------|--------|----------|-----------|-------|-------|
| create | POST /finance/budgets | finance:create | ✅ | ✅ | — |
| read | GET /finance/budgets | finance:read | — | — | — |
| approve | PATCH /finance/budgets/:id/approve | finance:approve | ✅ | ✅ | ✅ |

### fixed_assets

| الإجراء | المسار | الصلاحية | Lifecycle | Audit | إشعار |
|---------|--------|----------|-----------|-------|-------|
| create | POST /finance/fixed-assets | finance:create | — | ✅ | — |
| read | GET /finance/fixed-assets | finance:read | — | — | — |
| depreciate | POST /finance/fixed-assets/:id/depreciate | finance:create | — | ✅ | — |
| batch-depreciate | POST /finance/fixed-assets/batch-depreciate | finance:create | — | ✅ | — |

### recurring_journals

| الإجراء | المسار | الصلاحية | Lifecycle | Audit | إشعار |
|---------|--------|----------|-----------|-------|-------|
| create | POST /finance/recurring-journals | finance:create | — | ✅ | — |
| read | GET /finance/recurring-journals | finance:read | — | — | — |
| update | PATCH /finance/recurring-journals/:id | finance:update | — | ✅ | — |

---

## 3. إدارة الأسطول (Fleet) — `/fleet`

### fleet_vehicles

| الإجراء | المسار | الصلاحية | Lifecycle | Audit | إشعار |
|---------|--------|----------|-----------|-------|-------|
| create | POST /fleet/vehicles | fleet:create | — | ✅ | — |
| read | GET /fleet/vehicles, GET /fleet/vehicles/:id | fleet:read | — | — | — |
| update | PATCH /fleet/vehicles/:id | fleet:update | — | ✅ | — |
| delete | DELETE /fleet/vehicles/:id | fleet:delete | — | ✅ | — |

### fleet_drivers

| الإجراء | المسار | الصلاحية | Lifecycle | Audit | إشعار |
|---------|--------|----------|-----------|-------|-------|
| create | POST /fleet/drivers | fleet:create | — | ✅ | — |
| read | GET /fleet/drivers | fleet:read | — | — | — |
| update | PATCH /fleet/drivers/:id | fleet:update | — | ✅ | — |
| delete | DELETE /fleet/drivers/:id | fleet:delete | — | ✅ | — |

### fleet_trips

| الإجراء | المسار | الصلاحية | Lifecycle | Audit | إشعار |
|---------|--------|----------|-----------|-------|-------|
| create | POST /fleet/trips | fleet:create | ✅ | ✅ | ✅ |
| read | GET /fleet/trips | fleet:read | — | — | — |
| update | PATCH /fleet/trips/:id | fleet:update | — | ✅ | — |
| delete | DELETE /fleet/trips/:id | fleet:delete | — | ✅ | — |
| complete | POST /fleet/trips/:id/complete | fleet:update | ✅ | ✅ | ✅ |
| cancel | PATCH /fleet/trips/:id/cancel | fleet:update | ✅ | ✅ | — |

### fleet_maintenance

| الإجراء | المسار | الصلاحية | Lifecycle | Audit | إشعار |
|---------|--------|----------|-----------|-------|-------|
| create | POST /fleet/maintenance | fleet:create | ✅ | ✅ | ✅ |
| complete | PATCH /fleet/maintenance/:id/complete | fleet:update | ✅ | ✅ | — |
| cancel | PATCH /fleet/maintenance/:id/cancel | fleet:update | ✅ | ✅ | — |
| delete | DELETE /fleet/maintenance/:id | fleet:delete | — | ✅ | — |

### fleet_fuel_logs

| الإجراء | المسار | الصلاحية | Lifecycle | Audit | إشعار |
|---------|--------|----------|-----------|-------|-------|
| create | POST /fleet/fuel-logs | fleet:create | — | ✅ | — |
| delete | DELETE /fleet/fuel-logs/:id | fleet:delete | — | ✅ | — |

### fleet_insurance

| الإجراء | المسار | الصلاحية | Lifecycle | Audit | إشعار |
|---------|--------|----------|-----------|-------|-------|
| create | POST /fleet/insurance | fleet:create | — | ✅ | — |
| delete | DELETE /fleet/insurance/:id | fleet:delete | — | ✅ | — |

---

## 4. إدارة العقارات (Properties) — `/properties`

### property_buildings

| الإجراء | المسار | الصلاحية | Lifecycle | Audit | إشعار |
|---------|--------|----------|-----------|-------|-------|
| create | POST /properties/buildings | property:create | — | ✅ | — |
| read | GET /properties/buildings | property:read | — | — | — |
| update | PATCH /properties/buildings/:id | property:update | — | ✅ | — |
| delete | DELETE /properties/buildings/:id | property:delete | — | ✅ | — |

### property_units

| الإجراء | المسار | الصلاحية | Lifecycle | Audit | إشعار |
|---------|--------|----------|-----------|-------|-------|
| create | POST /properties/units | property:create | — | ✅ | — |
| read | GET /properties/units | property:read | — | — | — |
| update | PATCH /properties/units/:id | property:update | — | ✅ | — |
| delete | DELETE /properties/units/:id | property:delete | — | ✅ | — |

### property_contracts

| الإجراء | المسار | الصلاحية | Lifecycle | Audit | إشعار |
|---------|--------|----------|-----------|-------|-------|
| create | POST /properties/contracts | property:create | ✅ | ✅ | ✅ |
| read | GET /properties/contracts | property:read | — | — | — |
| update | PATCH /properties/contracts/:id | property:update | — | ✅ | — |
| terminate | PATCH /properties/contracts/:id/terminate | property:update | ✅ | ✅ | ✅ |
| renew | POST /properties/contracts/:id/renew | property:create | ✅ | ✅ | ✅ |

### tenants

| الإجراء | المسار | الصلاحية | Lifecycle | Audit | إشعار |
|---------|--------|----------|-----------|-------|-------|
| create | POST /properties/tenants | property:create | — | ✅ | — |
| read | GET /properties/tenants | property:read | — | — | — |
| update | PATCH /properties/tenants/:id | property:update | — | ✅ | — |
| delete | DELETE /properties/tenants/:id | property:delete | — | ✅ | — |

### rent_payments

| الإجراء | المسار | الصلاحية | Lifecycle | Audit | إشعار |
|---------|--------|----------|-----------|-------|-------|
| create | POST /properties/payments | property:create | — | ✅ | ✅ |
| read | GET /properties/payments | property:read | — | — | — |

---

## 5. المشاريع والمهام (Projects & Tasks) — `/projects`, `/tasks`

### projects

| الإجراء | المسار | الصلاحية | Lifecycle | Audit | إشعار |
|---------|--------|----------|-----------|-------|-------|
| create | POST /projects | projects:create | — | ✅ | ✅ |
| read | GET /projects, GET /projects/:id | projects:read | — | — | — |
| update | PATCH /projects/:id | projects:update | — | ✅ | — |
| delete | DELETE /projects/:id | projects:delete | — | ✅ | — |
| close | POST /projects/:id/close | projects:update | — | ✅ | ✅ |

### project_tasks

| الإجراء | المسار | الصلاحية | Lifecycle | Audit | إشعار |
|---------|--------|----------|-----------|-------|-------|
| create | POST /projects/:id/tasks | projects:create | — | ✅ | ✅ |
| update | PATCH /projects/tasks/:id | projects:update | — | ✅ | — |
| delete | DELETE /projects/tasks/:id | projects:delete | — | ✅ | — |

### tasks (standalone)

| الإجراء | المسار | الصلاحية | Lifecycle | Audit | إشعار |
|---------|--------|----------|-----------|-------|-------|
| create | POST /tasks | tasks:write | — | ✅ | ✅ |
| read | GET /tasks, GET /tasks/:id | tasks:read | — | — | — |
| update | PATCH /tasks/:id | tasks:write | — | ✅ | — |
| delete | DELETE /tasks/:id | tasks:write | — | ✅ | — |

---

## 6. المبيعات والعملاء (CRM) — `/crm`, `/clients`

### crm_opportunities

| الإجراء | المسار | الصلاحية | Lifecycle | Audit | إشعار |
|---------|--------|----------|-----------|-------|-------|
| create | POST /crm/opportunities | crm:create | ✅ | ✅ | ✅ |
| read | GET /crm/opportunities | crm:read | — | — | — |
| update | PATCH /crm/opportunities/:id | crm:update | — | ✅ | — |
| delete | DELETE /crm/opportunities/:id | crm:delete | — | ✅ | — |
| convert | POST /crm/opportunities/:id/convert | crm:create | ✅ | ✅ | ✅ |

### clients

| الإجراء | المسار | الصلاحية | Lifecycle | Audit | إشعار |
|---------|--------|----------|-----------|-------|-------|
| create | POST /clients | crm:create | — | ✅ | — |
| read | GET /clients, GET /clients/:id | crm:read | — | — | — |
| update | PATCH /clients/:id | crm:write | — | ✅ | — |
| delete | DELETE /clients/:id | crm:delete | — | ✅ | — |

---

## 7. الشؤون القانونية (Legal) — `/legal`

### legal_cases

| الإجراء | المسار | الصلاحية | Lifecycle | Audit | إشعار |
|---------|--------|----------|-----------|-------|-------|
| create | POST /legal/cases | legal:create | ✅ | ✅ | ✅ |
| read | GET /legal/cases | legal:read | — | — | — |
| update | PATCH /legal/cases/:id | legal:update | ✅ | ✅ | — |

### legal_contracts

| الإجراء | المسار | الصلاحية | Lifecycle | Audit | إشعار |
|---------|--------|----------|-----------|-------|-------|
| create | POST /legal/contracts | legal:create | ✅ | ✅ | — |
| read | GET /legal/contracts | legal:read | — | — | — |
| update | PATCH /legal/contracts/:id | legal:update | ✅ | ✅ | — |
| delete | DELETE /legal/contracts/:id | legal:delete | — | ✅ | — |

---

## 8. الدعم الفني (Support) — `/support`

### support_tickets

| الإجراء | المسار | الصلاحية | Lifecycle | Audit | إشعار |
|---------|--------|----------|-----------|-------|-------|
| create | POST /support/tickets | support:create | ✅ | ✅ | ✅ |
| read | GET /support/tickets | support:read | — | — | — |
| update | PATCH /support/tickets/:id | support:update | ✅ | ✅ | — |
| delete | DELETE /support/tickets/:id | support:delete | — | ✅ | — |
| reply | POST /support/tickets/:id/reply | support:create | — | ✅ | ✅ |
| resolve | PATCH /support/tickets/:id/resolve | support:update | ✅ | ✅ | ✅ |

---

## 9. المستودعات (Warehouse) — `/warehouse`

### warehouse_products

| الإجراء | المسار | الصلاحية | Lifecycle | Audit | إشعار |
|---------|--------|----------|-----------|-------|-------|
| create | POST /warehouse/products | warehouse:create | — | ✅ | — |
| read | GET /warehouse/products | warehouse:read | — | — | — |
| update | PATCH /warehouse/products/:id | warehouse:update | — | ✅ | — |
| delete | DELETE /warehouse/products/:id | warehouse:delete | — | ✅ | — |

### warehouse_movements

| الإجراء | المسار | الصلاحية | Lifecycle | Audit | إشعار |
|---------|--------|----------|-----------|-------|-------|
| create | POST /warehouse/movements | warehouse:create | — | ✅ | — |
| transfer | POST /warehouse/transfers | warehouse:create | — | ✅ | — |

### inventory_counts

| الإجراء | المسار | الصلاحية | Lifecycle | Audit | إشعار |
|---------|--------|----------|-----------|-------|-------|
| create | POST /warehouse/inventory-counts | warehouse:create | — | ✅ | — |
| add items | POST /warehouse/inventory-counts/:id/items | warehouse:create | — | ✅ | — |
| approve | PATCH /warehouse/inventory-counts/:id/approve | warehouse:update | — | ✅ | — |

---

## 10. الحوكمة (Governance) — `/governance`

### governance_policies

| الإجراء | المسار | الصلاحية | Lifecycle | Audit | إشعار |
|---------|--------|----------|-----------|-------|-------|
| create | POST /governance/policies | governance:write | ✅ | ✅ | — |
| read | GET /governance/policies | governance:read | — | — | — |
| update | PATCH /governance/policies/:id | governance:write | ✅ | ✅ | — |
| archive | PATCH /governance/policies/:id/archive | governance:write | ✅ | ✅ | — |

### governance_risks

| الإجراء | المسار | الصلاحية | Lifecycle | Audit | إشعار |
|---------|--------|----------|-----------|-------|-------|
| create | POST /governance/risks | governance:write | — | ✅ | — |
| read | GET /governance/risks | governance:read | — | — | — |
| update | PATCH /governance/risks/:id | governance:write | — | ✅ | — |

### governance_audits

| الإجراء | المسار | الصلاحية | Lifecycle | Audit | إشعار |
|---------|--------|----------|-----------|-------|-------|
| create | POST /governance/audits | governance:write | — | ✅ | — |
| update | PATCH /governance/audits/:id | governance:write | — | ✅ | — |

### governance_compliance

| الإجراء | المسار | الصلاحية | Lifecycle | Audit | إشعار |
|---------|--------|----------|-----------|-------|-------|
| create | POST /governance/compliance | governance:write | — | ✅ | — |
| update | PATCH /governance/compliance/:id | governance:write | — | ✅ | — |

---

## 11. المستندات (Documents) — `/documents`

### documents

| الإجراء | المسار | الصلاحية | Lifecycle | Audit | إشعار |
|---------|--------|----------|-----------|-------|-------|
| create | POST /documents | documents:create | — | ✅ | — |
| read | GET /documents | documents:read | — | — | — |
| update | PATCH /documents/:id | documents:update | — | ✅ | — |
| delete | DELETE /documents/:id | documents:delete | — | ✅ | — |
| upload version | POST /documents/:id/versions | documents:create | — | ✅ | — |
| download | GET /documents/:id/download | documents:download | — | ✅ | — |

---

## 12. النظام والإدارة (Admin) — `/admin`

### users

| الإجراء | المسار | الصلاحية | Lifecycle | Audit | إشعار |
|---------|--------|----------|-----------|-------|-------|
| create | POST /admin/users | admin:write + level 90 | — | ✅ | ✅ |
| read | GET /admin/users | admin:read + level 90 | — | — | — |
| update | PATCH /admin/users/:id | admin:write + level 90 | — | ✅ | — |
| delete | DELETE /admin/users/:id | admin:write + level 90 | — | ✅ | — |
| reset-password | POST /admin/users/:id/reset-password | admin:write + level 90 | — | ✅ | ✅ |

### integrations

| الإجراء | المسار | الصلاحية | Lifecycle | Audit | إشعار |
|---------|--------|----------|-----------|-------|-------|
| create | POST /admin/integrations | admin:write + level 90 | — | ✅ | — |
| update | PATCH /admin/integrations/:id | admin:write + level 90 | — | ✅ | — |
| delete | DELETE /admin/integrations/:id | admin:write + level 90 | — | ✅ | — |
| test | POST /admin/integrations/:id/test | admin:write + level 90 | — | ✅ | — |

---

## ملخص التغطية

| المقياس | القيمة |
|---------|--------|
| إجمالي الإجراءات المفهرسة | 150+ |
| تغطية emitEvent + createAuditLog | 100% (كل write endpoint) |
| تغطية Lifecycle (applyTransition) | 19 كيان |
| تغطية الإشعارات | 60+ إجراء يُنشئ إشعار |
