# المرجعية المركزية الشاملة لنظام غيث
# Ghayth ERP — System Master Registry

> آخر تحديث: 2026-04-24
> الإصدار: 1.0.0

---

## 1. فهرس النطاقات (Domain Index)

| # | النطاق (Domain) | المعرّف | الجداول | الـ Endpoints | الصفحات | الوحدة (Module) |
|---|-----------------|---------|---------|---------------|---------|-----------------|
| 1 | الموارد البشرية | hr | 55 | 102+ | 80 | hr |
| 2 | المالية والمحاسبة | finance | 37 | 200+ | 65 | finance |
| 3 | إدارة الأسطول | fleet | 12 | 42 | 26 | fleet |
| 4 | إدارة العقارات | properties | 10 | 53 | 29 | properties |
| 5 | إدارة المشاريع | projects | 7 | 26 | 6 | operations |
| 6 | إدارة المهام | tasks | 1 | 6 | 3 | operations |
| 7 | المبيعات والعملاء | crm | 8 | 22 | 10 | crm |
| 8 | الشؤون القانونية | legal | 6 | 26 | 13 | legal |
| 9 | الدعم الفني | support | 6 | 18 | 5 | support |
| 10 | المستودعات | warehouse | 10 | 22 | 13 | warehouse |
| 11 | العمرة | umrah | 18 | 40+ | 23 | operations |
| 12 | الحوكمة | governance | 5 | 24 | 14 | governance |
| 13 | التسويق | marketing | 1 | 4 | 2 | marketing |
| 14 | المستندات | documents | 7 | 20+ | 7 | documents |
| 15 | الاتصالات | communications | 5 | 10+ | 3 | comms |
| 16 | الإدارة والنظام | admin/system | 83 | 34+ | 15 | admin |
| 17 | ذكاء الأعمال | bi | 6 | 10+ | 9 | bi |
| 18 | المتجر | store | 3 | 5 | 6 | store |

**الإجمالي: 276 جدول · 879 endpoint · 300+ صفحة · 18 نطاق**

---

## 2. فهرس الكيانات (Entity Index)

### 2.1 الموارد البشرية (HR)

| الكيان | الجدول | المالك (Owner) | آلة الحالة | الأحداث | الصلاحيات |
|--------|--------|----------------|------------|---------|-----------|
| موظف | employees | hr | — | hr.employee.hired, hr.employee.terminated | hr:create, hr:update, hr:delete |
| تعيين موظف | employee_assignments | hr | — | — | hr:create, hr:update |
| طلب إجازة | hr_leave_requests | hr | pending→approved→rejected→cancelled→completed | hr.leave.requested, hr.leave.approved, hr.leave.rejected | hr:create, hr:approve |
| رصيد إجازات | hr_leave_balances | hr | — | — | hr:read |
| أنواع الإجازات | hr_leave_types | hr | — | — | hr:create |
| الحضور | attendance | hr | — | hr.attendance.checked_in, hr.attendance.checked_out | hr:self |
| سياسات الحضور | attendance_policies | hr | — | — | hr:create |
| الورديات | shifts | hr | — | hr.shift.created | hr:create |
| تقييم الأداء | performance_reviews | hr | — | hr.performance.created | hr:create |
| دورات التقييم | evaluation_cycles | hr | — | — | hr:create |
| كشف رواتب | payroll_runs | hr | — | hr.payroll.processed | hr:create |
| بنود الراتب | salary_components | hr | — | — | hr:create |
| مخالفة موظف | employee_violations | hr | — | hr.violation.created | hr:create |
| مذكرة تأديبية | hr_inquiry_memos | hr | draft→issued→acknowledged→appealed→escalated→gm_review→justified→closed | hr.discipline.memo.created | hr:discipline:create |
| لائحة تأديبية | hr_discipline_regulation | hr | — | — | hr:discipline:create |
| قرض موظف | hr_employee_loans | hr | — | hr.loan.approved | hr:create |
| أقساط القرض | hr_loan_installments | hr | — | — | hr:read |
| طلب عمل إضافي | hr_overtime_requests | hr | — | hr.overtime.approved | hr:create |
| طلب استئذان | hr_excuse_requests | hr | — | hr.excuse.created | hr:create |
| طلب مغادرة نهائية | hr_exit_requests | hr | pending→approved→clearance→rejected→completed | hr.exit.requested | hr:create |
| إخلاء طرف | hr_exit_clearance | hr | — | — | hr:update |
| نقل موظف | employee_transfers | hr | — | hr.transfer.created | hr:create |
| عقد موظف | employee_contracts | hr | — | hr.contract.created | hr:create |
| خطة تطوير | employee_development_plans | hr | — | — | hr:create |
| برنامج تدريبي | training_programs | hr | — | training.program.created | hr:create |
| توظيف (وظيفة) | job_postings | hr | — | recruitment.job.posted | hr:create |
| طلب توظيف | job_applications | hr | — | recruitment.application.received | hr:create |
| خطاب رسمي | official_letters | hr | — | hr.letter.created | hr:create |
| تفويض | delegations | hr | — | — | hr:create |
| موظف الشهر | employee_of_month | hr | — | — | hr:create |
| تقييم أقران | peer_evaluations | hr | — | hr.evaluation.peer_submitted | hr:create |
| مراجعة صاعدة | anonymous_upward_reviews | hr | — | hr.evaluation.upward_submitted | hr:create |

### 2.2 المالية والمحاسبة (Finance)

| الكيان | الجدول | المالك | آلة الحالة | الأحداث | الصلاحيات |
|--------|--------|--------|------------|---------|-----------|
| فاتورة | invoices | finance | draft→approved→posted→partial→overdue→paid→cancelled→closed | finance.invoice.created, finance.invoice.paid | finance:create, finance:approve |
| بنود فاتورة | invoice_lines | finance | — | — | finance:create |
| مدفوعات فاتورة | invoice_payments | finance | — | finance.payment.received | finance:create |
| قيد يومية | journal_entries | finance | draft→pending_approval→posted→rejected→reversed | finance.journal.created, finance.journal.posted | finance:create, finance:approve |
| بنود القيد | journal_lines | finance | — | — | finance:create |
| دليل حسابات | chart_of_accounts | finance | — | — | finance:create |
| مركز تكلفة | cost_centers | finance | — | — | finance:create |
| ميزانية | budgets | finance | draft→pending_approval→approved→rejected→closed | finance.budget.created, finance.budget.approved | finance:create, finance:approve |
| بنود ميزانية | budget_lines | finance | — | — | finance:create |
| أمر شراء | purchase_orders | finance | draft→pending_approval→approved→partially_received→received→rejected→paid→cancelled | finance.purchase_order.created | finance:create, finance:approve |
| طلب شراء | purchase_requests | finance | draft→pending→approved→rejected→converted | finance.purchase_request.created | finance:create |
| مورد | suppliers | finance | — | — | finance:create |
| عقد مورد | vendor_contracts | finance | — | — | finance:create |
| فترة مالية | financial_periods | finance | open↔closed | — | finance:write |
| أصل ثابت | fixed_assets | finance | — | finance.asset.created | finance:create |
| إهلاك | depreciation_entries | finance | — | — | finance:create |
| إشعار دائن | credit_memos | finance | — | finance.credit_memo.created | finance:create |
| إشعار مدين | debit_memos | finance | — | — | finance:create |
| دفعة مقدمة | customer_advances | finance | — | — | finance:create |
| عهدة مالية | expenses | finance | — | finance.custody.created | finance:create |
| قيود دورية | recurring_journals | finance | — | — | finance:create |
| كفالة بنكية | bank_guarantees | finance | — | — | finance:create |
| تسوية بنكية | bank_statements | finance | — | — | finance:create |
| إعادة تقييم عملات | fx_revaluations | finance | — | — | finance:create |
| أسعار صرف | fx_rates | finance | — | — | finance:create |
| إقفال يومي | daily_closures | finance | — | — | finance:write |
| زاتكا | zatca_settings | finance | — | — | finance:write |

### 2.3 إدارة الأسطول (Fleet)

| الكيان | الجدول | المالك | آلة الحالة | الأحداث | الصلاحيات |
|--------|--------|--------|------------|---------|-----------|
| مركبة | fleet_vehicles | fleet | — | fleet.vehicle.created | fleet:create |
| سائق | fleet_drivers | fleet | — | fleet.driver.created | fleet:create |
| رحلة | fleet_trips | fleet | scheduled→in_progress→completed→cancelled | fleet.trip.started, fleet.trip.completed | fleet:create |
| صيانة | fleet_maintenance | fleet | scheduled→in_progress→completed→cancelled | fleet.maintenance.created | fleet:create |
| وقود | fleet_fuel_logs | fleet | — | fleet.fuel.logged | fleet:create |
| تأمين | fleet_insurance | fleet | — | fleet.insurance.created | fleet:create |
| مخالفة مرورية | fleet_traffic_violations | fleet | — | fleet.violation.created | fleet:create |
| تتبع GPS | fleet_gps_tracking | fleet | — | — | fleet:read |
| خطة صيانة وقائية | fleet_preventive_plans | fleet | — | fleet.preventive.created | fleet:create |

### 2.4 إدارة العقارات (Properties)

| الكيان | الجدول | المالك | آلة الحالة | الأحداث | الصلاحيات |
|--------|--------|--------|------------|---------|-----------|
| مبنى | property_buildings | properties | — | property.building.created | property:create |
| وحدة عقارية | property_units | properties | — | property.unit.created | property:create |
| عقد إيجار | property_contracts | properties | draft→active→terminated→expired→renewed→cancelled | property.contract.created | property:create |
| مستأجر | tenants | properties | — | property.tenant.created | property:create |
| مالك | property_owners | properties | — | — | property:create |
| دفعة إيجار | rent_payments | properties | — | property.payment.received | property:create |
| طلب صيانة | maintenance_requests | properties | — | property.maintenance.requested | property:create |
| فحص عقاري | property_inspections | properties | — | — | property:create |
| تأمين عقاري | property_security_deposits | properties | — | — | property:create |

### 2.5 إدارة المشاريع والمهام (Projects & Tasks)

| الكيان | الجدول | المالك | آلة الحالة | الأحداث | الصلاحيات |
|--------|--------|--------|------------|---------|-----------|
| مشروع | projects | operations | — | project.created | projects:create |
| مهمة | project_tasks | operations | — | project.task.created | projects:create |
| مرحلة | project_phases | operations | — | — | projects:create |
| معلم | project_milestones | operations | — | — | projects:create |
| مخاطرة | project_risks | operations | — | — | projects:create |
| تكلفة مشروع | project_costs | operations | — | — | projects:create |
| مورد مشروع | project_resources | operations | — | — | projects:create |
| مهمة عامة | tasks | operations | — | tasks.created | tasks:write |

### 2.6 المبيعات والعملاء (CRM)

| الكيان | الجدول | المالك | آلة الحالة | الأحداث | الصلاحيات |
|--------|--------|--------|------------|---------|-----------|
| عميل | clients | crm | — | crm.client.created | crm:create |
| فرصة بيع | crm_opportunities | crm | prospecting→qualification→proposal→negotiation→won→lost | crm.opportunity.created, crm.opportunity.won | crm:create |
| نشاط CRM | crm_activities | crm | — | crm.activity.created | crm:create |
| جهة اتصال | crm_contacts | crm | — | — | crm:create |
| مراحل المبيعات | crm_pipeline_stages | crm | — | — | crm:create |
| حساب بوابة عميل | client_portal_accounts | crm | — | — | crm:write |
| حملة تسويقية | marketing_campaigns | marketing | — | marketing.campaign.created | marketing:create |

### 2.7 الشؤون القانونية (Legal)

| الكيان | الجدول | المالك | آلة الحالة | الأحداث | الصلاحيات |
|--------|--------|--------|------------|---------|-----------|
| قضية | legal_cases | legal | open→in_progress→on_hold→closed | legal.case.created | legal:create |
| عقد قانوني | legal_contracts | legal | draft→active→terminated→expired→renewed→cancelled | legal.contract.created | legal:create |
| جلسة | legal_sessions | legal | — | legal.session.created | legal:create |
| حكم | legal_judgments | legal | — | — | legal:create |
| مراسلة قانونية | legal_correspondence | legal | — | — | legal:create |

### 2.8 الدعم الفني (Support)

| الكيان | الجدول | المالك | آلة الحالة | الأحداث | الصلاحيات |
|--------|--------|--------|------------|---------|-----------|
| تذكرة دعم | support_tickets | support | open→in_progress→escalated→resolved→closed | support.ticket.created | support:create |
| رد على تذكرة | ticket_replies | support | — | support.ticket.replied | support:create |
| تقييم رضا | ticket_csat_ratings | support | — | — | support:create |
| تصعيد | ticket_escalations | support | — | support.sla.breached | support:read |
| قاعدة معرفة | kb_articles | support | — | — | support:create |
| اتفاقية مستوى خدمة | sla_definitions | support | — | — | support:create |

### 2.9 المستودعات (Warehouse)

| الكيان | الجدول | المالك | آلة الحالة | الأحداث | الصلاحيات |
|--------|--------|--------|------------|---------|-----------|
| منتج | warehouse_products | warehouse | — | warehouse.product.created | warehouse:create |
| حركة مخزون | warehouse_movements | warehouse | — | warehouse.movement.created | warehouse:create |
| تحويل مخزون | stock_transfers | warehouse | — | warehouse.transfer.created | warehouse:create |
| تصنيف | warehouse_categories | warehouse | — | — | warehouse:create |
| مورد | suppliers | warehouse | — | — | warehouse:create |
| جرد | inventory_counts | warehouse | — | warehouse.count.created | warehouse:create |
| دفعات مخزون | warehouse_stock_batches | warehouse | — | — | warehouse:read |

### 2.10 العمرة (Umrah)

| الكيان | الجدول | المالك | آلة الحالة | الأحداث | الصلاحيات |
|--------|--------|--------|------------|---------|-----------|
| معتمر | umrah_pilgrims | umrah | — | umrah.pilgrim.created | umrah:write |
| وكيل عمرة | umrah_agents | umrah | — | umrah.agent.created | umrah:write |
| فاتورة عمرة | umrah_sales_invoices | umrah | draft→confirmed→paid→partial→cancelled | umrah.invoice.generated | umrah:write |
| موسم | umrah_seasons | umrah | — | — | umrah:write |
| باقة | umrah_packages | umrah | — | — | umrah:write |
| مخالفة عمرة | umrah_violations | umrah | — | — | umrah:write |
| جزاء | umrah_penalties | umrah | — | — | umrah:write |
| نقل | umrah_transport | umrah | — | — | umrah:write |
| دفعة عمرة | umrah_payments | umrah | — | umrah.payment.received | umrah:write |
| عمولة | umrah_payment_allocations | umrah | — | umrah.commission.calculated | umrah:write |
| تسعير | umrah_pricing | umrah | — | — | umrah:write |
| وكيل فرعي | umrah_sub_agents | umrah | — | — | umrah:write |

### 2.11 الحوكمة (Governance)

| الكيان | الجدول | المالك | آلة الحالة | الأحداث | الصلاحيات |
|--------|--------|--------|------------|---------|-----------|
| سياسة | governance_policies | governance | draft→active→archived | governance.policy.created | governance:write |
| مخاطرة | governance_risks | governance | — | governance.risk.created | governance:write |
| تدقيق | governance_audits | governance | — | governance.audit.created | governance:write |
| امتثال | governance_compliance | governance | — | governance.compliance.created | governance:write |
| إجراء تصحيحي | governance_capa | governance | — | — | governance:write |

### 2.12 المستندات (Documents)

| الكيان | الجدول | المالك | آلة الحالة | الأحداث | الصلاحيات |
|--------|--------|--------|------------|---------|-----------|
| مستند | documents | documents | — | documents.created | documents:create |
| إصدار مستند | document_versions | documents | — | documents.version.uploaded | documents:create |
| مجلد | document_folders | documents | — | — | documents:create |
| قالب مستند | document_templates | documents | — | — | documents:create |
| ربط مستند بكيان | document_entity_links | documents | — | — | documents:create |
| مستند شركة | company_documents | documents | — | — | documents:create |
| مستند موظف | employee_documents | documents | — | — | documents:create |

### 2.13 الإدارة والنظام (Admin/System)

| الكيان | الجدول | المالك | الأحداث | الصلاحيات |
|--------|--------|--------|---------|-----------|
| مستخدم | users | admin | admin.user.created | admin:write |
| دور | roles | admin | admin.role.created | admin:write |
| صلاحية | permissions | admin | — | permissions:write |
| تكامل | integrations | admin | admin.integration.created | admin:write |
| سجل تدقيق | audit_logs | system | — | audit:read |
| إشعار | notifications | system | — | notifications:write |
| التزام | obligations | system | system.obligation.breached | operations:create |
| مهمة مجدولة | cron_jobs | system | — | admin:write |
| إعدادات | settings | system | — | settings:write |
| قاعدة أعمال | business_rules | system | — | settings:write |
| طلب عام | requests | system | — | requests:write |
| سير عمل | workflow_instances | system | pending→escalated→approved→rejected | workflow.submitted | requests:write |
| سلسلة اعتماد | approval_chains | system | — | — | admin:write |

---

## 3. ملخص آلات الحالة (Lifecycle State Machines)

| # | الكيان | الحالات | الانتقالات | الحالات النهائية |
|---|--------|---------|------------|-----------------|
| 1 | invoices | 8 | draft→approved→posted→paid/partial/overdue→closed/cancelled | closed, cancelled |
| 2 | purchase_orders | 8 | draft→pending_approval→approved→received→paid/cancelled | paid, cancelled |
| 3 | purchase_requests | 5 | draft→pending→approved→converted / rejected→draft | converted |
| 4 | journal_entries | 5 | draft→pending_approval→posted→reversed / rejected→draft | reversed |
| 5 | budgets | 5 | draft→pending_approval→approved→closed / rejected→draft | closed |
| 6 | financial_periods | 2 | open↔closed | — (دوري) |
| 7 | hr_leave_requests | 5 | pending→approved→completed/cancelled / rejected | rejected, cancelled, completed |
| 8 | hr_exit_requests | 5 | pending→approved→clearance→completed / rejected | rejected, completed |
| 9 | hr_inquiry_memos | 8 | draft→issued→acknowledged/appealed→gm_review→closed | closed |
| 10 | fleet_trips | 4 | scheduled→in_progress→completed/cancelled | completed, cancelled |
| 11 | fleet_maintenance | 4 | scheduled→in_progress→completed/cancelled | completed, cancelled |
| 12 | property_contracts | 6 | draft→active→terminated/expired/renewed→cancelled | terminated, cancelled |
| 13 | legal_cases | 4 | open→in_progress→on_hold→closed | closed |
| 14 | legal_contracts | 6 | draft→active→terminated/expired/renewed→cancelled | terminated, cancelled |
| 15 | support_tickets | 5 | open→in_progress→escalated→resolved→closed (↻open) | — (دوري) |
| 16 | crm_opportunities | 6 | prospecting→qualification→proposal→negotiation→won/lost | won, lost |
| 17 | workflow_instances | 4 | pending→escalated→approved/rejected | approved, rejected |
| 18 | umrah_sales_invoices | 5 | draft→confirmed→paid/partial/cancelled | paid, cancelled |
| 19 | governance_policies | 3 | draft→active→archived | archived |

---

## 4. ملخص كتالوج الأحداث (Event Catalog)

| النطاق | عدد الأحداث | أبرز الأحداث الحرجة |
|--------|-------------|---------------------|
| hr | 79 | hr.employee.hired, hr.employee.terminated, hr.payroll.processed |
| finance | 67 | finance.invoice.created, finance.invoice.paid, finance.payment.received |
| umrah | 36 | umrah.invoice.generated, umrah.payment.received |
| fleet | 27 | fleet.trip.started, fleet.trip.completed |
| governance | 24 | governance.compliance.created, governance.risk.created |
| property | 24 | property.contract.created, property.contract.terminated |
| admin | 18 | — |
| system | 20 | system.obligation.breached |
| warehouse | 14 | warehouse.movement.created, warehouse.stock.low |
| legal | 13 | legal.case.created |
| documents | 13 | — |
| recruitment | 13 | — |
| workflow | 22 | workflow.escalated, workflow.submitted |
| support | 9 | support.ticket.created, support.sla.breached |
| crm | 9 | crm.opportunity.won |
| project | 9 | — |
| intelligence | 9 | — |
| communications | 8 | — |
| auth | 7 | — |
| training | 7 | training.program.created |
| bi | 6 | — |
| store | 5 | store.order.created |
| tasks | 4 | — |
| marketing | 4 | — |
| notifications | 13 | — |
| **الإجمالي** | **500** | |

---

## 5. ملخص نظام الصلاحيات (RBAC)

### 5.1 الأدوار والمستويات

| الدور | المستوى | الصلاحيات |
|-------|---------|-----------|
| owner (مالك) | 100 | * (كل الصلاحيات) |
| general_manager (مدير عام) | 90 | * (كل الصلاحيات) |
| hr_manager | 70 | hr:*, hr:discipline:*, documents:read/create/download |
| finance_manager | 70 | finance:*, hr:read, fleet:read, projects:read, property:read |
| fleet_manager | 70 | fleet:* |
| warehouse_manager | 70 | warehouse:*, store:* |
| property_manager | 70 | property:* |
| projects_manager | 70 | projects:*, operations:* |
| legal_manager | 70 | legal:*, governance:* |
| support_manager | 70 | support:* |
| crm_manager | 70 | crm:* |
| bi_manager | 70 | bi:*, reports:*, audit:read |
| branch_manager | 60 | قراءة وإنشاء وتعديل واعتماد عبر عدة نطاقات |
| employee (موظف) | 10 | hr:read/self, operations:read/create, support:read/create |

### 5.2 حدود المستوى في المسارات

| المستوى | المسارات |
|---------|----------|
| 90 | /admin |
| 70 | /settings, /rules, /audit-logs |
| 60 | /exec-dashboard |
| 50 | /scheduled-reports |
| 40 | /operations-center, /bi, /legal, /manager-board |

---

## 6. الملفات المرجعية التفصيلية

| الملف | المحتوى |
|-------|---------|
| [entity-action-matrix.md](./entity-action-matrix.md) | مصفوفة الإجراءات لكل كيان مع الصلاحيات والأحداث |
| [request-approval-matrix.md](./request-approval-matrix.md) | مصفوفة الطلبات وسلاسل الاعتماد |
| [ui-page-registry.md](./ui-page-registry.md) | فهرس كل صفحات الواجهة |
| [action-url-registry.md](./action-url-registry.md) | ربط الإشعارات بمسارات الواجهة |
| [ledger-impact-registry.md](./ledger-impact-registry.md) | خريطة الأثر المالي والقيود المحاسبية |

---

## 7. إحصائيات سريعة

| المقياس | القيمة |
|---------|--------|
| إجمالي الجداول | 276 |
| إجمالي الـ Endpoints | 879 |
| GET endpoints | 421 (48%) |
| POST endpoints | 247 (28%) |
| PATCH endpoints | 108 (12%) |
| DELETE endpoints | 80 (9%) |
| PUT endpoints | 23 (3%) |
| صفحات الواجهة | 300+ |
| آلات الحالة | 19 |
| أحداث مسجلة | 500 |
| أنواع الإشعارات | 180+ |
| صلاحيات | 45+ |
| أدوار | 13 |
| أنواع الالتزامات | 10 |
| مهام مجدولة (Cron) | 60+ |
| أنواع القيود المحاسبية | 41 |
