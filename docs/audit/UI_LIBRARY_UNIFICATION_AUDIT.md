# تدقيق توحيد مكتبة واجهة المستخدم — Ghaith ERP

> AUDIT-ONLY. لا يجوز تعديل الشيفرة من خلال هذا التدقيق. يُسجَّل فقط الوضع الحالي لاعتماد المكونات الموحَّدة الموجودة، وتُحدَّد فجوات التبنّي.
>
> - السياق: تذكرة #1418 + #1413 — Deep Sweep لتوحيد طبقة العرض.
> - المسح: `artifacts/ghayth-erp/src/pages/**/*.{tsx,ts}` — **580 ملف**.
> - الأنماط المعتمدة: `<PageShell>`, `<ListPage>`, `<DetailPageLayout>`, `<EntityDetailPage>`, `<CreatePageLayout>`, `<FormShell>`, `<DataTable>`, `<AdvancedFilters>`, `<PageStatusBadge>`, `<ConfirmDeleteDialog>`, `<LoadingSpinner>`, `<ErrorState>`, `<PrintLayout>`, `<PrintButton>`, `<KpiCard>`, `<FileDropZone>`, `<ApprovalActions>`, `<EntityTimeline>`, `<AuditTrailPanel>`.

---

## 1) ملخص — الأرقام الإجمالية لكل بدائي (Primitive)

| البدائي الموحَّد | عدد الصفحات المستخدِمة | نسبة التبنّي من إجمالي 580 ملف | المصدر القانوني |
| :--- | ---: | ---: | :--- |
| `<PageShell>` | **326** | **56.2%** | `artifacts/ghayth-erp/src/components/page-shell.tsx` |
| `<DataTable>` | **265** | **45.7%** | `artifacts/ghayth-erp/src/components/shared/data-table.tsx` / `@workspace/ui-core` |
| `<PageStatusBadge>` | **118** | **20.3%** | `artifacts/ghayth-erp/src/components/page-status-badge.tsx` |
| `<CreatePageLayout>` | **89** | **15.3%** | `artifacts/ghayth-erp/src/components/create-page-layout.tsx` (يتم تصدير الأغلبية من `@workspace/ui-core`) |
| `<AdvancedFilters>` | **86** | **14.8%** | `artifacts/ghayth-erp/src/components/shared/advanced-filters.tsx` |
| `<DetailPageLayout>` | **77** | **13.3%** | `artifacts/ghayth-erp/src/components/shared/detail-page-layout.tsx` / `@workspace/entity-kit` |
| `<PrintLayout>` / `<PrintButton>` | **77** | **13.3%** | `artifacts/ghayth-erp/src/components/print-layout.tsx`, `…/shared/print-button.tsx` |
| `<FormShell>` | **71** | **12.2%** | `artifacts/ghayth-erp/src/components/form-shell.tsx` |
| `<ApprovalActions>` | **31** | **5.3%** | `artifacts/ghayth-erp/src/components/shared/approval-actions.tsx` / `@workspace/workflow-kit` |
| `<ConfirmDeleteDialog>` | **24** | **4.1%** | `artifacts/ghayth-erp/src/components/shared/confirm-delete-dialog.tsx` |
| `<FileDropZone>` | **36** | **6.2%** | `artifacts/ghayth-erp/src/components/shared/file-drop-zone.tsx` |
| `<LoadingSpinner>` / `<ErrorState>` | **336** | **57.9%** | `artifacts/ghayth-erp/src/components/shared/loading-error-states.tsx` |
| `<KpiCard>` | **4** | **0.7%** | `artifacts/ghayth-erp/src/components/shared/kpi-card.tsx` |
| `<EntityTimeline>` / `<WorkflowTimeline>` | **2** | **0.3%** | `artifacts/ghayth-erp/src/components/shared/entity-timeline.tsx` |
| `<EntityDetailPage>` | **2** | **0.3%** | `artifacts/ghayth-erp/src/components/shared/entity-detail-page.tsx` |
| `<AuditTrailPanel>` | **0** | **0.0%** | `artifacts/ghayth-erp/src/components/shared/audit-trail-panel.tsx` |
| `<ListPage>` | **2** | **0.3%** | `artifacts/ghayth-erp/src/components/list-page.tsx` |

### مؤشرات معاكسة (Anti-patterns)

| النمط غير الموحَّد | عدد الصفحات | ملاحظات |
| :--- | ---: | :--- |
| `<table>` خام داخل الصفحات | **53** | غالبًا في صفحات Finance/Print/Workbench |
| `window.confirm` / `window.prompt` | **15** | يجب استبدالها بـ `<ConfirmDeleteDialog>` أو حوار سياسة موحد |
| `<AlertDialog>` خام (دون `<ConfirmDeleteDialog>`) | **21** | غالبًا تأكيدات حساسة (إغلاق فترة، حذف موافقة) |
| `react-hook-form` بدون `<FormShell>` | **0** | كل صفحات RHF (23) تستخدم FormShell — جيد |
| `Skeleton` مخصّص بدلًا من `<LoadingSpinner>` | **19** | معظمها لوحات إحصائية (dashboards) — قد يكون مقبولًا تصميميًا |
| استيراد مباشر لـ `@/components/ui/input` | **163** | يعكس استمرار الحاجة لحقول خام داخل FormShell — راجع التوصية #6 |
| استيراد `@workspace/ui-core` | **513** | تبنّي عالٍ جدًا للحزمة الموحَّدة |
| استيراد `@workspace/entity-kit` | **86** | تبنّي صحي لمكتبة الكيانات |
| استيراد `@workspace/workflow-kit` | **35** | محدود لأن الحاجة سياقية (موافقات) |
| استيراد `@workspace/report-kit` | **3** | شبه معدومة — راجع التوصية #4 |

> **التقدير الإجمالي للتوحيد:** ~**56%** من الصفحات تستخدم `<PageShell>` كبدائي تخطيط أساسي. ~**95%** من صفحات التفاصيل تستخدم `<DetailPageLayout>`. ~**100%** من صفحات الإنشاء `create/**` تستخدم `<CreatePageLayout>`. الفجوة الأساسية مركَّزة في: tabs الفرعية، الـ workbenches الماليّة المخصصة، صفحات my-space المُجزأة.

---

## 2) المكونات الموحَّدة المتاحة — كتالوج

| البدائي | المسار الأساسي | غرضه | نسبة التبنّي |
| :--- | :--- | :--- | ---: |
| `PageShell` | `artifacts/ghayth-erp/src/components/page-shell.tsx` | غلاف صفحة مع عنوان + breadcrumb + actions + slot للمحتوى | 56.2% |
| `ListPage` | `artifacts/ghayth-erp/src/components/list-page.tsx` | غلاف صفحات القوائم (يضم AdvancedFilters + DataTable) | 0.3% — مهجور تقريبًا |
| `CreatePageLayout` | `artifacts/ghayth-erp/src/components/create-page-layout.tsx` (مُعاد التصدير من `@workspace/ui-core`) | غلاف صفحات الإنشاء/التعديل مع شريط حفظ ثابت | 15.3% (≈100% من create/**) |
| `DetailPageLayout` | `artifacts/ghayth-erp/src/components/shared/detail-page-layout.tsx` + `@workspace/entity-kit` | تخطيط صفحات التفاصيل مع شريط جانبي + Tabs | 13.3% (≈95% من details/**) |
| `EntityDetailPage` | `artifacts/ghayth-erp/src/components/shared/entity-detail-page.tsx` | تخطيط تفاصيل عالي المستوى (API-aware) | 0.3% — مهجور تقريبًا |
| `FormShell` | `artifacts/ghayth-erp/src/components/form-shell.tsx` | غلاف نموذج موحَّد (سياق RHF + رؤوس أقسام + سلوك حفظ) | 12.2% |
| `DataTable` | `artifacts/ghayth-erp/src/components/shared/data-table.tsx` / `@workspace/ui-core` | جدول موحَّد مع: ترتيب، تصفية، ترقيم، أعمدة معدَّة مسبقًا (`dateColumn`, `statusColumn` …) | 45.7% |
| `AdvancedFilters` | `artifacts/ghayth-erp/src/components/shared/advanced-filters.tsx` | عناصر تصفية موحَّدة (تواريخ، حالة، أرقام) | 14.8% |
| `PageStatusBadge` | `artifacts/ghayth-erp/src/components/page-status-badge.tsx` | شارة حالة بألوان موحَّدة حسب الدومين | 20.3% |
| `ConfirmDeleteDialog` | `artifacts/ghayth-erp/src/components/shared/confirm-delete-dialog.tsx` | حوار تأكيد حذف موحَّد | 4.1% |
| `LoadingSpinner` / `ErrorState` | `artifacts/ghayth-erp/src/components/shared/loading-error-states.tsx` | حالات تحميل/خطأ موحَّدة | 57.9% |
| `PrintLayout` / `PrintButton` | `artifacts/ghayth-erp/src/components/print-layout.tsx`, `…/shared/print-button.tsx` | تخطيط طباعة + زر طباعة ZATCA-friendly | 13.3% |
| `KpiCard` | `artifacts/ghayth-erp/src/components/shared/kpi-card.tsx` | بطاقة مؤشّر KPI | 0.7% — تبنّي ضعيف جدًا |
| `FileDropZone` | `artifacts/ghayth-erp/src/components/shared/file-drop-zone.tsx` | منطقة سحب/إفلات للمرفقات | 6.2% |
| `ApprovalActions` | `artifacts/ghayth-erp/src/components/shared/approval-actions.tsx` (`@workspace/workflow-kit`) | أزرار موافقة/رفض موحَّدة + سجل دورة الحياة | 5.3% |
| `EntityTimeline` / `WorkflowTimeline` | `artifacts/ghayth-erp/src/components/shared/entity-timeline.tsx` | عرض سير الحالة + الزمن | 0.3% — مهجور تقريبًا |
| `AuditTrailPanel` | `artifacts/ghayth-erp/src/components/shared/audit-trail-panel.tsx` | لوحة سجل التدقيق | 0% — لم يُستخدم |

### إعادة التصدير عبر الحزم الداخلية

| الحزمة | المسار | تبنّي |
| :--- | :--- | ---: |
| `@workspace/ui-core` (lib/ui-core) | يصدِّر `ListPage`, `PageShell`, `DataTable`, `FormShell`, `CreatePageLayout`, `dateColumn`, `statusColumn`, إلخ | **513** صفحة تستورد منها — الحزمة الأكثر اعتمادًا |
| `@workspace/entity-kit` | يصدِّر `DetailPageLayout`, `EntityDetailPage`, `EntityFinancialProfile`, … | **86** صفحة |
| `@workspace/workflow-kit` | يصدِّر `ApprovalActions`, `useLifecycleAction`, … | **35** صفحة |
| `@workspace/report-kit` | حزمة الطباعة/التقارير | **3** صفحات فقط — تبنّي شبه معدوم |

---

## 3) الصفحات الموحَّدة — العدد وأبرز عشرة أمثلة

تستخدم **326 صفحة** `<PageShell>` كبدائي تخطيط أساسي. أبرز عشرة أمثلة تمثيلية تُظهر التبنّي الكامل (PageShell + AdvancedFilters + DataTable + PageStatusBadge + LoadingSpinner/ErrorState):

| # | الملف | الملاحظات |
| --: | :--- | :--- |
| 1 | `artifacts/ghayth-erp/src/pages/finance/invoices.tsx` | PageShell + AdvancedFilters + DataTable + PageStatusBadge + LoadingSpinner + ErrorState |
| 2 | `artifacts/ghayth-erp/src/pages/finance/vendors.tsx` | نفس النمط الكامل |
| 3 | `artifacts/ghayth-erp/src/pages/finance/expenses.tsx` | نفس النمط الكامل |
| 4 | `artifacts/ghayth-erp/src/pages/finance/financial-requests.tsx` | يتضمّن `<ApprovalActions>` |
| 5 | `artifacts/ghayth-erp/src/pages/hr/leaves.tsx` | نموذجي لقوائم HR |
| 6 | `artifacts/ghayth-erp/src/pages/hr/payroll.tsx` | يتضمّن أعمدة مسبقة + statusColumn |
| 7 | `artifacts/ghayth-erp/src/pages/fleet/drivers.tsx` | تبنّي كامل في Fleet |
| 8 | `artifacts/ghayth-erp/src/pages/fleet/maintenance.tsx` | نفس النمط |
| 9 | `artifacts/ghayth-erp/src/pages/umrah/pilgrims.tsx` | يستخدم DataTable + AdvancedFilters |
| 10 | `artifacts/ghayth-erp/src/pages/properties-buildings.tsx` | تبنّي كامل في Properties |

كذلك، **77 صفحة من `details/**`** و **89 صفحة من `create/**`** تستخدم `DetailPageLayout` و `CreatePageLayout` على التوالي، وهي عمليًا 100% من تلك المجلدات.

---

## 4) الصفحات التي تستخدم legacy — جدول التصنيف بالتفصيل

> الأعمدة: المسار / Layout / Form / Filter / Table / Status / Confirm / Print / Loading / **الحكم**.
>
> الحكم: **موحَّد** = جميع البدائيات المعنيّة من المكتبة الموحَّدة. **يحتاج توحيد** = صفحة عمل/كومبليكس بدون PageShell/DataTable. **يستخدم legacy** = `<table>` خام أو `window.confirm` أو RHF بدون FormShell أو raw AlertDialog.

### 4.1 — صفحات Tabs/Partials بدون PageShell خاص (مقصودة — تُغلَّف بـ PageShell أبيها)

> لا يلزم توحيدها مباشرةً لأنها أجزاء (partials) من صفحة أب موحَّدة، لكن يجب التحقّق منها أثناء مرحلة التنظيف.

| المسار | السياق | الحكم |
| :--- | :--- | :--- |
| `artifacts/ghayth-erp/src/pages/admin/users-tab.tsx` | tab داخل `admin.tsx` (موحَّد) | partial — يستخدم DataTable + PageStatusBadge |
| `artifacts/ghayth-erp/src/pages/admin/roles-tab.tsx` | tab داخل `admin.tsx` (موحَّد) | partial |
| `artifacts/ghayth-erp/src/pages/admin/rbac-v2-*-tab.tsx` (×5) | tabs داخل `admin.tsx` | partial — يستخدم DataTable |
| `artifacts/ghayth-erp/src/pages/admin/audit-explorer-tab.tsx` | tab | partial |
| `artifacts/ghayth-erp/src/pages/admin/permissions-tab.tsx` | tab | partial |
| `artifacts/ghayth-erp/src/pages/admin/security-log-tab.tsx` | tab | partial |
| `artifacts/ghayth-erp/src/pages/admin/role-assignment-tab.tsx` | tab | partial |
| `artifacts/ghayth-erp/src/pages/admin/user-onboarding.tsx` | بدون PageShell — لكنه workflow متعدد الخطوات | **يحتاج توحيد** |
| `artifacts/ghayth-erp/src/pages/admin/users.tsx` | إعادة توجيه/Sub-page | partial |
| `artifacts/ghayth-erp/src/pages/admin/roles.tsx` | إعادة توجيه/Sub-page | partial |
| `artifacts/ghayth-erp/src/pages/bi/*-tab.tsx` (×14) | tabs داخل `bi.tsx` (موحَّد) | partial — يستخدم Cards + Skeleton |
| `artifacts/ghayth-erp/src/pages/governance/*-tab.tsx` (×7) | tabs داخل `governance.tsx` (موحَّد) | partial |
| `artifacts/ghayth-erp/src/pages/governance/stats-cards.tsx` | partial UI | partial |
| `artifacts/ghayth-erp/src/pages/settings/*-tab.tsx` (×13) | tabs داخل `settings.tsx` | partial — لكن `settings.tsx` نفسها فيها `<table>` و `window.confirm` |
| `artifacts/ghayth-erp/src/pages/my-space/*` (×17 ملف) | بطاقات/أقسام داخل `my-space.tsx` (موحَّد) | partial |
| `artifacts/ghayth-erp/src/pages/admin/shared.ts` | utility — ليس صفحة | لا ينطبق |
| `artifacts/ghayth-erp/src/pages/bi/shared.tsx` | helper — ليس صفحة فعلية | لا ينطبق |
| `artifacts/ghayth-erp/src/pages/my-space/shared.ts` | utility — ليس صفحة | لا ينطبق |

### 4.2 — صفحات Detail بدون DetailPageLayout

> هذه صفحات تفاصيل لم تنتقل بعد إلى `DetailPageLayout` / `EntityDetailPage`.

| المسار | Layout | Status | Confirm | Print | Loading | الحكم |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `artifacts/ghayth-erp/src/pages/finance/custody-detail.tsx` | يدوي (Card مباشر) | يدوي | `window.confirm` | `<PrintButton>` | LoadingSpinner | **يستخدم legacy** |
| `artifacts/ghayth-erp/src/pages/finance/customer-statement.tsx` | يدوي | — | — | يدوي | — | **يحتاج توحيد** |
| `artifacts/ghayth-erp/src/pages/finance/vendor-statement.tsx` | يدوي | — | — | يدوي | — | **يحتاج توحيد** |
| `artifacts/ghayth-erp/src/pages/finance/journal-manual.tsx` | يدوي | — | AlertDialog raw | يدوي | — | **يستخدم legacy** |
| `artifacts/ghayth-erp/src/pages/finance/journal-manual-detail.tsx` | يدوي | — | AlertDialog raw | PrintButton | — | **يستخدم legacy** |
| `artifacts/ghayth-erp/src/pages/finance/year-end-close.tsx` | يدوي | — | AlertDialog raw | — | — | **يستخدم legacy** |
| `artifacts/ghayth-erp/src/pages/finance/fiscal-periods-v2.tsx` | يدوي (نسخة v2) | — | — | — | — | **يحتاج توحيد** (يُفترض الاندماج مع `fiscal-periods.tsx`) |
| `artifacts/ghayth-erp/src/pages/finance/profitability-project.tsx` | يدوي | — | — | — | — | **يحتاج توحيد** |
| `artifacts/ghayth-erp/src/pages/finance/profitability-property.tsx` | يدوي | — | — | — | — | **يحتاج توحيد** |
| `artifacts/ghayth-erp/src/pages/finance/profitability-vehicle.tsx` | يدوي | — | — | — | — | **يحتاج توحيد** |
| `artifacts/ghayth-erp/src/pages/finance/profitability-umrah-agent.tsx` | يدوي | — | — | — | — | **يحتاج توحيد** |
| `artifacts/ghayth-erp/src/pages/store/product-detail.tsx` | يدوي | — | — | PrintButton | — | **يحتاج توحيد** |
| `artifacts/ghayth-erp/src/pages/umrah/pilgrim-create.tsx` | يدوي (لا CreatePageLayout) | — | — | — | — | **يحتاج توحيد** |
| `artifacts/ghayth-erp/src/pages/umrah/pilgrim-detail.tsx` | يدوي | — | — | PrintButton | — | **يحتاج توحيد** |
| `artifacts/ghayth-erp/src/pages/umrah/violation-create.tsx` | يدوي (لا CreatePageLayout) | — | — | — | — | **يحتاج توحيد** |

### 4.3 — صفحات Workbench / Print / Reports بـ `<table>` خام داخل PageShell

> هذه الصفحات تستخدم `<PageShell>` (تخطيط موحَّد) ولكنها تحتوي على `<table>` خام بدلًا من `<DataTable>` لأنها تعرض تنسيقات مالية مخصّصة (قوائم مالية، Crosstab، Print sheets).

| المسار | السبب الراجح | الحكم |
| :--- | :--- | :--- |
| `finance/account-reconciliation-workpaper.tsx` | ورقة تسوية بنكية بشكل ورقي | **يستخدم legacy** — يمكن نقل DataTable مع تخصيص |
| `finance/ap-payment-calendar.tsx` | تقويم دفعات (heatmap-like) | **يستخدم legacy** — احتمال يبرر raw table |
| `finance/ar-collection-workbench.tsx` | Workbench متعدد الأعمدة | **يستخدم legacy** |
| `finance/bad-debt-provision.tsx` | جدول مخصصات | **يستخدم legacy** |
| `finance/bad-debt.tsx` | تقرير ديون | **يستخدم legacy** |
| `finance/bank-accounts-watch.tsx` | لوحة مراقبة | **يستخدم legacy** |
| `finance/budget-heatmap.tsx` | خريطة حرارية | partial — قد يبرر raw |
| `finance/cash-13week.tsx` | 13-week cashflow | **يستخدم legacy** |
| `finance/cash-flow-statement.tsx` | قائمة التدفقات النقدية (تنسيق مالي مخصّص) | partial — يبرر raw |
| `finance/cash-position-calculator.tsx` | حاسبة سيولة | **يستخدم legacy** |
| `finance/custody-workbench.tsx` | Workbench عُهَد | **يستخدم legacy** |
| `finance/customer-360-sheet.tsx` | ورقة عميل 360 | partial — تنسيق مخصّص |
| `finance/customer-advances-workbench.tsx` | Workbench سُلف | **يستخدم legacy** |
| `finance/customer-statement-print.tsx` | كشف حساب للطباعة | partial — يبرر raw |
| `finance/expense-bulk-approvals.tsx` | موافقات مجمَّعة | **يستخدم legacy** |
| `finance/expense-burn-rate.tsx` | معدل إنفاق | **يستخدم legacy** |
| `finance/fixed-asset-register.tsx` | سجل أصول | **يستخدم legacy** |
| `finance/gl-anomaly-detector.tsx` | كشف شذوذ GL | **يستخدم legacy** |
| `finance/income-statement-trend.tsx` | اتجاه قائمة الدخل | partial — يبرر raw |
| `finance/income-statement-vs-budget.tsx` | مقارنة بالميزانية | partial — يبرر raw |
| `finance/invoice-send-queue.tsx` | طابور إرسال | **يستخدم legacy** |
| `finance/monthly-close-pack.tsx` | حزمة إقفال شهري | partial — يبرر raw |
| `finance/payment-run.tsx` | تشغيلة دفعات | **يستخدم legacy** |
| `finance/reports.tsx` | لوحة تقارير | **يستخدم legacy** + Skeleton |
| `finance/trial-balance-drilldown.tsx` | ميزان مراجعة درجات | partial — يبرر raw |
| `finance/vat-filing-readiness.tsx` | جاهزية إقرار ضريبي | **يستخدم legacy** |
| `finance/vehicle-portfolio-dashboard.tsx` | لوحة محفظة | **يستخدم legacy** |
| `finance/vendor-360-sheet.tsx` | ورقة مورد 360 | partial |
| `finance/vendor-settlement-workbench.tsx` | Workbench تسوية | **يستخدم legacy** |
| `finance/vendor-statement-print.tsx` | كشف للطباعة | partial — يبرر raw |
| `finance/wht-filing-workbench.tsx` | Workbench WHT | **يستخدم legacy** |
| `finance/yoy-comparison.tsx` | مقارنة سنوية | partial — يبرر raw |
| `manager-board/reprint-approvals.tsx` | موافقات إعادة طباعة | **يستخدم legacy** |
| `reports/print-log.tsx` | سجل الطباعة | **يستخدم legacy** |
| `settings.tsx` | إعدادات | **يستخدم legacy** — `<table>` + `window.confirm` |
| `settings/numbering-tab.tsx` | إعداد الترقيم | **يستخدم legacy** — `<table>` + `window.confirm` |
| `settings/print-templates.tsx` | قوالب الطباعة | **يستخدم legacy** |
| `umrah/commission-plan-editor.tsx` | محرر خطة عمولة | **يستخدم legacy** |
| `umrah/import-wizard.tsx` | معالج استيراد متعدد الخطوات | partial — يبرر raw |
| `umrah/sales-wizard.tsx` | معالج مبيعات متعدد الخطوات | partial — يبرر raw |

### 4.4 — صفحات Create بـ `<table>` خام داخل CreatePageLayout (سطور الفواتير/JV)

> هذه الصفحات تستخدم `<CreatePageLayout>` (موحَّد) لكنها تحتوي على جداول إدخال خطوط (line items). جداول الإدخال الخطّي ليست لها بدائي موحَّد بعد — راجع التوصية #5.

| المسار | الحكم |
| :--- | :--- |
| `create/finance/account-transfer.tsx` | partial — جدول سطور إدخال |
| `create/finance/cost-splitter.tsx` | partial — جدول تقسيم |
| `create/finance/expenses-create.tsx` | partial — جدول سطور |
| `create/finance/intercompany-consolidation-create.tsx` | partial — جدول سطور |
| `create/finance/journal-manual-create.tsx` | partial — جدول دفتر يومية |
| `create/finance/journal-quick-templates.tsx` | partial — قوالب |
| `create/finance/journal-reversal.tsx` | partial — عكس يومية |
| `create/finance/multi-line-expense-create.tsx` | partial — مصروف متعدد السطور |
| `create/properties/contracts-create.tsx` | partial — بنود عقد |

### 4.5 — صفحات بـ `window.confirm` / `window.prompt`

| المسار | الاستبدال المقترح |
| :--- | :--- |
| `admin-monitoring.tsx` | `<ConfirmDeleteDialog>` |
| `admin-observability.tsx` | `<ConfirmDeleteDialog>` |
| `admin/rbac-v2-sod-tab.tsx` | `<ConfirmDeleteDialog>` |
| `details/legal-contract-detail.tsx` | `<ConfirmDeleteDialog>` |
| `details/transfer-detail.tsx` | `<ConfirmDeleteDialog>` |
| `finance/custody-detail.tsx` | `<ConfirmDeleteDialog>` |
| `finance/purchase-requests.tsx` | `<ConfirmDeleteDialog>` |
| `hr/public-holidays.tsx` | `<ConfirmDeleteDialog>` |
| `manager-board.tsx` | `<ConfirmDeleteDialog>` |
| `properties/contract-detail.tsx` | `<ConfirmDeleteDialog>` |
| `settings.tsx` | `<ConfirmDeleteDialog>` |
| `settings/companies-tab.tsx` | `<ConfirmDeleteDialog>` |
| `settings/numbering-tab.tsx` | `<ConfirmDeleteDialog>` |
| `settings/workflow-definitions-tab.tsx` | `<ConfirmDeleteDialog>` |
| `warehouse/inventory-count.tsx` | `<ConfirmDeleteDialog>` |

### 4.6 — صفحات بـ `<AlertDialog>` خام دون `<ConfirmDeleteDialog>`

| المسار | السياق |
| :--- | :--- |
| `admin-monitoring.tsx` | إعادة تشغيل/إيقاف |
| `admin-observability.tsx` | إغلاق تنبيه |
| `daily-close.tsx` | تأكيد إقفال يومي |
| `details/leave-detail.tsx` | إلغاء إجازة |
| `finance/bank-guarantees.tsx` | تحرير ضمان |
| `finance/budget-approvals.tsx` | موافقة |
| `finance/collections.tsx` | تعديل حالة |
| `finance/invoice-detail.tsx` | إلغاء فاتورة |
| `finance/journal-manual-detail.tsx` | عكس قيد |
| `finance/journal-manual.tsx` | حذف قيد |
| `finance/journal.tsx` | عكس قيد |
| `finance/period-close-preflight.tsx` | إقفال فترة |
| `finance/year-end-close.tsx` | إقفال سنوي |
| `hr/discipline-regulation.tsx` | تطبيق عقوبة |
| `hr/employee-activation.tsx` | تفعيل موظف |
| `legal-case-detail.tsx` | إغلاق قضية |
| `properties/deposits.tsx` | استرداد |
| `properties/inspections.tsx` | إغلاق تفتيش |
| `umrah/groups.tsx` | حذف مجموعة |
| `umrah/penalties.tsx` | إلغاء عقوبة |
| `warehouse/inventory-count.tsx` | إغلاق جرد |

### 4.7 — صفحات Workbench / Wizard بدون أي تخطيط موحَّد

| المسار | الحكم |
| :--- | :--- |
| `documents/templates.tsx` | **يحتاج توحيد** |
| `documents/documents-upload.tsx` | **يحتاج توحيد** (يجب أن يستخدم CreatePageLayout + FileDropZone) |
| `properties-guide.tsx` | **يحتاج توحيد** |
| `reports/scheduled-reports.tsx` | **يحتاج توحيد** |
| `settings-rules.tsx` | **يحتاج توحيد** |
| `store.tsx` | **يحتاج توحيد** |
| `print-verify.tsx` | partial — أداة تشخيص |
| `not-found.tsx` | partial — صفحة 404 |
| `login.tsx` | partial — صفحة تسجيل دخول (مقصودة) |

---

## 5) التوصيات — أولويات الهجرة (تسجيل فقط — لا تنفيذ)

### الأولوية 1 — استبدال `window.confirm` (15 صفحة)
> تأثير مباشر على UX + i18n + إمكانية الوصول. الاستبدال 1:1 بـ `<ConfirmDeleteDialog>` للحذف، أو حوار سياسة موحَّد للموافقات. **لا حاجة لمكوّن جديد** — `<ConfirmDeleteDialog>` موجود في `artifacts/ghayth-erp/src/components/shared/confirm-delete-dialog.tsx`.

### الأولوية 2 — صفحات Workbench/Profitability بدون PageShell (≈12 صفحة)
> `finance/customer-statement.tsx`, `finance/vendor-statement.tsx`, `finance/profitability-*.tsx` (×4), `finance/fiscal-periods-v2.tsx`, `finance/journal-manual.tsx`, `finance/year-end-close.tsx`, `store.tsx`, `documents/templates.tsx`. التحويل الواضح إلى `<PageShell>`.

### الأولوية 3 — صفحات Detail خارج DetailPageLayout (≈15 صفحة)
> `finance/custody-detail.tsx`, `store/product-detail.tsx`, `umrah/pilgrim-detail.tsx`, `umrah/pilgrim-create.tsx`, `umrah/violation-create.tsx`. تحويلها إلى `<DetailPageLayout>` (من `@workspace/entity-kit`) أو `<CreatePageLayout>`.

### الأولوية 4 — `<AlertDialog>` خام (21 صفحة)
> توحيد كحالات تأكيد مرتبطة بسياق المخاطر/الإقفال. يُحبَّذ إنشاء واجهة موحَّدة `ConfirmActionDialog` تشبه `ConfirmDeleteDialog` لتشمل التأكيدات غير-الحذف (مع variant `destructive` / `caution`). راجع #6.

### الأولوية 5 — صفحات Settings (settings.tsx + 13 tab)
> الأكثر تشتتًا: `<table>` خام، `window.confirm`، `<AlertDialog>` خام. هذه الصفحة هي أكبر مصدر للتباين. يجب توحيدها مرحليًا.

### الأولوية 6 — تبنّي `<KpiCard>` و `<AuditTrailPanel>` و `<EntityTimeline>`
> `KpiCard`: تبنّي 0.7%؛ معظم لوحات BI تنشئ بطاقات KPI يدويًا. `AuditTrailPanel`: 0%، رغم أن سجل التدقيق ميزة متكررة في details/**. `EntityTimeline`: 0.3%، رغم وجود timelines يدوية في صفحات الموافقات (راجع #6).

### الأولوية 7 — صفحات Reports/Print
> 53 صفحة تستخدم `<table>` خام؛ منها ~22 تنسيقات مالية مبرَّرة (Trial Balance / IS / Cash Flow). أما الباقي (workbenches، queues، dashboards) فهي مرشحة للنقل إلى `<DataTable>` مع وضع التخصيص (مجاميع، subtotals) داخل `<DataTable>` نفسه — وهذا يقودنا إلى التوصية #6.

---

## 6) مكونات تحتاج تحسين مركزي بدلًا من التكرار

> هذه المكوّنات موجودة لكنها **غير كافية لاحتياجات الصفحات الفعلية**، مما يدفع المطوّرين لتجاوزها وإنشاء حلول يدوية. الحل ليس بناء مكوّن جديد لكل صفحة، بل **تحسين المكوّن المركزي ليُغطّي الحالات المتكرّرة**.

### 6.1 — `<DataTable>` يحتاج دعم: Subtotals + Grouping + Pivot
> 53 صفحة Finance/Reports تستخدم `<table>` خام لتقديم: مجاميع جزئية لكل مجموعة (Trial Balance/Workbenches)، صفوف pivot (YoY/IS-Trend)، رؤوس متعددة المستويات. حاليًا `DataTable` لا يدعم ذلك، فالتجاوز نحو raw `<table>` متوقَّع. **التوصية:** إضافة `groupBy`, `subtotalColumns`, و `pivotConfig` إلى `DataTable` بدلًا من تكرار `<table>` في كل ورقة.
> الدليل: `finance/trial-balance-drilldown.tsx`, `finance/income-statement-trend.tsx`, `finance/income-statement-vs-budget.tsx`, `finance/cash-flow-statement.tsx`, `finance/yoy-comparison.tsx`, `finance/monthly-close-pack.tsx`.

### 6.2 — `<ConfirmDeleteDialog>` يحتاج تعميم إلى `<ConfirmActionDialog>`
> 21 صفحة تستخدم `<AlertDialog>` خام للتأكيدات **غير-الحذف** (إقفال فترة، عكس قيد، إلغاء فاتورة، تطبيق عقوبة). `ConfirmDeleteDialog` مخصّص للحذف فقط، فلا يمكن تبنّيه. **التوصية:** تعميم المكوّن إلى `ConfirmActionDialog` يقبل `variant: "delete" | "destructive" | "caution" | "confirm"` + سبب اختياري (textarea). يلغي الحاجة لـ raw AlertDialog في كل ورقة.
> الدليل: `finance/year-end-close.tsx`, `finance/period-close-preflight.tsx`, `finance/journal-manual.tsx`, `finance/journal.tsx`, `finance/invoice-detail.tsx`, `daily-close.tsx`.

### 6.3 — `<FormShell>` يحتاج دعم: Line-items / Repeating rows
> 9 صفحات `create/**` تستخدم `<CreatePageLayout>` + `<FormShell>` لكنها تكتب جدول سطور (line items) يدويًا بـ `<table>` + `useFieldArray`. **التوصية:** إضافة بدائي `<LineItemsTable>` داخل `FormShell` (أو ضمن `@workspace/ui-core`) يربط `useFieldArray` بـ `DataTable` ويوحّد سلوك إضافة/حذف السطور والمجموع. يلغي 9 تنفيذات يدوية متباينة.
> الدليل: `create/finance/journal-manual-create.tsx`, `create/finance/multi-line-expense-create.tsx`, `create/finance/intercompany-consolidation-create.tsx`, `create/properties/contracts-create.tsx`, `create/finance/expenses-create.tsx`, `create/finance/cost-splitter.tsx`.

### 6.4 — `<KpiCard>` غير قادر على استيعاب المؤشرات المركّبة
> 0.7% تبنّي فقط. لوحات BI/Finance تنشئ بطاقات KPI يدويًا لأنّ `KpiCard` الحالي لا يدعم: sparkline، delta vs prev، عملة متعددة، عرض رقمي مزدوج. **التوصية:** توسيع `KpiCard` بـ `trend`, `comparison`, `currency`, `secondaryValue`. هذا يبرّر اعتماده الجماعي.
> الدليل: `bi/*-tab.tsx` (×14)، `finance/dashboard.tsx`, `properties-dashboard.tsx`, `module-dashboards.tsx`.

### 6.5 — `<AuditTrailPanel>` صفر تبنّي — يحتاج هجرة مخططة
> المكوّن موجود لكنه غير مستخدَم. صفحات `details/**` كثيرة تعرض سجل التدقيق ضمن tabs مخصّصة. **التوصية:** التحقق من أن `<AuditTrailPanel>` يستهلك endpoint موحَّد (`/api/audit/:entity/:id`) ثم إدراجه افتراضيًا داخل `<DetailPageLayout>` كـ tab احتياطي. لا داعي لمكوّن جديد — فقط دمجه.

### 6.6 — `<EntityTimeline>` غير مدمج مع `useLifecycleAction`
> 2 صفحات فقط (0.3%). صفحات الموافقات تنشئ timeline يدويًا. **التوصية:** ربط `<EntityTimeline>` بمصدر بيانات `useLifecycleAction` من `@workspace/workflow-kit` ليُصبح تلقائيًا في كل صفحة فيها `<ApprovalActions>`.
> الدليل: `details/excuse-detail.tsx`, `details/leave-detail.tsx`, `hr/leaves.tsx`.

### 6.7 — `<PrintLayout>` / `<PrintButton>` يحتاج اندماج مع `@workspace/report-kit`
> 13.3% تبنّي للـ Print، ولكن `@workspace/report-kit` يُستورَد في **3 صفحات فقط**. يبدو أن طبقة الطباعة المركزية مهملة لصالح inline printing. **التوصية:** التحقّق من حالة `report-kit` — هل هو حزمة فعلية أم stub؟ إذا كان حيّ، يجب توجيه كل صفحة Print خلاله. إذا كان معطلًا، يلزم توضيح ذلك في خارطة الطريق.

### 6.8 — `<ListPage>` مهجور (0.3%)
> المكوّن يهدف لتوحيد قوائم صفحة كاملة (PageShell + AdvancedFilters + DataTable في غلاف واحد) لكنه غير مستخدَم. **التوصية:** إما توسيعه ليُغطّي 100% من القوائم تلقائيًا (وعندئذٍ يجب ترحيل 326 صفحة موحّدة)، أو شطبه من المكتبة وإعلان `PageShell + AdvancedFilters + DataTable` كنمط رسمي. لا يجوز ترك مكوّن "ذو نية حسنة" بلا اعتماد.

---

## 7) ملاحظات إضافية

- **`details/` و `create/` نظيفة نسبيًا:** تقريبًا 100% من الملفات تستخدم `DetailPageLayout` و `CreatePageLayout` على التوالي. هذا أكبر إنجاز للتوحيد.
- **`bi/`, `governance/`, `my-space/` تحتوي على أجزاء (partials):** غلافها الأب يستخدم `<PageShell>`، لذا فقدان `<PageShell>` فيها مقصود.
- **`hr/` و `fleet/` و `properties/` تبنّت `<PageShell>` بشكل شبه كامل** (>90% من ملفاتها).
- **`finance/` هي المنطقة الأكثر تباينًا:** 178 صفحة تستخدم PageShell، لكن 43+ منها تستخدم `<table>` خام لتنسيقات مالية. حلّ ذلك يستوجب تحسين `<DataTable>` بدلًا من تحميل العبء على كل ورقة (راجع #6.1).
- **`settings.tsx` و tabs الإعدادات** هي الأسوأ توحيدًا: `<table>` + `window.confirm` + `<AlertDialog>` خام. يجب وضع هجرتها في أولوية واحدة.

---

**نهاية التدقيق — لا تعديلات نُفّذت على الشيفرة.**
