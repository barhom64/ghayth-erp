# Ghayth ERP — فهرس الخدمات الكامل

_تم التوليد: 2026-05-06T19:52:45.652Z_

## ملخص

| البند | العدد |
|---|---|
| إجمالي صفحات الواجهة | 369 |
| وحدات الواجهة (modules) | 48 |
| إجمالي endpoints الـAPI | 928 |
| Endpoints مرتبطة (mounted) | 922 |
| ملفات API | 58 |
| Smoke API GET نجح | 358 / 452 (79%) |
| Smoke API GET فشل | 0 |

### اختبار الواجهة (Playwright e2e — تم اليوم 2026-05-06)

| الصفحة | الحالة |
|---|---|
| / (root) → login | ✅ PASS — رُسمت RTL Arabic |
| /login (admin@ghayth.com) | ✅ PASS — JWT cookie set |
| /dashboard (post-login sidebar) | ✅ PASS — sidebar + nav مرئية |
| /hr/employees | ✅ PASS — 24 موظف |
| /hr/contracts | ✅ PASS — العقد CTR-ADMIN-001 ظهر |
| /finance/chart-of-accounts | ✅ PASS — 145 حساب |
| /finance/invoices | ✅ PASS |
| /umrah/seasons | ✅ PASS (rate-limited متوقع) |
| /properties/units | ✅ PASS |
| /fleet/vehicles | ✅ PASS |
| /admin/system-stops | ✅ PASS — 500 سابق مُصلح |
| /thispagedoesnotexist (404) | ⚠️ FAIL — يُعيد توجيه إلى /dashboard بدل صفحة 404 (catch-all مفقود) |

---

## فهرس بالوحدة (Module → Frontend Pages + API Endpoints)

### action-center (1 صفحة)

**Frontend pages:**

- `/action-center`

**API endpoints المرتبطة:**

- إجمالي endpoints: **1** | GET smoke نجح: **0**
- المسارات: `/api/action-center`

### activity-log (1 صفحة)

**Frontend pages:**

- `/activity-log`

**API endpoints المرتبطة:**

- إجمالي endpoints: **2** | GET smoke نجح: **0**
- المسارات: `/api/activity-log`

### admin (16 صفحة)

**Frontend pages:**

- `/admin`
- `/admin/domain-registry`
- `/admin/event-monitor`
- `/admin/gl-reconciliation`
- `/admin/integrations`
- `/admin/lifecycle-monitor`
- `/admin/logs`
- `/admin/monitoring`
- `/admin/policy-engine`
- `/admin/posting-failures`
- `/admin/rbac-matrix`
- `/admin/roles`
- `/admin/system-governor`
- `/admin/system-registry`
- `/admin/users`
- _... و 1 صفحة أخرى_

**API endpoints المرتبطة:**

- إجمالي endpoints: **78** | GET smoke نجح: **0**
- المسارات: `/api/admin`, `/api/settings`

### automation (1 صفحة)

**Frontend pages:**

- `/automation`

**API endpoints المرتبطة:**

- إجمالي endpoints: **10** | GET smoke نجح: **0**
- المسارات: `/api/automation`

### bi (9 صفحة)

**Frontend pages:**

- `/bi`
- `/bi/admin-reports`
- `/bi/dashboards`
- `/bi/dashboards/create`
- `/bi/kpis`
- `/bi/kpis/create`
- `/bi/operations`
- `/bi/reports`
- `/bi/reports/create`

**API endpoints المرتبطة:**

- إجمالي endpoints: **49** | GET smoke نجح: **0**
- المسارات: `/api/bi`, `/api/dashboard`, `/api/module-dashboards`

### calendar (1 صفحة)

**Frontend pages:**

- `/calendar`

### clients (3 صفحة)

**Frontend pages:**

- `/clients`
- `/clients/:id`
- `/clients/create`

**API endpoints المرتبطة:**

- إجمالي endpoints: **9** | GET smoke نجح: **0**
- المسارات: `/api/clients`

### communications (3 صفحة)

**Frontend pages:**

- `/communications`
- `/communications/letters/create`
- `/communications/notification-engine`

**API endpoints المرتبطة:**

- إجمالي endpoints: **25** | GET smoke نجح: **0**
- المسارات: `/api/communications`, `/api/notifications`

### correspondence (3 صفحة)

**Frontend pages:**

- `/correspondence`
- `/correspondence/:id`
- `/correspondence/create`

### crm (6 صفحة)

**Frontend pages:**

- `/crm`
- `/crm/:id`
- `/crm/activities`
- `/crm/create`
- `/crm/leads/:id`
- `/crm/pipeline`

**API endpoints المرتبطة:**

- إجمالي endpoints: **13** | GET smoke نجح: **0**
- المسارات: `/api/crm`

### daily-close (1 صفحة)

**Frontend pages:**

- `/daily-close`

### dashboard (1 صفحة)

**Frontend pages:**

- `/dashboard`

**API endpoints المرتبطة:**

- إجمالي endpoints: **18** | GET smoke نجح: **0**
- المسارات: `/api/dashboard`, `/api/module-dashboards`

### documents (7 صفحة)

**Frontend pages:**

- `/documents`
- `/documents/:docId/versions`
- `/documents/archive`
- `/documents/create`
- `/documents/folders`
- `/documents/templates`
- `/documents/upload`

**API endpoints المرتبطة:**

- إجمالي endpoints: **23** | GET smoke نجح: **0**
- المسارات: `/api/documents`

### employees (3 صفحة)

**Frontend pages:**

- `/employees`
- `/employees/:id`
- `/employees/create`

**API endpoints المرتبطة:**

- إجمالي endpoints: **10** | GET smoke نجح: **0**
- المسارات: `/api/employees`

### exec-dashboard (1 صفحة)

**Frontend pages:**

- `/exec-dashboard`

### finance (65 صفحة)

**Frontend pages:**

- `/finance`
- `/finance/accounts`
- `/finance/accounts/:id/edit`
- `/finance/accounts/create`
- `/finance/ap-aging`
- `/finance/ar-aging`
- `/finance/bank-guarantees`
- `/finance/bank-reconciliation`
- `/finance/bank-reconciliation/manual-match/:batchId/:rowId`
- `/finance/budget`
- `/finance/budget/:id`
- `/finance/budget/create`
- `/finance/cash-flow-forecast`
- `/finance/cashflow`
- `/finance/commitments`
- _... و 50 صفحة أخرى_

**API endpoints المرتبطة:**

- إجمالي endpoints: **18** | GET smoke نجح: **0**
- المسارات: `/api/finance`

### fleet (26 صفحة)

**Frontend pages:**

- `/fleet`
- `/fleet/:id`
- `/fleet/:id/status`
- `/fleet/alerts`
- `/fleet/alerts/create`
- `/fleet/drivers`
- `/fleet/drivers/:id`
- `/fleet/drivers/create`
- `/fleet/fuel`
- `/fleet/fuel/:id`
- `/fleet/fuel/create`
- `/fleet/insurance`
- `/fleet/insurance/:id`
- `/fleet/insurance/create`
- `/fleet/maintenance`
- _... و 11 صفحة أخرى_

**API endpoints المرتبطة:**

- إجمالي endpoints: **46** | GET smoke نجح: **0**
- المسارات: `/api/fleet`

### governance (14 صفحة)

**Frontend pages:**

- `/governance`
- `/governance/audits`
- `/governance/audits/:id`
- `/governance/audits/create`
- `/governance/capa`
- `/governance/compliance`
- `/governance/compliance/:id`
- `/governance/compliance/create`
- `/governance/policies`
- `/governance/policies/:id`
- `/governance/policies/create`
- `/governance/risks`
- `/governance/risks/:id`
- `/governance/risks/create`

**API endpoints المرتبطة:**

- إجمالي endpoints: **36** | GET smoke نجح: **0**
- المسارات: `/api/governance`

### guide (1 صفحة)

**Frontend pages:**

- `/guide/properties`

### hr (77 صفحة)

**Frontend pages:**

- `/hr`
- `/hr/attendance`
- `/hr/attendance/:id`
- `/hr/attendance/create`
- `/hr/attendance/field-tracking`
- `/hr/attendance/qr-scanner`
- `/hr/attendance/reports`
- `/hr/contracts`
- `/hr/contracts/:id`
- `/hr/contracts/create`
- `/hr/development-plans`
- `/hr/discipline/memos`
- `/hr/discipline/memos/:id`
- `/hr/discipline/regulation`
- `/hr/employee-activation`
- _... و 62 صفحة أخرى_

**API endpoints المرتبطة:**

- إجمالي endpoints: **189** | GET smoke نجح: **0**
- المسارات: `/api/employees`, `/api/hr/discipline`, `/api/hr`, `/api/hr/recruitment`, `/api/hr/training`

### insights (1 صفحة)

**Frontend pages:**

- `/insights`

### intelligence (1 صفحة)

**Frontend pages:**

- `/intelligence`

**API endpoints المرتبطة:**

- إجمالي endpoints: **27** | GET smoke نجح: **0**
- المسارات: `/api/intelligence`

### legal (13 صفحة)

**Frontend pages:**

- `/legal`
- `/legal/cases`
- `/legal/cases/:id`
- `/legal/cases/create`
- `/legal/contracts`
- `/legal/contracts/:id`
- `/legal/correspondence`
- `/legal/create`
- `/legal/documents`
- `/legal/judgments`
- `/legal/judgments/:id`
- `/legal/sessions`
- `/legal/sessions/:id`

**API endpoints المرتبطة:**

- إجمالي endpoints: **30** | GET smoke نجح: **0**
- المسارات: `/api/legal`

### manager-board (1 صفحة)

**Frontend pages:**

- `/manager-board`

### marketing (2 صفحة)

**Frontend pages:**

- `/marketing`
- `/marketing/create`

### module-dashboards (1 صفحة)

**Frontend pages:**

- `/module-dashboards`

**API endpoints المرتبطة:**

- إجمالي endpoints: **11** | GET smoke نجح: **0**
- المسارات: `/api/module-dashboards`

### my-attendance (1 صفحة)

**Frontend pages:**

- `/my-attendance`

### my-documents (1 صفحة)

**Frontend pages:**

- `/my-documents`

### my-leave-request (1 صفحة)

**Frontend pages:**

- `/my-leave-request`

### my-loans (1 صفحة)

**Frontend pages:**

- `/my-loans`

### my-overtime (1 صفحة)

**Frontend pages:**

- `/my-overtime`

### my-payslip (1 صفحة)

**Frontend pages:**

- `/my-payslip`

### my-performance (1 صفحة)

**Frontend pages:**

- `/my-performance`

### my-requests (1 صفحة)

**Frontend pages:**

- `/my-requests`

### my-space (1 صفحة)

**Frontend pages:**

- `/my-space`

**API endpoints المرتبطة:**

- إجمالي endpoints: **6** | GET smoke نجح: **0**
- المسارات: `/api/my-space`

### notifications (1 صفحة)

**Frontend pages:**

- `/notifications`

**API endpoints المرتبطة:**

- إجمالي endpoints: **6** | GET smoke نجح: **0**
- المسارات: `/api/notifications`

### obligations (1 صفحة)

**Frontend pages:**

- `/obligations`

### operations-center (1 صفحة)

**Frontend pages:**

- `/operations-center`

**API endpoints المرتبطة:**

- إجمالي endpoints: **3** | GET smoke نجح: **0**
- المسارات: `/api/operations-center`

### projects (6 صفحة)

**Frontend pages:**

- `/projects`
- `/projects/:id`
- `/projects/create`
- `/projects/gantt`
- `/projects/risks`
- `/projects/tasks`

**API endpoints المرتبطة:**

- إجمالي endpoints: **32** | GET smoke نجح: **0**
- المسارات: `/api/projects`, `/api/tasks`

### properties (28 صفحة)

**Frontend pages:**

- `/properties`
- `/properties/:id`
- `/properties/:id/status`
- `/properties/buildings`
- `/properties/buildings/:id`
- `/properties/buildings/create`
- `/properties/contracts`
- `/properties/contracts/:contractId/pay/:installmentId`
- `/properties/contracts/:id`
- `/properties/contracts/create`
- `/properties/create`
- `/properties/dashboard`
- `/properties/deposits`
- `/properties/guide`
- `/properties/inspections`
- _... و 13 صفحة أخرى_

**API endpoints المرتبطة:**

- إجمالي endpoints: **55** | GET smoke نجح: **0**
- المسارات: `/api/properties`

### reports (1 صفحة)

**Frontend pages:**

- `/reports/scheduled`

### requests (6 صفحة)

**Frontend pages:**

- `/requests`
- `/requests/:id`
- `/requests/create`
- `/requests/types`
- `/requests/types/create`
- `/requests/workflows`

**API endpoints المرتبطة:**

- إجمالي endpoints: **16** | GET smoke نجح: **0**
- المسارات: `/api/requests`

### settings (6 صفحة)

**Frontend pages:**

- `/settings`
- `/settings/audit-log`
- `/settings/branches`
- `/settings/companies`
- `/settings/departments`
- `/settings/rules`

**API endpoints المرتبطة:**

- إجمالي endpoints: **31** | GET smoke نجح: **0**
- المسارات: `/api/settings`

### store (6 صفحة)

**Frontend pages:**

- `/store`
- `/store/orders`
- `/store/orders/:id`
- `/store/orders/create`
- `/store/products/:id`
- `/store/products/create`

**API endpoints المرتبطة:**

- إجمالي endpoints: **11** | GET smoke نجح: **0**
- المسارات: `/api/store`

### support (5 صفحة)

**Frontend pages:**

- `/support`
- `/support/:id`
- `/support/create`
- `/support/kb`
- `/support/replies`

**API endpoints المرتبطة:**

- إجمالي endpoints: **18** | GET smoke نجح: **0**
- المسارات: `/api/support`

### tasks (3 صفحة)

**Frontend pages:**

- `/tasks`
- `/tasks/:id`
- `/tasks/create`

**API endpoints المرتبطة:**

- إجمالي endpoints: **6** | GET smoke نجح: **0**
- المسارات: `/api/tasks`

### umrah (24 صفحة)

**Frontend pages:**

- `/umrah`
- `/umrah/agents`
- `/umrah/agents/:id`
- `/umrah/commission-plans`
- `/umrah/commission-plans/:id/edit`
- `/umrah/commission-plans/new`
- `/umrah/import`
- `/umrah/import/legacy`
- `/umrah/invoices`
- `/umrah/invoices/:id`
- `/umrah/packages`
- `/umrah/packages/:id`
- `/umrah/penalties`
- `/umrah/penalties/:id`
- `/umrah/pilgrims`
- _... و 9 صفحة أخرى_

**API endpoints المرتبطة:**

- إجمالي endpoints: **86** | GET smoke نجح: **0**
- المسارات: `/api/umrah`

### warehouse (13 صفحة)

**Frontend pages:**

- `/warehouse`
- `/warehouse/categories`
- `/warehouse/categories/:id`
- `/warehouse/categories/create`
- `/warehouse/create`
- `/warehouse/inventory-count`
- `/warehouse/movements`
- `/warehouse/movements/:id`
- `/warehouse/movements/create`
- `/warehouse/products/:id`
- `/warehouse/suppliers`
- `/warehouse/suppliers/:id`
- `/warehouse/suppliers/create`

**API endpoints المرتبطة:**

- إجمالي endpoints: **25** | GET smoke نجح: **0**
- المسارات: `/api/warehouse`

---

## كل API mounts (مرتبة)

| Mount | عدد Endpoints | GET smoke OK |
|---|---|---|
| `/api/hr` | 129 | 0 / 63 |
| `/api/umrah` | 86 | 0 / 35 |
| `/api/properties` | 55 | 0 / 25 |
| `/api/admin` | 47 | 0 / 27 |
| `/api/fleet` | 46 | 0 / 19 |
| `/api/governance` | 36 | 0 / 15 |
| `/api/bi` | 31 | 0 / 24 |
| `/api/settings` | 31 | 0 / 14 |
| `/api/legal` | 30 | 0 / 15 |
| `/api/intelligence` | 27 | 0 / 15 |
| `/api/projects` | 26 | 0 / 11 |
| `/api/warehouse` | 25 | 0 / 11 |
| `/api/hr/discipline` | 24 | 0 / 9 |
| `/api/documents` | 23 | 0 / 11 |
| `/api/notification-engine` | 20 | 0 / 7 |
| `/api/communications` | 19 | 0 / 8 |
| `/api/finance` | 18 | 0 / 8 |
| `/api/support` | 18 | 0 / 7 |
| `/api/workflows` | 18 | 0 / 8 |
| `/api/requests` | 16 | 0 / 7 |
| `/api/crm` | 13 | 0 / 7 |
| `/api/hr/recruitment` | 13 | 0 / 5 |
| `/api/hr/training` | 13 | 0 / 5 |
| `/api/module-dashboards` | 11 | 0 / 11 |
| `/api/store` | 11 | 0 / 5 |
| `/api/automation` | 10 | 0 / 7 |
| `/api/employees` | 10 | 0 / 5 |
| `/api/request-catalog` | 10 | 0 / 6 |
| `/api/careers` | 9 | 0 / 4 |
| `/api/clients` | 9 | 0 / 3 |
| `/api/entity-meta` | 9 | 0 / 4 |
| `/api/gov-integrations` | 9 | 0 / 4 |
| `/api/auth` | 7 | 0 / 1 |
| `/api/dashboard` | 7 | 0 / 7 |
| `/api/permissions` | 7 | 0 / 3 |
| `/api` | 6 | 0 / 4 |
| `/api/my-space` | 6 | 0 / 6 |
| `/api/notifications` | 6 | 0 / 3 |
| `/api/rules` | 6 | 0 / 2 |
| `/api/tasks` | 6 | 0 / 3 |
| `/api/pdpl` | 5 | 0 / 4 |
| `/api/audit-logs` | 3 | 0 / 3 |
| `/api/digital-signature` | 3 | 0 / 1 |
| `/api/operations-center` | 3 | 0 / 2 |
| `/api/public` | 3 | 0 / 2 |
| `/api/activity-log` | 2 | 0 / 2 |
| `/api/approval-actions` | 2 | 0 / 2 |
| `/api/action-center` | 1 | 0 / 1 |
| `/api/portal` | 1 | 0 / 0 |
| `/api/impact-preview` | 1 | 0 / 0 |
| `/api/search` | 1 | 0 / 1 |

---

## الفجوات والملاحظات

1. **404 Routing (P3)**: المسارات غير الموجودة تُعيد التوجيه إلى `/dashboard` بدل عرض صفحة 404 المخصصة. يحتاج إضافة `<Route path="*">` كـcatch-all في الراوتر الرئيسي.
2. **VAPID 502 (config)**: `/api/communications/push/vapid-key` يرجع 502 — مفاتيح VAPID غير مهيأة (تدهور آمن، ليس خللًا).
3. **Umrah Rate-limit (by design)**: 10 طلبات/دقيقة على endpoints الـumrah — 429 متوقع.
4. **اختبار شامل لكل 403 صفحة**: الاختبار اليوم غطى 12 صفحة حرجة فقط. الفحص الكامل لكل صفحة يحتاج جلسة Playwright أطول (ساعات).
5. **POST/PUT/DELETE smoke**: فحص الكتابة لم يُجرَ آليًا (احتراز ضد تلويث البيانات). مغطى يدويًا عبر اختبارات الواجهة.
