# SYSTEM_PAGE_INVENTORY — جرد صفحات الواجهة الأمامية (Frontend Page Inventory)
> **AUDIT-ONLY** — هذه الوثيقة وثيقة مراجعة فقط. لا يوجد فيها أي توصية بإعادة بناء أو تعديل. الهدف هو فهرسة كل صفحة في النظام مع حالتها الحالية.

**التاريخ**: 2026-05-30  ·  **النطاق**: `artifacts/ghayth-erp/src/pages/**/*.tsx` + `routes/*.tsx` + `components/layout/sidebar-layout.tsx`  ·  **الإصدار**: 1.0

**العلاقة بالقضايا**: #1418 (Ghaith Operating Foundation), #1413 (Unified users/roles/permissions/visibility)

**مرجع ذو صلة**: `docs/audit/EXECUTIVE_INVENTORY_REPORT.md`, `docs/audit/SYSTEM_INVENTORY_MATRIX.md`, `docs/audit/UNVERIFIED_PATHS_ARCHITECTURE_MAP.md`

---
## 1. المنهجية (Methodology)

1. **مصادر البيانات**:
   - `components/layout/sidebar-layout.tsx` — السلطة الرسمية لقائمة الـ sidebar (دالة `getAllNavigationPages()` السطر 627). تم استخراج كل عنصر `{ label, path, minRoleLevel, perm }`.
   - `routes/*.tsx` (15 ملف توجيه) — السلطة الرسمية لربط `path → component` لكل وحدة. تم بناء قاموس `path → file` و `file → paths` (file قد يكون له أكثر من path: مثل `pages/finance/dashboard.tsx` لها `/finance` فقط، بينما `pages/legal.tsx` ترتبط بـ 5 مسارات).
   - `routes/registry.ts` — لائحة `isRegisteredRoute()` التي يستخدمها الـ sidebar للتحقق من أن الـ link لا تشير إلى صفحة محذوفة.
   - `App.tsx` — يربط الـ module على كل route group (مثل `tagRoutes(hrRoutes, "hr")`) ويفرض `ModuleRoute` (gate الموديول + sub-key + minRoleLevel).

2. **التصنيف لكل ملف**:
   - **اسم الصفحة**: من خاصية `title="..."` على `<PageShell>` أو ما يكافئها. اذا لم يوجد title صريح (مثل صفحات `details/*` الديناميكية) — يستعمل اسم الملف.
   - **مسار التوجيه**: من قواميس الـ routes؛ إن لم يوجد ⇒ `غير مسجل`.
   - **مسار الملف**: نسبي إلى جذر المستودع تحت `artifacts/ghayth-erp/src/pages/`.
   - **الموديول**: من `tagRoutes()` في `App.tsx` أو `module:` على عنصر sidebar أو موقع الملف.
   - **الخدمة الفرعية**: مأخوذة من `subKey:` على route أو من المجلد الفرعي.
   - **ظاهر في القائمة الجانبية؟**: مقارنة مع `getAllNavigationPages()`.
   - **يتطلب صلاحية؟**: من `perm:` و `minRoleLevel:` في الـ sidebar + ما يطبقه `ModuleRoute` في `App.tsx` + ما يقرره `tagRoutes()`.
   - **يستخدم useApiQuery/useApiMutation؟**: grep على الملف. عدد مرات التطابق مدرج كعدد المكالمات (proxy لربط backend).
   - **الحالة**: انظر القاموس أدناه.

3. **استبعاد الـ sub-components**: الملفات بنهايات `*-tab.tsx | *-section.tsx | *-card.tsx | *-row.tsx | *-grid.tsx | *-panel.tsx | *-strip.tsx` (59 ملف) لا تظهر في الجدول الرئيسي — مدرجة في القسم 6.

4. **قاموس الحالات**:
   - **جاهز**: يستخدم API + shell موحّد + مرتبط بـ route.
   - **جزئي**: مرتبط بـ route لكن api=0 — قد يكون hub-only يفوّض إلى tabs (انظر `bi.tsx`).
   - **placeholder**: لا يوجد API ولا تحميل بيانات حقيقي.
   - **dead**: ليس مرتبطًا بـ route ولا مستورد كـ sub-component.
   - **duplicate**: يقدم نفس وظيفة صفحة أخرى.
   - **داخلي فقط**: ليس له route، لكنه مستورد من صفحة أخرى (مثل `bi/shared.tsx`).
   - **مخفي**: مرتبط بـ route ولكن غير ظاهر في الـ sidebar (e.g. صفحات تفاصيل).
   - **يحتاج ربط backend**: على القائمة الجانبية لكن لا يستخدم API.
   - **يحتاج توحيد UI**: لا يستخدم `PageShell` أو معادله.

---
## 2. الإحصاءات الإجمالية (Totals)

| المقياس | القيمة |
|---|---|
| إجمالي ملفات `.tsx` تحت `pages/` | **578** |
| منها sub-components (`*-tab/-section/-card/-row/-grid/-panel/-strip`) | **59** |
| **صفحات رئيسية مدرجة في الجدول** | **519** |
| صفحات مرتبطة بـ route مسجّل (`routes/*.tsx`) | **510** |
| صفحات غير مرتبطة بأي route | **9** |
| صفحات ظاهرة في القائمة الجانبية (Sidebar) | **331** |
| صفحات تستخدم `useApiQuery` أو `useApiMutation` | **491** |
| صفحات تستخدم `<PageShell>` أو أحد قوالب التخطيط الموحّدة | **503** |
| ملفات توجيه (`src/routes/*.tsx`) | **15** |
| إجمالي مسارات (path entries) مسجلة | **534** |
| إجمالي روابط الـ sidebar (من `getAllNavigationPages`) | **352** |

---
## 3. أعلى 10 ملاحظات لافتة (Top 10 Surprising Findings)

1. **`pages/finance/profitability.tsx`** موجود كملف لكنه **غير مسجَّل في `financeRoutes.tsx`** — هو "dead" حسب التعريف. الصفحات الأخرى `profitability-vehicle/property/project/umrah-agent` كلها مسجّلة وتعتمد على `:id` ولكن الصفحة الأم `profitability.tsx` بدون id ليس لها مسار.
2. **`pages/finance/account-statement.tsx`** موجود **بدون route**. السطر الأقرب في الجدول هو `customer-statement.tsx` و `vendor-statement.tsx` المسجّلتان عبر `clients/:id/statement` و `vendors/:id/statement`. هذا الملف اليتيم يبدو متبقّى من PR لاحقة.
3. **القائمة الجانبية تشير إلى `/insights` و `/intelligence`** ضمن قسم "ذكاء الأعمال"، وفعلاً الصفحتان `pages/insights.tsx` و `pages/intelligence.tsx` مرتبطتان بـ route ضمن `miscRoutes.tsx`، لكنهما **مرتبطتان بالموديول `bi`** — أي إذا أُغلق `bi` كموديول لشركة، يفقد المستخدم الذكاء كله.
4. **`pages/admin/rbac-v2-conditions-editor.tsx`** صفحة موجودة، api=0، وغير مسجَّلة في `adminRoutes.tsx`. الـ rbac-v2 tabs الأخرى (`rbac-v2-tab/jit-tab/sod-tab/users-tab`) هي sub-components مستوردة من `admin.tsx`. ⇒ محرر الشروط يبدو **غير مستخدم**.
5. **`pages/admin-intelligence-playground.tsx`** على القائمة الجانبية (`/admin/intelligence-playground`، يتطلب `admin:update`) لكنها **لا تستخدم أي API call** (api=0). يحتاج التحقق هل هي صفحة تشخيص محلية أم placeholder.
6. **مكرّرات قائمة جانبية لنفس الصفحة**: `pages/finance/dashboard.tsx` يخدم `/finance`، بينما `pages/finance/cfo-cockpit.tsx` يخدم `/finance/cfo-cockpit` — كلاهما "dashboards" مالية. وأيضًا `pages/finance/finance-workflows-hub.tsx` و `finance/settings-hub.tsx` يطرحان hubs منفصلة — لا duplicate حقيقي لكن **3 hubs مالية مختلفة** قد يخلط المستخدم.
7. **سلاسل ZATCA**: `pages/finance/zatca-reports-hub.tsx` (api=0!) + `admin-zatca-audits.tsx` (api=4) + `vat-filing-readiness.tsx` + `vat-reconciliation.tsx`. الـ hub لا يستدعي API — هو صفحة navigation فقط، الصفحات الفرعية تستدعي.
8. **`pages/finance/customer-statement.tsx` و `vendor-statement.tsx` و `profitability-{vehicle,property,project,umrah-agent}.tsx`** كلها api=0 — تعتمد على parsed params من URL وعرض static. هذه ربما **client-side compositions** تستهلك hooks مغلّفة وليس `useApiQuery` مباشرة. يحتاج فحص يدوي.
9. **سلسلة Telematics**: 10 صفحات تحت `fleet/telematics/*` كلها مسجَّلة وعلى الـ sidebar تحت "إدارة الأسطول". `fleet/telematics/settings.tsx` api=0 — على عكس بقية الـ telematics التي تستدعي API. هذه الصفحة قد تكون settings UI بدون backend wiring.
10. **`pages/admin-event-monitor.tsx`** label في الـ sidebar = "مراقبة الأحداث" لكن `title=` الفعلي للصفحة = **"كتالوج الأحداث"**. تباين عنوان واحد فقط لكنه يدل على أن العناوين في الـ sidebar وداخل الصفحات **غير مزامنة بشكل آلي**.

---
## 4. جدول الصفحات حسب القسم (Page Table by Section)

### 4.1 Home / Dashboards  (13 صفحة)

<details>
<summary>عرض الجدول</summary>

| # | اسم الصفحة | مسار التوجيه | مسار الملف | الخدمة الفرعية | في القائمة؟ | صلاحية | API؟ | الحالة |
|---|---|---|---|---|---|---|---|---|
| 1 | مركز القرارات | `/action-center` | `artifacts/ghayth-erp/src/pages/action-center.tsx` | Action Center | نعم | L20 | نعم (9) | جاهز |
| 2 | التقويم الموحد | `/calendar` | `artifacts/ghayth-erp/src/pages/calendar.tsx` | Home | نعم | L20 | نعم (2) | جاهز |
| 3 | الإقفال اليومي | `/daily-close` | `artifacts/ghayth-erp/src/pages/daily-close.tsx` | Daily close | نعم | L40 | نعم (3) | جاهز |
| 4 | مهامي اليوم | `/dashboard` | `artifacts/ghayth-erp/src/pages/dashboard.tsx` | Home | نعم | — | نعم (12) | جاهز |
| 5 | لوحة القيادة التنفيذية | `/exec-dashboard` | `artifacts/ghayth-erp/src/pages/exec-dashboard.tsx` | Executive | نعم | L60 | نعم (4) | جاهز |
| 6 | لوحة المدير | `/manager-board` | `artifacts/ghayth-erp/src/pages/manager-board.tsx` | Manager | نعم | L40 | نعم (7) | جاهز |
| 7 | موافقات إعادة الطباعة | `/manager-board/reprint-approvals` | `artifacts/ghayth-erp/src/pages/manager-board/reprint-approvals.tsx` | manager-board | نعم | L40, "print:reprint:approve" | نعم (2) | جاهز |
| 8 | مساحة المدير | `/manager-workspace` | `artifacts/ghayth-erp/src/pages/manager-workspace.tsx` | Workspace | نعم | — | نعم (2) | جاهز |
| 9 | إجمالي الموظفين | `/module-dashboards` | `artifacts/ghayth-erp/src/pages/module-dashboards.tsx` | Module | نعم | — | نعم (12) | جاهز |
| 10 | مركز الالتزامات الزمنية | `/obligations` | `artifacts/ghayth-erp/src/pages/obligations.tsx` | Obligations | نعم | L30 | نعم (3) | جاهز |
| 11 | مركز العمليات | `/operations-center` | `artifacts/ghayth-erp/src/pages/operations-center.tsx` | Operations | نعم | L40 | نعم (2) | جاهز |
| 12 | كل الخدمات | `/services` | `artifacts/ghayth-erp/src/pages/services.tsx` | Home | نعم | — | لا | يحتاج ربط backend (hub أو placeholder) |
| 13 | مساحة العمل | `/workspace` | `artifacts/ghayth-erp/src/pages/workspace.tsx` | Workspace | نعم | — | نعم (2) | جاهز |

</details>

### 4.2 Employee Portal  (9 صفحة)

<details>
<summary>عرض الجدول</summary>

| # | اسم الصفحة | مسار التوجيه | مسار الملف | الخدمة الفرعية | في القائمة؟ | صلاحية | API؟ | الحالة |
|---|---|---|---|---|---|---|---|---|
| 1 | حضوري وانصرافي | `/my-attendance` | `artifacts/ghayth-erp/src/pages/my-attendance.tsx` | Employee | نعم | — | نعم (2) | جاهز |
| 2 | مستنداتي | `/my-documents` | `artifacts/ghayth-erp/src/pages/my-documents.tsx` | Employee | نعم | — | نعم (2) | جاهز |
| 3 | سلفي | `/my-loans` | `artifacts/ghayth-erp/src/pages/my-loans.tsx` | Employee | نعم | — | نعم (2) | جاهز |
| 4 | ساعاتي الإضافية | `/my-overtime` | `artifacts/ghayth-erp/src/pages/my-overtime.tsx` | Employee | نعم | — | نعم (2) | جاهز |
| 5 | كشف راتبي | `/my-payslip` | `artifacts/ghayth-erp/src/pages/my-payslip.tsx` | Employee | نعم | — | نعم (2) | جاهز |
| 6 | تقييمي | `/my-performance` | `artifacts/ghayth-erp/src/pages/my-performance.tsx` | Employee | نعم | — | نعم (2) | جاهز |
| 7 | طلباتي | `/my-requests` | `artifacts/ghayth-erp/src/pages/my-requests.tsx` | Employee | نعم | — | نعم (2) | جاهز |
| 8 | مساحتي | `/my-space` | `artifacts/ghayth-erp/src/pages/my-space.tsx` | Employee | نعم | — | نعم (3) | جاهز |
| 9 | summary-cards | `غير مسجل` | `artifacts/ghayth-erp/src/pages/my-space/summary-cards.tsx` | my-space | لا | — | لا | داخلي فقط |

</details>

### 4.3 HR (الموارد البشرية)  (83 صفحة)

<details>
<summary>عرض الجدول</summary>

| # | اسم الصفحة | مسار التوجيه | مسار الملف | الخدمة الفرعية | في القائمة؟ | صلاحية | API؟ | الحالة |
|---|---|---|---|---|---|---|---|---|
| 1 | إضافة متقدم جديد | `/hr/recruitment/applicants/create` | `artifacts/ghayth-erp/src/pages/create/hr/applicants-create.tsx` | hr | لا | — | نعم (4) | مخفي |
| 2 | تسجيل حضور / انصراف | `/hr/attendance/create` | `artifacts/ghayth-erp/src/pages/create/hr/attendance-create.tsx` | hr | لا | — | نعم (4) | مخفي |
| 3 | attendance-edit | `/hr/attendance/:id/edit` | `artifacts/ghayth-erp/src/pages/create/hr/attendance-edit.tsx` | hr | لا | — | نعم (2) | مخفي |
| 4 | عقد موظف جديد | `/hr/contracts/create` | `artifacts/ghayth-erp/src/pages/create/hr/contracts-create.tsx` | hr | لا | — | نعم (3) | مخفي |
| 5 | تعذّر التعديل | `/hr/contracts/:id/edit` | `artifacts/ghayth-erp/src/pages/create/hr/contracts-edit.tsx` | hr | لا | — | نعم (2) | مخفي |
| 6 | بدء دورة تقييم جديدة | `/hr/evaluation-360/create` | `artifacts/ghayth-erp/src/pages/create/hr/evaluation-360-create.tsx` | hr | لا | — | نعم (3) | مخفي |
| 7 | طلب استئذان | `/hr/excuse-requests/create` | `artifacts/ghayth-erp/src/pages/create/hr/excuse-create.tsx` | hr | لا | — | نعم (3) | مخفي |
| 8 | تعذّر التعديل | `/hr/excuse-requests/:id/edit` | `artifacts/ghayth-erp/src/pages/create/hr/excuse-edit.tsx` | hr | لا | — | نعم (2) | مخفي |
| 9 | طلب نهاية خدمة | `/hr/exit/create` | `artifacts/ghayth-erp/src/pages/create/hr/exit-create.tsx` | hr | لا | — | نعم (3) | مخفي |
| 10 | طلب إجازة جديد | `/hr/leaves/create` | `artifacts/ghayth-erp/src/pages/create/hr/leaves-create.tsx` | hr | نعم | — | نعم (7) | جاهز |
| 11 | تعذّر التعديل | `/hr/leaves/:id/edit` | `artifacts/ghayth-erp/src/pages/create/hr/leaves-edit.tsx` | hr | لا | — | نعم (2) | مخفي |
| 12 | طلب سلفة جديدة | `/hr/loans/create` | `artifacts/ghayth-erp/src/pages/create/hr/loans-create.tsx` | hr | لا | — | نعم (3) | مخفي |
| 13 | طلب وقت إضافي | `/hr/overtime/create` | `artifacts/ghayth-erp/src/pages/create/hr/overtime-create.tsx` | hr | لا | — | نعم (3) | مخفي |
| 14 | تشغيل مسير الرواتب | `/hr/payroll/create` | `artifacts/ghayth-erp/src/pages/create/hr/payroll-create.tsx` | hr | لا | — | نعم (5) | مخفي |
| 15 | تقييم أداء جديد | `/hr/performance/create` | `artifacts/ghayth-erp/src/pages/create/hr/performance-create.tsx` | hr | لا | — | نعم (4) | مخفي |
| 16 | إضافة وظيفة جديدة | `/hr/recruitment/create` | `artifacts/ghayth-erp/src/pages/create/hr/recruitment-create.tsx` | hr | لا | — | نعم (4) | مخفي |
| 17 | إضافة وردية جديدة | `/hr/shifts/create` | `artifacts/ghayth-erp/src/pages/create/hr/shifts-create.tsx` | hr | لا | — | نعم (4) | مخفي |
| 18 | إضافة برنامج تدريبي | `/hr/training/create` | `artifacts/ghayth-erp/src/pages/create/hr/training-create.tsx` | hr | لا | — | نعم (3) | مخفي |
| 19 | تعذّر التعديل | `/hr/transfers/:id/edit` | `artifacts/ghayth-erp/src/pages/create/hr/transfers-edit.tsx` | hr | لا | — | نعم (2) | مخفي |
| 20 | تسجيل مخالفة | `/hr/violations/create` | `artifacts/ghayth-erp/src/pages/create/hr/violations-create.tsx` | hr | لا | — | نعم (3) | مخفي |
| 21 | ملف انضباط الموظف | `/employees/:id` | `artifacts/ghayth-erp/src/pages/employee-detail.tsx` | Employees | لا | — | نعم (7) | مخفي |
| 22 | معاينة سريعة | `/employees` | `artifacts/ghayth-erp/src/pages/employees.tsx` | Employees | نعم | — | نعم (4) | جاهز |
| 23 | الموارد البشرية | `/hr` | `artifacts/ghayth-erp/src/pages/hr.tsx` | HR overview | لا | — | نعم (10) | جاهز |
| 24 | الاستحقاقات الشهرية | `/hr/accruals` | `artifacts/ghayth-erp/src/pages/hr/accruals.tsx` | hr | نعم | — | نعم (3) | جاهز |
| 25 | قائمة المتقدمين | `/hr/recruitment/applications` | `artifacts/ghayth-erp/src/pages/hr/application-list.tsx` | hr | نعم | — | نعم (2) | جاهز |
| 26 | سلاسل الموافقات | `/hr/leaves/approval-chains` | `artifacts/ghayth-erp/src/pages/hr/approval-chains.tsx` | hr | نعم | — | نعم (4) | جاهز |
| 27 | صندوق الموافقات | `/hr/approvals` | `artifacts/ghayth-erp/src/pages/hr/approval-inbox.tsx` | hr | نعم | — | نعم (3) | جاهز |
| 28 | سياسة الحضور | `/hr/attendance-policy` | `artifacts/ghayth-erp/src/pages/hr/attendance-policy.tsx` | hr | نعم | — | نعم (3) | جاهز |
| 29 | تقارير الحضور والانصراف | `/hr/attendance/reports` | `artifacts/ghayth-erp/src/pages/hr/attendance-reports.tsx` | hr | نعم | — | نعم (4) | جاهز |
| 30 | الحضور والانصراف | `/hr/attendance` | `artifacts/ghayth-erp/src/pages/hr/attendance.tsx` | hr | نعم | — | نعم (3) | جاهز |
| 31 | الرصد التلقائي للمخالفات | `/hr/violations/auto-detection` | `artifacts/ghayth-erp/src/pages/hr/auto-detection.tsx` | hr | نعم | — | نعم (6) | جاهز |
| 32 | عقود الموظفين | `/hr/contracts` | `artifacts/ghayth-erp/src/pages/hr/contracts.tsx` | hr | نعم | — | نعم (8) | جاهز |
| 33 | التفويضات | `/hr/delegations` | `artifacts/ghayth-erp/src/pages/hr/delegations.tsx` | hr | نعم | — | نعم (4) | جاهز |
| 34 | سبب إلغاء المحضر | `/hr/discipline/memos/:id` | `artifacts/ghayth-erp/src/pages/hr/discipline-memo-detail.tsx` | hr | لا | — | نعم (2) | مخفي |
| 35 | عرض | `/hr/discipline/regulation` | `artifacts/ghayth-erp/src/pages/hr/discipline-regulation.tsx` | hr | نعم | — | نعم (7) | جاهز |
| 36 | وثائق المنشأة والموظفين | `/hr/documents` | `artifacts/ghayth-erp/src/pages/hr/documents.tsx` | hr | نعم | — | نعم (6) | جاهز |
| 37 | تفعيل / تعليق الموظفين | `/hr/employee-activation` | `artifacts/ghayth-erp/src/pages/hr/employee-activation.tsx` | hr | نعم | — | نعم (4) | جاهز |
| 38 | evaluation-360-detail | `/hr/evaluation-360/:id` | `artifacts/ghayth-erp/src/pages/hr/evaluation-360-detail.tsx` | hr | لا | — | نعم (5) | مخفي |
| 39 | تاريخ التقييمات | `/hr/evaluation-360/history/:employeeId` | `artifacts/ghayth-erp/src/pages/hr/evaluation-360-history.tsx` | hr | لا | — | نعم (2) | جاهز |
| 40 | تقييم المدير / الزملاء | `/hr/evaluation-360/:id/peer` | `artifacts/ghayth-erp/src/pages/hr/evaluation-360-peer.tsx` | hr | لا | — | نعم (3) | مخفي |
| 41 | التقييم العكسي السري | `/hr/evaluation-360/:id/upward` | `artifacts/ghayth-erp/src/pages/hr/evaluation-360-upward.tsx` | hr | لا | — | نعم (3) | مخفي |
| 42 | عرض تاريخ تقييمات الموظف | `/hr/evaluation-360` | `artifacts/ghayth-erp/src/pages/hr/evaluation-360.tsx` | hr | نعم | — | نعم (2) | جاهز |
| 43 | طلبات الاستئذان | `/hr/excuse-requests` | `artifacts/ghayth-erp/src/pages/hr/excuse-requests.tsx` | hr | نعم | — | نعم (2) | جاهز |
| 44 | exit-detail | `/hr/exit/:id` | `artifacts/ghayth-erp/src/pages/hr/exit-detail.tsx` | hr | لا | — | نعم (5) | مخفي |
| 45 | نهاية الخدمة | `/hr/exit` | `artifacts/ghayth-erp/src/pages/hr/exit-requests.tsx` | hr | نعم | — | نعم (3) | جاهز |
| 46 | متابعة الوثائق المنتهية | `/hr/expiring-documents` | `artifacts/ghayth-erp/src/pages/hr/expiring-documents.tsx` | hr | نعم | — | نعم (2) | جاهز |
| 47 | التتبع الميداني | `/hr/attendance/field-tracking` | `artifacts/ghayth-erp/src/pages/hr/field-tracking.tsx` | hr | نعم | — | نعم (2) | جاهز |
| 48 | حساب مكافأة نهاية الخدمة | `/hr/gratuity` | `artifacts/ghayth-erp/src/pages/hr/gratuity.tsx` | hr | نعم | — | نعم (3) | جاهز |
| 49 | خطط التطوير الفردي | `/hr/idp` | `artifacts/ghayth-erp/src/pages/hr/idp.tsx` | hr | نعم | — | نعم (5) | جاهز |
| 50 | job-detail | `/hr/recruitment/jobs/:id` | `artifacts/ghayth-erp/src/pages/hr/job-detail.tsx` | hr | لا | — | نعم (3) | مخفي |
| 51 | إدارة الإجازات | `/hr/leaves/management` | `artifacts/ghayth-erp/src/pages/hr/leave-management.tsx` | hr | نعم | — | نعم (5) | جاهز |
| 52 | نسخ الطلب | `/hr/leaves` | `artifacts/ghayth-erp/src/pages/hr/leaves.tsx` | hr | نعم | — | نعم (4) | جاهز |
| 53 | loan-detail | `/hr/loans/:id` | `artifacts/ghayth-erp/src/pages/hr/loan-detail.tsx` | hr | لا | — | نعم (2) | مخفي |
| 54 | سلف الموظفين | `/hr/loans` | `artifacts/ghayth-erp/src/pages/hr/loans.tsx` | hr | نعم | — | نعم (4) | جاهز |
| 55 | معاينة | `/hr/official-letters` | `artifacts/ghayth-erp/src/pages/hr/official-letters.tsx` | hr | نعم | — | نعم (5) | جاهز |
| 56 | مراجعة التعيين والتأهيل | `/hr/onboarding-review` | `artifacts/ghayth-erp/src/pages/hr/onboarding-review.tsx` | hr | نعم | — | نعم (6) | جاهز |
| 57 | الهيكل التنظيمي المفصل | `/hr/organization/structure` | `artifacts/ghayth-erp/src/pages/hr/organization-structure.tsx` | hr | نعم | — | نعم (3) | جاهز |
| 58 | الهيكل التنظيمي | `/hr/organization` | `artifacts/ghayth-erp/src/pages/hr/organization.tsx` | hr | نعم | — | نعم (3) | جاهز |
| 59 | الطلب غير موجود | `/hr/overtime/:id` | `artifacts/ghayth-erp/src/pages/hr/overtime-detail.tsx` | hr | لا | — | نعم (2) | مخفي |
| 60 | الوقت الإضافي | `/hr/overtime` | `artifacts/ghayth-erp/src/pages/hr/overtime.tsx` | hr | نعم | — | نعم (5) | جاهز |
| 61 | مسيرات الرواتب | `/hr/payroll` | `artifacts/ghayth-erp/src/pages/hr/payroll.tsx` | hr | نعم | — | نعم (4) | جاهز |
| 62 | تصعيد الجزاءات | `/hr/violations/penalty-escalation` | `artifacts/ghayth-erp/src/pages/hr/penalty-escalation.tsx` | hr | نعم | — | نعم (3) | جاهز |
| 63 | تحليلات الأداء المتقدمة | `/hr/performance/advanced` | `artifacts/ghayth-erp/src/pages/hr/performance-advanced.tsx` | hr | نعم | — | نعم (2) | جاهز |
| 64 | تقييمات الأداء | `/hr/performance` | `artifacts/ghayth-erp/src/pages/hr/performance.tsx` | hr | نعم | — | نعم (2) | جاهز |
| 65 | تقويم الإجازات الرسمية | `/hr/public-holidays` | `artifacts/ghayth-erp/src/pages/hr/public-holidays.tsx` | hr | نعم | — | نعم (4) | جاهز |
| 66 | تسجيل الحضور السريع | `/hr/attendance/qr-scanner` | `artifacts/ghayth-erp/src/pages/hr/qr-scanner.tsx` | hr | نعم | — | نعم (5) | جاهز |
| 67 | تحليلات التوظيف المتقدمة | `/hr/recruitment/advanced` | `artifacts/ghayth-erp/src/pages/hr/recruitment-advanced.tsx` | hr | نعم | — | نعم (3) | جاهز |
| 68 | التوظيف والاستقطاب | `/hr/recruitment` | `artifacts/ghayth-erp/src/pages/hr/recruitment.tsx` | hr | نعم | — | نعم (5) | جاهز |
| 69 | مكونات الرواتب | `/hr/payroll/salary-components` | `artifacts/ghayth-erp/src/pages/hr/salary-components.tsx` | hr | نعم | — | نعم (4) | جاهز |
| 70 | الامتثال السعودي — WPS / مدد | `/hr/saudi-compliance` | `artifacts/ghayth-erp/src/pages/hr/saudi-compliance.tsx` | hr | نعم | — | نعم (6) | جاهز |
| 71 | السعودة ونطاقات | `/hr/saudization` | `artifacts/ghayth-erp/src/pages/hr/saudization.tsx` | hr | نعم | — | نعم (5) | جاهز |
| 72 | إدارة الورديات المتقدمة | `/hr/shifts/management` | `artifacts/ghayth-erp/src/pages/hr/shifts-management.tsx` | hr | نعم | — | نعم (5) | جاهز |
| 73 | إدارة الورديات | `/hr/shifts` | `artifacts/ghayth-erp/src/pages/hr/shifts.tsx` | hr | نعم | — | نعم (3) | جاهز |
| 74 | تحليلات التدريب المتقدمة | `/hr/training/advanced` | `artifacts/ghayth-erp/src/pages/hr/training-advanced.tsx` | hr | نعم | — | نعم (4) | جاهز |
| 75 | training-detail | `/hr/training/:id` | `artifacts/ghayth-erp/src/pages/hr/training-detail.tsx` | hr | لا | — | نعم (3) | مخفي |
| 76 | برامج التدريب | `/hr/training` | `artifacts/ghayth-erp/src/pages/hr/training.tsx` | hr | نعم | — | نعم (5) | جاهز |
| 77 | نقل الموظفين | `/hr/transfers` | `artifacts/ghayth-erp/src/pages/hr/transfers.tsx` | hr | نعم | — | نعم (5) | جاهز |
| 78 | تقرير دوران الموظفين | `/hr/turnover-report` | `artifacts/ghayth-erp/src/pages/hr/turnover-report.tsx` | hr | نعم | — | نعم (2) | جاهز |
| 79 | violation-detail | `/hr/violations/:id` | `artifacts/ghayth-erp/src/pages/hr/violation-detail.tsx` | hr | لا | — | نعم (2) | مخفي |
| 80 | إدارة المخالفات المتقدمة | `/hr/violations/management` | `artifacts/ghayth-erp/src/pages/hr/violations-management.tsx` | hr | نعم | — | نعم (4) | جاهز |
| 81 | المخالفات والجزاءات | `/hr/violations` | `artifacts/ghayth-erp/src/pages/hr/violations.tsx` | hr | نعم | — | نعم (3) | جاهز |
| 82 | wps-run-detail | `/hr/wps/:id` | `artifacts/ghayth-erp/src/pages/hr/wps-run-detail.tsx` | hr | لا | — | نعم (4) | مخفي |
| 83 | تفاصيل | `/hr/wps` | `artifacts/ghayth-erp/src/pages/hr/wps-runs.tsx` | hr | نعم | — | نعم (6) | جاهز |

</details>

### 4.4 Finance (المالية)  (165 صفحة)

<details>
<summary>عرض الجدول</summary>

| # | اسم الصفحة | مسار التوجيه | مسار الملف | الخدمة الفرعية | في القائمة؟ | صلاحية | API؟ | الحالة |
|---|---|---|---|---|---|---|---|---|
| 1 | تحويل بين الحسابات | `/finance/treasury/transfer` | `artifacts/ghayth-erp/src/pages/create/finance/account-transfer.tsx` | finance | نعم | — | نعم (3) | جاهز |
| 2 | إضافة حساب جديد | `/finance/accounts/create` | `artifacts/ghayth-erp/src/pages/create/finance/accounts-create.tsx` | finance | لا | — | نعم (3) | مخفي |
| 3 | تعديل بيانات الحساب في شجرة الحسابات | `/finance/accounts/:id/edit` | `artifacts/ghayth-erp/src/pages/create/finance/accounts-edit.tsx` | finance | لا | — | نعم (2) | مخفي |
| 4 | قاعدة توجيه محاسبي جديدة | `/finance/allocation-rules/create` | `artifacts/ghayth-erp/src/pages/create/finance/allocation-rule-create.tsx` | finance | لا | — | نعم (2) | مخفي |
| 5 | allocation-rule-edit | `/finance/allocation-rules/:id/edit` | `artifacts/ghayth-erp/src/pages/create/finance/allocation-rule-edit.tsx` | finance | لا | — | نعم (3) | مخفي |
| 6 | مطابقة يدوية | `/finance/bank-reconciliation/manual-match/:batchId/:rowId` | `artifacts/ghayth-erp/src/pages/create/finance/bank-manual-match.tsx` | finance | لا | — | نعم (3) | جاهز |
| 7 | إهلاك دفعي للأصول | `/finance/fixed-assets/batch-depreciate` | `artifacts/ghayth-erp/src/pages/create/finance/batch-depreciate.tsx` | finance | نعم | — | نعم (2) | جاهز |
| 8 | إضافة بند ميزانية | `/finance/budget/create` | `artifacts/ghayth-erp/src/pages/create/finance/budget-create.tsx` | finance | لا | — | نعم (3) | مخفي |
| 9 | موزّع التكلفة على عدة كيانات | `/finance/expenses/split` | `artifacts/ghayth-erp/src/pages/create/finance/cost-splitter.tsx` | finance | نعم | — | نعم (3) | جاهز |
| 10 | customer-advances-apply | `/finance/customer-advances/:id/apply` | `artifacts/ghayth-erp/src/pages/create/finance/customer-advances-apply.tsx` | finance | لا | — | نعم (4) | مخفي |
| 11 | دفعة مقدمة جديدة | `/finance/customer-advances/create` | `artifacts/ghayth-erp/src/pages/create/finance/customer-advances-create.tsx` | finance | لا | — | نعم (2) | مخفي |
| 12 | إضافة مصروف جديد | `/finance/expenses/create` | `artifacts/ghayth-erp/src/pages/create/finance/expenses-create.tsx` | finance | لا | — | نعم (12) | مخفي |
| 13 | القوائم المالية الموحدة | `/finance/intercompany/consolidation/create` | `artifacts/ghayth-erp/src/pages/create/finance/intercompany-consolidation-create.tsx` | finance | لا | — | نعم (2) | مخفي |
| 14 | فاتورة جديدة | `/finance/invoices/create` | `artifacts/ghayth-erp/src/pages/create/finance/invoices-create.tsx` | finance | لا | — | نعم (4) | مخفي |
| 15 | قيد يومية جديد | `/finance/journal/create` | `artifacts/ghayth-erp/src/pages/create/finance/journal-create.tsx` | finance | لا | — | نعم (5) | مخفي |
| 16 | إنشاء قيد يدوي جديد | `/finance/journal-manual/create` | `artifacts/ghayth-erp/src/pages/create/finance/journal-manual-create.tsx` | finance | لا | — | نعم (3) | مخفي |
| 17 | قوالب قيود سريعة | `/finance/journal-quick-templates` | `artifacts/ghayth-erp/src/pages/create/finance/journal-quick-templates.tsx` | finance | نعم | — | نعم (2) | جاهز |
| 18 | عكس قيد محاسبي | `/finance/journal/reverse` | `artifacts/ghayth-erp/src/pages/create/finance/journal-reversal.tsx` | finance | نعم | — | نعم (3) | جاهز |
| 19 | مصروف متعدد البنود | `/finance/expenses/multi-line` | `artifacts/ghayth-erp/src/pages/create/finance/multi-line-expense-create.tsx` | finance | نعم | — | نعم (3) | جاهز |
| 20 | أرصدة افتتاحية جديدة | `/finance/opening-balances/create` | `artifacts/ghayth-erp/src/pages/create/finance/opening-balances-create.tsx` | finance | لا | — | نعم (4) | مخفي |
| 21 | طلب شراء جديد | `/finance/purchase-orders/create` | `artifacts/ghayth-erp/src/pages/create/finance/purchase-orders-create.tsx` | finance | لا | — | نعم (5) | مخفي |
| 22 | قيد دوري جديد | `/finance/recurring-journals/create` | `artifacts/ghayth-erp/src/pages/create/finance/recurring-journals-create.tsx` | finance | لا | — | نعم (3) | مخفي |
| 23 | إضافة رمز ضريبة جديد | `/finance/tax-codes/create` | `artifacts/ghayth-erp/src/pages/create/finance/tax-codes-create.tsx` | finance | لا | — | نعم (3) | مخفي |
| 24 | tax-codes-edit | `/finance/tax-codes/:id/edit` | `artifacts/ghayth-erp/src/pages/create/finance/tax-codes-edit.tsx` | finance | لا | — | نعم (4) | مخفي |
| 25 | إضافة مورد جديد | `/finance/vendors/create` | `artifacts/ghayth-erp/src/pages/create/finance/vendors-create.tsx` | finance | لا | — | نعم (3) | مخفي |
| 26 | vendors-edit | `/finance/vendors/:id/edit` | `artifacts/ghayth-erp/src/pages/create/finance/vendors-edit.tsx` | finance | لا | — | نعم (4) | مخفي |
| 27 | سند جديد | `/finance/vouchers/create` | `artifacts/ghayth-erp/src/pages/create/finance/vouchers-create.tsx` | finance | لا | — | نعم (8) | مخفي |
| 28 | إضافة فئة استقطاع | `/finance/wht-categories/create` | `artifacts/ghayth-erp/src/pages/create/finance/wht-categories-create.tsx` | finance | لا | — | نعم (3) | مخفي |
| 29 | wht-categories-edit | `/finance/wht-categories/:id/edit` | `artifacts/ghayth-erp/src/pages/create/finance/wht-categories-edit.tsx` | finance | لا | — | نعم (4) | مخفي |
| 30 | ورقة عمل تسوية حساب | `/finance/account-recon-workpaper` | `artifacts/ghayth-erp/src/pages/finance/account-reconciliation-workpaper.tsx` | finance | نعم | — | نعم (3) | جاهز |
| 31 | account-statement | `غير مسجل` | `artifacts/ghayth-erp/src/pages/finance/account-statement.tsx` | finance | لا | — | نعم (2) | dead |
| 32 | تعديل | `/finance/accounts` | `artifacts/ghayth-erp/src/pages/finance/accounts.tsx` | finance | نعم | — | نعم (3) | جاهز |
| 33 | تشخيص محرك التوجيه (Allocation Coverage) | `/finance/allocation-coverage` | `artifacts/ghayth-erp/src/pages/finance/allocation-coverage.tsx` | finance | نعم | — | نعم (2) | جاهز |
| 34 | سجل تجاوزات تخصيص البنود | `/finance/allocation-override-log` | `artifacts/ghayth-erp/src/pages/finance/allocation-override-log.tsx` | finance | نعم | — | نعم (2) | جاهز |
| 35 | سجل توجيه البنود (Allocation Audit Trail) | `/finance/allocation-results` | `artifacts/ghayth-erp/src/pages/finance/allocation-results.tsx` | finance | نعم | — | نعم (2) | جاهز |
| 36 | تعديل القاعدة | `/finance/allocation-rules` | `artifacts/ghayth-erp/src/pages/finance/allocation-rules.tsx` | finance | نعم | — | نعم (2) | جاهز |
| 37 | تقرير تقادم الذمم الدائنة | `/finance/ap-aging` | `artifacts/ghayth-erp/src/pages/finance/ap-aging.tsx` | finance | نعم | — | نعم (2) | جاهز |
| 38 | تقويم الدفعات للموردين | `/finance/ap-payment-calendar` | `artifacts/ghayth-erp/src/pages/finance/ap-payment-calendar.tsx` | finance | نعم | — | نعم (2) | جاهز |
| 39 | صندوق الموافقات الموحد (Approvals Inbox) | `/finance/approvals-inbox` | `artifacts/ghayth-erp/src/pages/finance/approvals-inbox.tsx` | finance | نعم | — | نعم (11) | جاهز |
| 40 | تقرير تقادم الذمم المدينة | `/finance/ar-aging` | `artifacts/ghayth-erp/src/pages/finance/ar-aging.tsx` | finance | نعم | — | نعم (2) | جاهز |
| 41 | منضدة عمل التحصيل | `/finance/ar-collection-workbench` | `artifacts/ghayth-erp/src/pages/finance/ar-collection-workbench.tsx` | finance | نعم | — | نعم (2) | جاهز |
| 42 | مخصص ديون مشكوك فيها | `/finance/bad-debt-provision` | `artifacts/ghayth-erp/src/pages/finance/bad-debt-provision.tsx` | finance | نعم | — | نعم (3) | جاهز |
| 43 | مخصص الديون المشكوك في تحصيلها | `/finance/bad-debt` | `artifacts/ghayth-erp/src/pages/finance/bad-debt.tsx` | finance | نعم | — | نعم (3) | جاهز |
| 44 | مراقبة الحسابات البنكية | `/finance/bank-accounts-watch` | `artifacts/ghayth-erp/src/pages/finance/bank-accounts-watch.tsx` | finance | نعم | — | نعم (14) | جاهز |
| 45 | الضمانات البنكية | `/finance/bank-guarantees` | `artifacts/ghayth-erp/src/pages/finance/bank-guarantees.tsx` | finance | نعم | — | نعم (9) | جاهز |
| 46 | التسوية البنكية | `/finance/bank-reconciliation` | `artifacts/ghayth-erp/src/pages/finance/bank-reconciliation.tsx` | finance | نعم | — | نعم (6) | جاهز |
| 47 | اعتمادات تجاوز الميزانية | `/finance/budget-approvals` | `artifacts/ghayth-erp/src/pages/finance/budget-approvals.tsx` | finance | نعم | — | نعم (3) | جاهز |
| 48 | خريطة حرارية للميزانية | `/finance/budget-heatmap` | `artifacts/ghayth-erp/src/pages/finance/budget-heatmap.tsx` | finance | نعم | — | نعم (13) | جاهز |
| 49 | تقرير انحراف الميزانية | `/finance/budget-variance` | `artifacts/ghayth-erp/src/pages/finance/budget-variance.tsx` | finance | نعم | — | نعم (2) | جاهز |
| 50 | الميزانية | `/finance/budget` | `artifacts/ghayth-erp/src/pages/finance/budget.tsx` | finance | نعم | — | نعم (2) | جاهز |
| 51 | تدفق نقدي 13 أسبوع (13-Week Cash Flow) | `/finance/cash-13week` | `artifacts/ghayth-erp/src/pages/finance/cash-13week.tsx` | finance | نعم | — | نعم (2) | جاهز |
| 52 | تقويم السيولة (Cash Calendar) | `/finance/cash-calendar` | `artifacts/ghayth-erp/src/pages/finance/cash-calendar.tsx` | finance | نعم | — | نعم (2) | جاهز |
| 53 | توقعات التدفق النقدي | `/finance/cash-flow-forecast` | `artifacts/ghayth-erp/src/pages/finance/cash-flow-forecast.tsx` | finance | نعم | — | نعم (2) | جاهز |
| 54 | قائمة التدفقات النقدية | `/finance/reports/cash-flow-statement` | `artifacts/ghayth-erp/src/pages/finance/cash-flow-statement.tsx` | finance | نعم | — | نعم (2) | جاهز |
| 55 | حاسبة الوضع النقدي | `/finance/cash-position-calculator` | `artifacts/ghayth-erp/src/pages/finance/cash-position-calculator.tsx` | finance | نعم | — | نعم (4) | جاهز |
| 56 | لوحة التدفق النقدي | `/finance/cashflow` | `artifacts/ghayth-erp/src/pages/finance/cashflow-dashboard.tsx` | finance | نعم | — | نعم (5) | جاهز |
| 57 | لوحة المدير المالي اليومية (CFO Cockpit) | `/finance/cfo-cockpit` | `artifacts/ghayth-erp/src/pages/finance/cfo-cockpit.tsx` | finance | نعم | — | نعم (8) | جاهز |
| 58 | ملخص التكلفة وهامش الربح (COGS) | `/finance/reports/cogs-summary` | `artifacts/ghayth-erp/src/pages/finance/cogs-summary.tsx` | finance | نعم | — | نعم (2) | جاهز |
| 59 | مراحل تحصيل الفواتير المتأخرة | `/finance/collection` | `artifacts/ghayth-erp/src/pages/finance/collection-stages.tsx` | finance | نعم | — | نعم (3) | جاهز |
| 60 | التحصيل والمتابعة | `/finance/collections` | `artifacts/ghayth-erp/src/pages/finance/collections.tsx` | finance | نعم | — | نعم (4) | جاهز |
| 61 | الالتزامات المالية | `/finance/commitments` | `artifacts/ghayth-erp/src/pages/finance/commitments.tsx` | finance | نعم | — | نعم (2) | جاهز |
| 62 | مقارنة ربحية مراكز التكلفة | `/finance/cost-center-pnl` | `artifacts/ghayth-erp/src/pages/finance/cost-center-pnl.tsx` | finance | نعم | — | نعم (2) | جاهز |
| 63 | تفاصيل | `/finance/cost-centers` | `artifacts/ghayth-erp/src/pages/finance/cost-centers.tsx` | finance | نعم | — | نعم (6) | جاهز |
| 64 | عرض | `/finance/custodies` | `artifacts/ghayth-erp/src/pages/finance/custodies.tsx` | finance | نعم | — | نعم (10) | جاهز |
| 65 | تقرير أعمار العهد | `/finance/custodies/report` | `artifacts/ghayth-erp/src/pages/finance/custody-aging-report.tsx` | finance | نعم | — | نعم (2) | جاهز |
| 66 | custody-detail | `/finance/custodies/:id` | `artifacts/ghayth-erp/src/pages/finance/custody-detail.tsx` | finance | لا | — | نعم (3) | مخفي |
| 67 | منضدة عمل العُهد | `/finance/custody-workbench` | `artifacts/ghayth-erp/src/pages/finance/custody-workbench.tsx` | finance | نعم | — | نعم (2) | جاهز |
| 68 | ملف العميل 360° | `/finance/customer-360-sheet` | `artifacts/ghayth-erp/src/pages/finance/customer-360-sheet.tsx` | finance | نعم | — | نعم (4) | جاهز |
| 69 | منضدة الدفعات المقدمة | `/finance/customer-advances-workbench` | `artifacts/ghayth-erp/src/pages/finance/customer-advances-workbench.tsx` | finance | نعم | — | نعم (2) | جاهز |
| 70 | دفعات مقدمة من العملاء | `/finance/customer-advances` | `artifacts/ghayth-erp/src/pages/finance/customer-advances.tsx` | finance | نعم | — | نعم (2) | جاهز |
| 71 | تحليل مخاطر العملاء (Customer Risk Dashboard) | `/finance/customer-risk` | `artifacts/ghayth-erp/src/pages/finance/customer-risk.tsx` | finance | نعم | — | نعم (3) | جاهز |
| 72 | كشف حساب عميل قابل للطباعة | `/finance/customer-statement-print` | `artifacts/ghayth-erp/src/pages/finance/customer-statement-print.tsx` | finance | نعم | — | نعم (2) | جاهز |
| 73 | customer-statement | `/clients/:id/statement` | `artifacts/ghayth-erp/src/pages/finance/customer-statement.tsx` | finance | لا | — | لا | مخفي |
| 74 | فحص الإغلاق اليومي | `/finance/daily-close-checklist` | `artifacts/ghayth-erp/src/pages/finance/daily-close-checklist.tsx` | finance | نعم | — | نعم (9) | جاهز |
| 75 | لوحة المالية | `/finance` | `artifacts/ghayth-erp/src/pages/finance/dashboard.tsx` | finance | لا | — | نعم (7) | جاهز |
| 76 | متابعة تحصيل الذمم (Dunning) | `/finance/dunning` | `artifacts/ghayth-erp/src/pages/finance/dunning.tsx` | finance | نعم | — | نعم (4) | جاهز |
| 77 | نظرة شاملة على كيان (Entity 360) | `/finance/entity-360` | `artifacts/ghayth-erp/src/pages/finance/entity-360.tsx` | finance | نعم | — | نعم (2) | جاهز |
| 78 | كشوف الحسابات والحركات الفرعية | `/finance/entity-statements` | `artifacts/ghayth-erp/src/pages/finance/entity-statements.tsx` | finance | نعم | — | نعم (5) | جاهز |
| 79 | اعتماد المصاريف بالجملة | `/finance/expense-bulk-approvals` | `artifacts/ghayth-erp/src/pages/finance/expense-bulk-approvals.tsx` | finance | نعم | — | نعم (3) | جاهز |
| 80 | معدل الحرق وفترة البقاء | `/finance/expense-burn-rate` | `artifacts/ghayth-erp/src/pages/finance/expense-burn-rate.tsx` | finance | نعم | — | نعم (8) | جاهز |
| 81 | مرتبط بنظام حكومي | `/finance/expenses` | `artifacts/ghayth-erp/src/pages/finance/expenses.tsx` | finance | نعم | — | نعم (2) | جاهز |
| 82 | مركز سير عمل المالية | `/finance/workflows-hub` | `artifacts/ghayth-erp/src/pages/finance/finance-workflows-hub.tsx` | finance | نعم | — | لا | يحتاج ربط backend (hub أو placeholder) |
| 83 | الطلبات المالية | `/finance/financial-requests` | `artifacts/ghayth-erp/src/pages/finance/financial-requests.tsx` | finance | نعم | — | نعم (2) | جاهز |
| 84 | إقفال الفترات المالية | `/finance/fiscal-periods-v2` | `artifacts/ghayth-erp/src/pages/finance/fiscal-periods-v2.tsx` | finance | نعم | — | نعم (6) | جاهز |
| 85 | الفترات المالية | `/finance/fiscal-periods` | `artifacts/ghayth-erp/src/pages/finance/fiscal-periods.tsx` | finance | نعم | — | نعم (5) | جاهز |
| 86 | سجل الأصول الثابتة | `/finance/fixed-asset-register` | `artifacts/ghayth-erp/src/pages/finance/fixed-asset-register.tsx` | finance | نعم | — | نعم (2) | جاهز |
| 87 | الأصول الثابتة والإهلاك | `/finance/fixed-assets` | `artifacts/ghayth-erp/src/pages/finance/fixed-assets.tsx` | finance | نعم | — | نعم (5) | جاهز |
| 88 | أسعار صرف العملات (FX Rates) | `/finance/fx-rates` | `artifacts/ghayth-erp/src/pages/finance/fx-rates.tsx` | finance | نعم | — | نعم (3) | جاهز |
| 89 | سجل إعادة تقييم العملات | `/finance/fx-revaluation/history` | `artifacts/ghayth-erp/src/pages/finance/fx-revaluation-history.tsx` | finance | نعم | — | نعم (2) | جاهز |
| 90 | إعادة تقييم العملات الأجنبية (FX Revaluation) | `/finance/fx-revaluation` | `artifacts/ghayth-erp/src/pages/finance/fx-revaluation.tsx` | finance | نعم | — | نعم (3) | جاهز |
| 91 | كاشف الشذوذ في القيود | `/finance/gl-anomaly-detector` | `artifacts/ghayth-erp/src/pages/finance/gl-anomaly-detector.tsx` | finance | نعم | — | نعم (2) | جاهز |
| 92 | مؤشر صحة النظام المالي (GL Health Score) | `/finance/gl-health` | `artifacts/ghayth-erp/src/pages/finance/gl-health-score.tsx` | finance | نعم | — | نعم (8) | جاهز |
| 93 | فجوات سلامة الـ GL (قبل إقفال الفترة) | `/finance/reports/gl-integrity-gaps` | `artifacts/ghayth-erp/src/pages/finance/gl-integrity-gaps.tsx` | finance | نعم | — | نعم (2) | جاهز |
| 94 | قائمة الانتظار للترحيل المحاسبي | `/finance/gl-posting-queue` | `artifacts/ghayth-erp/src/pages/finance/gl-posting-queue.tsx` | finance | نعم | — | نعم (11) | جاهز |
| 95 | قائمة الدخل — اتجاه شهري متعدد الفترات | `/finance/reports/is-trend` | `artifacts/ghayth-erp/src/pages/finance/income-statement-trend.tsx` | finance | نعم | — | نعم (4) | جاهز |
| 96 | قائمة الدخل مقابل الميزانية | `/finance/reports/is-vs-budget` | `artifacts/ghayth-erp/src/pages/finance/income-statement-vs-budget.tsx` | finance | نعم | — | نعم (3) | جاهز |
| 97 | المعاملات البينية | `/finance/intercompany` | `artifacts/ghayth-erp/src/pages/finance/intercompany.tsx` | finance | نعم | — | نعم (4) | جاهز |
| 98 | تقييم المخزون بالمتوسط المرجح | `/finance/inventory-costing` | `artifacts/ghayth-erp/src/pages/finance/inventory-costing.tsx` | finance | نعم | — | نعم (5) | جاهز |
| 99 | معدل دوران المخزون | `/finance/reports/inventory-turnover` | `artifacts/ghayth-erp/src/pages/finance/inventory-turnover.tsx` | finance | نعم | — | نعم (2) | جاهز |
| 100 | تقييم المخزون | `/finance/reports/inventory-valuation` | `artifacts/ghayth-erp/src/pages/finance/inventory-valuation.tsx` | finance | نعم | — | نعم (2) | جاهز |
| 101 | invoice-detail | `/finance/invoices/:id` | `artifacts/ghayth-erp/src/pages/finance/invoice-detail.tsx` | finance | لا | — | نعم (9) | مخفي |
| 102 | صف إرسال الفواتير | `/finance/invoice-send-queue` | `artifacts/ghayth-erp/src/pages/finance/invoice-send-queue.tsx` | finance | نعم | — | نعم (2) | جاهز |
| 103 | عرض التفاصيل | `/finance/invoices` | `artifacts/ghayth-erp/src/pages/finance/invoices.tsx` | finance | نعم | — | نعم (3) | جاهز |
| 104 | journal-detail | `/finance/journal/:id` | `artifacts/ghayth-erp/src/pages/finance/journal-detail.tsx` | finance | لا | — | نعم (4) | مخفي |
| 105 | journal-manual-detail | `/finance/journal-manual/:id` | `artifacts/ghayth-erp/src/pages/finance/journal-manual-detail.tsx` | finance | لا | — | نعم (9) | مخفي |
| 106 | القيود اليدوية | `/finance/journal-manual` | `artifacts/ghayth-erp/src/pages/finance/journal-manual.tsx` | finance | نعم | — | نعم (5) | جاهز |
| 107 | قوالب القيود المحاسبية | `/finance/journal-templates` | `artifacts/ghayth-erp/src/pages/finance/journal-templates.tsx` | finance | نعم | — | نعم (5) | جاهز |
| 108 | عكس القيد | `/finance/journal` | `artifacts/ghayth-erp/src/pages/finance/journal.tsx` | finance | نعم | — | نعم (4) | جاهز |
| 109 | الانتقال | `/finance/ledger/:code` | `artifacts/ghayth-erp/src/pages/finance/ledger.tsx` | finance | لا | — | نعم (2) | جاهز |
| 110 | تنبيهات صلاحية التشغيلات | `/finance/reports/lot-expiry-alerts` | `artifacts/ghayth-erp/src/pages/finance/lot-expiry-alerts.tsx` | finance | نعم | — | نعم (2) | جاهز |
| 111 | حزمة الإقفال الشهري | `/finance/monthly-close-pack` | `artifacts/ghayth-erp/src/pages/finance/monthly-close-pack.tsx` | finance | نعم | — | نعم (7) | جاهز |
| 112 | تشغيلات بمخزون سالب | `/finance/reports/negative-stock` | `artifacts/ghayth-erp/src/pages/finance/negative-stock.tsx` | finance | نعم | — | نعم (2) | جاهز |
| 113 | الأرصدة الافتتاحية | `/finance/opening-balances` | `artifacts/ghayth-erp/src/pages/finance/opening-balances.tsx` | finance | نعم | — | نعم (2) | جاهز |
| 114 | سجل التعديلات اليدوية (Manual Overrides) | `/finance/overrides-report` | `artifacts/ghayth-erp/src/pages/finance/overrides-report.tsx` | finance | نعم | — | نعم (2) | جاهز |
| 115 | دفعة الدفع الجماعية | `/finance/payment-run` | `artifacts/ghayth-erp/src/pages/finance/payment-run.tsx` | finance | نعم | — | نعم (4) | جاهز |
| 116 | المدفوعات | `/finance/payments` | `artifacts/ghayth-erp/src/pages/finance/payments-page.tsx` | finance | نعم | — | نعم (2) | جاهز |
| 117 | الفحص ما قبل إقفال الفترة | `/finance/period-close-preflight` | `artifacts/ghayth-erp/src/pages/finance/period-close-preflight.tsx` | finance | نعم | — | نعم (14) | جاهز |
| 118 | نشاط الترحيل المحاسبي اليومي | `/finance/journal/activity` | `artifacts/ghayth-erp/src/pages/finance/posting-activity.tsx` | finance | نعم | — | نعم (2) | جاهز |
| 119 | قواعد التسعير | `/finance/pricing-rules` | `artifacts/ghayth-erp/src/pages/finance/pricing-rules.tsx` | finance | نعم | — | نعم (5) | جاهز |
| 120 | كتالوج المنتجات والخدمات المحاسبي | `/finance/product-catalog` | `artifacts/ghayth-erp/src/pages/finance/product-catalog.tsx` | finance | نعم | — | نعم (2) | جاهز |
| 121 | profitability-project | `/finance/profitability/project/:id` | `artifacts/ghayth-erp/src/pages/finance/profitability-project.tsx` | finance | لا | — | لا | مخفي |
| 122 | profitability-property | `/finance/profitability/property/:id` | `artifacts/ghayth-erp/src/pages/finance/profitability-property.tsx` | finance | لا | — | لا | مخفي |
| 123 | profitability-umrah-agent | `/finance/profitability/umrah-agent/:id` | `artifacts/ghayth-erp/src/pages/finance/profitability-umrah-agent.tsx` | finance | لا | — | لا | مخفي |
| 124 | profitability-vehicle | `/finance/profitability/vehicle/:id` | `artifacts/ghayth-erp/src/pages/finance/profitability-vehicle.tsx` | finance | لا | — | لا | مخفي |
| 125 | profitability | `غير مسجل` | `artifacts/ghayth-erp/src/pages/finance/profitability.tsx` | finance | لا | — | نعم (6) | dead |
| 126 | project-costing-detail | `/finance/project-costing/:id` | `artifacts/ghayth-erp/src/pages/finance/project-costing-detail.tsx` | finance | لا | — | نعم (4) | مخفي |
| 127 | تكاليف المشاريع | `/finance/project-costing` | `artifacts/ghayth-erp/src/pages/finance/project-costing.tsx` | finance | نعم | — | نعم (4) | جاهز |
| 128 | purchase-order-detail | `/finance/purchase-orders/:id` | `artifacts/ghayth-erp/src/pages/finance/purchase-order-detail.tsx` | finance | لا | — | نعم (4) | مخفي |
| 129 | نسخ طلب الشراء | `/finance/purchase-orders` | `artifacts/ghayth-erp/src/pages/finance/purchase-orders.tsx` | finance | نعم | — | نعم (3) | جاهز |
| 130 | تحويل مباشر إلى PO (Shift = المسار القديم) | `/finance/purchase-requests` | `artifacts/ghayth-erp/src/pages/finance/purchase-requests.tsx` | finance | نعم | — | نعم (6) | جاهز |
| 131 | عرض | `/finance/receivables` | `artifacts/ghayth-erp/src/pages/finance/receivables.tsx` | finance | نعم | — | نعم (2) | جاهز |
| 132 | مركز التسوية المحاسبية (Reconciliation Hub) | `/finance/reconciliation-hub` | `artifacts/ghayth-erp/src/pages/finance/reconciliation-hub.tsx` | finance | نعم | — | نعم (7) | جاهز |
| 133 | تقويم القيود المتكررة | `/finance/recurring-calendar` | `artifacts/ghayth-erp/src/pages/finance/recurring-calendar.tsx` | finance | نعم | — | نعم (2) | جاهز |
| 134 | recurring-journal-detail | `/finance/recurring-journals/:id` | `artifacts/ghayth-erp/src/pages/finance/recurring-journal-detail.tsx` | finance | لا | — | نعم (2) | مخفي |
| 135 | تنفيذ الآن | `/finance/recurring-journals` | `artifacts/ghayth-erp/src/pages/finance/recurring-journals.tsx` | finance | نعم | — | نعم (5) | جاهز |
| 136 | التقارير المالية المتقدمة | `/finance/reports` | `artifacts/ghayth-erp/src/pages/finance/reports.tsx` | finance | نعم | — | نعم (14) | جاهز |
| 137 | سلف الرواتب | `/finance/salary-advances` | `artifacts/ghayth-erp/src/pages/finance/salary-advances.tsx` | finance | نعم | — | نعم (5) | جاهز |
| 138 | مركز إعدادات النظام المالي | `/finance/settings` | `artifacts/ghayth-erp/src/pages/finance/settings-hub.tsx` | finance | نعم | — | نعم (2) | جاهز |
| 139 | الحسابات الفرعية | `/finance/subsidiary-accounts` | `artifacts/ghayth-erp/src/pages/finance/subsidiary-accounts.tsx` | finance | نعم | — | نعم (5) | جاهز |
| 140 | تعديل | `/finance/tax-codes` | `artifacts/ghayth-erp/src/pages/finance/tax-codes.tsx` | finance | نعم | — | نعم (2) | جاهز |
| 141 | تقويم الإقرارات الضريبية | `/finance/tax-filing-calendar` | `artifacts/ghayth-erp/src/pages/finance/tax-filing-calendar.tsx` | finance | نعم | — | لا | يحتاج ربط backend (hub أو placeholder) |
| 142 | نظام الضرائب والفوترة الإلكترونية | `/finance/tax` | `artifacts/ghayth-erp/src/pages/finance/tax-system.tsx` | finance | نعم | — | نعم (5) | جاهز |
| 143 | دفتر الأستاذ | `/finance/treasury` | `artifacts/ghayth-erp/src/pages/finance/treasury.tsx` | finance | نعم | — | نعم (2) | جاهز |
| 144 | مقارنة ميزان المراجعة (Trial Balance Comparison) | `/finance/trial-balance-comparison` | `artifacts/ghayth-erp/src/pages/finance/trial-balance-comparison.tsx` | finance | نعم | — | نعم (3) | جاهز |
| 145 | ميزان المراجعة مع التتبّع | `/finance/trial-balance-drilldown` | `artifacts/ghayth-erp/src/pages/finance/trial-balance-drilldown.tsx` | finance | نعم | — | نعم (3) | جاهز |
| 146 | البنود غير المُوجَّهة (قبل الإقفال) | `/finance/reports/unmapped-lines` | `artifacts/ghayth-erp/src/pages/finance/unmapped-lines.tsx` | finance | نعم | — | نعم (2) | جاهز |
| 147 | جاهزية إقرار ZATCA | `/finance/vat-filing-readiness` | `artifacts/ghayth-erp/src/pages/finance/vat-filing-readiness.tsx` | finance | نعم | — | نعم (4) | جاهز |
| 148 | مطابقة ضريبة القيمة المضافة | `/finance/reports/vat-reconciliation` | `artifacts/ghayth-erp/src/pages/finance/vat-reconciliation.tsx` | finance | نعم | — | نعم (2) | جاهز |
| 149 | لوحة محفظة المركبات | `/finance/vehicle-portfolio` | `artifacts/ghayth-erp/src/pages/finance/vehicle-portfolio-dashboard.tsx` | finance | نعم | — | نعم (14) | جاهز |
| 150 | ملف المورد 360° | `/finance/vendor-360-sheet` | `artifacts/ghayth-erp/src/pages/finance/vendor-360-sheet.tsx` | finance | نعم | — | نعم (5) | جاهز |
| 151 | متابعة عقود الموردين | `/finance/vendor-contracts-tracker` | `artifacts/ghayth-erp/src/pages/finance/vendor-contracts-tracker.tsx` | finance | نعم | — | نعم (2) | جاهز |
| 152 | تفاصيل | `/finance/contracts` | `artifacts/ghayth-erp/src/pages/finance/vendor-contracts.tsx` | finance | نعم | — | نعم (5) | جاهز |
| 153 | vendor-detail | `/finance/vendors/:id` | `artifacts/ghayth-erp/src/pages/finance/vendor-detail.tsx` | finance | لا | — | نعم (6) | مخفي |
| 154 | منضدة تسوية الموردين | `/finance/vendor-settlement-workbench` | `artifacts/ghayth-erp/src/pages/finance/vendor-settlement-workbench.tsx` | finance | نعم | — | نعم (2) | جاهز |
| 155 | تحليل الإنفاق على الموردين (Vendor Spend Analysis) | `/finance/vendor-spend` | `artifacts/ghayth-erp/src/pages/finance/vendor-spend.tsx` | finance | نعم | — | نعم (4) | جاهز |
| 156 | كشف حساب مورد قابل للطباعة | `/finance/vendor-statement-print` | `artifacts/ghayth-erp/src/pages/finance/vendor-statement-print.tsx` | finance | نعم | — | نعم (2) | جاهز |
| 157 | vendor-statement | `/finance/vendors/:id/statement` | `artifacts/ghayth-erp/src/pages/finance/vendor-statement.tsx` | finance | لا | — | لا | مخفي |
| 158 | الموردون | `/finance/vendors` | `artifacts/ghayth-erp/src/pages/finance/vendors.tsx` | finance | نعم | — | نعم (2) | جاهز |
| 159 | السندات | `/finance/vouchers` | `artifacts/ghayth-erp/src/pages/finance/vouchers.tsx` | finance | نعم | — | نعم (2) | جاهز |
| 160 | تعديل | `/finance/wht-categories` | `artifacts/ghayth-erp/src/pages/finance/wht-categories.tsx` | finance | نعم | — | نعم (2) | جاهز |
| 161 | إعداد إقرار الاستقطاع WHT | `/finance/wht-filing-workbench` | `artifacts/ghayth-erp/src/pages/finance/wht-filing-workbench.tsx` | finance | نعم | — | نعم (2) | جاهز |
| 162 | ملخص استقطاع ضريبة الدخل (WHT) | `/finance/reports/wht-summary` | `artifacts/ghayth-erp/src/pages/finance/wht-summary.tsx` | finance | نعم | — | نعم (2) | جاهز |
| 163 | إقفال السنة المالية | `/finance/year-end-close` | `artifacts/ghayth-erp/src/pages/finance/year-end-close.tsx` | finance | نعم | — | نعم (3) | جاهز |
| 164 | مقارنة YTD سنة بسنة | `/finance/reports/yoy` | `artifacts/ghayth-erp/src/pages/finance/yoy-comparison.tsx` | finance | نعم | — | نعم (3) | جاهز |
| 165 | تقارير الضرائب والمخزون | `/finance/reports/zatca` | `artifacts/ghayth-erp/src/pages/finance/zatca-reports-hub.tsx` | finance | نعم | — | لا | يحتاج ربط backend (hub أو placeholder) |

</details>

### 4.5 Fleet (الأسطول)  (28 صفحة)

<details>
<summary>عرض الجدول</summary>

| # | اسم الصفحة | مسار التوجيه | مسار الملف | الخدمة الفرعية | في القائمة؟ | صلاحية | API؟ | الحالة |
|---|---|---|---|---|---|---|---|---|
| 1 | إضافة سائق جديد | `/fleet/drivers/create` | `artifacts/ghayth-erp/src/pages/create/fleet/drivers-create.tsx` | fleet | لا | — | نعم (3) | مخفي |
| 2 | تسجيل تعبئة وقود | `/fleet/fuel/create` | `artifacts/ghayth-erp/src/pages/create/fleet/fuel-create.tsx` | fleet | لا | — | نعم (2) | مخفي |
| 3 | إضافة تأمين مركبة | `/fleet/insurance/create` | `artifacts/ghayth-erp/src/pages/create/fleet/insurance-create.tsx` | fleet | لا | — | نعم (2) | مخفي |
| 4 | إضافة صيانة مركبة | `/fleet/maintenance/create` | `artifacts/ghayth-erp/src/pages/create/fleet/maintenance-create.tsx` | fleet | لا | — | نعم (2) | مخفي |
| 5 | رحلة جديدة | `/fleet/trips/create` | `artifacts/ghayth-erp/src/pages/create/fleet/trips-create.tsx` | fleet | لا | — | نعم (2) | مخفي |
| 6 | تغيير حالة المركبة | `/fleet/:id/status` | `artifacts/ghayth-erp/src/pages/create/fleet/vehicle-status-change.tsx` | fleet | لا | — | نعم (2) | مخفي |
| 7 | إضافة مركبة جديدة | `/fleet/vehicles/create` | `artifacts/ghayth-erp/src/pages/create/fleet/vehicles-create.tsx` | fleet | لا | — | نعم (2) | مخفي |
| 8 | إدارة الأسطول | `/fleet` | `artifacts/ghayth-erp/src/pages/fleet.tsx` | Fleet | نعم | — | نعم (8) | جاهز |
| 9 | تنبيهات الأسطول | `/fleet/alerts` | `artifacts/ghayth-erp/src/pages/fleet/alerts.tsx` | fleet | نعم | — | نعم (4) | جاهز |
| 10 | السائقين | `/fleet/drivers` | `artifacts/ghayth-erp/src/pages/fleet/drivers.tsx` | fleet | نعم | — | نعم (2) | جاهز |
| 11 | استهلاك الوقود | `/fleet/fuel` | `artifacts/ghayth-erp/src/pages/fleet/fuel.tsx` | fleet | نعم | — | نعم (2) | جاهز |
| 12 | التأمين | `/fleet/insurance` | `artifacts/ghayth-erp/src/pages/fleet/insurance.tsx` | fleet | نعم | — | نعم (2) | جاهز |
| 13 | صيانة المركبات | `/fleet/maintenance` | `artifacts/ghayth-erp/src/pages/fleet/maintenance.tsx` | fleet | نعم | — | نعم (2) | جاهز |
| 14 | خطط الصيانة الوقائية | `/fleet/preventive-plans` | `artifacts/ghayth-erp/src/pages/fleet/preventive-plans.tsx` | fleet | نعم | — | نعم (5) | جاهز |
| 15 | تقارير الأسطول | `/fleet/reports` | `artifacts/ghayth-erp/src/pages/fleet/reports.tsx` | fleet | نعم | — | نعم (2) | جاهز |
| 16 | تحليل التكلفة الكلية للمركبة | `/fleet/tco` | `artifacts/ghayth-erp/src/pages/fleet/tco.tsx` | fleet | نعم | — | نعم (3) | جاهز |
| 17 | حل التنبيه | `/fleet/telematics/ai-alerts` | `artifacts/ghayth-erp/src/pages/fleet/telematics/ai-alerts.tsx` | fleet | نعم | — | نعم (5) | جاهز |
| 18 | فتح بث القناة 1 (HLS) | `/fleet/telematics/devices` | `artifacts/ghayth-erp/src/pages/fleet/telematics/devices.tsx` | fleet | نعم | — | نعم (5) | جاهز |
| 19 | تفاصيل الدليل | `/fleet/telematics/evidence` | `artifacts/ghayth-erp/src/pages/fleet/telematics/evidence.tsx` | fleet | نعم | — | نعم (4) | جاهز |
| 20 | الخريطة المباشرة للأسطول | `/fleet/telematics (+1)` | `artifacts/ghayth-erp/src/pages/fleet/telematics/live-map.tsx` | fleet | نعم | — | نعم (3) | جاهز |
| 21 | تشغيل التتبع — مراقبة CMSV6 و breakers | `/fleet/telematics/operations` | `artifacts/ghayth-erp/src/pages/fleet/telematics/operations.tsx` | fleet | نعم | — | نعم (5) | جاهز |
| 22 | بطاقة أداء السلامة للسائقين | `/fleet/telematics/scorecard` | `artifacts/ghayth-erp/src/pages/fleet/telematics/scorecard.tsx` | fleet | نعم | — | نعم (3) | جاهز |
| 23 | قراءات الحساسات | `/fleet/telematics/sensors` | `artifacts/ghayth-erp/src/pages/fleet/telematics/sensors.tsx` | fleet | نعم | — | نعم (3) | جاهز |
| 24 | إعدادات تكامل CMSV6 | `/fleet/telematics/settings` | `artifacts/ghayth-erp/src/pages/fleet/telematics/settings.tsx` | fleet | نعم | — | نعم (6) | جاهز |
| 25 | سجل الوصول | `/fleet/telematics/video-evidence` | `artifacts/ghayth-erp/src/pages/fleet/telematics/video-evidence.tsx` | fleet | نعم | — | نعم (4) | جاهز |
| 26 | المخالفات المرورية | `/fleet/traffic-violations` | `artifacts/ghayth-erp/src/pages/fleet/traffic-violations.tsx` | fleet | نعم | — | نعم (4) | جاهز |
| 27 | trip-detail | `/fleet/trips/:id` | `artifacts/ghayth-erp/src/pages/fleet/trip-detail.tsx` | fleet | لا | — | نعم (4) | مخفي |
| 28 | الرحلات | `/fleet/trips` | `artifacts/ghayth-erp/src/pages/fleet/trips.tsx` | fleet | نعم | — | نعم (2) | جاهز |

</details>

### 4.6 Property (الأملاك)  (23 صفحة)

<details>
<summary>عرض الجدول</summary>

| # | اسم الصفحة | مسار التوجيه | مسار الملف | الخدمة الفرعية | في القائمة؟ | صلاحية | API؟ | الحالة |
|---|---|---|---|---|---|---|---|---|
| 1 | إضافة مبنى جديد | `/properties/buildings/create` | `artifacts/ghayth-erp/src/pages/create/properties/buildings-create.tsx` | properties | لا | — | نعم (2) | مخفي |
| 2 | عقد إيجار جديد | `/properties/contracts/create` | `artifacts/ghayth-erp/src/pages/create/properties/contracts-create.tsx` | properties | لا | — | نعم (5) | مخفي |
| 3 | طلب صيانة جديد | `/properties/maintenance/create` | `artifacts/ghayth-erp/src/pages/create/properties/maintenance-create.tsx` | properties | لا | — | نعم (4) | مخفي |
| 4 | إضافة مالك جديد | `/properties/owners/create` | `artifacts/ghayth-erp/src/pages/create/properties/owners-create.tsx` | properties | لا | — | لا | مخفي |
| 5 | تعديل بيانات مالك العقار | `/properties/owners/:id/edit` | `artifacts/ghayth-erp/src/pages/create/properties/owners-edit.tsx` | properties | لا | — | نعم (2) | مخفي |
| 6 | تسجيل دفعة | `/properties/contracts/:contractId/pay/:installmentId` | `artifacts/ghayth-erp/src/pages/create/properties/payment-record.tsx` | properties | لا | — | نعم (2) | جاهز |
| 7 | تسجيل دفعة إيجار | `/properties/payments/:paymentId/pay` | `artifacts/ghayth-erp/src/pages/create/properties/payment-register.tsx` | properties | لا | — | نعم (2) | جاهز |
| 8 | إضافة مستأجر جديد | `/properties/tenants/create` | `artifacts/ghayth-erp/src/pages/create/properties/tenants-create.tsx` | properties | لا | — | نعم (2) | مخفي |
| 9 | تغيير حالة الوحدة | `/properties/:id/status` | `artifacts/ghayth-erp/src/pages/create/properties/unit-status-change.tsx` | properties | لا | — | نعم (2) | مخفي |
| 10 | تعديل | `/properties/buildings` | `artifacts/ghayth-erp/src/pages/properties-buildings.tsx` | Buildings | نعم | — | نعم (2) | جاهز |
| 11 | عقود الإيجار | `/properties/contracts` | `artifacts/ghayth-erp/src/pages/properties-contracts.tsx` | Contracts | نعم | — | نعم (3) | جاهز |
| 12 | لوحة تحكم الأملاك | `/properties/dashboard` | `artifacts/ghayth-erp/src/pages/properties-dashboard.tsx` | Dashboard | نعم | — | نعم (3) | جاهز |
| 13 | properties-guide | `/guide/properties (+1)` | `artifacts/ghayth-erp/src/pages/properties-guide.tsx` | Guide | نعم | — | لا | يحتاج ربط backend (hub أو placeholder) |
| 14 | طلبات الصيانة | `/properties/maintenance` | `artifacts/ghayth-erp/src/pages/properties-maintenance.tsx` | Maintenance | نعم | — | نعم (2) | جاهز |
| 15 | كشف حساب المالك | `/properties/owners/statement` | `artifacts/ghayth-erp/src/pages/properties-owner-statement.tsx` | Owners | نعم | — | نعم (5) | جاهز |
| 16 | الملاك | `/properties/owners` | `artifacts/ghayth-erp/src/pages/properties-owners.tsx` | Owners | نعم | — | نعم (2) | جاهز |
| 17 | مدفوعات الإيجار | `/properties/payments` | `artifacts/ghayth-erp/src/pages/properties-payments.tsx` | Payments | نعم | — | نعم (3) | جاهز |
| 18 | المستأجرون | `/properties/tenants` | `artifacts/ghayth-erp/src/pages/properties-tenants.tsx` | Tenants | نعم | — | نعم (2) | جاهز |
| 19 | عرض | `/properties` | `artifacts/ghayth-erp/src/pages/properties.tsx` | Properties | نعم | — | نعم (3) | جاهز |
| 20 | contract-detail | `/properties/contracts/:id` | `artifacts/ghayth-erp/src/pages/properties/contract-detail.tsx` | properties | لا | — | نعم (5) | مخفي |
| 21 | ودائع الضمان | `/properties/deposits` | `artifacts/ghayth-erp/src/pages/properties/deposits.tsx` | properties | نعم | — | نعم (4) | جاهز |
| 22 | فحص الوحدات العقارية | `/properties/inspections` | `artifacts/ghayth-erp/src/pages/properties/inspections.tsx` | properties | نعم | — | نعم (4) | جاهز |
| 23 | تقرير الإشغال العقاري | `/properties/occupancy-report` | `artifacts/ghayth-erp/src/pages/properties/occupancy-report.tsx` | properties | نعم | — | نعم (2) | جاهز |

</details>

### 4.7 Umrah (العمرة)  (26 صفحة)

<details>
<summary>عرض الجدول</summary>

| # | اسم الصفحة | مسار التوجيه | مسار الملف | الخدمة الفرعية | في القائمة؟ | صلاحية | API؟ | الحالة |
|---|---|---|---|---|---|---|---|---|
| 1 | تعديل | `/umrah/agents` | `artifacts/ghayth-erp/src/pages/umrah/agents.tsx` | umrah | نعم | — | نعم (5) | جاهز |
| 2 | مرفقات العمرة | `/umrah/attachments` | `artifacts/ghayth-erp/src/pages/umrah/attachments.tsx` | umrah | نعم | — | نعم (2) | جاهز |
| 3 | حسابات العمولات | `/umrah/commission-calculations` | `artifacts/ghayth-erp/src/pages/umrah/commission-calculations.tsx` | umrah | نعم | — | نعم (4) | جاهز |
| 4 | إعداد خطة عمولة لموظف ضمن موسم عمرة محدد | `/umrah/commission-plans/new (+1)` | `artifacts/ghayth-erp/src/pages/umrah/commission-plan-editor.tsx` | umrah | لا | — | نعم (7) | جاهز |
| 5 | احتساب العمولة للشهر الحالي | `/umrah/commission-plans` | `artifacts/ghayth-erp/src/pages/umrah/commission-plans.tsx` | umrah | نعم | — | نعم (6) | جاهز |
| 6 | كشف اليوم التشغيلي — عمرة | `/umrah/daily-runsheet` | `artifacts/ghayth-erp/src/pages/umrah/daily-runsheet.tsx` | umrah | نعم | — | نعم (2) | جاهز |
| 7 | لوحة تشغيل العمرة | `/umrah` | `artifacts/ghayth-erp/src/pages/umrah/dashboard.tsx` | umrah | نعم | — | نعم (3) | جاهز |
| 8 | المجموعات | `/umrah/groups` | `artifacts/ghayth-erp/src/pages/umrah/groups.tsx` | umrah | نعم | — | نعم (9) | جاهز |
| 9 | معالج استيراد العمرة | `/umrah/import` | `artifacts/ghayth-erp/src/pages/umrah/import-wizard.tsx` | umrah | نعم | — | نعم (9) | جاهز |
| 10 | استيراد المعتمرين | `/umrah/import/legacy` | `artifacts/ghayth-erp/src/pages/umrah/import.tsx` | umrah | نعم | — | نعم (3) | جاهز |
| 11 | فواتير العمرة | `/umrah/invoices` | `artifacts/ghayth-erp/src/pages/umrah/invoices.tsx` | umrah | نعم | — | نعم (16) | جاهز |
| 12 | تعديل | `/umrah/packages` | `artifacts/ghayth-erp/src/pages/umrah/packages.tsx` | umrah | نعم | — | نعم (6) | جاهز |
| 13 | مدفوعات العمرة | `/umrah/payments` | `artifacts/ghayth-erp/src/pages/umrah/payments.tsx` | umrah | نعم | — | نعم (4) | جاهز |
| 14 | الغرامات | `/umrah/penalties` | `artifacts/ghayth-erp/src/pages/umrah/penalties.tsx` | umrah | نعم | — | نعم (5) | جاهز |
| 15 | الانتقال | `/umrah/pilgrims/create` | `artifacts/ghayth-erp/src/pages/umrah/pilgrim-create.tsx` | umrah | لا | — | نعم (4) | مخفي |
| 16 | تعديل بيانات المعتمر | `/umrah/pilgrims/:id` | `artifacts/ghayth-erp/src/pages/umrah/pilgrim-detail.tsx` | umrah | لا | — | نعم (4) | مخفي |
| 17 | المعتمرين | `/umrah/pilgrims` | `artifacts/ghayth-erp/src/pages/umrah/pilgrims.tsx` | umrah | نعم | — | نعم (9) | جاهز |
| 18 | تسعيرة العمرة | `/umrah/pricing` | `artifacts/ghayth-erp/src/pages/umrah/pricing.tsx` | umrah | نعم | — | نعم (8) | جاهز |
| 19 | تقرير المطابقة — نسك ↔ النظام | `/umrah/reconciliation` | `artifacts/ghayth-erp/src/pages/umrah/reconciliation.tsx` | umrah | نعم | — | نعم (2) | جاهز |
| 20 | إنشاء فاتورة مبيعات — معالج ذكي | `/umrah/sales-wizard` | `artifacts/ghayth-erp/src/pages/umrah/sales-wizard.tsx` | umrah | نعم | — | نعم (5) | جاهز |
| 21 | مواسم العمرة | `/umrah/seasons` | `artifacts/ghayth-erp/src/pages/umrah/seasons.tsx` | umrah | نعم | — | نعم (2) | جاهز |
| 22 | إعدادات العمرة | `/umrah/settings` | `artifacts/ghayth-erp/src/pages/umrah/settings.tsx` | umrah | لا | — | نعم (3) | جاهز |
| 23 | الوكلاء الفرعيون | `/umrah/sub-agents` | `artifacts/ghayth-erp/src/pages/umrah/sub-agents.tsx` | umrah | نعم | — | نعم (10) | جاهز |
| 24 | النقل والمواصلات | `/umrah/transport` | `artifacts/ghayth-erp/src/pages/umrah/transport.tsx` | umrah | نعم | — | نعم (2) | جاهز |
| 25 | تسجيل مخالفة عمرة | `/umrah/violations/create` | `artifacts/ghayth-erp/src/pages/umrah/violation-create.tsx` | umrah | لا | — | نعم (5) | مخفي |
| 26 | المخالفات | `/umrah/violations` | `artifacts/ghayth-erp/src/pages/umrah/violations.tsx` | umrah | نعم | — | نعم (8) | جاهز |

</details>

### 4.8 Operations / Projects  (4 صفحة)

<details>
<summary>عرض الجدول</summary>

| # | اسم الصفحة | مسار التوجيه | مسار الملف | الخدمة الفرعية | في القائمة؟ | صلاحية | API؟ | الحالة |
|---|---|---|---|---|---|---|---|---|
| 1 | عرض | `/projects` | `artifacts/ghayth-erp/src/pages/projects.tsx` | Projects | نعم | — | نعم (4) | جاهز |
| 2 | مخطط غانت | `/projects/gantt` | `artifacts/ghayth-erp/src/pages/projects/gantt.tsx` | projects | نعم | — | نعم (3) | جاهز |
| 3 | مخاطر المشاريع | `/projects/risks` | `artifacts/ghayth-erp/src/pages/projects/risks.tsx` | projects | نعم | — | نعم (3) | جاهز |
| 4 | معاينة سريعة | `/projects/tasks (+1)` | `artifacts/ghayth-erp/src/pages/tasks.tsx` | Tasks | نعم | — | نعم (6) | جاهز |

</details>

### 4.9 Operations / Warehouse  (6 صفحة)

<details>
<summary>عرض الجدول</summary>

| # | اسم الصفحة | مسار التوجيه | مسار الملف | الخدمة الفرعية | في القائمة؟ | صلاحية | API؟ | الحالة |
|---|---|---|---|---|---|---|---|---|
| 1 | تصنيف جديد | `/warehouse/categories/create` | `artifacts/ghayth-erp/src/pages/create/warehouse/categories-create.tsx` | warehouse | لا | — | نعم (2) | مخفي |
| 2 | حركة مخزون جديدة | `/warehouse/movements/create` | `artifacts/ghayth-erp/src/pages/create/warehouse/movements-create.tsx` | warehouse | لا | — | نعم (3) | مخفي |
| 3 | إضافة مورد جديد | `/warehouse/suppliers/create` | `artifacts/ghayth-erp/src/pages/create/warehouse/suppliers-create.tsx` | warehouse | لا | — | نعم (2) | مخفي |
| 4 | عمليات المستودع المتقدّمة | `/warehouse/advanced` | `artifacts/ghayth-erp/src/pages/warehouse-advanced.tsx` | Warehouse | نعم | — | نعم (14) | جاهز |
| 5 | إدارة المستودعات | `/warehouse (+3)` | `artifacts/ghayth-erp/src/pages/warehouse.tsx` | Warehouse | نعم | — | نعم (9) | جاهز |
| 6 | جرد المخزن | `/warehouse/inventory-count` | `artifacts/ghayth-erp/src/pages/warehouse/inventory-count.tsx` | warehouse | نعم | — | نعم (3) | جاهز |

</details>

### 4.10 Store (المتجر)  (3 صفحة)

<details>
<summary>عرض الجدول</summary>

| # | اسم الصفحة | مسار التوجيه | مسار الملف | الخدمة الفرعية | في القائمة؟ | صلاحية | API؟ | الحالة |
|---|---|---|---|---|---|---|---|---|
| 1 | عرض | `/store (+2)` | `artifacts/ghayth-erp/src/pages/store.tsx` | Store | نعم | — | نعم (6) | جاهز |
| 2 | order-detail | `/store/orders/:id` | `artifacts/ghayth-erp/src/pages/store/order-detail.tsx` | store | لا | — | نعم (2) | مخفي |
| 3 | product-detail | `/store/products/:id` | `artifacts/ghayth-erp/src/pages/store/product-detail.tsx` | store | لا | — | نعم (4) | مخفي |

</details>

### 4.11 CRM  (6 صفحة)

<details>
<summary>عرض الجدول</summary>

| # | اسم الصفحة | مسار التوجيه | مسار الملف | الخدمة الفرعية | في القائمة؟ | صلاحية | API؟ | الحالة |
|---|---|---|---|---|---|---|---|---|
| 1 | الإيجارات المرتبطة | `/clients/:id` | `artifacts/ghayth-erp/src/pages/client-detail.tsx` | Customers | لا | — | نعم (7) | مخفي |
| 2 | إدارة العملاء | `/clients` | `artifacts/ghayth-erp/src/pages/clients.tsx` | Customers | نعم | — | نعم (3) | جاهز |
| 3 | إدارة علاقات العملاء | `/crm (+1)` | `artifacts/ghayth-erp/src/pages/crm.tsx` | Sales | نعم | — | نعم (7) | جاهز |
| 4 | أنشطة إدارة العملاء | `/crm/activities` | `artifacts/ghayth-erp/src/pages/crm/activities.tsx` | crm | نعم | — | نعم (2) | جاهز |
| 5 | lead-detail | `/crm/leads/:id` | `artifacts/ghayth-erp/src/pages/crm/lead-detail.tsx` | crm | لا | — | نعم (4) | مخفي |
| 6 | عرض تفاصيل العائد + تحديث الإيرادات | `/marketing` | `artifacts/ghayth-erp/src/pages/marketing.tsx` | Marketing | نعم | — | نعم (7) | جاهز |

</details>

### 4.12 Support  (3 صفحة)

<details>
<summary>عرض الجدول</summary>

| # | اسم الصفحة | مسار التوجيه | مسار الملف | الخدمة الفرعية | في القائمة؟ | صلاحية | API؟ | الحالة |
|---|---|---|---|---|---|---|---|---|
| 1 | الدعم الفني | `/support` | `artifacts/ghayth-erp/src/pages/support.tsx` | Tickets | نعم | — | نعم (6) | جاهز |
| 2 | قاعدة المعرفة | `/support/kb` | `artifacts/ghayth-erp/src/pages/support/kb.tsx` | support | نعم | — | نعم (4) | جاهز |
| 3 | ردود الدعم الفني | `/support/replies` | `artifacts/ghayth-erp/src/pages/support/replies.tsx` | support | نعم | — | نعم (2) | جاهز |

</details>

### 4.13 Requests (الطلبات)  (1 صفحة)

<details>
<summary>عرض الجدول</summary>

| # | اسم الصفحة | مسار التوجيه | مسار الملف | الخدمة الفرعية | في القائمة؟ | صلاحية | API؟ | الحالة |
|---|---|---|---|---|---|---|---|---|
| 1 | طلبات المشتريات | `/requests (+2)` | `artifacts/ghayth-erp/src/pages/requests-page.tsx` | Requests | نعم | — | نعم (10) | جاهز |

</details>

### 4.14 Documents (المستندات)  (7 صفحة)

<details>
<summary>عرض الجدول</summary>

| # | اسم الصفحة | مسار التوجيه | مسار الملف | الخدمة الفرعية | في القائمة؟ | صلاحية | API؟ | الحالة |
|---|---|---|---|---|---|---|---|---|
| 1 | إضافة مستند جديد | `/documents/create` | `artifacts/ghayth-erp/src/pages/create/documents/documents-create.tsx` | documents | لا | — | نعم (2) | مخفي |
| 2 | إصدارات المستند | `/documents/:docId/versions` | `artifacts/ghayth-erp/src/pages/create/documents/version-upload.tsx` | documents | لا | — | نعم (2) | جاهز |
| 3 | صندوق استخراج المستندات (OCR) | `/documents/ocr-inbox` | `artifacts/ghayth-erp/src/pages/documents-ocr-inbox.tsx` | OCR | نعم | — | نعم (2) | جاهز |
| 4 | معاينة | `/documents (+1)` | `artifacts/ghayth-erp/src/pages/documents-page.tsx` | Documents | نعم | — | نعم (14) | جاهز |
| 5 | الأرشيف | `/documents/archive` | `artifacts/ghayth-erp/src/pages/documents/archive.tsx` | documents | نعم | — | نعم (2) | جاهز |
| 6 | رفع مستند جديد | `/documents/upload` | `artifacts/ghayth-erp/src/pages/documents/documents-upload.tsx` | documents | نعم | — | لا | يحتاج ربط backend (hub أو placeholder) |
| 7 | إدراج في المحتوى | `/documents/templates` | `artifacts/ghayth-erp/src/pages/documents/templates.tsx` | documents | نعم | — | نعم (4) | جاهز |

</details>

### 4.15 Comms (التواصل)  (7 صفحة)

<details>
<summary>عرض الجدول</summary>

| # | اسم الصفحة | مسار التوجيه | مسار الملف | الخدمة الفرعية | في القائمة؟ | صلاحية | API؟ | الحالة |
|---|---|---|---|---|---|---|---|---|
| 1 | المراسلات | `/correspondence` | `artifacts/ghayth-erp/src/pages/comms/correspondence.tsx` | comms | نعم | — | نعم (5) | جاهز |
| 2 | الاتصالات | `/communications` | `artifacts/ghayth-erp/src/pages/communications.tsx` | Comms | نعم | L40 | نعم (8) | جاهز |
| 3 | مراسلة جديدة | `/correspondence/create` | `artifacts/ghayth-erp/src/pages/create/comms/correspondence-create.tsx` | comms | لا | — | نعم (2) | مخفي |
| 4 | صندوقي الموحّد | `/inbox` | `artifacts/ghayth-erp/src/pages/inbox.tsx` | Inbox | نعم | — | نعم (10) | جاهز |
| 5 | الصناديق المتصلة | `/mailboxes` | `artifacts/ghayth-erp/src/pages/mailboxes.tsx` | Mailboxes | نعم | — | نعم (8) | جاهز |
| 6 | محرك الإشعارات | `/communications/notification-engine` | `artifacts/ghayth-erp/src/pages/notification-engine.tsx` | Notification engine | نعم | L40 | نعم (22) | جاهز |
| 7 | مركز الإشعارات | `/notifications` | `artifacts/ghayth-erp/src/pages/notifications.tsx` | Notifications | نعم | — | نعم (5) | جاهز |

</details>

### 4.16 Legal (القانوني)  (5 صفحة)

<details>
<summary>عرض الجدول</summary>

| # | اسم الصفحة | مسار التوجيه | مسار الملف | الخدمة الفرعية | في القائمة؟ | صلاحية | API؟ | الحالة |
|---|---|---|---|---|---|---|---|---|
| 1 | إغلاق نهائي للقضية (يفعل side-effects: إشعار المحامي، إغلاق المخاطر) | `/legal/cases/:id` | `artifacts/ghayth-erp/src/pages/legal-case-detail.tsx` | Legal | لا | L40* | نعم (14) | مخفي |
| 2 | الشؤون القانونية | `/legal (+3)` | `artifacts/ghayth-erp/src/pages/legal.tsx` | Legal | نعم | L40*, L40*, L40 | نعم (7) | جاهز |
| 3 | المراسلات القانونية | `/legal/correspondence` | `artifacts/ghayth-erp/src/pages/legal/correspondence.tsx` | legal | نعم | L40* | نعم (2) | جاهز |
| 4 | الأحكام القضائية | `/legal/judgments` | `artifacts/ghayth-erp/src/pages/legal/judgments.tsx` | legal | نعم | L40* | نعم (2) | جاهز |
| 5 | الجلسات القادمة | `/legal/sessions` | `artifacts/ghayth-erp/src/pages/legal/sessions.tsx` | legal | نعم | L40* | نعم (2) | جاهز |

</details>

### 4.17 Governance (الحوكمة)  (7 صفحة)

<details>
<summary>عرض الجدول</summary>

| # | اسم الصفحة | مسار التوجيه | مسار الملف | الخدمة الفرعية | في القائمة؟ | صلاحية | API؟ | الحالة |
|---|---|---|---|---|---|---|---|---|
| 1 | تدقيق جديد | `/governance/audits/create` | `artifacts/ghayth-erp/src/pages/create/governance/audits-create.tsx` | governance | لا | L60* | نعم (2) | مخفي |
| 2 | إضافة بند امتثال | `/governance/compliance/create` | `artifacts/ghayth-erp/src/pages/create/governance/compliance-create.tsx` | governance | لا | L60* | نعم (2) | مخفي |
| 3 | إضافة سياسة جديدة | `/governance/policies/create` | `artifacts/ghayth-erp/src/pages/create/governance/policies-create.tsx` | governance | لا | L60* | نعم (2) | مخفي |
| 4 | تسجيل خطر جديد | `/governance/risks/create` | `artifacts/ghayth-erp/src/pages/create/governance/risks-create.tsx` | governance | لا | L60* | نعم (3) | مخفي |
| 5 | الحوكمة والامتثال | `/governance (+4)` | `artifacts/ghayth-erp/src/pages/governance.tsx` | Governance | نعم | L60*, L60 | نعم (2) | جاهز |
| 6 | الإجراءات التصحيحية والوقائية (CAPA) | `/governance/capa` | `artifacts/ghayth-erp/src/pages/governance/capa.tsx` | governance | نعم | L60* | نعم (2) | جاهز |
| 7 | stats-cards | `غير مسجل` | `artifacts/ghayth-erp/src/pages/governance/stats-cards.tsx` | governance | لا | — | لا | داخلي فقط |

</details>

### 4.18 BI (ذكاء الأعمال)  (15 صفحة)

<details>
<summary>عرض الجدول</summary>

| # | اسم الصفحة | مسار التوجيه | مسار الملف | الخدمة الفرعية | في القائمة؟ | صلاحية | API؟ | الحالة |
|---|---|---|---|---|---|---|---|---|
| 1 | منصة الذكاء الاصطناعي | `/intelligence/ai-workbench` | `artifacts/ghayth-erp/src/pages/ai-workbench.tsx` | AI | نعم | — | لا | يحتاج ربط backend (hub أو placeholder) |
| 2 | التقارير الإدارية | `/bi/admin-reports` | `artifacts/ghayth-erp/src/pages/bi-admin-reports.tsx` | Admin reports | نعم | L40* | نعم (4) | جاهز |
| 3 | لوحات المعلومات | `/bi/dashboards` | `artifacts/ghayth-erp/src/pages/bi-dashboards.tsx` | Dashboards | نعم | L40* | لا | يحتاج ربط backend (hub أو placeholder) |
| 4 | المؤشرات | `/bi/kpis` | `artifacts/ghayth-erp/src/pages/bi-kpis.tsx` | KPIs | نعم | L40* | لا | يحتاج ربط backend (hub أو placeholder) |
| 5 | تحليل الأداء التشغيلي | `/bi/operations` | `artifacts/ghayth-erp/src/pages/bi-operations.tsx` | Operations | نعم | L40* | نعم (8) | جاهز |
| 6 | التقارير | `/bi/reports` | `artifacts/ghayth-erp/src/pages/bi-reports.tsx` | Reports | نعم | L40* | لا | يحتاج ربط backend (hub أو placeholder) |
| 7 | ذكاء الأعمال | `/bi` | `artifacts/ghayth-erp/src/pages/bi.tsx` | BI hub | نعم | L40 | لا | يحتاج ربط backend (hub أو placeholder) |
| 8 | shared | `غير مسجل` | `artifacts/ghayth-erp/src/pages/bi/shared.tsx` | bi | لا | — | لا | داخلي فقط |
| 9 | إنشاء لوحة معلومات | `/bi/dashboards/create` | `artifacts/ghayth-erp/src/pages/create/bi/dashboards-create.tsx` | bi | لا | L40* | نعم (2) | مخفي |
| 10 | إضافة مؤشر أداء | `/bi/kpis/create` | `artifacts/ghayth-erp/src/pages/create/bi/kpis-create.tsx` | bi | لا | L40* | نعم (2) | مخفي |
| 11 | إنشاء تقرير جديد | `/bi/reports/create` | `artifacts/ghayth-erp/src/pages/create/bi/reports-create.tsx` | bi | لا | L40* | نعم (2) | مخفي |
| 12 | رؤى ذكية | `/insights` | `artifacts/ghayth-erp/src/pages/insights.tsx` | Insights | نعم | — | نعم (7) | جاهز |
| 13 | لوحة الذكاء | `/intelligence` | `artifacts/ghayth-erp/src/pages/intelligence.tsx` | Intelligence | نعم | — | نعم (8) | جاهز |
| 14 | سجل المطبوعات | `/reports/print-log` | `artifacts/ghayth-erp/src/pages/reports/print-log.tsx` | reports | نعم | L40, "print_jobs:read" | نعم (3) | جاهز |
| 15 | حذف | `/reports/scheduled` | `artifacts/ghayth-erp/src/pages/reports/scheduled-reports.tsx` | reports | نعم | L40, ["bi:read", "reports:read"] | نعم (6) | جاهز |

</details>

### 4.19 Admin (مدير النظام)  (37 صفحة)

<details>
<summary>عرض الجدول</summary>

| # | اسم الصفحة | مسار التوجيه | مسار الملف | الخدمة الفرعية | في القائمة؟ | صلاحية | API؟ | الحالة |
|---|---|---|---|---|---|---|---|---|
| 1 | سجل الحركات والنشاطات | `/activity-log` | `artifacts/ghayth-erp/src/pages/activity-log.tsx` | Activity log | نعم | — | نعم (5) | جاهز |
| 2 | فتح صفحة التفاصيل | `/admin/ai-governance` | `artifacts/ghayth-erp/src/pages/admin-ai-governance.tsx` | admin- | نعم | ["admin:list", "admin:view"], L90* | نعم (10) | جاهز |
| 3 | تعديل Prompt | `/admin/ai-governance/prompts/:id` | `artifacts/ghayth-erp/src/pages/admin-ai-prompt-detail.tsx` | admin- | لا | L90* | نعم (5) | مخفي |
| 4 | مركز التحكّم بالاتصالات | `/admin/communication-control` | `artifacts/ghayth-erp/src/pages/admin-communication-control.tsx` | admin- | نعم | ["admin:list", "admin:view"], L90* | نعم (5) | جاهز |
| 5 | استيراد البيانات (إداري) | `/admin/data-import` | `artifacts/ghayth-erp/src/pages/admin-data-import.tsx` | admin- | نعم | "admin:update", L90* | نعم (5) | جاهز |
| 6 | فاحص التوقيع الرقمي | `/admin/digital-signature` | `artifacts/ghayth-erp/src/pages/admin-digital-signature.tsx` | admin- | نعم | ["admin:list", "admin:view"], L90* | نعم (2) | جاهز |
| 7 | سجل النطاقات | `/admin/domain-registry` | `artifacts/ghayth-erp/src/pages/admin-domain-registry.tsx` | admin- | نعم | ["admin:list", "admin:view"], L90* | نعم (2) | جاهز |
| 8 | كتالوج الأحداث | `/admin/event-monitor` | `artifacts/ghayth-erp/src/pages/admin-event-monitor.tsx` | admin- | نعم | ["admin:list", "admin:view"], L90* | نعم (3) | جاهز |
| 9 | مطابقة دفتر الأستاذ | `/admin/gl-reconciliation` | `artifacts/ghayth-erp/src/pages/admin-gl-reconciliation.tsx` | admin- | نعم | ["admin:list", "admin:view"], L90* | نعم (2) | جاهز |
| 10 | تشخيص التكاملات | `/admin/integrations-diagnostics` | `artifacts/ghayth-erp/src/pages/admin-integrations-diagnostics.tsx` | admin- | نعم | "admin:update", L90* | نعم (4) | جاهز |
| 11 | مركز التكاملات | `/admin/integrations` | `artifacts/ghayth-erp/src/pages/admin-integrations.tsx` | admin- | نعم | "admin:update", L90* | نعم (8) | جاهز |
| 12 | ملعب الذكاء الاصطناعي والخوارزميات | `/admin/intelligence-playground` | `artifacts/ghayth-erp/src/pages/admin-intelligence-playground.tsx` | admin- | نعم | "admin:update", L90* | لا | يحتاج ربط backend (hub أو placeholder) |
| 13 | محرك دورة الحياة | `/admin/lifecycle-monitor` | `artifacts/ghayth-erp/src/pages/admin-lifecycle-monitor.tsx` | admin- | نعم | ["admin:list", "admin:view"], L90* | نعم (2) | جاهز |
| 14 | خارطة #1139 — حالة التنفيذ الحيّة | `/admin/master-plan` | `artifacts/ghayth-erp/src/pages/admin-master-plan.tsx` | admin- | نعم | ["admin:list", "admin:view"], L90* | نعم (2) | جاهز |
| 15 | إلغاء التفعيل | `/admin/monitoring` | `artifacts/ghayth-erp/src/pages/admin-monitoring.tsx` | admin- | نعم | ["admin:list", "admin:view"], L90* | نعم (10) | جاهز |
| 16 | توجيه الإشعارات | `/admin/notification-routing` | `artifacts/ghayth-erp/src/pages/admin-notification-routing.tsx` | admin- | نعم | ["admin:list", "admin:view"], L90* | نعم (3) | جاهز |
| 17 | مرصد المراقبة الموحّد | `/admin/observability` | `artifacts/ghayth-erp/src/pages/admin-observability.tsx` | admin- | نعم | ["admin:list", "admin:view"], L90* | نعم (7) | جاهز |
| 18 | مركز التحكّم بالـ PBX | `/admin/pbx-control` | `artifacts/ghayth-erp/src/pages/admin-pbx-control.tsx` | admin- | نعم | ["admin:list", "admin:view"], L90* | نعم (9) | جاهز |
| 19 | حماية البيانات الشخصية (PDPL) | `/admin/pdpl` | `artifacts/ghayth-erp/src/pages/admin-pdpl.tsx` | admin- | نعم | ["admin:list", "admin:view"], L90* | نعم (5) | جاهز |
| 20 | محرك السياسات | `/admin/policy-engine` | `artifacts/ghayth-erp/src/pages/admin-policy-engine.tsx` | admin- | نعم | "admin:update", L90* | نعم (3) | جاهز |
| 21 | فشل القيود المالية | `/admin/posting-failures` | `artifacts/ghayth-erp/src/pages/admin-posting-failures.tsx` | admin- | نعم | ["admin:list", "admin:view"], L90* | نعم (3) | جاهز |
| 22 | مصفوفة الصلاحيات | `/admin/rbac-matrix` | `artifacts/ghayth-erp/src/pages/admin-rbac-matrix.tsx` | admin- | نعم | "admin.roles:view", L90* | نعم (2) | جاهز |
| 23 | حاكم النظام | `/admin/system-governor` | `artifacts/ghayth-erp/src/pages/admin-system-governor.tsx` | admin- | نعم | ["admin:list", "admin:view"], L90* | نعم (14) | جاهز |
| 24 | المرجعية المركزية الشاملة | `/admin/system-registry` | `artifacts/ghayth-erp/src/pages/admin-system-registry.tsx` | admin- | نعم | ["admin:list", "admin:view"], L90* | نعم (10) | جاهز |
| 25 | إعدادات المزوّدات الخارجية | `/admin/vendor-settings` | `artifacts/ghayth-erp/src/pages/admin-vendor-settings.tsx` | admin- | نعم | ["admin:list", "admin:view"], L90* | نعم (2) | جاهز |
| 26 | تقرير المخالفات | `/admin/violations-report` | `artifacts/ghayth-erp/src/pages/admin-violations-report.tsx` | admin- | نعم | ["hr:approve", "admin:view"], L90* | نعم (3) | جاهز |
| 27 | مراجعات ZATCA | `/admin/zatca-audits` | `artifacts/ghayth-erp/src/pages/admin-zatca-audits.tsx` | admin- | نعم | ["admin:list", "admin:view"], L90* | نعم (4) | جاهز |
| 28 | لوحة الإدارة | `/admin` | `artifacts/ghayth-erp/src/pages/admin.tsx` | Admin | نعم | L90, ["admin.roles:view", "admin.roles:update"] | لا | يحتاج ربط backend (hub أو placeholder) |
| 29 | سجل تجاوز الـ Workflow | `/admin/approval-overrides` | `artifacts/ghayth-erp/src/pages/admin/approval-overrides-report.tsx` | admin | نعم | "admin:update", L90* | نعم (2) | جاهز |
| 30 | سجل التدقيق | `/admin/logs` | `artifacts/ghayth-erp/src/pages/admin/logs.tsx` | admin | نعم | ["audit:read", "admin:read"], L90* | نعم (3) | جاهز |
| 31 | تشخيص الطباعة | `/admin/print-diagnostics` | `artifacts/ghayth-erp/src/pages/admin/print-diagnostics.tsx` | admin | نعم | ["admin:list", "admin:view"], L90* | نعم (5) | جاهز |
| 32 | قوالب الطباعة | `/admin/print-templates` | `artifacts/ghayth-erp/src/pages/admin/print-templates.tsx` | admin | نعم | ["admin:list", "admin:view"], L90* | نعم (3) | جاهز |
| 33 | إضافة | `غير مسجل` | `artifacts/ghayth-erp/src/pages/admin/rbac-v2-conditions-editor.tsx` | admin | لا | — | لا | dead |
| 34 | roles | `/admin/roles` | `artifacts/ghayth-erp/src/pages/admin/roles.tsx` | admin | نعم | ["admin.roles:view", "admin.roles:update"], L90* | نعم (5) | جاهز |
| 35 | user-onboarding | `/admin/user-onboarding` | `artifacts/ghayth-erp/src/pages/admin/user-onboarding.tsx` | admin | نعم | ["admin:update"], L90* | لا | يحتاج ربط backend (hub أو placeholder) |
| 36 | تعديل | `/admin/users` | `artifacts/ghayth-erp/src/pages/admin/users.tsx` | admin | نعم | ["admin:list", "admin:update"], L90* | نعم (4) | جاهز |
| 37 | الأتمتة والجدولة | `/automation` | `artifacts/ghayth-erp/src/pages/automation.tsx` | Automation | نعم | L60, ["admin:update", "automation:write"] | نعم (12) | جاهز |

</details>

### 4.20 Settings (الإعدادات)  (3 صفحة)

<details>
<summary>عرض الجدول</summary>

| # | اسم الصفحة | مسار التوجيه | مسار الملف | الخدمة الفرعية | في القائمة؟ | صلاحية | API؟ | الحالة |
|---|---|---|---|---|---|---|---|---|
| 1 | رفع الأولوية | `/settings/rules` | `artifacts/ghayth-erp/src/pages/settings-rules.tsx` | Rules | نعم | "settings:write", L70* | نعم (8) | جاهز |
| 2 | تعديل | `/settings (+4)` | `artifacts/ghayth-erp/src/pages/settings.tsx` | Settings | نعم | L70, "settings:write", "settings:write", "settings:write", ["audit:read", "settings:write"] | نعم (14) | جاهز |
| 3 | قوالب الطباعة (الكليشة) | `/settings/print-templates` | `artifacts/ghayth-erp/src/pages/settings/print-templates.tsx` | settings | نعم | "templates:read", L70* | نعم (3) | جاهز |

</details>

### 4.21 Details (Cross-module)  (54 صفحة)

<details>
<summary>عرض الجدول</summary>

| # | اسم الصفحة | مسار التوجيه | مسار الملف | الخدمة الفرعية | في القائمة؟ | صلاحية | API؟ | الحالة |
|---|---|---|---|---|---|---|---|---|
| 1 | account-detail | `/finance/accounts/:id` | `artifacts/ghayth-erp/src/pages/details/account-detail.tsx` | details | لا | — | نعم (2) | مخفي |
| 2 | attendance-detail | `/hr/attendance/:id` | `artifacts/ghayth-erp/src/pages/details/attendance-detail.tsx` | details | لا | — | نعم (2) | مخفي |
| 3 | تعديل التدقيق | `/governance/audits/:id` | `artifacts/ghayth-erp/src/pages/details/audit-detail.tsx` | details | لا | L60* | نعم (2) | مخفي |
| 4 | budget-detail | `/finance/budget/:id` | `artifacts/ghayth-erp/src/pages/details/budget-detail.tsx` | details | لا | — | نعم (2) | مخفي |
| 5 | building-detail | `/properties/buildings/:id` | `artifacts/ghayth-erp/src/pages/details/building-detail.tsx` | details | لا | — | نعم (3) | مخفي |
| 6 | commitment-detail | `/finance/commitments/:id` | `artifacts/ghayth-erp/src/pages/details/commitment-detail.tsx` | details | لا | — | نعم (2) | مخفي |
| 7 | تعديل سجل الامتثال | `/governance/compliance/:id` | `artifacts/ghayth-erp/src/pages/details/compliance-detail.tsx` | details | لا | L60* | نعم (2) | مخفي |
| 8 | معاينة | `/correspondence/:id` | `artifacts/ghayth-erp/src/pages/details/correspondence-detail.tsx` | details | لا | — | نعم (4) | مخفي |
| 9 | driver-detail | `/fleet/drivers/:id` | `artifacts/ghayth-erp/src/pages/details/driver-detail.tsx` | details | لا | — | نعم (5) | مخفي |
| 10 | excuse-detail | `/hr/excuse-requests/:id` | `artifacts/ghayth-erp/src/pages/details/excuse-detail.tsx` | details | لا | — | نعم (2) | مخفي |
| 11 | فتح | `/finance/expenses/:id` | `artifacts/ghayth-erp/src/pages/details/expense-detail.tsx` | details | لا | — | نعم (2) | مخفي |
| 12 | financial-request-detail | `/finance/financial-requests/:id` | `artifacts/ghayth-erp/src/pages/details/financial-request-detail.tsx` | details | لا | — | نعم (2) | مخفي |
| 13 | تعديل الأصل الثابت | `/finance/fixed-assets/:id` | `artifacts/ghayth-erp/src/pages/details/fixed-asset-detail.tsx` | details | لا | — | نعم (3) | مخفي |
| 14 | fuel-detail | `/fleet/fuel/:id` | `artifacts/ghayth-erp/src/pages/details/fuel-detail.tsx` | details | لا | — | نعم (2) | مخفي |
| 15 | hr-contract-detail | `/hr/contracts/:id` | `artifacts/ghayth-erp/src/pages/details/hr-contract-detail.tsx` | details | لا | — | نعم (2) | مخفي |
| 16 | insurance-detail | `/fleet/insurance/:id` | `artifacts/ghayth-erp/src/pages/details/insurance-detail.tsx` | details | لا | — | نعم (2) | مخفي |
| 17 | يصبح متاحاً بعد 48 ساعة من بدء المرحلة الحالية | `/hr/leaves/:id` | `artifacts/ghayth-erp/src/pages/details/leave-detail.tsx` | details | لا | — | نعم (2) | مخفي |
| 18 | تعديل العقد | `/legal/contracts/:id` | `artifacts/ghayth-erp/src/pages/details/legal-contract-detail.tsx` | details | لا | L40* | نعم (4) | مخفي |
| 19 | تعديل الحكم | `/legal/judgments/:id` | `artifacts/ghayth-erp/src/pages/details/legal-judgment-detail.tsx` | details | لا | L40* | نعم (2) | مخفي |
| 20 | legal-session-detail | `/legal/sessions/:id` | `artifacts/ghayth-erp/src/pages/details/legal-session-detail.tsx` | details | لا | L40* | نعم (2) | مخفي |
| 21 | maintenance-detail | `/fleet/maintenance/:id` | `artifacts/ghayth-erp/src/pages/details/maintenance-detail.tsx` | details | لا | — | نعم (2) | مخفي |
| 22 | opportunity-detail | `/crm/:id` | `artifacts/ghayth-erp/src/pages/details/opportunity-detail.tsx` | details | لا | — | نعم (3) | مخفي |
| 23 | owner-detail | `/properties/owners/:id` | `artifacts/ghayth-erp/src/pages/details/owner-detail.tsx` | details | لا | — | نعم (2) | مخفي |
| 24 | payroll-detail | `/hr/payroll/:id` | `artifacts/ghayth-erp/src/pages/details/payroll-detail.tsx` | details | لا | — | نعم (2) | مخفي |
| 25 | performance-detail | `/hr/performance/:id` | `artifacts/ghayth-erp/src/pages/details/performance-detail.tsx` | details | لا | — | نعم (2) | مخفي |
| 26 | تعديل السياسة | `/governance/policies/:id` | `artifacts/ghayth-erp/src/pages/details/policy-detail.tsx` | details | لا | L60* | نعم (5) | مخفي |
| 27 | تعليم كمكتمل | `/projects/:id` | `artifacts/ghayth-erp/src/pages/details/project-detail.tsx` | details | لا | — | نعم (12) | مخفي |
| 28 | تعديل طلب الصيانة | `/properties/maintenance/:id` | `artifacts/ghayth-erp/src/pages/details/property-maintenance-detail.tsx` | details | لا | — | نعم (4) | مخفي |
| 29 | property-payment-detail | `/properties/payments/:id` | `artifacts/ghayth-erp/src/pages/details/property-payment-detail.tsx` | details | لا | — | نعم (2) | مخفي |
| 30 | receivable-detail | `/finance/receivables/:id` | `artifacts/ghayth-erp/src/pages/details/receivable-detail.tsx` | details | لا | — | نعم (2) | مخفي |
| 31 | معاينة | `/requests/:id` | `artifacts/ghayth-erp/src/pages/details/request-detail.tsx` | details | لا | — | نعم (4) | مخفي |
| 32 | تعديل المخاطر | `/governance/risks/:id` | `artifacts/ghayth-erp/src/pages/details/risk-detail.tsx` | details | لا | L60* | نعم (3) | مخفي |
| 33 | salary-advance-detail | `/finance/salary-advances/:id` | `artifacts/ghayth-erp/src/pages/details/salary-advance-detail.tsx` | details | لا | — | نعم (2) | مخفي |
| 34 | shift-detail | `/hr/shifts/:id` | `artifacts/ghayth-erp/src/pages/details/shift-detail.tsx` | details | لا | — | نعم (2) | مخفي |
| 35 | تعديل المهمة | `/tasks/:id` | `artifacts/ghayth-erp/src/pages/details/task-detail.tsx` | details | لا | — | نعم (3) | مخفي |
| 36 | tenant-detail | `/properties/tenants/:id` | `artifacts/ghayth-erp/src/pages/details/tenant-detail.tsx` | details | لا | — | نعم (4) | مخفي |
| 37 | ticket-detail | `/support/:id` | `artifacts/ghayth-erp/src/pages/details/ticket-detail.tsx` | details | لا | — | نعم (2) | مخفي |
| 38 | traffic-violation-detail | `/fleet/traffic-violations/:id` | `artifacts/ghayth-erp/src/pages/details/traffic-violation-detail.tsx` | details | لا | — | نعم (2) | مخفي |
| 39 | transfer-detail | `/hr/transfers/:id` | `artifacts/ghayth-erp/src/pages/details/transfer-detail.tsx` | details | لا | — | نعم (2) | مخفي |
| 40 | umrah-agent-detail | `/umrah/agents/:id` | `artifacts/ghayth-erp/src/pages/details/umrah-agent-detail.tsx` | details | لا | — | نعم (3) | مخفي |
| 41 | umrah-invoice-detail | `/umrah/invoices/:id` | `artifacts/ghayth-erp/src/pages/details/umrah-invoice-detail.tsx` | details | لا | — | نعم (3) | مخفي |
| 42 | umrah-package-detail | `/umrah/packages/:id` | `artifacts/ghayth-erp/src/pages/details/umrah-package-detail.tsx` | details | لا | — | نعم (2) | مخفي |
| 43 | umrah-penalty-detail | `/umrah/penalties/:id` | `artifacts/ghayth-erp/src/pages/details/umrah-penalty-detail.tsx` | details | لا | — | نعم (2) | مخفي |
| 44 | umrah-season-detail | `/umrah/seasons/:id` | `artifacts/ghayth-erp/src/pages/details/umrah-season-detail.tsx` | details | لا | — | نعم (2) | مخفي |
| 45 | umrah-sub-agent-detail | `/umrah/sub-agents/:id` | `artifacts/ghayth-erp/src/pages/details/umrah-sub-agent-detail.tsx` | details | لا | — | نعم (5) | مخفي |
| 46 | umrah-transport-detail | `/umrah/transport/:id` | `artifacts/ghayth-erp/src/pages/details/umrah-transport-detail.tsx` | details | لا | — | نعم (3) | مخفي |
| 47 | umrah-violation-detail | `/umrah/violations/:id` | `artifacts/ghayth-erp/src/pages/details/umrah-violation-detail.tsx` | details | لا | — | نعم (2) | مخفي |
| 48 | unit-detail | `/properties/:id` | `artifacts/ghayth-erp/src/pages/details/unit-detail.tsx` | details | لا | — | نعم (2) | مخفي |
| 49 | vehicle-detail | `/fleet/:id` | `artifacts/ghayth-erp/src/pages/details/vehicle-detail.tsx` | details | لا | — | نعم (8) | مخفي |
| 50 | فتح | `/finance/vouchers/:id` | `artifacts/ghayth-erp/src/pages/details/voucher-detail.tsx` | details | لا | — | نعم (2) | مخفي |
| 51 | تعديل التصنيف | `/warehouse/categories/:id` | `artifacts/ghayth-erp/src/pages/details/warehouse-category-detail.tsx` | details | لا | — | نعم (2) | مخفي |
| 52 | warehouse-movement-detail | `/warehouse/movements/:id` | `artifacts/ghayth-erp/src/pages/details/warehouse-movement-detail.tsx` | details | لا | — | نعم (2) | مخفي |
| 53 | تعديل المنتج | `/warehouse/products/:id` | `artifacts/ghayth-erp/src/pages/details/warehouse-product-detail.tsx` | details | لا | — | نعم (2) | مخفي |
| 54 | تعديل المورد | `/warehouse/suppliers/:id` | `artifacts/ghayth-erp/src/pages/details/warehouse-supplier-detail.tsx` | details | لا | — | نعم (2) | مخفي |

</details>

### 4.22 Cross-module create  (11 صفحة)

<details>
<summary>عرض الجدول</summary>

| # | اسم الصفحة | مسار التوجيه | مسار الملف | الخدمة الفرعية | في القائمة؟ | صلاحية | API؟ | الحالة |
|---|---|---|---|---|---|---|---|---|
| 1 | إضافة عميل جديد | `/clients/create` | `artifacts/ghayth-erp/src/pages/create/clients-create.tsx` | create | لا | — | نعم (2) | مخفي |
| 2 | فرصة تجارية جديدة | `/crm/create` | `artifacts/ghayth-erp/src/pages/create/crm-create.tsx` | create | لا | — | نعم (4) | مخفي |
| 3 | تم إنشاء الموظف بنجاح | `/employees/create` | `artifacts/ghayth-erp/src/pages/create/employees-create.tsx` | create | لا | — | نعم (6) | مخفي |
| 4 | قضية جديدة | `/legal/cases/create` | `artifacts/ghayth-erp/src/pages/create/legal-cases-create.tsx` | create | لا | L40* | نعم (3) | مخفي |
| 5 | legal-create | `/legal/create` | `artifacts/ghayth-erp/src/pages/create/legal-create.tsx` | create | لا | L40* | نعم (3) | مخفي |
| 6 | حملة تسويقية جديدة | `/marketing/create` | `artifacts/ghayth-erp/src/pages/create/marketing-create.tsx` | create | لا | — | نعم (2) | مخفي |
| 7 | مشروع جديد | `/projects/create` | `artifacts/ghayth-erp/src/pages/create/projects-create.tsx` | create | لا | — | نعم (2) | مخفي |
| 8 | إضافة وحدة عقارية | `/properties/create` | `artifacts/ghayth-erp/src/pages/create/properties-create.tsx` | create | لا | — | نعم (4) | مخفي |
| 9 | تذكرة دعم جديدة | `/support/create` | `artifacts/ghayth-erp/src/pages/create/support-create.tsx` | create | لا | — | نعم (2) | مخفي |
| 10 | مهمة جديدة | `/tasks/create` | `artifacts/ghayth-erp/src/pages/create/tasks-create.tsx` | create | لا | — | نعم (4) | مخفي |
| 11 | إضافة منتج جديد | `/warehouse/create` | `artifacts/ghayth-erp/src/pages/create/warehouse-create.tsx` | create | لا | — | نعم (3) | مخفي |

</details>

### 4.23 Authentication  (1 صفحة)

<details>
<summary>عرض الجدول</summary>

| # | اسم الصفحة | مسار التوجيه | مسار الملف | الخدمة الفرعية | في القائمة؟ | صلاحية | API؟ | الحالة |
|---|---|---|---|---|---|---|---|---|
| 1 | login | `غير مسجل` | `artifacts/ghayth-erp/src/pages/login.tsx` | Login | لا | — | لا | dead |

</details>

### 4.24 Shared  (2 صفحة)

<details>
<summary>عرض الجدول</summary>

| # | اسم الصفحة | مسار التوجيه | مسار الملف | الخدمة الفرعية | في القائمة؟ | صلاحية | API؟ | الحالة |
|---|---|---|---|---|---|---|---|---|
| 1 | not-found | `غير مسجل` | `artifacts/ghayth-erp/src/pages/not-found.tsx` | 404 | لا | — | لا | dead |
| 2 | print-verify | `غير مسجل` | `artifacts/ghayth-erp/src/pages/print-verify.tsx` | QR verify | لا | — | لا | dead |

</details>

---
## 5. ملفات يتيمة / مشبوهة (Dead / Orphan Files)

صفحات لا تظهر في القائمة الجانبية **ولا** مرتبطة بأي route مسجَّل. أغلبها قد يكون:
- محتوى مستورد من ملف آخر (داخلي).
- بقايا PRs ملغاة.
- صفحات لم تكتمل التسجيل بعد.

| الملف | استخدم API؟ | استخدم Shell؟ | الحالة المرجَّحة |
|---|---|---|---|
| `artifacts/ghayth-erp/src/pages/admin/rbac-v2-conditions-editor.tsx` | لا | لا | dead — محرر شروط RBAC v2 غير مسجّل في adminRoutes |
| `artifacts/ghayth-erp/src/pages/bi/shared.tsx` | لا | لا | داخلي |
| `artifacts/ghayth-erp/src/pages/finance/account-statement.tsx` | نعم | نعم | dead — بديل عام لـ customer/vendor statement لكن غير مسجّل |
| `artifacts/ghayth-erp/src/pages/finance/profitability.tsx` | نعم | نعم | dead — لا يوجد route للأم بدون :id |
| `artifacts/ghayth-erp/src/pages/governance/stats-cards.tsx` | لا | لا | داخلي |
| `artifacts/ghayth-erp/src/pages/my-space/summary-cards.tsx` | لا | لا | داخلي |

---
## 6. مكوّنات فرعية (Sub-components) داخل `pages/`

ليست صفحات مستقلة بل تيبَات/سيكشنز/كروت يستوردها صفحة أم. لا يوجد لها route، ولا يجب اعتبارها صفحات.

| الملف | يستخدم API؟ | الأصل المتوقع (الأم) |
|---|---|---|
| `artifacts/ghayth-erp/src/pages/admin/audit-explorer-tab.tsx` | لا | admin.tsx / pages/admin-*.tsx |
| `artifacts/ghayth-erp/src/pages/admin/logs-tab.tsx` | لا | admin.tsx / pages/admin-*.tsx |
| `artifacts/ghayth-erp/src/pages/admin/permissions-tab.tsx` | لا | admin.tsx / pages/admin-*.tsx |
| `artifacts/ghayth-erp/src/pages/admin/rbac-v2-jit-tab.tsx` | لا | admin.tsx / pages/admin-*.tsx |
| `artifacts/ghayth-erp/src/pages/admin/rbac-v2-sod-tab.tsx` | لا | admin.tsx / pages/admin-*.tsx |
| `artifacts/ghayth-erp/src/pages/admin/rbac-v2-tab.tsx` | لا | admin.tsx / pages/admin-*.tsx |
| `artifacts/ghayth-erp/src/pages/admin/rbac-v2-users-tab.tsx` | لا | admin.tsx / pages/admin-*.tsx |
| `artifacts/ghayth-erp/src/pages/admin/role-assignment-tab.tsx` | لا | admin.tsx / pages/admin-*.tsx |
| `artifacts/ghayth-erp/src/pages/admin/roles-tab.tsx` | لا | admin.tsx / pages/admin-*.tsx |
| `artifacts/ghayth-erp/src/pages/admin/security-log-tab.tsx` | لا | admin.tsx / pages/admin-*.tsx |
| `artifacts/ghayth-erp/src/pages/admin/users-tab.tsx` | لا | admin.tsx / pages/admin-*.tsx |
| `artifacts/ghayth-erp/src/pages/bi/ai-insights-tab.tsx` | لا | bi.tsx / bi-*.tsx |
| `artifacts/ghayth-erp/src/pages/bi/alert-fatigue-tab.tsx` | لا | bi.tsx / bi-*.tsx |
| `artifacts/ghayth-erp/src/pages/bi/branch-performance-tab.tsx` | لا | bi.tsx / bi-*.tsx |
| `artifacts/ghayth-erp/src/pages/bi/ceo-dashboard-tab.tsx` | لا | bi.tsx / bi-*.tsx |
| `artifacts/ghayth-erp/src/pages/bi/dashboards-tab.tsx` | لا | bi.tsx / bi-*.tsx |
| `artifacts/ghayth-erp/src/pages/bi/fleet-tco-tab.tsx` | لا | bi.tsx / bi-*.tsx |
| `artifacts/ghayth-erp/src/pages/bi/kpis-tab.tsx` | لا | bi.tsx / bi-*.tsx |
| `artifacts/ghayth-erp/src/pages/bi/leave-balance-tab.tsx` | لا | bi.tsx / bi-*.tsx |
| `artifacts/ghayth-erp/src/pages/bi/overview-tab.tsx` | لا | bi.tsx / bi-*.tsx |
| `artifacts/ghayth-erp/src/pages/bi/property-occupancy-tab.tsx` | لا | bi.tsx / bi-*.tsx |
| `artifacts/ghayth-erp/src/pages/bi/reports-tab.tsx` | لا | bi.tsx / bi-*.tsx |
| `artifacts/ghayth-erp/src/pages/bi/training-roi-tab.tsx` | لا | bi.tsx / bi-*.tsx |
| `artifacts/ghayth-erp/src/pages/bi/vendor-performance-tab.tsx` | لا | bi.tsx / bi-*.tsx |
| `artifacts/ghayth-erp/src/pages/governance/audits-tab.tsx` | لا | governance.tsx |
| `artifacts/ghayth-erp/src/pages/governance/capa-tab.tsx` | لا | governance.tsx |
| `artifacts/ghayth-erp/src/pages/governance/compliance-actions-tab.tsx` | لا | governance.tsx |
| `artifacts/ghayth-erp/src/pages/governance/compliance-dashboard-tab.tsx` | لا | governance.tsx |
| `artifacts/ghayth-erp/src/pages/governance/compliance-tab.tsx` | لا | governance.tsx |
| `artifacts/ghayth-erp/src/pages/governance/policies-tab.tsx` | لا | governance.tsx |
| `artifacts/ghayth-erp/src/pages/governance/risks-tab.tsx` | لا | governance.tsx |
| `artifacts/ghayth-erp/src/pages/my-space/account-info-card.tsx` | لا | my-space.tsx |
| `artifacts/ghayth-erp/src/pages/my-space/active-loans-card.tsx` | لا | my-space.tsx |
| `artifacts/ghayth-erp/src/pages/my-space/alerts-section.tsx` | لا | my-space.tsx |
| `artifacts/ghayth-erp/src/pages/my-space/change-password-section.tsx` | لا | my-space.tsx |
| `artifacts/ghayth-erp/src/pages/my-space/custodies-and-documents-section.tsx` | لا | my-space.tsx |
| `artifacts/ghayth-erp/src/pages/my-space/entity-cards-section.tsx` | لا | my-space.tsx |
| `artifacts/ghayth-erp/src/pages/my-space/leaves-and-requests-section.tsx` | لا | my-space.tsx |
| `artifacts/ghayth-erp/src/pages/my-space/monthly-summary-card.tsx` | لا | my-space.tsx |
| `artifacts/ghayth-erp/src/pages/my-space/pending-approvals-card.tsx` | لا | my-space.tsx |
| `artifacts/ghayth-erp/src/pages/my-space/preferences-card.tsx` | لا | my-space.tsx |
| `artifacts/ghayth-erp/src/pages/my-space/recent-actions-and-performance-section.tsx` | لا | my-space.tsx |
| `artifacts/ghayth-erp/src/pages/my-space/role-entities-grid.tsx` | لا | my-space.tsx |
| `artifacts/ghayth-erp/src/pages/my-space/secondary-alerts-section.tsx` | لا | my-space.tsx |
| `artifacts/ghayth-erp/src/pages/my-space/smart-suggestions-card.tsx` | لا | my-space.tsx |
| `artifacts/ghayth-erp/src/pages/my-space/tasks-and-notifications-section.tsx` | لا | my-space.tsx |
| `artifacts/ghayth-erp/src/pages/my-space/violations-card.tsx` | لا | my-space.tsx |
| `artifacts/ghayth-erp/src/pages/settings/accounting-mappings-tab.tsx` | لا | settings.tsx |
| `artifacts/ghayth-erp/src/pages/settings/approval-workflows-tab.tsx` | لا | settings.tsx |
| `artifacts/ghayth-erp/src/pages/settings/branches-tab.tsx` | لا | settings.tsx |
| `artifacts/ghayth-erp/src/pages/settings/communication-channels-tab.tsx` | لا | settings.tsx |
| `artifacts/ghayth-erp/src/pages/settings/companies-tab.tsx` | لا | settings.tsx |
| `artifacts/ghayth-erp/src/pages/settings/gov-integrations-tab.tsx` | لا | settings.tsx |
| `artifacts/ghayth-erp/src/pages/settings/letterhead-tab.tsx` | لا | settings.tsx |
| `artifacts/ghayth-erp/src/pages/settings/numbering-tab.tsx` | لا | settings.tsx |
| `artifacts/ghayth-erp/src/pages/settings/role-permissions-tab.tsx` | لا | settings.tsx |
| `artifacts/ghayth-erp/src/pages/settings/system-controls-tab.tsx` | لا | settings.tsx |
| `artifacts/ghayth-erp/src/pages/settings/workflow-definitions-tab.tsx` | لا | settings.tsx |
| `artifacts/ghayth-erp/src/pages/settings/zatca-settings-tab.tsx` | لا | settings.tsx |

---
## 7. ملاحظات تشغيلية (Operational Notes)
- **`App.tsx`** يلفّ كل route بـ `<ModuleRoute>` الذي يطبق ثلاث بوابات: `canAccessModule(module)` + `canAccessSubPage(module, subKey)` + `minRoleLevel`. هذا يعني أن العمود "صلاحية" في الجداول أعلاه يمثل الحد الأدنى الظاهر؛ الفلتر الفعلي قد يكون أعلى بسبب `tagRoutes()` في `App.tsx` (مثلاً `governanceRoutes` لها `minRoleLevel: 60` تلقائيًا، `biRoutes` و `legalRoutes` 40، `adminRoutes` 90، `settingsRoutes` 70).
- **`useFilteredNavSections()`** في `sidebar-layout.tsx:666` يضيف فلتر إضافي: يتحقق من `isRegisteredRoute(path)` قبل عرض أي عنصر في الـ sidebar — أي أن أي link في الـ sidebar لا يقابله path في `registry.ts` يُحذف تلقائيًا (لن تظهر للمستخدم). هذا يفسر عدم ظهور بعض الصفحات في القائمة على الرغم من أن `allNavSections` يتضمنها.
- **القائمة الجانبية تستخدم mapping بين `module` و `featureCatalog`**: شركة قد تعطل موديولًا كاملاً (e.g. `umrah`) فتختفي 35 صفحة عمرة من القائمة دفعة واحدة. هذا منطق visibility مركّز يشرح لماذا قد لا يرى مستخدم معين أي قائمة من قسم كامل.
- **التكرار بين paths**: بعض الصفحات `path → file` متعددة-إلى-واحدة. مثل: `documents-page.tsx` يخدم `/documents` و `/documents/folders` (نفس المكون، تبويبات مختلفة). و `governance.tsx` يخدم 5 paths (`/governance`, `/governance/policies`, `/governance/risks`, ...). هذه تصاميم بـ tab-routing.
- **عناوين الصفحات (`title=`) باللغة العربية أساسًا**؛ بعض الصفحات الإدارية الجديدة (مثل `admin-master-plan.tsx`) تستخدم خليط عربي/إنجليزي في العنوان. الجدول أعلاه يحتفظ بما هو موجود في الكود حرفياً.
- **`pages/admin/users.tsx` و `pages/admin/roles.tsx` و `pages/admin-rbac-matrix.tsx`** هي صفحات تسجل في `/admin/users` و `/admin/roles` و `/admin/rbac-matrix` بالترتيب — جميعها على القائمة تحت "المستخدمين والصلاحيات". يتداخل هذا مع #1413 (Unified users/roles/permissions/visibility) — يوجد أيضاً sub-components `admin/users-tab.tsx`، `admin/roles-tab.tsx`، `admin/rbac-v2-tab.tsx`، `admin/rbac-v2-users-tab.tsx` التي تستوردها `admin.tsx` (`/admin` الأم).
- **العمرة (Umrah)** هي الموديول الذي شهد آخر إعادة هيكلة (انظر تعليق `App.tsx` سطر 61-67 حول VIS-001). كل routes العمرة تأخذ `module: "operations"` على route entry لكن `tagRoutes` يفرض `module: "umrah"` فوقها (sidebar perm).
- **HR** هي أكبر قسم منفرد (95+ صفحة بين main و sub-components). توزّعها على إجمالي 90 route entry يجعلها أكثر الموديولات تعقيدًا.

---
## 8. مراجع متصلة (Cross-references)

- `docs/audit/EXECUTIVE_INVENTORY_REPORT.md` — جرد تنفيذي عام (موديولات).
- `docs/audit/SYSTEM_INVENTORY_MATRIX.md` — مصفوفة inventory جزئية.
- `docs/audit/UNVERIFIED_PATHS_ARCHITECTURE_MAP.md` — خريطة المسارات غير الموثَّقة في المعمارية.
- `artifacts/ghayth-erp/src/components/layout/sidebar-layout.tsx:73-623` — `allNavSections` السلطة الرسمية.
- `artifacts/ghayth-erp/src/components/layout/sidebar-layout.tsx:627-656` — `getAllNavigationPages()` يولّد قائمة الـ paths المسطّحة.
- `artifacts/ghayth-erp/src/routes/registry.ts` — `isRegisteredRoute()` المستخدم لتصفية الـ sidebar.
- `artifacts/ghayth-erp/src/App.tsx:36-69` — `tagRoutes()` و `allModuleRoutes` يربطان الـ route بـ module + minRoleLevel.
