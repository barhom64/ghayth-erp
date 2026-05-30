# تصنيف الصفحات حسب الخدمة — Ghaith ERP

> ملف تدقيق فقط (AUDIT-ONLY). لا يحتوي على أي تعديلات بل ملاحظات فقط.
> المصدر الأساسي للحقيقة: `artifacts/ghayth-erp/src/components/layout/sidebar-layout.tsx:73-623` (مصفوفة `allNavSections`).
> المرجع: #1418 (الأساس التشغيلي) و#1413 (توحيد المستخدمين/الأدوار/الصلاحيات).
> اللغة الأولى: العربية.

---

## 1. ملخص تنفيذي

- **إجمالي الصفحات المُصنَّفة:** 376 ملف `.tsx` تحت `artifacts/ghayth-erp/src/pages/` (ضمنها 120 ملف في الجذر و256 ملف في 22 مجلد فرعي).
- **عدد المداخل الجانبية الفريدة في `allNavSections`:** 8 أقسام تنظيمية مع >220 مدخل قائد/مساند مربوط بمسار.
- **الصفحات الموضوعة في مكان خاطئ (Top 5):**
  1. `pages/documents-ocr-inbox.tsx` و`pages/documents/` خارج مجلد `documents/` للجذر — صفحات OCR مكررة كمدخل قائد بدلاً من كونها تبويب داخل المستندات.
  2. `pages/properties-buildings.tsx`، `pages/properties-contracts.tsx`، `pages/properties-tenants.tsx`، `pages/properties-owners.tsx`، `pages/properties-owner-statement.tsx`، `pages/properties-maintenance.tsx`، `pages/properties-payments.tsx`، `pages/properties-dashboard.tsx`، `pages/properties-guide.tsx` — كلها صفحات أملاك مفلطحة في الجذر بدل مجلد `properties/`.
  3. `pages/legal-case-detail.tsx` خارج `pages/legal/` — صفحة تفصيل قضية لا تظهر في sidebar لكنها قائدة المظهر.
  4. `pages/admin-*.tsx` (≈30 ملف) — كل صفحات الإدارة في الجذر بدلاً من مجلد `admin/`، مما يخلق التباس مع `pages/admin/*.tsx` الموجود فعلاً.
  5. `pages/bi-*.tsx` بجوار `pages/bi/` — تكرار بنيوي بين الصفحة الكاملة والتبويبات.
- **التكرارات الكبرى (Top 5):**
  1. **العقود:** `pages/finance/contracts` (عقود الموردين) ↔ `pages/properties/contracts` ↔ `pages/legal/contracts` ↔ `pages/hr/contracts` — 4 مفاهيم متشابهة بمعالجة منفصلة.
  2. **التقارير:** `pages/finance/reports.tsx`، `pages/bi-reports.tsx`، `pages/bi/reports-tab.tsx`، `pages/reports/scheduled-reports.tsx`، `pages/fleet/reports.tsx` — عدّة مراكز تقارير دون توحيد.
  3. **اللوحات/Dashboards:** `pages/dashboard.tsx`، `pages/exec-dashboard.tsx`، `pages/module-dashboards.tsx`، `pages/finance/dashboard.tsx`، `pages/properties/dashboard.tsx` (المسار `/properties/dashboard`)، `pages/umrah/dashboard.tsx`، `pages/bi-dashboards.tsx` — ست لوحات بمسميات متشابهة.
  4. **التقادم (Aging):** `pages/finance/ap-aging.tsx` ↔ `pages/finance/ar-aging.tsx` — صحيح كزوج لكن ليس مربوطين بمدخل موحّد "تقادم"؛ ar-aging يظهر تحت "التحصيل" وap-aging تحت "النقد والذمم".
  5. **كشف الحساب (Statement):** `pages/finance/customer-statement.tsx`، `customer-statement-print.tsx`، `vendor-statement.tsx`، `vendor-statement-print.tsx`، `entity-statements.tsx`، `account-statement.tsx`، `properties-owner-statement.tsx` — ست صفحات لنفس المفهوم.

> ملاحظة: التصنيف أدناه يعتمد على المسار الذي يستهدفه الـsidebar (`path:`) كقرينة قطعية. الصفحات التي لا تظهر في `allNavSections` ولا في `details/` صُنّفت حسب اسم مجلد الجذر.

---

## 2. التصنيف حسب الخدمة

### 2.1 الرئيسية / Dashboard

| الصفحة (ملف) | المسار | الدور (قائدة/مساندة) | الخدمة الفرعية | التعرض الموصى به |
|---|---|---|---|---|
| `artifacts/ghayth-erp/src/pages/dashboard.tsx` | `/dashboard` | قائدة | لوحة عامة | standalone في sidebar |
| `artifacts/ghayth-erp/src/pages/services.tsx` | `/services` | قائدة | كل الخدمات (hub) | standalone في sidebar |
| `artifacts/ghayth-erp/src/pages/calendar.tsx` | `/calendar` | قائدة | تقويم موحد | standalone في sidebar |
| `artifacts/ghayth-erp/src/pages/my-space.tsx` | `/my-space` | قائدة | مساحاتي | standalone (بوابة الموظف) |
| `artifacts/ghayth-erp/src/pages/workspace.tsx` | `/workspace` | مساندة | مساحة العمل | inside مساحاتي |
| `artifacts/ghayth-erp/src/pages/notifications.tsx` | `/notifications` | مساندة | إشعاراتي | inside مساحاتي |
| `artifacts/ghayth-erp/src/pages/manager-board.tsx` | `/manager-board` | قائدة | لوحات الإدارة | standalone في sidebar |
| `artifacts/ghayth-erp/src/pages/manager-workspace.tsx` | `/manager-workspace` | مساندة | مساحة المدير | inside لوحات الإدارة |
| `artifacts/ghayth-erp/src/pages/module-dashboards.tsx` | `/module-dashboards` | قائدة | لوحات مؤشرات المسارات | standalone، يتلقى ?tab |
| `artifacts/ghayth-erp/src/pages/exec-dashboard.tsx` | `/exec-dashboard` | قائدة (تنفيذيون) | لوحة القيادة التنفيذية | standalone بمستوى ≥60 |
| `artifacts/ghayth-erp/src/pages/action-center.tsx` | `/action-center` | قائدة | مركز القرارات | standalone في sidebar |
| `artifacts/ghayth-erp/src/pages/operations-center.tsx` | `/operations-center` | مساندة | مركز العمليات | inside مراكز التحكم |
| `artifacts/ghayth-erp/src/pages/obligations.tsx` | `/obligations` | مساندة | مركز الالتزامات | inside مراكز التحكم |
| `artifacts/ghayth-erp/src/pages/my-space/*` (18 ملف cards/sections) | بدون مسار | مساندة (مكوّنات) | شرائح my-space | مكوّنات داخلية فقط |

### 2.2 بوابة الموظف

| الصفحة | المسار | الدور | الخدمة الفرعية | التعرض الموصى به |
|---|---|---|---|---|
| `pages/my-requests.tsx` | `/my-requests` | قائدة | طلباتي | standalone في sidebar |
| `pages/my-attendance.tsx` | `/my-attendance` | مساندة | حضوري وانصرافي | inside معلوماتي |
| `pages/my-payslip.tsx` | `/my-payslip` | مساندة | كشف راتبي | inside معلوماتي |
| `pages/my-loans.tsx` | `/my-loans` | مساندة | سلفي | inside معلوماتي |
| `pages/my-overtime.tsx` | `/my-overtime` | مساندة | ساعاتي الإضافية | inside معلوماتي |
| `pages/my-performance.tsx` | `/my-performance` | مساندة | تقييمي | inside معلوماتي |
| `pages/my-documents.tsx` | `/my-documents` | مساندة | مستنداتي | inside معلوماتي |

### 2.3 الموارد البشرية (HR)

| الصفحة | المسار | الدور | الخدمة الفرعية | التعرض الموصى به |
|---|---|---|---|---|
| `pages/hr.tsx` | `/hr` | قائدة (legacy) | لوحة HR قديمة | عرض فقط — استبدلت بـ `module-dashboards?tab=hr` |
| `pages/employees.tsx` | `/employees` | قائدة | قائمة الموظفين | standalone في sidebar |
| `pages/employee-detail.tsx` | `/employees/:id` | مساندة (تفصيل) | تفصيل موظف | inside الموظفين |
| `pages/hr/recruitment.tsx` | `/hr/recruitment` | قائدة | التوظيف | standalone في sidebar |
| `pages/hr/recruitment-advanced.tsx` | `/hr/recruitment/advanced` | مساندة | التوظيف المتقدم | tab داخل التوظيف |
| `pages/hr/application-list.tsx` | `/hr/recruitment/applications` | مساندة | المتقدمين | tab داخل التوظيف |
| `pages/hr/employee-activation.tsx` | `/hr/employee-activation` | مساندة | تفعيل الموظفين | inside الموظفين |
| `pages/hr/onboarding-review.tsx` | `/hr/onboarding-review` | مساندة | مراجعة التعيين | inside الموظفين |
| `pages/hr/transfers.tsx` | `/hr/transfers` | مساندة | نقل الموظفين | inside الموظفين |
| `pages/hr/expiring-documents.tsx` | `/hr/expiring-documents` | مساندة | الوثائق المنتهية | inside الموظفين |
| `pages/hr/organization.tsx` | `/hr/organization` | مساندة | الهيكل التنظيمي | inside الموظفين |
| `pages/hr/organization-structure.tsx` | `/hr/organization/structure` | مساندة | الهيكل المصوّر | inside الموظفين |
| `pages/hr/delegations.tsx` | `/hr/delegations` | مساندة | التفويضات | inside الموظفين |
| `pages/hr/shifts.tsx` | `/hr/shifts` | قائدة | جدول الورديات | standalone في sidebar |
| `pages/hr/shifts-management.tsx` | `/hr/shifts/management` | مساندة | إدارة الورديات | tab داخل الورديات |
| `pages/hr/attendance.tsx` | `/hr/attendance` | قائدة | الحضور والانصراف | standalone في sidebar |
| `pages/hr/attendance-reports.tsx` | `/hr/attendance/reports` | مساندة | تقارير الحضور | tab داخل الحضور |
| `pages/hr/field-tracking.tsx` | `/hr/attendance/field-tracking` | مساندة | التتبع الميداني | tab داخل الحضور |
| `pages/hr/qr-scanner.tsx` | `/hr/attendance/qr-scanner` | مساندة | تسجيل بالرمز المصوّر | tab داخل الحضور |
| `pages/hr/overtime.tsx` | `/hr/overtime` | مساندة | الوقت الإضافي | inside الحضور |
| `pages/hr/excuse-requests.tsx` | `/hr/excuse-requests` | مساندة | طلبات الأعذار | inside الحضور |
| `pages/hr/attendance-policy.tsx` | `/hr/attendance-policy` | مساندة | سياسة الحضور | inside الحضور |
| `pages/hr/leaves.tsx` | `/hr/leaves` | قائدة | طلبات الإجازة | standalone في sidebar |
| `pages/hr/leave-management.tsx` | `/hr/leaves/management` | مساندة | إدارة الإجازات | tab داخل الإجازات |
| `pages/hr/approval-chains.tsx` | `/hr/leaves/approval-chains` | مساندة | سلاسل الموافقات | inside الإجازات |
| `pages/hr/public-holidays.tsx` | `/hr/public-holidays` | مساندة | الإجازات الرسمية | inside الإجازات |
| `pages/hr/payroll.tsx` | `/hr/payroll` | قائدة | مسيرات الرواتب | standalone في sidebar |
| `pages/hr/salary-components.tsx` | `/hr/payroll/salary-components` | مساندة | مكونات الرواتب | tab داخل الرواتب |
| `pages/hr/loans.tsx` | `/hr/loans` | مساندة | سلف الموظفين | inside الرواتب |
| `pages/hr/gratuity.tsx` | `/hr/gratuity` | مساندة | مكافأة نهاية الخدمة | inside الرواتب |
| `pages/hr/accruals.tsx` | `/hr/accruals` | مساندة | الاستحقاقات الشهرية | inside الرواتب |
| `pages/hr/wps-runs.tsx` | `/hr/wps` | مساندة | نظام حماية الأجور | inside الرواتب |
| `pages/hr/saudization.tsx` | `/hr/saudization` | قائدة | السعودة (نطاقات) | standalone في sidebar |
| `pages/hr/saudi-compliance.tsx` | `/hr/saudi-compliance` | مساندة | WPS / مدد / بنوك | inside الامتثال السعودي |
| `pages/hr/performance.tsx` | `/hr/performance` | قائدة | تقييم الأداء | standalone في sidebar |
| `pages/hr/performance-advanced.tsx` | `/hr/performance/advanced` | مساندة | التقييم المتقدم | tab داخل الأداء |
| `pages/hr/evaluation-360.tsx` و`evaluation-360-{peer,upward,history,detail}.tsx` | `/hr/evaluation-360*` | مساندة | تقييم 360° | inside الأداء |
| `pages/hr/idp.tsx` | `/hr/idp` | مساندة | خطط التطوير الفردية | inside الأداء |
| `pages/hr/turnover-report.tsx` | `/hr/turnover-report` | مساندة | تقرير الدوران | inside الأداء |
| `pages/hr/training.tsx` | `/hr/training` | قائدة | البرامج التدريبية | standalone في sidebar |
| `pages/hr/training-advanced.tsx` | `/hr/training/advanced` | مساندة | التدريب المتقدم | tab داخل التدريب |
| `pages/hr/violations.tsx` | `/hr/violations` | قائدة | الانضباط والمخالفات | standalone في sidebar |
| `pages/hr/violations-management.tsx` | `/hr/violations/management` | مساندة | إدارة المخالفات | tab داخل المخالفات |
| `pages/hr/auto-detection.tsx` | `/hr/violations/auto-detection` | مساندة | الرصد التلقائي | tab داخل المخالفات |
| `pages/hr/penalty-escalation.tsx` | `/hr/violations/penalty-escalation` | مساندة | تصعيد العقوبات | tab داخل المخالفات |
| `pages/hr/discipline-regulation.tsx` | `/hr/discipline/regulation` | مساندة | لائحة الانضباط | inside المخالفات |
| `pages/hr/discipline-memo-detail.tsx` | `/hr/violations?tab=memos` | مساندة (تفصيل) | المحاضر التأديبية | tab داخل المخالفات |
| `pages/hr/approval-inbox.tsx` | `/hr/approvals` | مساندة | صناديق الواردات HR | inside HR (يتقاطع مع inbox عام — مكرر) |
| `pages/hr/documents.tsx` | `/hr/documents` | مساندة | وثائق الموظفين | inside الموظفين (مكرر مع `/documents`) |
| `pages/hr/exit-requests.tsx` | `/hr/exit` | مساندة | نهاية الخدمة | inside الموظفين |
| `pages/hr/exit-detail.tsx` | `/hr/exit/:id` | مساندة (تفصيل) | تفصيل خروج | inside نهاية الخدمة |
| `pages/hr/official-letters.tsx` | `/hr/official-letters` | مساندة | الخطابات الرسمية | inside الموظفين |
| `pages/hr/contracts.tsx` | `/hr/contracts` | مساندة | عقود الموظفين | inside الموظفين (مكرر مع عقود قانون/أملاك/مالية) |
| `pages/hr/wps-run-detail.tsx`، `loan-detail.tsx`، `job-detail.tsx`، `overtime-detail.tsx`، `training-detail.tsx`، `violation-detail.tsx` | `*/:id` | مساندة | تفاصيل HR | inside كل قسم |
| `pages/employees-create.tsx` و`pages/create/hr/*` (≈20 ملف) | `/employees/new`, `/hr/*/create` | مساندة | نماذج إنشاء | inside كل journey |

### 2.4 المالية (Finance)

| الصفحة | المسار | الدور | الخدمة الفرعية | التعرض الموصى به |
|---|---|---|---|---|
| `pages/finance/finance-workflows-hub.tsx` | `/finance/workflows-hub` | قائدة | مركز سير العمل المالي | standalone في sidebar |
| `pages/finance/cfo-cockpit.tsx` | `/finance/cfo-cockpit` | قائدة | CFO Cockpit | standalone (CFO) |
| `pages/finance/dashboard.tsx` | — (غير مربوط بصراحة) | قائدة (يتيمة) | لوحة مالية قديمة | عرض فقط أو مخفي |
| `pages/finance/daily-close-checklist.tsx` | `/finance/daily-close-checklist` | قائدة | فحص الإغلاق اليومي | standalone في sidebar |
| `pages/finance/monthly-close-pack.tsx` | `/finance/monthly-close-pack` | قائدة | حزمة الإقفال الشهري | standalone في sidebar |
| `pages/finance/accounts.tsx` | `/finance/accounts` | قائدة | شجرة الحسابات (Accounts hub) | standalone في sidebar |
| `pages/finance/subsidiary-accounts.tsx` | `/finance/subsidiary-accounts` | مساندة | حسابات فرعية | inside الحسابات والقيود |
| `pages/finance/cost-centers.tsx` | `/finance/cost-centers` | مساندة | مراكز التكلفة | inside الحسابات والقيود |
| `pages/finance/entity-statements.tsx` | `/finance/entity-statements` | مساندة | كشف الحساب التحليلي | inside الحسابات والقيود (مكرر) |
| `pages/finance/journal.tsx` | `/finance/journal` | مساندة | القيود اليومية | inside الحسابات والقيود |
| `pages/finance/trial-balance-drilldown.tsx` | `/finance/trial-balance-drilldown` | مساندة | ميزان مع تتبع | inside الحسابات والقيود |
| `pages/finance/trial-balance-comparison.tsx` | `/finance/trial-balance-comparison` | مساندة | مقارنة ميزان | inside الحسابات والقيود |
| `pages/finance/gl-anomaly-detector.tsx` | `/finance/gl-anomaly-detector` | مساندة | كاشف الشذوذ | inside الحسابات والقيود |
| `pages/finance/gl-posting-queue.tsx` | `/finance/gl-posting-queue` | مساندة | طابور الترحيل | inside الحسابات والقيود |
| `pages/finance/reconciliation-hub.tsx` | `/finance/reconciliation-hub` | مساندة | مركز التسويات | inside الحسابات والقيود |
| `pages/finance/journal-manual.tsx` | `/finance/journal-manual` | مساندة | القيود اليدوية | inside الحسابات والقيود |
| `pages/finance/journal-templates.tsx` | `/finance/journal-templates` | مساندة | قوالب القيود | inside الحسابات والقيود |
| `pages/finance/recurring-journals.tsx`، `recurring-calendar.tsx` | `/finance/recurring-*` | مساندة | قيود دورية | inside الحسابات والقيود |
| `pages/finance/opening-balances.tsx` | `/finance/opening-balances` | مساندة | أرصدة افتتاحية | inside الحسابات والقيود |
| `pages/finance/invoices.tsx` | `/finance/invoices` | قائدة | الفواتير | standalone في sidebar |
| `pages/finance/invoice-send-queue.tsx` | `/finance/invoice-send-queue` | مساندة | صف الإرسال | inside الفواتير والسندات |
| `pages/finance/vouchers.tsx` | `/finance/vouchers` | مساندة | السندات | inside الفواتير والسندات |
| `pages/finance/expenses.tsx` | `/finance/expenses` | مساندة | المصروفات | inside الفواتير والسندات |
| `pages/finance/expense-bulk-approvals.tsx` | `/finance/expense-bulk-approvals` | مساندة | اعتماد مصاريف بالجملة | inside الفواتير والسندات |
| `pages/finance/receivables.tsx`، `payments-page.tsx` | `/finance/receivables`، `/finance/payments` | مساندة | مقبوضات/مدفوعات | inside الفواتير والسندات |
| `pages/finance/customer-advances.tsx`، `customer-advances-workbench.tsx` | `/finance/customer-advances*` | مساندة | دفعات مقدمة | inside الفواتير والسندات |
| `pages/finance/purchase-requests.tsx`، `purchase-orders.tsx` | `/finance/purchase-{requests,orders}` | قائدة | المشتريات | standalone في sidebar |
| `pages/finance/vendors.tsx` | `/finance/vendors` | مساندة | الموردين | inside المشتريات |
| `pages/finance/vendor-360-sheet.tsx`، `vendor-statement-print.tsx`، `vendor-statement.tsx`، `vendor-spend.tsx`، `vendor-contracts.tsx`، `vendor-contracts-tracker.tsx`، `vendor-settlement-workbench.tsx`، `vendor-detail.tsx` | `/finance/vendor-*` | مساندة | ملفات الموردين | inside المشتريات (8 صفحات — كثيرة) |
| `pages/finance/payment-run.tsx`، `ap-payment-calendar.tsx` | `/finance/payment-run`، `/finance/ap-payment-calendar` | مساندة | الدفعات | inside المشتريات |
| `pages/finance/contracts.tsx` | `/finance/contracts` | مساندة | عقود الموردين | inside المشتريات (مكرر) |
| `pages/finance/treasury.tsx` | `/finance/treasury` | قائدة | الخزينة | standalone في sidebar |
| `pages/finance/bank-accounts-watch.tsx`، `bank-reconciliation.tsx`، `account-reconciliation-workpaper.tsx` | `/finance/bank-*` | مساندة | البنوك | inside النقد والذمم |
| `pages/finance/customer-statement-print.tsx`، `customer-statement.tsx`، `customer-360-sheet.tsx`، `customer-risk.tsx` | `/finance/customer-*` | مساندة | ملفات العملاء | inside النقد والذمم |
| `pages/finance/bad-debt-provision.tsx`، `bad-debt.tsx` | `/finance/bad-debt*` | مساندة | الديون المشكوك بها | inside التحصيل والديون |
| `pages/finance/ap-aging.tsx` | `/finance/ap-aging` | مساندة | تقادم الذمم الدائنة | inside النقد والذمم |
| `pages/finance/ar-aging.tsx` | `/finance/ar-aging` | مساندة | تقادم الذمم المدينة | inside التحصيل والديون |
| `pages/finance/cashflow-dashboard.tsx` | `/finance/cashflow` | مساندة | لوحة التدفق النقدي | inside النقد والذمم |
| `pages/finance/cash-flow-forecast.tsx`، `cash-13week.tsx`، `cash-calendar.tsx`، `cash-position-calculator.tsx` | `/finance/cash-*` | مساندة | التدفق النقدي | inside النقد والذمم |
| `pages/finance/fixed-assets.tsx` | `/finance/fixed-assets` | قائدة | الأصول الثابتة | standalone في sidebar |
| `pages/finance/fixed-asset-register.tsx` | `/finance/fixed-asset-register` | مساندة | سجل الأصول التحليلي | inside الأصول والعهد |
| `pages/finance/custodies.tsx`، `custody-workbench.tsx`، `custody-aging-report.tsx`، `custody-detail.tsx` | `/finance/custodies*`، `/finance/custody-*` | مساندة | العهد | inside الأصول والعهد |
| `pages/finance/budget.tsx`، `budget-heatmap.tsx`، `budget-variance.tsx`، `budget-approvals.tsx` | `/finance/budget*` | قائدة (الميزانية الرئيسية) + مساندة (الباقي) | الميزانية | standalone (budget)؛ tabs |
| `pages/finance/fiscal-periods.tsx`، `fiscal-periods-v2.tsx`، `period-close-preflight.tsx`، `year-end-close.tsx` | `/finance/fiscal-periods*`، `/finance/year-end-close` | مساندة | الفترات | inside الفترات والميزانية |
| `pages/finance/commitments.tsx`، `bank-guarantees.tsx` | `/finance/commitments`، `/finance/bank-guarantees` | قائدة | الالتزامات | standalone في sidebar |
| `pages/finance/project-costing.tsx`، `project-costing-detail.tsx` | `/finance/project-costing*` | مساندة | تكاليف المشاريع | inside التكاليف والتسويات |
| `pages/finance/vehicle-portfolio-dashboard.tsx` | `/finance/vehicle-portfolio` | مساندة | محفظة المركبات | inside التكاليف والتسويات |
| `pages/finance/cost-center-pnl.tsx`، `inventory-costing.tsx`، `intercompany.tsx` | `/finance/{cost-center-pnl,inventory-costing,intercompany}` | مساندة | تسويات | inside التكاليف والتسويات |
| `pages/finance/tax-system.tsx`، `tax-codes.tsx`، `pricing-rules.tsx`، `wht-categories.tsx`، `tax-filing-calendar.tsx`، `vat-filing-readiness.tsx`، `vat-reconciliation.tsx`، `wht-summary.tsx`، `wht-filing-workbench.tsx`، `zatca-reports-hub.tsx` | `/finance/tax*`، `/finance/reports/zatca`، `/finance/reports/{vat-reconciliation,wht-summary}` | قائدة (`/finance/tax`) + مساندة | الضرائب | standalone للضرائب؛ tabs للباقي |
| `pages/finance/reports.tsx`، `income-statement-vs-budget.tsx`، `income-statement-trend.tsx`، `cash-flow-statement.tsx`، `yoy-comparison.tsx`، `expense-burn-rate.tsx`، `gl-health-score.tsx` | `/finance/reports*` | قائدة (التقارير) + مساندة | التقارير المالية | standalone في sidebar |
| `pages/finance/cogs-summary.tsx`، `inventory-valuation.tsx`، `inventory-turnover.tsx`، `lot-expiry-alerts.tsx`، `negative-stock.tsx` | `/finance/reports/*` | مساندة | تقارير المخزون | inside تقارير محاسبية متقدمة |
| `pages/finance/approvals-inbox.tsx`، `entity-360.tsx`، `gl-integrity-gaps.tsx`، `unmapped-lines.tsx`، `posting-activity.tsx` | `/finance/{approvals-inbox,entity-360,…}` | قائدة (inbox) + مساندة | صناديق الواردات | standalone في sidebar |
| `pages/finance/settings-hub.tsx`، `allocation-rules.tsx`، `product-catalog.tsx`، `allocation-coverage.tsx`، `allocation-results.tsx`، `overrides-report.tsx`، `allocation-override-log.tsx` | `/finance/settings`، `/finance/allocation-*` | قائدة (settings-hub) + مساندة | محرك التوجيه المحاسبي | standalone في sidebar |
| `pages/finance/salary-advances.tsx`، `financial-requests.tsx` | `/finance/salary-advances`، `/finance/financial-requests` | مساندة | ارتباطات الموظفين | inside (مكرر مع HR loans) |
| `pages/finance/ar-collection-workbench.tsx`، `dunning.tsx`، `collection-stages.tsx`، `collections.tsx` | `/finance/{ar-collection-workbench,dunning,collection,collections}` | قائدة (collections hub) + مساندة | التحصيل والديون | standalone في sidebar |
| `pages/finance/fx-rates.tsx`، `fx-revaluation.tsx`، `fx-revaluation-history.tsx` | `/finance/fx-*` | قائدة (fx-rates) + مساندة | العملات الأجنبية | standalone في sidebar |
| `pages/finance/profitability.tsx`، `profitability-project.tsx`، `profitability-property.tsx`، `profitability-umrah-agent.tsx`، `profitability-vehicle.tsx` | غير مربوطة في sidebar | مساندة (يتيمة) | الربحية | يحتاج ربط أو مخفي |
| `pages/finance/ledger.tsx`، `account-statement.tsx` | غير مربوطة | مساندة (يتيمة، قديمة) | كشوف قديمة | عرض فقط أو مدمج مع entity-statements |
| `pages/finance/journal-detail.tsx`، `journal-manual-detail.tsx`، `recurring-journal-detail.tsx`، `invoice-detail.tsx`، `purchase-order-detail.tsx`، `vendor-detail.tsx` | `*/:id` | مساندة (تفصيل) | تفاصيل مالية | inside الصفحات الأم |
| `pages/finance/journal-quick-templates.tsx` | `/finance/journal-quick-templates` (يوجد ملف `create/finance/journal-quick-templates.tsx` كذلك) | مساندة | قوالب قيود سريعة | inside الحسابات والقيود — **مكرر مع create/** |
| `pages/create/finance/*` (≈25 ملف) | `/finance/*/create`, `*/edit` | مساندة | نماذج إنشاء/تعديل | inside كل journey |
| `pages/daily-close.tsx` | `/daily-close` | قائدة | الإقفال اليومي (للإدارة) | standalone في sidebar (يتقاطع مع `/finance/daily-close-checklist`) |
| `pages/details/{account,budget,commitment,expense,fixed-asset,journal,payroll,receivable,salary-advance,voucher,financial-request}-detail.tsx` | `*/:id` | مساندة (تفصيل) | تفاصيل مالية يتيمة | inside كل journey |

### 2.5 الأسطول / النقل (Fleet)

| الصفحة | المسار | الدور | الخدمة الفرعية | التعرض الموصى به |
|---|---|---|---|---|
| `pages/fleet.tsx` | `/fleet` | قائدة | لوحة الأسطول (legacy) | عرض فقط — يفضل دمج مع `/module-dashboards?tab=fleet` |
| `pages/fleet/drivers.tsx` | `/fleet/drivers` | مساندة | السائقين | inside الأسطول |
| `pages/fleet/trips.tsx` و`trip-detail.tsx` | `/fleet/trips*` | مساندة | الرحلات | inside الأسطول |
| `pages/fleet/maintenance.tsx`، `preventive-plans.tsx` | `/fleet/maintenance`، `/fleet/preventive-plans` | مساندة | الصيانة | inside الأسطول |
| `pages/fleet/fuel.tsx` | `/fleet/fuel` | مساندة | استهلاك الوقود | inside الأسطول |
| `pages/fleet/insurance.tsx` | `/fleet/insurance` | مساندة | التأمين | inside الأسطول |
| `pages/fleet/alerts.tsx` | `/fleet/alerts` | مساندة | التنبيهات | inside الأسطول |
| `pages/fleet/traffic-violations.tsx` | `/fleet/traffic-violations` | مساندة | مخالفات المرور | inside الأسطول |
| `pages/fleet/telematics/{live-map,ai-alerts,scorecard,sensors,evidence,video-evidence,devices,settings,operations}.tsx` | `/fleet/telematics/*` | مساندة | التتبع | inside الأسطول (تجميعها كقسم telematics) |
| `pages/fleet/tco.tsx` | `/fleet/tco` | مساندة | تكلفة الملكية (TCO) | inside الأسطول |
| `pages/fleet/reports.tsx` | `/fleet/reports` | مساندة | تقارير الأسطول | inside الأسطول (مكرر مع `/bi/reports`) |
| `pages/create/fleet/*` (7 ملف) | `/fleet/*/create` | مساندة | نماذج إنشاء | inside كل journey |
| `pages/details/{driver,fuel,insurance,maintenance,traffic-violation,vehicle}-detail.tsx` | `*/:id` | مساندة | تفاصيل الأسطول | inside كل journey |

### 2.6 العمرة (Umrah)

| الصفحة | المسار | الدور | الخدمة الفرعية | التعرض الموصى به |
|---|---|---|---|---|
| `pages/umrah/dashboard.tsx` | `/umrah` | قائدة | لوحة تشغيل العمرة | standalone في sidebar |
| `pages/umrah/pilgrims.tsx`، `pilgrim-create.tsx`، `pilgrim-detail.tsx` | `/umrah/pilgrims*` | مساندة | المعتمرين | inside العمرة |
| `pages/umrah/agents.tsx`، `sub-agents.tsx` | `/umrah/agents`، `/umrah/sub-agents` | مساندة | الوكلاء | inside العمرة |
| `pages/umrah/seasons.tsx`، `packages.tsx`، `groups.tsx`، `pricing.tsx` | `/umrah/{seasons,packages,groups,pricing}` | مساندة | الكيانات | inside العمرة |
| `pages/umrah/commission-plans.tsx`، `commission-plan-editor.tsx`، `commission-calculations.tsx` | `/umrah/commission-*` | مساندة | العمولات | inside العمرة |
| `pages/umrah/invoices.tsx`، `payments.tsx`، `sales-wizard.tsx` | `/umrah/{invoices,payments,sales-wizard}` | مساندة | المالية العمرية | inside العمرة |
| `pages/umrah/penalties.tsx`، `violations.tsx`، `violation-create.tsx` | `/umrah/{penalties,violations}` | مساندة | الغرامات والمخالفات | inside العمرة |
| `pages/umrah/transport.tsx`، `daily-runsheet.tsx` | `/umrah/{transport,daily-runsheet}` | مساندة | النقل والبرنامج اليومي | inside العمرة |
| `pages/umrah/reconciliation.tsx` | `/umrah/reconciliation` | مساندة | التسوية | inside العمرة |
| `pages/umrah/attachments.tsx`، `import.tsx`، `import-wizard.tsx` | `/umrah/{attachments,import,import/legacy}` | مساندة | المرفقات والاستيراد | inside العمرة |
| `pages/umrah/settings.tsx` | `/umrah/settings` | مساندة | إعدادات العمرة | hidden until setup أو inside إعدادات |
| `pages/details/umrah-{agent,invoice,package,penalty,season,sub-agent,transport,violation}-detail.tsx` | `*/:id` | مساندة | تفاصيل العمرة | inside كل journey |

### 2.7 الأملاك (Property)

| الصفحة | المسار | الدور | الخدمة الفرعية | التعرض الموصى به |
|---|---|---|---|---|
| `pages/properties.tsx` | `/properties` | قائدة | الوحدات العقارية | standalone في sidebar |
| `pages/properties-dashboard.tsx` | `/properties/dashboard` | قائدة | نظرة عامة | standalone (مدخل العقارات) |
| `pages/properties-buildings.tsx` | `/properties/buildings` | مساندة | المباني | inside الأملاك |
| `pages/properties-tenants.tsx` | `/properties/tenants` | مساندة | المستأجرون | inside الأملاك |
| `pages/properties-owners.tsx` | `/properties/owners` | مساندة | الملاك | inside الأملاك |
| `pages/properties-owner-statement.tsx` | `/properties/owners/statement` | مساندة | كشف حساب المالك | inside الأملاك (مكرر مع finance statements) |
| `pages/properties-contracts.tsx` | `/properties/contracts` | مساندة | عقود الإيجار | inside الأملاك (مكرر مع contracts) |
| `pages/properties-payments.tsx` | `/properties/payments` | مساندة | المدفوعات | inside الأملاك (مكرر مع finance payments) |
| `pages/properties-maintenance.tsx` | `/properties/maintenance` | مساندة | طلبات الصيانة | inside الأملاك (مكرر مع fleet maintenance) |
| `pages/properties/inspections.tsx` | `/properties/inspections` | مساندة | الفحص والتفتيش | inside الأملاك |
| `pages/properties/deposits.tsx` | `/properties/deposits` | مساندة | ودائع الضمان | inside الأملاك |
| `pages/properties/occupancy-report.tsx` | `/properties/occupancy-report` | مساندة | تقرير الإشغال | inside الأملاك |
| `pages/properties/contract-detail.tsx` | `/properties/contracts/:id` | مساندة (تفصيل) | تفصيل عقد إيجار | inside الأملاك |
| `pages/properties-guide.tsx` | `/properties/guide` | مساندة | دليل العقارات | inside الأملاك أو مكان "الدليل المصور" `/guide/properties` |
| `pages/create/properties/*` (9 ملف) | `/properties/*/create` | مساندة | نماذج إنشاء | inside كل journey |
| `pages/details/{building,owner,tenant,unit,property-maintenance,property-payment}-detail.tsx` | `*/:id` | مساندة | تفاصيل الأملاك | inside كل journey |

### 2.8 القانونية (Legal)

| الصفحة | المسار | الدور | الخدمة الفرعية | التعرض الموصى به |
|---|---|---|---|---|
| `pages/legal.tsx` | `/legal` | قائدة (legacy) | لوحة قانونية قديمة | عرض فقط — استبدلت بـ `/legal/cases` |
| `pages/legal-case-detail.tsx` | `/legal/cases/:id` | مساندة (تفصيل) | تفصيل قضية | inside القضايا |
| `pages/legal/correspondence.tsx` | `/legal/correspondence` | مساندة | المراسلات | inside الشؤون القانونية (مكرر مع inbox/correspondence) |
| `pages/legal/judgments.tsx` | `/legal/judgments` | مساندة | الأحكام القضائية | inside الشؤون القانونية |
| `pages/legal/sessions.tsx` | `/legal/sessions` | مساندة | الجلسات القادمة | inside الشؤون القانونية |
| `pages/create/legal-cases-create.tsx`، `legal-create.tsx` | `/legal/cases/create`، `/legal/create` | مساندة | نماذج إنشاء | inside Legal |
| `pages/details/{legal-contract,legal-judgment,legal-session}-detail.tsx` | `*/:id` | مساندة | تفاصيل قانونية | inside كل journey |

### 2.9 المستندات (Documents)

| الصفحة | المسار | الدور | الخدمة الفرعية | التعرض الموصى به |
|---|---|---|---|---|
| `pages/documents-page.tsx` | `/documents` | قائدة | جميع المستندات | standalone في sidebar |
| `pages/documents/archive.tsx` | `/documents/archive` | مساندة | الأرشيف | inside المستندات |
| `pages/documents/templates.tsx` | `/documents/templates` | مساندة | القوالب | inside المستندات (مكرر مع settings/print-templates) |
| `pages/documents/documents-upload.tsx` | `/documents/upload` | مساندة | رفع مستند | inside المستندات |
| `pages/documents-ocr-inbox.tsx` | `/documents/ocr-inbox` | مساندة | صندوق OCR | inside المستندات |
| `pages/create/documents/*` (2 ملف) | `/documents/create*` | مساندة | نماذج إنشاء/نسخ | inside كل journey |

### 2.10 الاتصالات (Communications)

| الصفحة | المسار | الدور | الخدمة الفرعية | التعرض الموصى به |
|---|---|---|---|---|
| `pages/inbox.tsx` | `/inbox` | قائدة | صندوقي الموحّد | standalone في sidebar |
| `pages/mailboxes.tsx` | `/mailboxes` | مساندة | الصناديق المتصلة | inside التواصل |
| `pages/comms/correspondence.tsx` | `/correspondence` | مساندة | الصادر والوارد | inside التواصل (مكرر مع legal/correspondence و details/correspondence-detail) |
| `pages/communications.tsx` | `/communications` | مساندة | مراقبة الاتصالات | inside التواصل (Admin-only ≥40) |
| `pages/notification-engine.tsx` | `/communications/notification-engine` | مساندة | محرك الإشعارات | inside التواصل (Admin-only ≥40) |
| `pages/create/comms/correspondence-create.tsx` | `/correspondence/create` | مساندة | نموذج إنشاء | inside التواصل |
| `pages/details/correspondence-detail.tsx` | `/correspondence/:id` | مساندة | تفصيل مراسلة | inside التواصل |

### 2.11 الطلبات (Requests)

| الصفحة | المسار | الدور | الخدمة الفرعية | التعرض الموصى به |
|---|---|---|---|---|
| `pages/requests-page.tsx` | `/requests` | قائدة | تقديم طلب | standalone في sidebar |
| `pages/details/request-detail.tsx` | `/requests/:id` | مساندة | تفصيل طلب | inside الطلبات |

> ملاحظة: مسارات `/requests/types` و`/requests/workflows` معرّفة في sidebar لكن لم يُعثر على ملف مخصص — قد تكون مغطاة داخل `requests-page.tsx` أو يحتاج ربط/إنشاء.

### 2.12 الحوكمة (Governance)

| الصفحة | المسار | الدور | الخدمة الفرعية | التعرض الموصى به |
|---|---|---|---|---|
| `pages/governance.tsx` | `/governance` | قائدة | نظرة عامة | standalone في sidebar |
| `pages/governance/policies-tab.tsx` | `/governance/policies` | مساندة | السياسات | inside الحوكمة |
| `pages/governance/risks-tab.tsx` | `/governance/risks` | مساندة | المخاطر | inside الحوكمة |
| `pages/governance/audits-tab.tsx` | `/governance/audits` | مساندة | التدقيق | inside الحوكمة |
| `pages/governance/compliance-tab.tsx`، `compliance-dashboard-tab.tsx`، `compliance-actions-tab.tsx` | `/governance/compliance*` | مساندة | الامتثال | inside الحوكمة (3 صفحات لنفس المفهوم) |
| `pages/governance/capa-tab.tsx`، `capa.tsx` | `/governance/capa` | مساندة | الإجراءات التصحيحية | inside الحوكمة (مكرر) |
| `pages/governance/stats-cards.tsx` | بدون مسار | مساندة (مكوّن) | بطاقات إحصائية | داخلي فقط |
| `pages/create/governance/*` (4 ملف) | `/governance/*/create` | مساندة | نماذج إنشاء | inside كل journey |
| `pages/details/{policy,risk,audit,compliance}-detail.tsx` | `*/:id` | مساندة | تفاصيل الحوكمة | inside كل journey |

### 2.13 المتجر (Store)

| الصفحة | المسار | الدور | الخدمة الفرعية | التعرض الموصى به |
|---|---|---|---|---|
| `pages/store.tsx` | `/store` | قائدة | لوحة المتجر | standalone في sidebar |
| `pages/store/product-detail.tsx` | `/store/products/:id` | مساندة | تفصيل منتج | inside المتجر |
| `pages/store/order-detail.tsx` | `/store/orders/:id` | مساندة | تفصيل طلب | inside المتجر |

> ملاحظة: المسارات `/store/products` و`/store/orders` في sidebar — يبدو أن `store.tsx` يخدم كقائمة عبر tabs.

### 2.14 ذكاء الأعمال (BI / Reports)

| الصفحة | المسار | الدور | الخدمة الفرعية | التعرض الموصى به |
|---|---|---|---|---|
| `pages/bi.tsx` | `/bi` | قائدة | لوحة التحليلات | standalone في sidebar |
| `pages/bi-operations.tsx` | `/bi/operations` | مساندة | تحليل الأداء | inside BI |
| `pages/bi-admin-reports.tsx` | `/bi/admin-reports` | مساندة | التقارير الإدارية | inside BI |
| `pages/bi-kpis.tsx` | `/bi/kpis` | مساندة | مؤشرات الأداء | inside BI |
| `pages/bi-reports.tsx` | `/bi/reports` | مساندة | التقارير التحليلية | inside BI (مكرر مع `/finance/reports`) |
| `pages/bi-dashboards.tsx` | `/bi/dashboards` | مساندة | لوحات BI | inside BI |
| `pages/bi/{overview,kpis,reports,dashboards,branch-performance,ceo-dashboard,alert-fatigue,fleet-tco,leave-balance,property-occupancy,training-roi,vendor-performance,ai-insights}-tab.tsx` | tabs داخل `/bi*` | مساندة (مكوّنات تبويبات) | شرائح BI | داخلي فقط |
| `pages/insights.tsx` | `/insights` | مساندة | الرؤى الذكية | inside BI |
| `pages/intelligence.tsx` | `/intelligence` | مساندة | لوحة الذكاء | inside BI |
| `pages/ai-workbench.tsx` | `/intelligence/ai-workbench` | مساندة | منصة AI | inside BI |
| `pages/reports/scheduled-reports.tsx` | `/reports/scheduled` | قائدة | التقارير المجدولة | standalone في sidebar |
| `pages/reports/print-log.tsx` | `/reports/print-log` | قائدة | سجل المطبوعات | standalone في sidebar |
| `pages/create/bi/*` (3 ملف) | `/bi/*/create` | مساندة | نماذج إنشاء | inside BI |

### 2.15 الإعدادات (Settings)

| الصفحة | المسار | الدور | الخدمة الفرعية | التعرض الموصى به |
|---|---|---|---|---|
| `pages/settings.tsx` | `/settings` | قائدة | عام | standalone في sidebar |
| `pages/settings/branches-tab.tsx` | `/settings/branches` | مساندة | الفروع | inside الإعدادات |
| `pages/settings/companies-tab.tsx` | `/settings/companies` | مساندة | الشركات | inside الإعدادات |
| `pages/settings-rules.tsx` | `/settings/rules` | مساندة | قواعد الأعمال | inside الإعدادات |
| `pages/settings/print-templates.tsx` | `/settings/print-templates` | مساندة | قوالب الطباعة | inside الإعدادات (مكرر مع `/admin/print-templates`) |
| `pages/settings/{approval-workflows,workflow-definitions,communication-channels,letterhead,numbering,gov-integrations,role-permissions,system-controls,accounting-mappings,zatca-settings}-tab.tsx` | غير مربوطة بـ sidebar مباشرة (tabs داخل settings) | مساندة | تبويبات الإعدادات | inside الإعدادات (بحاجة جرد ربط) |

> ملاحظة: مسار `/settings/departments` معرّف في sidebar لكن لا يوجد ملف مستقل — مغطى داخل `settings.tsx` كتبويب.

### 2.16 الإدارة (Admin)

| الصفحة | المسار | الدور | الخدمة الفرعية | التعرض الموصى به |
|---|---|---|---|---|
| `pages/admin.tsx` | `/admin` | قائدة | مدير النظام | standalone في sidebar (≥90) |
| `pages/admin/users.tsx` | `/admin/users` | مساندة | المستخدمين | inside مدير النظام |
| `pages/admin/user-onboarding.tsx` | `/admin/user-onboarding` | مساندة | إنشاء سريع وصلاحيات | inside مدير النظام |
| `pages/admin/roles.tsx` | `/admin/roles` | مساندة | الأدوار الكلاسيكية | inside مدير النظام |
| `pages/admin-rbac-matrix.tsx` | `/admin/rbac-matrix` | مساندة | مصفوفة الأدوار | inside مدير النظام |
| `pages/admin/{rbac-v2-tab,rbac-v2-conditions-editor,rbac-v2-jit-tab,rbac-v2-sod-tab,rbac-v2-users-tab,role-assignment-tab,users-tab,roles-tab,permissions-tab}.tsx` | tabs داخل `/admin` | مساندة | تبويبات RBAC v2 | داخلي |
| `pages/admin-monitoring.tsx`، `admin-observability.tsx`، `admin-master-plan.tsx`، `admin-violations-report.tsx`، `admin-event-monitor.tsx`، `admin-lifecycle-monitor.tsx`، `admin-system-governor.tsx`، `admin-system-registry.tsx`، `admin-domain-registry.tsx` | `/admin/{monitoring,observability,master-plan,violations-report,event-monitor,lifecycle-monitor,system-governor,system-registry,domain-registry}` | مساندة | المراقبة والمتابعة | inside مدير النظام |
| `pages/admin-policy-engine.tsx`، `admin/approval-overrides-report.tsx`، `admin-pdpl.tsx`، `admin-digital-signature.tsx` | `/admin/{policy-engine,approval-overrides,pdpl,digital-signature}` | مساندة | السياسات والحوكمة (إدارية) | inside مدير النظام (مكرر مع Governance) |
| `pages/admin-gl-reconciliation.tsx`، `admin-posting-failures.tsx`، `admin/print-diagnostics.tsx`، `admin/print-templates.tsx` | `/admin/{gl-reconciliation,posting-failures,print-diagnostics,print-templates}` | مساندة | تشخيص محاسبي وطباعة | inside مدير النظام (مكرر مع finance + settings) |
| `pages/admin-integrations.tsx`، `admin-communication-control.tsx`، `admin-pbx-control.tsx`، `admin-notification-routing.tsx`، `admin-vendor-settings.tsx`، `admin-integrations-diagnostics.tsx`، `admin-zatca-audits.tsx`، `admin-ai-governance.tsx`، `admin-intelligence-playground.tsx`، `admin-data-import.tsx`، `admin-ai-prompt-detail.tsx` | `/admin/{integrations,…}` | مساندة | التكاملات والاتصالات | inside مدير النظام |
| `pages/admin/logs.tsx`، `admin/logs-tab.tsx`، `admin/security-log-tab.tsx`، `admin/audit-explorer-tab.tsx`، `admin/shared.ts` | `/admin/logs*` | مساندة | سجلات التدقيق | inside مدير النظام |
| `pages/activity-log.tsx` | `/activity-log` | مساندة | سجل الحركات | inside مدير النظام (مدخل مكرر — يظهر مرتين) |
| `pages/automation.tsx` | `/automation` | قائدة | الأتمتة | standalone في sidebar |
| `pages/manager-board/reprint-approvals.tsx` | `/manager-board/reprint-approvals` | مساندة | موافقات إعادة الطباعة | inside مدير النظام/manager-board |
| `pages/login.tsx` | `/login` | قائدة (auth) | تسجيل الدخول | خارج sidebar |
| `pages/not-found.tsx` | `*` (catch) | مساندة | 404 | خارج sidebar |
| `pages/print-verify.tsx` | `/print-verify` | مساندة | تحقق طباعة | hidden — أداة |

### 2.17 العلاقات (CRM/Support/Marketing) — ضمن العمليات

| الصفحة | المسار | الدور | الخدمة الفرعية | التعرض الموصى به |
|---|---|---|---|---|
| `pages/clients.tsx`، `client-detail.tsx` | `/clients`، `/clients/:id` | قائدة | العملاء | standalone في sidebar |
| `pages/crm.tsx` | `/crm` | مساندة | الفرص التجارية | inside العملاء والمبيعات |
| `pages/crm/activities.tsx` | `/crm/activities` | مساندة | أنشطة CRM | inside العملاء والمبيعات |
| `pages/crm/lead-detail.tsx` | `/crm/leads/:id` | مساندة | تفصيل فرصة | inside العملاء والمبيعات |
| `pages/details/opportunity-detail.tsx` | `/crm/opportunities/:id` | مساندة | تفصيل فرصة (مكرر مع lead-detail) | inside العملاء والمبيعات |
| `pages/support.tsx` | `/support` | قائدة | الدعم الفني | standalone في sidebar |
| `pages/support/kb.tsx`، `replies.tsx` | `/support/{kb,replies}` | مساندة | قاعدة المعرفة / الردود | inside الدعم |
| `pages/details/ticket-detail.tsx` | `/support/tickets/:id` | مساندة | تفصيل تذكرة | inside الدعم |
| `pages/marketing.tsx` | `/marketing` | قائدة | التسويق | standalone في sidebar |
| `pages/create/{crm,clients,marketing,support}-create.tsx` | `*/create` | مساندة | نماذج إنشاء | inside كل journey |

### 2.18 المشاريع والمستودعات — ضمن العمليات

| الصفحة | المسار | الدور | الخدمة الفرعية | التعرض الموصى به |
|---|---|---|---|---|
| `pages/projects.tsx` | `/projects` | قائدة | المشاريع | standalone في sidebar |
| `pages/projects/gantt.tsx` | `/projects/gantt` | مساندة | مخطط غانت | inside المشاريع |
| `pages/projects/risks.tsx` | `/projects/risks` | مساندة | المخاطر | inside المشاريع (مكرر مع `/governance/risks`) |
| `pages/tasks.tsx` | `/tasks` | قائدة | المهام | inside المشاريع والمهام (يحتاج توحيد) |
| `pages/details/{project,task}-detail.tsx` | `*/:id` | مساندة | تفاصيل | inside |
| `pages/warehouse.tsx` | `/warehouse` | قائدة | لوحة المستودعات | standalone في sidebar |
| `pages/warehouse-advanced.tsx` | `/warehouse/advanced` | مساندة | عمليات متقدّمة | inside المستودعات |
| `pages/warehouse/inventory-count.tsx` | `/warehouse/inventory-count` | مساندة | جرد المخزون | inside المستودعات |
| `pages/create/warehouse/*` (3 ملف) و`warehouse-create.tsx` | `/warehouse/*/create` | مساندة | نماذج إنشاء | inside المستودعات |
| `pages/details/{warehouse-category,warehouse-movement,warehouse-product,warehouse-supplier}-detail.tsx` | `/warehouse/*/:id` | مساندة | تفاصيل المستودع | inside كل journey |

### 2.19 خدمات مشتركة / مركزية (Shared / Core)

| الصفحة | المسار | الدور | الخدمة الفرعية | التعرض الموصى به |
|---|---|---|---|---|
| `pages/details/*` (54 ملف) | `*/:id` لكل وحدة | مساندة (تفاصيل) | تفاصيل عابرة | inside كل journey صاحبتها |
| `pages/create/*` (≈80 ملف موزّع) | `*/create`, `*/edit` لكل وحدة | مساندة | نماذج إنشاء/تعديل | inside كل journey |
| `pages/my-space/*` و`pages/admin/shared.ts` و`pages/bi/shared.tsx` و`pages/governance/stats-cards.tsx` | بدون مسار | مساندة (مكوّنات داخلية) | عناصر مشتركة | داخلي فقط |

### 2.20 غير محدد / مكان خاطئ (Unknown / Misplaced)

| الصفحة | الملاحظة | التوصية |
|---|---|---|
| `pages/admin-*.tsx` (≈30 ملف في الجذر) | منطق إدارة في جذر `pages/` مع مجلد `pages/admin/` موجود | مكان خاطئ — جزئي |
| `pages/bi-*.tsx` (6 ملفات في الجذر) | تكرار مع `pages/bi/*-tab.tsx` | مكرر — يحتاج توحيد |
| `pages/properties-*.tsx` (9 ملفات في الجذر) | جوار `pages/properties/` | مكان خاطئ — جزئي |
| `pages/documents-page.tsx`، `documents-ocr-inbox.tsx` | جوار `pages/documents/` | مكان خاطئ — جزئي |
| `pages/legal-case-detail.tsx`، `pages/comms/correspondence.tsx` | جوار مجلدات مخصصة | مكان خاطئ — جزئي |
| `pages/finance/dashboard.tsx`، `finance/ledger.tsx`، `finance/account-statement.tsx`، `finance/profitability*.tsx` | غير مربوطة في sidebar | يحتاج ربط أو مخفي |
| `pages/fleet.tsx`، `pages/hr.tsx`، `pages/legal.tsx` (legacy hubs) | استبدلت بـ `module-dashboards?tab=*` لكنها لا تزال مسجلة كصفحات | عرض فقط، يحتاج توحيد |
| `pages/details/correspondence-detail.tsx` ↔ `pages/comms/correspondence.tsx` ↔ `pages/legal/correspondence.tsx` | ثلاث صفحات مراسلات | مكرر |

---

## 3. الصفحات المساندة الظاهرة كقائدة

تظهر هذه الصفحات كمدخل قائد في sidebar بينما طبيعتها مساندة (تبويب أو شاشة فرعية داخل قائد آخر):

| المدخل | المسار | السبب | الموقع الصحيح المقترح |
|---|---|---|---|
| الإقفال اليومي | `/daily-close` (`pages/daily-close.tsx`) | مدخل قائد بمستوى ≥40، لكن منطقه يكرر `/finance/daily-close-checklist` | tab داخل المالية |
| الأتمتة | `/automation` (`pages/automation.tsx`) | مدخل قائد لكنه أداة عبر-نظامية | tab داخل مدير النظام |
| التقارير المجدولة | `/reports/scheduled` | مدخل قائد، لكن جزء من BI Reports | tab داخل ذكاء الأعمال |
| سجل المطبوعات | `/reports/print-log` | مدخل قائد، لكن جزء من الإعدادات/الإدارة | tab داخل الإعدادات أو الإدارة |
| موافقات إعادة الطباعة | `/manager-board/reprint-approvals` | مدخل قائد عبر `manager-board` | tab داخل مركز الالتزامات |
| لوحة القيادة التنفيذية | `/exec-dashboard` | يظهر كقائد ضمن لوحات الإدارة لكن منفصل | tab داخل لوحات الإدارة |
| محرك التوجيه المحاسبي | `/finance/settings` | مدخل قائد لكنه تخصيص خلفية | tab داخل الإعدادات أو مساندة في المالية |
| إدارة الإجازات / إدارة المخالفات / إدارة الورديات | `/hr/*/management` | تظهر بجانب الواجهات المساندة المتطابقة في نفس القائد — تكرار لإحساس قيادي | tab متخصص فقط |
| تقادم AR (`/finance/ar-aging`) و AP (`/finance/ap-aging`) | تحت قياديين مختلفين (التحصيل/النقد) | يفضّل تجميعهما تحت قائد "تقادم الذمم" واحد | tab داخل التحصيل |
| الديون المشكوك بها (`/finance/bad-debt-provision`) | يظهر مرتين تحت "النقد والذمم" و"التحصيل والديون" | تكرار في sidebar | tab مرة واحدة |
| نشاط العمليات (`/activity-log`) | يظهر تحت "سجلات التدقيق" في الإدارة، رغم أنه مدخل عام | tab داخل الإدارة فقط |

---

## 4. التداخلات والتكرارات

### 4.1 العقود — 4 مفاهيم متشابهة
- `pages/hr/contracts.tsx` (عقود الموظفين) — `/hr/contracts`
- `pages/finance/contracts.tsx` (عقود الموردين) — `/finance/contracts`
- `pages/finance/vendor-contracts.tsx` و`vendor-contracts-tracker.tsx` — `/finance/vendor-contracts*`
- `pages/properties-contracts.tsx` و`pages/properties/contract-detail.tsx` (عقود الإيجار) — `/properties/contracts*`
- `pages/legal.tsx` يحوي قسم "العقود القانونية" — `/legal/contracts`
- `pages/create/hr/contracts-create.tsx`، `create/properties/contracts-create.tsx` (وكذلك للموردين/القانونية) — نماذج إنشاء متعدّدة
- `pages/details/{hr-contract,legal-contract}-detail.tsx`

**التوصية:** يحتاج توحيد. كل قسم يبقي عقدَه كـ "نوع عقد" داخل خدمة عقود مركزية مشتركة.

### 4.2 التقارير — مراكز موزّعة
- `pages/finance/reports.tsx` و≈10 تقارير ضمن `pages/finance/reports/*` (داخل المالية)
- `pages/bi-reports.tsx` + `pages/bi/reports-tab.tsx`
- `pages/bi-admin-reports.tsx`
- `pages/reports/scheduled-reports.tsx`، `print-log.tsx`
- `pages/fleet/reports.tsx`
- `pages/hr/turnover-report.tsx`، `attendance-reports.tsx`
- `pages/properties/occupancy-report.tsx`
- `pages/admin-violations-report.tsx`

**التوصية:** يحتاج توحيد — مركز تقارير واحد (BI) مع شجرة موحّدة وروابط من كل خدمة.

### 4.3 اللوحات / Dashboards — 7+ نسخ
- `/dashboard` (`pages/dashboard.tsx`) — الرئيسي
- `/exec-dashboard`، `/manager-board`، `/module-dashboards`
- `/finance/dashboard` (يتيمة)، `/finance/cashflow` (لوحة)، `/finance/cfo-cockpit`
- `/properties/dashboard` (`pages/properties-dashboard.tsx`)
- `/umrah` (`pages/umrah/dashboard.tsx`)
- `/bi`، `/bi/dashboards`، `/bi/ceo-dashboard-tab`
- `/module-dashboards?tab=*` (hr/fleet/warehouse/store/crm/support)

**التوصية:** مكرر. توحيد نقطة الدخول عبر `module-dashboards?tab=*` وإلغاء اللوحات اليتيمة (`finance/dashboard`).

### 4.4 كشف الحساب (Statement)
- `pages/finance/customer-statement.tsx`، `customer-statement-print.tsx`، `customer-360-sheet.tsx`
- `pages/finance/vendor-statement.tsx`، `vendor-statement-print.tsx`، `vendor-360-sheet.tsx`
- `pages/finance/entity-statements.tsx`، `entity-360.tsx`
- `pages/finance/account-statement.tsx` (يتيمة)
- `pages/properties-owner-statement.tsx` (`/properties/owners/statement`)

**التوصية:** يحتاج توحيد تحت "كشف الجهة 360°" واحد بتصفية حسب نوع الجهة (عميل/مورد/مالك/حساب).

### 4.5 المراسلات (Correspondence)
- `pages/comms/correspondence.tsx` — `/correspondence`
- `pages/legal/correspondence.tsx` — `/legal/correspondence`
- `pages/details/correspondence-detail.tsx`
- `pages/create/comms/correspondence-create.tsx`
- `pages/inbox.tsx`، `pages/mailboxes.tsx`

**التوصية:** يحتاج توحيد. خدمة مراسلات واحدة بتاج (legal/admin/general).

### 4.6 الصيانة (Maintenance)
- `pages/fleet/maintenance.tsx` + `preventive-plans.tsx`
- `pages/properties-maintenance.tsx` + `pages/details/property-maintenance-detail.tsx`
- `pages/create/fleet/maintenance-create.tsx` و`create/properties/maintenance-create.tsx`

**التوصية:** مكرر — يبقى منفصلاً (أصول مختلفة) لكن مع توحيد نموذج طلب الصيانة الأساسي.

### 4.7 المخالفات (Violations)
- `pages/hr/violations.tsx` + `auto-detection.tsx`، `violations-management.tsx`، `penalty-escalation.tsx`، `violation-detail.tsx`
- `pages/fleet/traffic-violations.tsx` + `details/traffic-violation-detail.tsx`
- `pages/umrah/violations.tsx`، `violation-create.tsx`، `details/umrah-violation-detail.tsx`
- `pages/admin-violations-report.tsx`

**التوصية:** مكرر بطبيعته (موضوعات مختلفة). تحتاج خدمة مساندة مشتركة "محرك العقوبات" لكل القنوات.

### 4.8 الإعدادات والقوالب
- `pages/settings/print-templates.tsx` ↔ `pages/admin/print-templates.tsx` ↔ `pages/documents/templates.tsx`
- `pages/settings/zatca-settings-tab.tsx` ↔ `pages/admin-zatca-audits.tsx` ↔ `pages/finance/zatca-reports-hub.tsx`
- `pages/settings/role-permissions-tab.tsx` ↔ `pages/admin-rbac-matrix.tsx` ↔ `pages/admin/roles.tsx` ↔ `pages/admin/{rbac-v2-*}`

**التوصية:** يحتاج توحيد. الإعدادات تكون مدخل، الإدارة تكون منفذ تشغيلي — لا تكرار للواجهة.

### 4.9 السلف / الدفعات المقدمة
- `pages/hr/loans.tsx` + `my-loans.tsx` + `loan-detail.tsx`
- `pages/finance/salary-advances.tsx` + `details/salary-advance-detail.tsx`
- `pages/finance/customer-advances.tsx` + `customer-advances-workbench.tsx`
- `pages/create/hr/loans-create.tsx`

**التوصية:** يحتاج توحيد — `loans` (HR) و`salary-advances` (Finance) نفس المفهوم.

### 4.10 طلبات/Approvals Inboxes
- `pages/hr/approval-inbox.tsx` — `/hr/approvals`
- `pages/finance/approvals-inbox.tsx` — `/finance/approvals-inbox`
- `pages/finance/budget-approvals.tsx` — `/finance/budget-approvals`
- `pages/finance/expense-bulk-approvals.tsx` — `/finance/expense-bulk-approvals`
- `pages/manager-board/reprint-approvals.tsx` — `/manager-board/reprint-approvals`
- `pages/admin/approval-overrides-report.tsx` — `/admin/approval-overrides`
- `pages/my-requests.tsx`، `pages/requests-page.tsx`

**التوصية:** يحتاج توحيد — صندوق وارد موافقات مركزي مع filtering حسب الخدمة.

---

## 5. التوصيات الموحَّدة

1. **توحيد قسم العقود:** كل العقود (HR، موردين، إيجار، قانونية) تربط تحت خدمة قائدة واحدة "العقود" بأنواع فرعية. حالياً: مكرر — يحتاج توحيد.
2. **مركز تقارير موحّد:** نقل كل التقارير من `finance/`، `bi/`، `fleet/`، `hr/`، `properties/`، `admin/` إلى مركز BI واحد مع روابط back إلى الخدمة. حالياً: مكرر — يحتاج توحيد.
3. **حذف اللوحات اليتيمة:** صفحات `finance/dashboard.tsx`، `legal.tsx`، `hr.tsx`، `fleet.tsx` تُحال إلى عرض فقط أو مخفي، والتوجيه يذهب إلى `module-dashboards?tab=*`.
4. **توحيد كشوف الحساب 360°:** ندمج customer-statement + vendor-statement + entity-statement + account-statement + owner-statement تحت "كشف الجهة 360°" واحد. حالياً: مكرر — يحتاج توحيد.
5. **توحيد صناديق الوارد الموافقات:** صندوق وارد مركزي بدلاً من 7+ مداخل متفرقة. حالياً: جزئي — يحتاج توحيد.
6. **نقل `daily-close` إلى المالية:** `/daily-close` صفحة مساندة، تُنقل من قائد إلى تبويب داخل المالية. حالياً: خدمة مساندة تظهر كقائدة.
7. **توحيد المراسلات:** `comms/correspondence` و`legal/correspondence` يندمجان في خدمة مراسلات واحدة بتاج. حالياً: مكرر — يحتاج توحيد.
8. **توحيد القوالب والإعدادات:** `settings/print-templates`، `admin/print-templates`، `documents/templates` — قالب واحد، إذن إعدادات واحدة. حالياً: مكرر — يحتاج توحيد.
9. **توحيد السلف:** `hr/loans` و`finance/salary-advances` نفس المفهوم — يحتاج توحيد.
10. **نقل صفحات `admin-*.tsx` من الجذر إلى `pages/admin/`:** 30+ ملف admin خارج المجلد المخصص. حالياً: مكان خاطئ — يحتاج تنظيم بنيوي.
11. **نقل صفحات `properties-*.tsx` و`bi-*.tsx` و`documents-*.tsx` من الجذر إلى مجلداتها:** تنظيم. حالياً: مكان خاطئ.
12. **توحيد التقادم (Aging) AP/AR:** قائد واحد "تقادم الذمم" مع تبويبات AP/AR بدلاً من توزيعهما تحت قياديين منفصلين. حالياً: جزئي.
13. **توحيد لوحات الموظف (`my-*.tsx`):** كلها مدخل واحد `/my-space` مع تبويبات بدلاً من 7 مداخل مساندة. حالياً: جاهز بنيوياً لكن مداخل متعددة.
14. **توحيد المخالفات تحت محرك عقوبات مشترك:** فئات (HR/Fleet/Umrah) تظل منفصلة بصرياً لكن المحرك واحد. حالياً: مكرر — يحتاج خدمة مساندة موحّدة.
15. **مراجعة tabs الإعدادات غير المربوطة:** `accounting-mappings`، `gov-integrations`، `letterhead`، `numbering`، `system-controls`، `workflow-definitions`، `zatca-settings` — تأكد أنها مربوطة فعلاً داخل `settings.tsx`. حالياً: يحتاج ربط (تحقّق).
16. **توحيد الصفحات اليتيمة في المالية:** `profitability*.tsx` (5 ملفات)، `ledger.tsx`، `account-statement.tsx` — إما ربط بـ sidebar أو مخفي/عرض فقط. حالياً: غير مفعّل.
17. **توحيد التفاصيل (`pages/details/*`):** 54 ملف تفصيل في مجلد عام بدلاً من تجميعها تحت مجلد الخدمة الأم — تنظيم بنيوي. حالياً: مكان خاطئ.
18. **توحيد مدخل "نقد/خزينة":** `cash-13week`، `cash-calendar`، `cash-flow-forecast`، `cash-flow-statement`، `cash-position-calculator`، `cashflow-dashboard` — 6 شاشات. ضرورة تجميع. حالياً: جزئي.
19. **إخفاء أدوات التطوير من sidebar للمستخدم العام:** `print-verify`، `intelligence-playground`، `system-governor` — أدوات للمشغلين فقط. حالياً: غير مفعّل للمستخدم.
20. **تثبيت ترميز الخدمات حسب `ModuleType` (`app-context`):** عدد من الصفحات بدون `module` في sidebar (`/calendar`، `/daily-close`، `/automation`، `/exec-dashboard`، `/reports/scheduled`) — يحتاج وضع `module` صريح ليُحترم filter الصلاحيات. حالياً: جزئي — يحتاج توحيد مع #1413.
