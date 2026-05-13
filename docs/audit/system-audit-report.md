# تقرير Ghaith System Auditor

> تاريخ التوليد: 2026-05-13T13:15:38.711Z

## التوصية العامة: 🛑 Stop Ship

## ملخّص

| البند | العدد |
|---|---:|
| إجمالي المسارات | 83 |
| ✅ Pass | 15 |
| ⚠️ Needs Fix | 12 |
| 🛑 Stop Ship | 56 |
| 🔴 ملاحظات حرجة | 213 |
| 🟠 ملاحظات متوسطة | 394 |
| 🔵 اقتراحات تحسين | 1713 |

## نتائج المحاور

| المحور | التوصية | عدد الملاحظات |
|---|---|---:|
| قاعدة البيانات | 🛑 Stop Ship | 1393 |
| حدود المسارات | 🛑 Stop Ship | 3 |
| API Contracts | ✅ Pass | 61 |
| الواجهة | 🛑 Stop Ship | 658 |
| الصلاحيات والتدقيق | 🛑 Stop Ship | 41 |
| الأحداث | 🛑 Stop Ship | 164 |

## نتائج المسارات

| المسار | اكتمال | التوصية | Entities | Events | RBAC | Audit |
|---|---:|---|---:|---:|---:|---:|
| `events` | 24% | 🛑 Stop Ship | 0 | 0 | 0 | 0 |
| `index` | 24% | 🛑 Stop Ship | 0 | 0 | 0 | 0 |
| `health` | 31% | 🛑 Stop Ship | 0 | 0 | 0 | 0 |
| `approvalActions` | 39% | 🛑 Stop Ship | 0 | 0 | 100 | 0 |
| `auditLogs` | 39% | 🛑 Stop Ship | 0 | 0 | 100 | 0 |
| `export` | 39% | 🛑 Stop Ship | 0 | 0 | 100 | 0 |
| `actionCenter` | 46% | 🛑 Stop Ship | 0 | 0 | 100 | 0 |
| `activityLog` | 46% | 🛑 Stop Ship | 0 | 0 | 100 | 0 |
| `calendar` | 46% | 🛑 Stop Ship | 0 | 0 | 100 | 0 |
| `dashboard` | 46% | 🛑 Stop Ship | 0 | 0 | 100 | 0 |
| `execDashboard` | 46% | 🛑 Stop Ship | 0 | 0 | 100 | 0 |
| `moduleDashboards` | 46% | 🛑 Stop Ship | 0 | 0 | 100 | 0 |
| `mySpace` | 46% | 🛑 Stop Ship | 0 | 0 | 100 | 0 |
| `search` | 46% | 🛑 Stop Ship | 0 | 0 | 100 | 0 |
| `finance-reports` | 51% | 🛑 Stop Ship | 0 | 0 | 100 | 0 |
| `activityIngest` | 53% | 🛑 Stop Ship | 0 | 1 | 0 | 1 |
| `import` | 53% | 🛑 Stop Ship | 0 | 0 | 100 | 2 |
| `scheduled-reports` | 53% | 🛑 Stop Ship | 1 | 0 | 100 | 0 |
| `hr-contracts` | 60% | 🛑 Stop Ship | 0 | 0 | 100 | 9 |
| `obligations` | 60% | 🛑 Stop Ship | 0 | 6 | 100 | 0 |
| `auth` | 74% | 🛑 Stop Ship | 2 | 6 | 0 | 7 |
| `careersPortal` | 74% | 🛑 Stop Ship | 3 | 5 | 0 | 5 |
| `clientPortal` | 74% | 🛑 Stop Ship | 5 | 7 | 0 | 7 |
| `correspondence` | 74% | ⚠️ Needs Fix | 0 | 4 | 100 | 3 |
| `finance-algorithms` | 74% | 🛑 Stop Ship | 4 | 6 | 100 | 0 |
| `finance-gl-helpers` | 74% | 🛑 Stop Ship | 0 | 1 | 100 | 1 |
| `hr-exit` | 74% | 🛑 Stop Ship | 0 | 3 | 100 | 2 |
| `impactPreview` | 74% | ⚠️ Needs Fix | 0 | 1 | 100 | 1 |
| `publicData` | 74% | 🛑 Stop Ship | 3 | 1 | 0 | 1 |
| `rbacV2` | 74% | 🛑 Stop Ship | 6 | 0 | 100 | 19 |
| `accounting-engine` | 81% | ⚠️ Needs Fix | 4 | 7 | 100 | 7 |
| `automation` | 81% | ⚠️ Needs Fix | 2 | 3 | 100 | 3 |
| `digital-signature` | 81% | ⚠️ Needs Fix | 1 | 2 | 100 | 2 |
| `finance-collection` | 81% | 🛑 Stop Ship | 1 | 1 | 100 | 1 |
| `finance-recurring` | 81% | ⚠️ Needs Fix | 1 | 4 | 100 | 4 |
| `notification-engine` | 81% | ⚠️ Needs Fix | 6 | 13 | 100 | 13 |
| `notifications` | 81% | ⚠️ Needs Fix | 3 | 3 | 100 | 3 |
| `pdpl` | 81% | ⚠️ Needs Fix | 2 | 1 | 100 | 1 |
| `permissions` | 81% | ⚠️ Needs Fix | 3 | 4 | 100 | 4 |
| `rules` | 81% | ⚠️ Needs Fix | 1 | 4 | 100 | 4 |
| `storage` | 81% | ⚠️ Needs Fix | 2 | 1 | 100 | 1 |
| `workflows` | 81% | 🛑 Stop Ship | 3 | 7 | 100 | 10 |
| `admin` | 89% | 🛑 Stop Ship | 14 | 18 | 100 | 20 |
| `clients` | 89% | ✅ Pass | 2 | 3 | 100 | 6 |
| `communications` | 89% | 🛑 Stop Ship | 8 | 13 | 100 | 11 |
| `crm` | 89% | 🛑 Stop Ship | 3 | 12 | 100 | 6 |
| `documents` | 89% | 🛑 Stop Ship | 5 | 12 | 100 | 12 |
| `employees` | 89% | 🛑 Stop Ship | 1 | 5 | 100 | 5 |
| `entityMeta` | 89% | ✅ Pass | 3 | 4 | 100 | 5 |
| `finance-accounts` | 89% | ✅ Pass | 1 | 4 | 100 | 4 |
| `finance-budget` | 89% | ✅ Pass | 1 | 4 | 100 | 4 |
| `finance-cost-centers` | 89% | 🛑 Stop Ship | 1 | 3 | 100 | 3 |
| `finance-custodies` | 89% | ✅ Pass | 1 | 2 | 100 | 3 |
| `finance-hardening` | 89% | 🛑 Stop Ship | 6 | 9 | 100 | 7 |
| `finance-invoices` | 89% | 🛑 Stop Ship | 5 | 11 | 100 | 3 |
| `finance-journal` | 89% | 🛑 Stop Ship | 3 | 9 | 100 | 2 |
| `finance-purchase` | 89% | 🛑 Stop Ship | 7 | 4 | 100 | 1 |
| `finance-vendors` | 89% | ✅ Pass | 1 | 3 | 100 | 3 |
| `fleet` | 89% | 🛑 Stop Ship | 7 | 32 | 100 | 27 |
| `gov-integrations` | 89% | ✅ Pass | 2 | 5 | 100 | 5 |
| `governance` | 89% | ✅ Pass | 7 | 19 | 100 | 20 |
| `hr-discipline` | 89% | 🛑 Stop Ship | 3 | 9 | 100 | 8 |
| `hr-loans` | 89% | 🛑 Stop Ship | 2 | 5 | 100 | 3 |
| `hr-overtime` | 89% | 🛑 Stop Ship | 2 | 5 | 100 | 3 |
| `hr` | 89% | 🛑 Stop Ship | 24 | 54 | 100 | 51 |
| `intelligence` | 89% | 🛑 Stop Ship | 1 | 13 | 100 | 12 |
| `legal` | 89% | 🛑 Stop Ship | 5 | 17 | 100 | 14 |
| `marketing` | 89% | ✅ Pass | 1 | 4 | 100 | 4 |
| `operationsCenter` | 89% | ✅ Pass | 2 | 1 | 100 | 1 |
| `projects` | 89% | 🛑 Stop Ship | 6 | 17 | 100 | 14 |
| `properties` | 89% | 🛑 Stop Ship | 12 | 31 | 100 | 32 |
| `recruitment` | 89% | ✅ Pass | 2 | 8 | 100 | 8 |
| `requests` | 89% | 🛑 Stop Ship | 5 | 8 | 100 | 8 |
| `store` | 89% | ✅ Pass | 2 | 7 | 100 | 6 |
| `support` | 89% | 🛑 Stop Ship | 5 | 12 | 100 | 10 |
| `tasks` | 89% | 🛑 Stop Ship | 1 | 3 | 100 | 3 |
| `training` | 89% | ✅ Pass | 2 | 6 | 100 | 6 |
| `umrah` | 89% | 🛑 Stop Ship | 9 | 26 | 100 | 26 |
| `warehouse` | 89% | 🛑 Stop Ship | 6 | 12 | 100 | 12 |
| `bi` | 94% | ✅ Pass | 6 | 7 | 100 | 7 |
| `finance-zatca` | 94% | 🛑 Stop Ship | 3 | 1 | 100 | 1 |
| `settings` | 94% | ✅ Pass | 8 | 4 | 100 | 17 |
| `umrah-entities` | 94% | 🛑 Stop Ship | 16 | 24 | 100 | 27 |

## أبرز الملاحظات لكل محور

### قاعدة البيانات — 🛑 Stop Ship (1393 ملاحظة)

- 🔴 **db**: العمود companies.taxNumber معرَّف في schema/migrations لكنه غير موجود في قاعدة البيانات الحيّة (Migration لم تُطبَّق؟)
- 🔴 **db**: العمود companies.currency معرَّف في schema/migrations لكنه غير موجود في قاعدة البيانات الحيّة (Migration لم تُطبَّق؟)
- 🔴 **db**: العمود companies.timezone معرَّف في schema/migrations لكنه غير موجود في قاعدة البيانات الحيّة (Migration لم تُطبَّق؟)
- 🔴 **db**: العمود employees.updatedAt معرَّف في schema/migrations لكنه غير موجود في قاعدة البيانات الحيّة (Migration لم تُطبَّق؟)
- 🔴 **db**: العمود employee_assignments.startDate معرَّف في schema/migrations لكنه غير موجود في قاعدة البيانات الحيّة (Migration لم تُطبَّق؟)
- 🔴 **db**: العمود hr_leave_types.requiresApproval معرَّف في schema/migrations لكنه غير موجود في قاعدة البيانات الحيّة (Migration لم تُطبَّق؟)
- 🔴 **db**: العمود clients.taxNumber معرَّف في schema/migrations لكنه غير موجود في قاعدة البيانات الحيّة (Migration لم تُطبَّق؟)
- 🔴 **db**: العمود clients.address معرَّف في schema/migrations لكنه غير موجود في قاعدة البيانات الحيّة (Migration لم تُطبَّق؟)
- 🔴 **db**: العمود clients.status معرَّف في schema/migrations لكنه غير موجود في قاعدة البيانات الحيّة (Migration لم تُطبَّق؟)
- 🔴 **db**: العمود invoices.IF معرَّف في schema/migrations لكنه غير موجود في قاعدة البيانات الحيّة (Migration لم تُطبَّق؟)
- 🔵 **db**: قراءة من جدول غير موجود في قاعدة البيانات الحيّة: idset
- 🔵 **db**: جدول حيّ بلا تعريف في schema ولا قراءة من أي route: employee_salary_components
- 🔵 **db**: جدول حيّ بلا تعريف في schema ولا قراءة من أي route: payroll_deductions

### حدود المسارات — 🛑 Stop Ship (3 ملاحظة)

- 🔴 **finance-hardening**: كتابة عابرة للحدود: finance-hardening يكتب في جدول projects المملوك لمسار projects _(artifacts/api-server/src/routes/finance-hardening.ts:1141)_
- 🟠 **finance-hardening**: قراءة عابرة للحدود: finance-hardening يقرأ من جدول projects المملوك لمسار projects _(artifacts/api-server/src/routes/finance-hardening.ts:1141)_
- 🟠 **umrah-entities**: قراءة عابرة للحدود: umrah-entities يقرأ من جدول employee_assignments المملوك لمسار hr _(artifacts/api-server/src/routes/umrah-entities.ts:1011)_

### API Contracts — ✅ Pass (61 ملاحظة)

- 🟠 **api-contracts**: endpoint موثّق في openapi.yaml بدون تنفيذ مطابق: GET /auth/me
- 🟠 **api-contracts**: endpoint موثّق في openapi.yaml بدون تنفيذ مطابق: GET /dashboard/summary
- 🟠 **api-contracts**: endpoint موثّق في openapi.yaml بدون تنفيذ مطابق: GET /employees
- 🟠 **api-contracts**: endpoint موثّق في openapi.yaml بدون تنفيذ مطابق: POST /employees
- 🟠 **api-contracts**: endpoint موثّق في openapi.yaml بدون تنفيذ مطابق: GET /employees/{x}
- 🔵 **actionCenter**: 1 handler بدون أي ربط بجدول/خدمة (entities = 0) — تأكد من طبقة البيانات. _(artifacts/api-server/src/routes/actionCenter.ts)_
- 🔵 **activityIngest**: 1 handler بدون أي ربط بجدول/خدمة (entities = 0) — تأكد من طبقة البيانات. _(artifacts/api-server/src/routes/activityIngest.ts)_
- 🔵 **activityLog**: 2 handler بدون أي ربط بجدول/خدمة (entities = 0) — تأكد من طبقة البيانات. _(artifacts/api-server/src/routes/activityLog.ts)_

### الواجهة — 🛑 Stop Ship (658 ملاحظة)

- 🔴 **frontend**: الصفحة تستخدم fetch/axios مباشرة بدلاً من hooks المُولَّدة في lib/api-client-react _(artifacts/ghayth-erp/src/pages/create/documents/version-upload.tsx)_
- 🔴 **frontend**: الصفحة تستخدم fetch/axios مباشرة بدلاً من hooks المُولَّدة في lib/api-client-react _(artifacts/ghayth-erp/src/pages/documents/documents-upload.tsx)_
- 🔴 **frontend**: الصفحة تستخدم fetch/axios مباشرة بدلاً من hooks المُولَّدة في lib/api-client-react _(artifacts/ghayth-erp/src/pages/documents-page.tsx)_
- 🔴 **frontend**: الصفحة تستخدم fetch/axios مباشرة بدلاً من hooks المُولَّدة في lib/api-client-react _(artifacts/ghayth-erp/src/pages/login.tsx)_
- 🔴 **frontend**: الصفحة تستخدم fetch/axios مباشرة بدلاً من hooks المُولَّدة في lib/api-client-react _(artifacts/ghayth-erp/src/pages/umrah/daily-runsheet.tsx)_
- 🟠 **frontend**: صفحة تحتوي علامات TODO/قيد الإنشاء/placeholder _(artifacts/ghayth-erp/src/pages/action-center.tsx)_
- 🟠 **frontend**: صفحة تحتوي علامات TODO/قيد الإنشاء/placeholder _(artifacts/ghayth-erp/src/pages/admin/audit-explorer-tab.tsx)_
- 🟠 **frontend**: صفحة تحتوي علامات TODO/قيد الإنشاء/placeholder _(artifacts/ghayth-erp/src/pages/admin/logs-tab.tsx)_
- 🟠 **frontend**: صفحة تحتوي علامات TODO/قيد الإنشاء/placeholder _(artifacts/ghayth-erp/src/pages/admin/logs.tsx)_
- 🟠 **frontend**: صفحة تحتوي علامات TODO/قيد الإنشاء/placeholder _(artifacts/ghayth-erp/src/pages/admin/permissions-tab.tsx)_
- 🔵 **frontend**: 5 زر بدون onClick (heuristic — قد يكون submit form) _(artifacts/ghayth-erp/src/pages/action-center.tsx)_
- 🔵 **frontend**: 7 زر بدون onClick (heuristic — قد يكون submit form) _(artifacts/ghayth-erp/src/pages/activity-log.tsx)_
- 🔵 **frontend**: 1 زر بدون onClick (heuristic — قد يكون submit form) _(artifacts/ghayth-erp/src/pages/admin/logs.tsx)_

### الصلاحيات والتدقيق — 🛑 Stop Ship (41 ملاحظة)

- 🔴 **activityIngest**: POST /intelligence/activity بدون صلاحية واضحة (requirePermission/authorize) _(artifacts/api-server/src/routes/activityIngest.ts:26)_
- 🔴 **communications**: POST /whatsapp/webhook بدون صلاحية واضحة (requirePermission/authorize) _(artifacts/api-server/src/routes/communications.ts:157)_
- 🔴 **communications**: POST /pbx/incoming بدون صلاحية واضحة (requirePermission/authorize) _(artifacts/api-server/src/routes/communications.ts:264)_
- 🔴 **communications**: POST /pbx/completed بدون صلاحية واضحة (requirePermission/authorize) _(artifacts/api-server/src/routes/communications.ts:344)_
- 🔴 **communications**: POST /pbx/status بدون صلاحية واضحة (requirePermission/authorize) _(artifacts/api-server/src/routes/communications.ts:397)_
- 🔴 **import**: POST /preview بدون صلاحية واضحة (requirePermission/authorize) _(artifacts/api-server/src/routes/import.ts:149)_
- 🔴 **import**: POST /confirm بدون صلاحية واضحة (requirePermission/authorize) _(artifacts/api-server/src/routes/import.ts:175)_
- 🔴 **rbacV2**: POST /jit/request بدون صلاحية واضحة (requirePermission/authorize) _(artifacts/api-server/src/routes/rbacV2.ts:940)_
- 🔴 **rbacV2**: POST /jit/:id/cancel بدون صلاحية واضحة (requirePermission/authorize) _(artifacts/api-server/src/routes/rbacV2.ts:1166)_
- 🟠 **accounting-engine**: POST /journal-templates (عملية مالية) بدون idempotency key _(artifacts/api-server/src/routes/accounting-engine.ts:336)_
- 🟠 **accounting-engine**: PUT /journal-templates/:id (عملية مالية) بدون idempotency key _(artifacts/api-server/src/routes/accounting-engine.ts:384)_
- 🟠 **accounting-engine**: DELETE /journal-templates/:id (عملية مالية) بدون idempotency key _(artifacts/api-server/src/routes/accounting-engine.ts:439)_
- 🟠 **automation**: POST /cron-jobs/:id/toggle (عملية مالية) بدون idempotency key _(artifacts/api-server/src/routes/automation.ts:19)_
- 🟠 **automation**: POST /proactive-rules/:id/toggle (عملية مالية) بدون idempotency key _(artifacts/api-server/src/routes/automation.ts:105)_

### الأحداث — 🛑 Stop Ship (164 ملاحظة)

- 🔴 **admin**: الحدث المُطلَق "admin.integration.tested" غير مسجَّل في eventCatalog.ts _(artifacts/api-server/src/routes/admin.ts)_
- 🔴 **auth**: الحدث المُطلَق "auth.logout" غير مسجَّل في eventCatalog.ts _(artifacts/api-server/src/routes/auth.ts)_
- 🔴 **clientPortal**: الحدث المُطلَق "portal.csat.submitted" غير مسجَّل في eventCatalog.ts _(artifacts/api-server/src/routes/clientPortal.ts)_
- 🔴 **clientPortal**: الحدث المُطلَق "portal.invoice.paid" غير مسجَّل في eventCatalog.ts _(artifacts/api-server/src/routes/clientPortal.ts)_
- 🔴 **clientPortal**: الحدث المُطلَق "portal.kb_feedback.submitted" غير مسجَّل في eventCatalog.ts _(artifacts/api-server/src/routes/clientPortal.ts)_
- 🔴 **clientPortal**: الحدث المُطلَق "portal.password.changed" غير مسجَّل في eventCatalog.ts _(artifacts/api-server/src/routes/clientPortal.ts)_
- 🔴 **clientPortal**: الحدث المُطلَق "portal.ticket.created" غير مسجَّل في eventCatalog.ts _(artifacts/api-server/src/routes/clientPortal.ts)_
- 🔴 **clientPortal**: الحدث المُطلَق "portal.ticket_reply.created" غير مسجَّل في eventCatalog.ts _(artifacts/api-server/src/routes/clientPortal.ts)_
- 🔴 **communications**: الحدث المُطلَق "communication.pbx.completed" غير مسجَّل في eventCatalog.ts _(artifacts/api-server/src/routes/communications.ts)_
- 🔴 **communications**: الحدث المُطلَق "communication.pbx.incoming" غير مسجَّل في eventCatalog.ts _(artifacts/api-server/src/routes/communications.ts)_
- 🟠 **projects**: projects يُطلق حدثًا عابرًا للنطاقات: project.closed (نطاقه الرسمي: project) _(artifacts/api-server/src/routes/projects.ts)_
- 🟠 **projects**: projects يُطلق حدثًا عابرًا للنطاقات: project.cost.created (نطاقه الرسمي: project) _(artifacts/api-server/src/routes/projects.ts)_
- 🟠 **projects**: projects يُطلق حدثًا عابرًا للنطاقات: project.created (نطاقه الرسمي: project) _(artifacts/api-server/src/routes/projects.ts)_
- 🟠 **projects**: projects يُطلق حدثًا عابرًا للنطاقات: project.deleted (نطاقه الرسمي: project) _(artifacts/api-server/src/routes/projects.ts)_
- 🟠 **projects**: projects يُطلق حدثًا عابرًا للنطاقات: project.impact_preview (نطاقه الرسمي: project) _(artifacts/api-server/src/routes/projects.ts)_

## تفاصيل المسارات (مختصر)

### `events` — 🛑 Stop Ship (24%)

- **Entities**: —
- **States**: —
- **Events**: —
- **RBAC guards**: 0 _(عدد استدعاءات: 0 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 0
- **Handlers**: 0
- **ملاحظات (أول 5)**:
  - 🔵 1 استجابة خطأ بدون مغلّف موحّد { error: { code, field, fix } }
  - 🟠 حدث حرج معرَّف في الكتالوج لكنه لا يُطلَق من أي route: finance.invoice.created
  - 🟠 حدث حرج معرَّف في الكتالوج لكنه لا يُطلَق من أي route: finance.invoice.paid
  - 🟠 حدث حرج معرَّف في الكتالوج لكنه لا يُطلَق من أي route: finance.invoice.overdue
  - 🟠 حدث حرج معرَّف في الكتالوج لكنه لا يُطلَق من أي route: finance.payment.sent

### `index` — 🛑 Stop Ship (24%)

- **Entities**: —
- **States**: —
- **Events**: —
- **RBAC guards**: 0 _(عدد استدعاءات: 0 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 0
- **Handlers**: 2
- **ملاحظات (أول 5)**:
  - 🔵 2 handler بدون أي ربط بجدول/خدمة (entities = 0) — تأكد من طبقة البيانات.
  - 🔵 1 استجابة خطأ بدون مغلّف موحّد { error: { code, field, fix } }

### `health` — 🛑 Stop Ship (31%)

- **Entities**: —
- **States**: critical, ok
- **Events**: —
- **RBAC guards**: 0 _(عدد استدعاءات: 0 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 0
- **Handlers**: 2
- **ملاحظات (أول 5)**:
  - 🔵 2 handler بدون أي ربط بجدول/خدمة (entities = 0) — تأكد من طبقة البيانات.
  - 🔵 1 استجابة خطأ بدون مغلّف موحّد { error: { code, field, fix } }

### `approvalActions` — 🛑 Stop Ship (39%)

- **Entities**: —
- **States**: —
- **Events**: —
- **RBAC guards**: 100 _(عدد استدعاءات: 2 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 0
- **Handlers**: 2
- **ملاحظات (أول 5)**:
  - 🔵 2 handler بدون أي ربط بجدول/خدمة (entities = 0) — تأكد من طبقة البيانات.

### `auditLogs` — 🛑 Stop Ship (39%)

- **Entities**: —
- **States**: —
- **Events**: —
- **RBAC guards**: 100 _(عدد استدعاءات: 3 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 0
- **Handlers**: 3
- **ملاحظات (أول 5)**:
  - 🔵 3 handler بدون أي ربط بجدول/خدمة (entities = 0) — تأكد من طبقة البيانات.
  - 🔵 1 استجابة خطأ بدون مغلّف موحّد { error: { code, field, fix } }

### `export` — 🛑 Stop Ship (39%)

- **Entities**: —
- **States**: —
- **Events**: —
- **RBAC guards**: 100 _(عدد استدعاءات: 12 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 0
- **Handlers**: 0

### `actionCenter` — 🛑 Stop Ship (46%)

- **Entities**: —
- **States**: open, pending, pending_approval
- **Events**: —
- **RBAC guards**: 100 _(عدد استدعاءات: 1 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 0
- **Handlers**: 1
- **ملاحظات (أول 5)**:
  - 🔵 1 handler بدون أي ربط بجدول/خدمة (entities = 0) — تأكد من طبقة البيانات.

### `activityLog` — 🛑 Stop Ship (46%)

- **Entities**: —
- **States**: active, open, overdue, pending
- **Events**: —
- **RBAC guards**: 100 _(عدد استدعاءات: 2 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 0
- **Handlers**: 2
- **ملاحظات (أول 5)**:
  - 🔵 2 handler بدون أي ربط بجدول/خدمة (entities = 0) — تأكد من طبقة البيانات.

### `calendar` — 🛑 Stop Ship (46%)

- **Entities**: —
- **States**: active, closes, due, expiring, opens, scheduled
- **Events**: —
- **RBAC guards**: 100 _(عدد استدعاءات: 1 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 0
- **Handlers**: 0

### `dashboard` — 🛑 Stop Ship (46%)

- **Entities**: —
- **States**: absent, active, completed, in_progress, late, open, pending, present
- **Events**: —
- **RBAC guards**: 100 _(عدد استدعاءات: 7 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 0
- **Handlers**: 7
- **ملاحظات (أول 5)**:
  - 🔵 7 handler بدون أي ربط بجدول/خدمة (entities = 0) — تأكد من طبقة البيانات.

### `execDashboard` — 🛑 Stop Ship (46%)

- **Entities**: —
- **States**: active, open, posted
- **Events**: —
- **RBAC guards**: 100 _(عدد استدعاءات: 3 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 0
- **Handlers**: 0

### `moduleDashboards` — 🛑 Stop Ship (46%)

- **Entities**: —
- **States**: absent, active, approved, available, blocked, cancelled, closed, completed, done, in_progress
- **Events**: —
- **RBAC guards**: 100 _(عدد استدعاءات: 11 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 0
- **Handlers**: 11
- **ملاحظات (أول 5)**:
  - 🔵 11 handler بدون أي ربط بجدول/خدمة (entities = 0) — تأكد من طبقة البيانات.

### `mySpace` — 🛑 Stop Ship (46%)

- **Entities**: —
- **States**: active, approved, available, closed, draft, in_use, inactive, maintenance, open, overdue
- **Events**: —
- **RBAC guards**: 100 _(عدد استدعاءات: 6 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 0
- **Handlers**: 6
- **ملاحظات (أول 5)**:
  - 🔵 6 handler بدون أي ربط بجدول/خدمة (entities = 0) — تأكد من طبقة البيانات.

### `search` — 🛑 Stop Ship (46%)

- **Entities**: —
- **States**: active
- **Events**: —
- **RBAC guards**: 100 _(عدد استدعاءات: 1 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 0
- **Handlers**: 1
- **ملاحظات (أول 5)**:
  - 🔵 1 handler بدون أي ربط بجدول/خدمة (entities = 0) — تأكد من طبقة البيانات.

### `finance-reports` — 🛑 Stop Ship (51%)

- **Entities**: —
- **States**: posted
- **Events**: —
- **RBAC guards**: 100 _(عدد استدعاءات: 14 استدعاء)_
- **Settings**: —
- **Reports**: 13 مرجع تقرير
- **Audit calls**: 0
- **Handlers**: 0

### `activityIngest` — 🛑 Stop Ship (53%)

- **Entities**: —
- **States**: —
- **Events**: activity.ingested
- **RBAC guards**: 0 _(عدد استدعاءات: 0 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 1
- **Handlers**: 1
- **ملاحظات (أول 5)**:
  - 🔵 1 handler بدون أي ربط بجدول/خدمة (entities = 0) — تأكد من طبقة البيانات.
  - 🔴 POST /intelligence/activity بدون صلاحية واضحة (requirePermission/authorize)

### `import` — 🛑 Stop Ship (53%)

- **Entities**: —
- **States**: —
- **Events**: —
- **RBAC guards**: 100 _(عدد استدعاءات: 6 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 2
- **Handlers**: 6
- **ملاحظات (أول 5)**:
  - 🔵 6 handler بدون أي ربط بجدول/خدمة (entities = 0) — تأكد من طبقة البيانات.
  - 🔵 1 استجابة خطأ بدون مغلّف موحّد { error: { code, field, fix } }
  - 🔴 POST /preview بدون صلاحية واضحة (requirePermission/authorize)
  - 🔴 POST /confirm بدون صلاحية واضحة (requirePermission/authorize)

### `scheduled-reports` — 🛑 Stop Ship (53%)

- **Entities**: scheduled_reports
- **States**: —
- **Events**: —
- **RBAC guards**: 100 _(عدد استدعاءات: 5 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 0
- **Handlers**: 0

### `hr-contracts` — 🛑 Stop Ship (60%)

- **Entities**: —
- **States**: active, terminated
- **Events**: —
- **RBAC guards**: 100 _(عدد استدعاءات: 11 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 9
- **Handlers**: 0

### `obligations` — 🛑 Stop Ship (60%)

- **Entities**: —
- **States**: cancelled, met, pending
- **Events**: obligation.cancelled, obligation.cancelled_by_entity, obligation.created, obligation.met, obligation.met_by_entity, obligation.scan_triggered
- **RBAC guards**: 100 _(عدد استدعاءات: 8 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 0
- **Handlers**: 0

### `auth` — 🛑 Stop Ship (74%)

- **Entities**: refresh_tokens, users
- **States**: active
- **Events**: auth.login.success, auth.logout, auth.password.changed, auth.refresh, auth.register, auth.switch_assignment
- **RBAC guards**: 0 _(عدد استدعاءات: 0 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 7
- **Handlers**: 7
- **ملاحظات (أول 5)**:
  - 🔵 3 استجابة خطأ بدون مغلّف موحّد { error: { code, field, fix } }
  - 🔴 الحدث المُطلَق "auth.logout" غير مسجَّل في eventCatalog.ts

### `careersPortal` — 🛑 Stop Ship (74%)

- **Entities**: applicant_accounts, job_applications, job_postings
- **States**: open
- **Events**: careers.account.logged_in, careers.account.registered, careers.application.submitted, careers.profile.updated, careers.resume.updated
- **RBAC guards**: 0 _(عدد استدعاءات: 0 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 5
- **Handlers**: 9
- **ملاحظات (أول 5)**:
  - 🔵 5 استجابة خطأ بدون مغلّف موحّد { error: { code, field, fix } }

### `clientPortal` — 🛑 Stop Ship (74%)

- **Entities**: client_portal_accounts, kb_articles, set, ticket_csat_ratings, ticket_replies
- **States**: closed, in_progress, open, paid, pending_approval, published
- **Events**: portal.csat.submitted, portal.invoice.paid, portal.kb_feedback.submitted, portal.login, portal.password.changed, portal.ticket.created, portal.ticket_reply.created
- **RBAC guards**: 0 _(عدد استدعاءات: 0 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 7
- **Handlers**: 1
- **ملاحظات (أول 5)**:
  - 🔵 8 استجابة خطأ بدون مغلّف موحّد { error: { code, field, fix } }
  - 🔴 الحدث المُطلَق "portal.csat.submitted" غير مسجَّل في eventCatalog.ts
  - 🔴 الحدث المُطلَق "portal.invoice.paid" غير مسجَّل في eventCatalog.ts
  - 🔴 الحدث المُطلَق "portal.kb_feedback.submitted" غير مسجَّل في eventCatalog.ts
  - 🔴 الحدث المُطلَق "portal.password.changed" غير مسجَّل في eventCatalog.ts

### `correspondence` — ⚠️ Needs Fix (74%)

- **Entities**: —
- **States**: draft, sent
- **Events**: correspondence.created, correspondence.responded, correspondence.sent, correspondence.updated
- **RBAC guards**: 100 _(عدد استدعاءات: 7 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 3
- **Handlers**: 0

### `finance-algorithms` — 🛑 Stop Ship (74%)

- **Entities**: bank_statements, chart_of_accounts, fixed_assets, journal_lines
- **States**: active, posted
- **Events**: depreciation, finance.bank_reconciliation.imported, finance.bank_reconciliation.matched, finance.fixed_assets.batch_depreciated, finance.rounding_account.configured, fx_revaluation
- **RBAC guards**: 100 _(عدد استدعاءات: 27 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 0
- **Handlers**: 0
- **ملاحظات (أول 5)**:
  - 🔴 الحدث المُطلَق "depreciation" غير مسجَّل في eventCatalog.ts
  - 🔴 الحدث المُطلَق "fx_revaluation" غير مسجَّل في eventCatalog.ts

### `finance-gl-helpers` — 🛑 Stop Ship (74%)

- **Entities**: —
- **States**: acknowledged, approved
- **Events**: list
- **RBAC guards**: 100 _(عدد استدعاءات: 10 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 1
- **Handlers**: 0
- **ملاحظات (أول 5)**:
  - 🔴 الحدث المُطلَق "list" غير مسجَّل في eventCatalog.ts

### `hr-exit` — 🛑 Stop Ship (74%)

- **Entities**: —
- **States**: active, approved, completed, pending, pending_next_step, terminated
- **Events**: exit.clearance_updated, exit_rejected, hr.exit.created
- **RBAC guards**: 100 _(عدد استدعاءات: 6 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 2
- **Handlers**: 6
- **ملاحظات (أول 5)**:
  - 🔵 6 handler بدون أي ربط بجدول/خدمة (entities = 0) — تأكد من طبقة البيانات.
  - 🔴 الحدث المُطلَق "exit_rejected" غير مسجَّل في eventCatalog.ts

### `impactPreview` — ⚠️ Needs Fix (74%)

- **Entities**: —
- **States**: active, pending
- **Events**: impact.previewed
- **RBAC guards**: 100 _(عدد استدعاءات: 1 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 1
- **Handlers**: 1
- **ملاحظات (أول 5)**:
  - 🔵 1 handler بدون أي ربط بجدول/خدمة (entities = 0) — تأكد من طبقة البيانات.

### `publicData` — 🛑 Stop Ship (74%)

- **Entities**: employee_of_month, password_reset_requests, public_announcements
- **States**: active
- **Events**: password_reset.requested
- **RBAC guards**: 0 _(عدد استدعاءات: 0 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 1
- **Handlers**: 3

### `rbacV2` — 🛑 Stop Ship (74%)

- **Entities**: rbac_jit_requests, rbac_role_history, rbac_roles, rbac_sod_rules, rbac_user_roles, set
- **States**: active, approved, cancelled, pending, rejected
- **Events**: —
- **RBAC guards**: 100 _(عدد استدعاءات: 27 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 19
- **Handlers**: 32
- **ملاحظات (أول 5)**:
  - 🔵 12 استجابة خطأ بدون مغلّف موحّد { error: { code, field, fix } }
  - 🔴 POST /jit/request بدون صلاحية واضحة (requirePermission/authorize)
  - 🔴 POST /jit/:id/cancel بدون صلاحية واضحة (requirePermission/authorize)

### `accounting-engine` — ⚠️ Needs Fix (81%)

- **Entities**: accounting_mappings, journal_entry_templates, set, subsidiary_accounts
- **States**: —
- **Events**: accounting.journal_template.created, accounting.journal_template.deleted, accounting.journal_template.updated, accounting.mapping.updated, accounting.mappings.batch_updated, accounting.subsidiary_account.created, accounting.subsidiary_account.deleted
- **RBAC guards**: 100 _(عدد استدعاءات: 13 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 7
- **Handlers**: 13
- **ملاحظات (أول 5)**:
  - 🟠 POST /journal-templates (عملية مالية) بدون idempotency key
  - 🟠 PUT /journal-templates/:id (عملية مالية) بدون idempotency key
  - 🟠 DELETE /journal-templates/:id (عملية مالية) بدون idempotency key

### `automation` — ⚠️ Needs Fix (81%)

- **Entities**: cron_jobs, proactive_rules
- **States**: —
- **Events**: automation.cron_job.toggled, automation.cron_job.triggered, automation.proactive_rule.toggled
- **RBAC guards**: 100 _(عدد استدعاءات: 10 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 3
- **Handlers**: 10
- **ملاحظات (أول 5)**:
  - 🟠 POST /cron-jobs/:id/toggle (عملية مالية) بدون idempotency key
  - 🟠 POST /proactive-rules/:id/toggle (عملية مالية) بدون idempotency key

### `digital-signature` — ⚠️ Needs Fix (81%)

- **Entities**: digital_signature_otps
- **States**: —
- **Events**: digital_signature.otp_requested, digital_signature.verified
- **RBAC guards**: 100 _(عدد استدعاءات: 3 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 2
- **Handlers**: 3

### `finance-collection` — 🛑 Stop Ship (81%)

- **Entities**: invoice_collection_stages
- **States**: —
- **Events**: view
- **RBAC guards**: 100 _(عدد استدعاءات: 3 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 1
- **Handlers**: 0
- **ملاحظات (أول 5)**:
  - 🔴 الحدث المُطلَق "view" غير مسجَّل في eventCatalog.ts

### `finance-recurring` — ⚠️ Needs Fix (81%)

- **Entities**: recurring_journals
- **States**: —
- **Events**: recurring_journal.created, recurring_journal.deleted, recurring_journal.run_now, recurring_journal.updated
- **RBAC guards**: 100 _(عدد استدعاءات: 6 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 4
- **Handlers**: 0

### `notification-engine` — ⚠️ Needs Fix (81%)

- **Entities**: notification_fallback_chains, notification_preferences, notification_routing_rules, notification_templates, notification_webhooks, set
- **States**: —
- **Events**: notification.fallback_chain.created, notification.fallback_chain.deleted, notification.fallback_chain.updated, notification.preferences.updated, notification.routing_rule.created, notification.routing_rule.deleted, notification.routing_rule.updated, notification.template.created, notification.template.deleted, notification.template.updated … (+3)
- **RBAC guards**: 100 _(عدد استدعاءات: 20 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 13
- **Handlers**: 20

### `notifications` — ⚠️ Needs Fix (81%)

- **Entities**: notification_preferences, notifications, set
- **States**: —
- **Events**: notification.all_read, notification.preference.updated, notification.read
- **RBAC guards**: 100 _(عدد استدعاءات: 6 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 3
- **Handlers**: 6
- **ملاحظات (أول 5)**:
  - 🔵 1 استجابة خطأ بدون مغلّف موحّد { error: { code, field, fix } }

### `pdpl` — ⚠️ Needs Fix (81%)

- **Entities**: data_access_requests, processing_activities_log
- **States**: —
- **Events**: pdpl.data_request.created
- **RBAC guards**: 100 _(عدد استدعاءات: 1 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 1
- **Handlers**: 5

### `permissions` — ⚠️ Needs Fix (81%)

- **Entities**: permissions, role_permissions, set
- **States**: —
- **Events**: permissions.role_permission.created, permissions.role_permission.deleted, permissions.user_permission.created, permissions.user_permission.deleted
- **RBAC guards**: 100 _(عدد استدعاءات: 10 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 4
- **Handlers**: 7

### `rules` — ⚠️ Needs Fix (81%)

- **Entities**: business_rules
- **States**: —
- **Events**: rules.created, rules.deleted, rules.toggled, rules.updated
- **RBAC guards**: 100 _(عدد استدعاءات: 6 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 4
- **Handlers**: 6
- **ملاحظات (أول 5)**:
  - 🟠 PATCH /:id/toggle (عملية مالية) بدون idempotency key

### `storage` — ⚠️ Needs Fix (81%)

- **Entities**: document_versions, documents
- **States**: —
- **Events**: storage.upload_requested
- **RBAC guards**: 100 _(عدد استدعاءات: 2 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 1
- **Handlers**: 3

### `workflows` — 🛑 Stop Ship (81%)

- **Entities**: set, sla_definitions, workflow_definitions
- **States**: —
- **Events**: workflow.definition.created, workflow.definition.deleted, workflow.definition.updated, workflow.instance.approved, workflow.instance.created, workflow.instance.rejected, workflow.instance.updated
- **RBAC guards**: 100 _(عدد استدعاءات: 18 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 10
- **Handlers**: 18
- **ملاحظات (أول 5)**:
  - 🔴 الحدث المُطلَق "workflow.instance.updated" غير مسجَّل في eventCatalog.ts

### `admin` — 🛑 Stop Ship (89%)

- **Entities**: audit_violations, custom_roles, email_queue, employee_assignments, event_dlq, integration_logs, integrations, role_permissions, roles, security_log, set, system_stops … (+2)
- **States**: active, error, failed, healthy, ok, open, resolved, warn
- **Events**: admin.integration.created, admin.integration.deleted, admin.integration.tested, admin.integration.updated, admin.integration_logs.retried, admin.role.created, admin.role_permission.created, admin.role_permission.deleted, admin.role_permissions.bulk_updated, admin.user.created … (+8)
- **RBAC guards**: 100 _(عدد استدعاءات: 51 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 20
- **Handlers**: 51
- **ملاحظات (أول 5)**:
  - 🔴 الحدث المُطلَق "admin.integration.tested" غير مسجَّل في eventCatalog.ts

### `clients` — ✅ Pass (89%)

- **Entities**: client_portal_accounts, clients
- **States**: active, paid
- **Events**: client.created, client.deleted, client.updated
- **RBAC guards**: 100 _(عدد استدعاءات: 9 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 6
- **Handlers**: 9

### `communications` — 🛑 Stop Ship (89%)

- **Entities**: communications_log, crm_opportunities, pbx_calls, push_subscriptions, set, support_tickets, tasks, whatsapp_queue
- **States**: active, ok, pending
- **Events**: communication.pbx.completed, communication.pbx.incoming, communication.pbx.status, communication.whatsapp.received, communications.log.converted, communications.log.deleted, communications.log.updated, communications.message.sent, communications.push.subscribed, communications.push.test … (+3)
- **RBAC guards**: 100 _(عدد استدعاءات: 13 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 11
- **Handlers**: 19
- **ملاحظات (أول 5)**:
  - 🔵 1 استجابة خطأ بدون مغلّف موحّد { error: { code, field, fix } }
  - 🔴 POST /whatsapp/webhook بدون صلاحية واضحة (requirePermission/authorize)
  - 🔴 POST /pbx/incoming بدون صلاحية واضحة (requirePermission/authorize)
  - 🔴 POST /pbx/completed بدون صلاحية واضحة (requirePermission/authorize)
  - 🔴 POST /pbx/status بدون صلاحية واضحة (requirePermission/authorize)

### `crm` — 🛑 Stop Ship (89%)

- **Entities**: clients, crm_activities, crm_opportunities
- **States**: active, open
- **Events**: crm.activity.created, crm.deal.lost, crm.deal.won, crm.followup.checked, crm.opportunity.converted, crm.opportunity.created, crm.opportunity.deleted, crm.opportunity.stage_changed, crm.opportunity.updated, crm_overdue … (+2)
- **RBAC guards**: 100 _(عدد استدعاءات: 13 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 6
- **Handlers**: 13
- **ملاحظات (أول 5)**:
  - 🔴 الحدث المُطلَق "crm.activity.created" غير مسجَّل في eventCatalog.ts
  - 🔴 الحدث المُطلَق "crm.followup.checked" غير مسجَّل في eventCatalog.ts
  - 🔴 الحدث المُطلَق "crm.opportunity.converted" غير مسجَّل في eventCatalog.ts
  - 🔴 الحدث المُطلَق "crm_overdue" غير مسجَّل في eventCatalog.ts
  - 🔴 الحدث المُطلَق "crm_stage_change" غير مسجَّل في eventCatalog.ts

### `documents` — 🛑 Stop Ship (89%)

- **Entities**: document_entity_links, document_folders, document_templates, document_versions, documents
- **States**: active, approved, draft
- **Events**: documents.document.created, documents.document.deleted, documents.document.status_changed, documents.document.updated, documents.document.uploaded, documents.entity_link.created, documents.folder.created, documents.template.created, documents.template.deleted, documents.template.generated … (+2)
- **RBAC guards**: 100 _(عدد استدعاءات: 23 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 12
- **Handlers**: 23
- **ملاحظات (أول 5)**:
  - 🔴 الحدث المُطلَق "documents.template.generated" غير مسجَّل في eventCatalog.ts

### `employees` — 🛑 Stop Ship (89%)

- **Entities**: email_queue
- **States**: active, cancelled, pending, suspended, terminated
- **Events**: employee.created, employee.terminated, employee.updated, obligations.seeded, onboarding_task.updated
- **RBAC guards**: 100 _(عدد استدعاءات: 10 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 5
- **Handlers**: 10
- **ملاحظات (أول 5)**:
  - 🔴 الحدث المُطلَق "obligations.seeded" غير مسجَّل في eventCatalog.ts
  - 🔴 الحدث المُطلَق "onboarding_task.updated" غير مسجَّل في eventCatalog.ts

### `entityMeta` — ✅ Pass (89%)

- **Entities**: approval_actions, entity_comments, entity_tags
- **States**: approved, rejected
- **Events**: entity.comment.created, entity.comment.deleted, entity.tag.created, entity.tag.deleted
- **RBAC guards**: 100 _(عدد استدعاءات: 9 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 5
- **Handlers**: 9

### `finance-accounts` — ✅ Pass (89%)

- **Entities**: chart_of_accounts
- **States**: overdue, posted
- **Events**: account.created, account.deleted, account.updated, journal.created
- **RBAC guards**: 100 _(عدد استدعاءات: 10 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 4
- **Handlers**: 0

### `finance-budget` — ✅ Pass (89%)

- **Entities**: budgets
- **States**: auto_approved, draft, near_limit, no_budget, over_budget, posted, within_budget
- **Events**: budget.approval_requested, budget.created, budget.deleted, budget.updated
- **RBAC guards**: 100 _(عدد استدعاءات: 13 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 4
- **Handlers**: 0

### `finance-cost-centers` — 🛑 Stop Ship (89%)

- **Entities**: cost_centers
- **States**: deleted
- **Events**: cost_center.created, cost_center.deleted, cost_center.updated
- **RBAC guards**: 100 _(عدد استدعاءات: 5 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 3
- **Handlers**: 5
- **ملاحظات (أول 5)**:
  - 🔴 2 write-handler في تدفق مالي يُطلق أحداث بدون مفتاح idempotency — إعادة المحاولة قد تُكرّر القيد

### `finance-custodies` — ✅ Pass (89%)

- **Entities**: journal_entries
- **States**: active, draft, overdue, partial, pending, pending_approval, posted, rejected, returned, settled
- **Events**: custody.created, custody.settled
- **RBAC guards**: 100 _(عدد استدعاءات: 8 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 3
- **Handlers**: 0

### `finance-hardening` — 🛑 Stop Ship (89%)

- **Entities**: bank_guarantees, financial_periods, financial_posting_failures, intercompany_transactions, journal_entries, projects
- **States**: active, closed, posted
- **Events**: bank_guarantee.created, bank_guarantee.deleted, bank_guarantee.updated, finance_project.created, fiscal_period.created, intercompany, intercompany.created, journal.manual_created, posting_failure.resolved
- **RBAC guards**: 100 _(عدد استدعاءات: 28 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 7
- **Handlers**: 0
- **ملاحظات (أول 5)**:
  - 🔴 كتابة عابرة للحدود: finance-hardening يكتب في جدول projects المملوك لمسار projects
  - 🟠 قراءة عابرة للحدود: finance-hardening يقرأ من جدول projects المملوك لمسار projects
  - 🔴 الحدث المُطلَق "intercompany" غير مسجَّل في eventCatalog.ts

### `finance-invoices` — 🛑 Stop Ship (89%)

- **Entities**: budgets, credit_memos, customer_advances, debit_memos, event_logs
- **States**: active, cancelled, open, posted, sent, skipped
- **Events**: bad_debt.posted, invoice.approved, invoice.created, invoice.credit_memo, invoice.debit_memo, invoice.deleted, invoice.paid, invoice.posted, invoice_created, payment … (+1)
- **RBAC guards**: 100 _(عدد استدعاءات: 27 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 3
- **Handlers**: 0
- **ملاحظات (أول 5)**:
  - 🔴 الحدث المُطلَق "invoice_created" غير مسجَّل في eventCatalog.ts
  - 🔴 الحدث المُطلَق "payment" غير مسجَّل في eventCatalog.ts
  - 🔴 الحدث المُطلَق "status" غير مسجَّل في eventCatalog.ts

### `finance-journal` — 🛑 Stop Ship (89%)

- **Entities**: financial_periods, gov_integration_links, journal_entries
- **States**: blocked_gm, closed, draft, open, pending_approval, rejected, reversed, warning_cfo
- **Events**: closing, expense.created, finance.journal.created, fiscal.year_end_closed, journal.reversed, opening_balance, reversal, salary_advance, update
- **RBAC guards**: 100 _(عدد استدعاءات: 23 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 2
- **Handlers**: 0
- **ملاحظات (أول 5)**:
  - 🔴 الحدث المُطلَق "closing" غير مسجَّل في eventCatalog.ts
  - 🔴 الحدث المُطلَق "finance.journal.created" غير مسجَّل في eventCatalog.ts
  - 🔴 الحدث المُطلَق "opening_balance" غير مسجَّل في eventCatalog.ts
  - 🔴 الحدث المُطلَق "reversal" غير مسجَّل في eventCatalog.ts
  - 🔴 الحدث المُطلَق "salary_advance" غير مسجَّل في eventCatalog.ts

### `finance-purchase` — 🛑 Stop Ship (89%)

- **Entities**: approval_actions, goods_receipts, payment_runs, purchase_order_items, purchase_orders, purchase_request_items, purchase_requests
- **States**: confirmed, converted, invoice_matched, payment_scheduled
- **Events**: payment_run.executed, purchase_order.created, purchase_request.created, three_way_mismatch
- **RBAC guards**: 100 _(عدد استدعاءات: 22 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 1
- **Handlers**: 0
- **ملاحظات (أول 5)**:
  - 🔴 الحدث المُطلَق "three_way_mismatch" غير مسجَّل في eventCatalog.ts

### `finance-vendors` — ✅ Pass (89%)

- **Entities**: suppliers
- **States**: overdue, posted
- **Events**: vendor.created, vendor.deleted, vendor.updated
- **RBAC guards**: 100 _(عدد استدعاءات: 18 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 3
- **Handlers**: 0

### `fleet` — 🛑 Stop Ship (89%)

- **Entities**: fleet_drivers, fleet_fuel_logs, fleet_gps_tracking, fleet_insurance, fleet_preventive_plans, fleet_traffic_violations, fleet_vehicles
- **States**: active, available, cancelled, completed, in_progress, in_use, maintenance, on_trip, paid, status
- **Events**: auto_journal, fleet.driver.created, fleet.driver.deleted, fleet.fuel_log.created, fleet.fuel_log.deleted, fleet.fuel_log.updated, fleet.insurance.created, fleet.insurance.deleted, fleet.insurance.updated, fleet.maintenance.completed … (+22)
- **RBAC guards**: 100 _(عدد استدعاءات: 46 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 27
- **Handlers**: 46
- **ملاحظات (أول 5)**:
  - 🔴 الحدث المُطلَق "auto_journal" غير مسجَّل في eventCatalog.ts
  - 🔴 الحدث المُطلَق "fleet_trip" غير مسجَّل في eventCatalog.ts
  - 🔴 الحدث المُطلَق "insurance_expiry" غير مسجَّل في eventCatalog.ts
  - 🔴 الحدث المُطلَق "status" غير مسجَّل في eventCatalog.ts
  - 🔴 الحدث المُطلَق "traffic_violation_deducted" غير مسجَّل في eventCatalog.ts

### `gov-integrations` — ✅ Pass (89%)

- **Entities**: gov_integration_links, gov_integrations
- **States**: active
- **Events**: gov.integration.tested, gov.integration.updated, gov.link.created, gov.link.deleted, gov.link.updated
- **RBAC guards**: 100 _(عدد استدعاءات: 9 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 5
- **Handlers**: 9
- **ملاحظات (أول 5)**:
  - 🔵 1 استجابة خطأ بدون مغلّف موحّد { error: { code, field, fix } }

### `governance` — ✅ Pass (89%)

- **Entities**: governance_audits, governance_capa, governance_compliance, governance_policies, governance_risks, policy_compliance_actions, policy_module_links
- **States**: active, archived, done, non_compliant, open
- **Events**: governance.audit.created, governance.audit.deleted, governance.audit.updated, governance.capa.created, governance.capa.updated, governance.compliance.created, governance.compliance.deleted, governance.compliance.updated, governance.compliance_action.created, governance.compliance_action.deleted … (+9)
- **RBAC guards**: 100 _(عدد استدعاءات: 35 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 20
- **Handlers**: 35

### `hr-discipline` — 🛑 Stop Ship (89%)

- **Entities**: hr_discipline_regulation, hr_inquiry_memo_events, hr_inquiry_memos
- **States**: appeal_accepted, appeal_pending, approved, cancelled, closed, pending, pending_employee, pending_gm, pending_manager, rejected
- **Events**: discipline.auto_detection_run, discipline.auto_detection_settings_updated, discipline_regulations.penalty_previewed, discipline_regulations.reseeded, hr.discipline.regulation.created, hr.discipline.regulation.deleted, hr.discipline.regulation.updated, hr.memo.created, inquiry_memo
- **RBAC guards**: 100 _(عدد استدعاءات: 24 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 8
- **Handlers**: 24
- **ملاحظات (أول 5)**:
  - 🟠 POST /penalty-preview (عملية مالية) بدون idempotency key
  - 🔴 الحدث المُطلَق "discipline.auto_detection_run" غير مسجَّل في eventCatalog.ts
  - 🔴 الحدث المُطلَق "discipline.auto_detection_settings_updated" غير مسجَّل في eventCatalog.ts
  - 🔴 الحدث المُطلَق "discipline_regulations.penalty_previewed" غير مسجَّل في eventCatalog.ts
  - 🔴 الحدث المُطلَق "discipline_regulations.reseeded" غير مسجَّل في eventCatalog.ts

### `hr-loans` — 🛑 Stop Ship (89%)

- **Entities**: approval_actions, hr_employee_loans
- **States**: active, approved, completed, pending, pending_next_step, rejected
- **Events**: hr.loan.approved, hr.loan.created, hr.loan.rejected, loan_approved, loan_rejected
- **RBAC guards**: 100 _(عدد استدعاءات: 6 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 3
- **Handlers**: 6
- **ملاحظات (أول 5)**:
  - 🔴 الحدث المُطلَق "loan_approved" غير مسجَّل في eventCatalog.ts
  - 🔴 الحدث المُطلَق "loan_rejected" غير مسجَّل في eventCatalog.ts

### `hr-overtime` — 🛑 Stop Ship (89%)

- **Entities**: approval_actions, hr_overtime_requests
- **States**: approved, pending, pending_next_step, rejected
- **Events**: hr.overtime.approved, hr.overtime.created, hr.overtime.rejected, overtime_approved, overtime_rejected
- **RBAC guards**: 100 _(عدد استدعاءات: 7 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 3
- **Handlers**: 7
- **ملاحظات (أول 5)**:
  - 🔴 الحدث المُطلَق "overtime_approved" غير مسجَّل في eventCatalog.ts
  - 🔴 الحدث المُطلَق "overtime_rejected" غير مسجَّل في eventCatalog.ts

### `hr` — 🛑 Stop Ship (89%)

- **Entities**: anonymous_upward_reviews, approval_actions, approval_chains, attendance_policies, company_documents, delegations, email_queue, employee_development_plans, employee_documents, employee_shift_assignments, employee_transfers, employee_violations … (+12)
- **States**: absent, active, approved, cancelled, completed, deducted_in_payroll, deleted, draft, escalated, in_progress
- **Events**: approval_chain.created, approval_chain.deleted, attendance.checkin, attendance.checkout, attendance_policy.updated, checkin, checkout, company_document.created, delegation.created, employee_document.created … (+44)
- **RBAC guards**: 100 _(عدد استدعاءات: 112 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 51
- **Handlers**: 110
- **ملاحظات (أول 5)**:
  - 🟠 POST /payroll (عملية مالية) بدون idempotency key
  - 🟠 PATCH /payroll/:id/approve (عملية مالية) بدون idempotency key
  - 🟠 PATCH /payroll/:id (عملية مالية) بدون idempotency key
  - 🟠 DELETE /payroll/:id (عملية مالية) بدون idempotency key
  - 🟠 POST /transfers (عملية مالية) بدون idempotency key

### `intelligence` — 🛑 Stop Ship (89%)

- **Entities**: smart_alerts
- **States**: active, completed, open, pending
- **Events**: employee_overload, intelligence.ai.categorized, intelligence.ai.draft_replied, intelligence.ai.forecasted, intelligence.ai.rules_evaluated, intelligence.ai.summarized, intelligence.ai.translated, intelligence.alert.read, intelligence.alert.scanned, intelligence.algorithm.haversine … (+3)
- **RBAC guards**: 100 _(عدد استدعاءات: 27 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 12
- **Handlers**: 27
- **ملاحظات (أول 5)**:
  - 🔴 الحدث المُطلَق "employee_overload" غير مسجَّل في eventCatalog.ts

### `legal` — 🛑 Stop Ship (89%)

- **Entities**: legal_cases, legal_contracts, legal_correspondence, legal_judgments, legal_sessions
- **States**: active, in_progress, open, status, terminated
- **Events**: delete, legal.case.cost_added, legal.case.created, legal.case.deleted, legal.case.judgment, legal.case.risk_updated, legal.contract.created, legal.contract.deleted, legal.contract.renewed, legal.contract.terminated … (+7)
- **RBAC guards**: 100 _(عدد استدعاءات: 30 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 14
- **Handlers**: 30
- **ملاحظات (أول 5)**:
  - 🔴 الحدث المُطلَق "delete" غير مسجَّل في eventCatalog.ts
  - 🔴 الحدث المُطلَق "legal.case.cost_added" غير مسجَّل في eventCatalog.ts
  - 🔴 الحدث المُطلَق "legal_case_assigned" غير مسجَّل في eventCatalog.ts
  - 🔴 الحدث المُطلَق "legal_case_closed" غير مسجَّل في eventCatalog.ts
  - 🔴 الحدث المُطلَق "legal_session" غير مسجَّل في eventCatalog.ts

### `marketing` — ✅ Pass (89%)

- **Entities**: marketing_campaigns
- **States**: active
- **Events**: marketing.campaign.created, marketing.campaign.deleted, marketing.campaign.revenue_updated, marketing.campaign.updated
- **RBAC guards**: 100 _(عدد استدعاءات: 10 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 4
- **Handlers**: 10

### `operationsCenter` — ✅ Pass (89%)

- **Entities**: audit_logs, daily_close_log
- **States**: active, completed, in_progress, open, overstayed, pending, under_maintenance, violated
- **Events**: daily_close.executed
- **RBAC guards**: 100 _(عدد استدعاءات: 3 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 1
- **Handlers**: 3

### `projects` — 🛑 Stop Ship (89%)

- **Entities**: project_costs, project_milestones, project_phases, project_resources, project_risks, projects
- **States**: active, blocked, cancelled, completed, done, in_progress, on_hold, planning, todo
- **Events**: project.closed, project.cost.created, project.created, project.deleted, project.impact_preview, project.milestone.created, project.milestone.updated, project.phase.completed, project.phase.created, project.resource.created … (+7)
- **RBAC guards**: 100 _(عدد استدعاءات: 26 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 14
- **Handlers**: 26
- **ملاحظات (أول 5)**:
  - 🔴 الحدث المُطلَق "project.closed" غير مسجَّل في eventCatalog.ts
  - 🔴 الحدث المُطلَق "project.impact_preview" غير مسجَّل في eventCatalog.ts
  - 🔴 الحدث المُطلَق "project_closed" غير مسجَّل في eventCatalog.ts
  - 🔴 الحدث المُطلَق "status" غير مسجَّل في eventCatalog.ts
  - 🔴 الحدث المُطلَق "task_assigned" غير مسجَّل في eventCatalog.ts

### `properties` — 🛑 Stop Ship (89%)

- **Entities**: contract_payment_schedule, late_rent_actions, maintenance_requests, property_buildings, property_inspections, property_owners, property_security_deposits, property_units, rental_contracts, tasks, technicians, tenants
- **States**: active, available, cancelled, completed, held, paid, pending, rented, terminated, under_maintenance
- **Events**: auto_journal, deposit.received, lease.created, legal_case_assigned, maintenance_request, property.building.created, property.building.deleted, property.building.updated, property.contract.deleted, property.contract.impact_preview … (+21)
- **RBAC guards**: 100 _(عدد استدعاءات: 55 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 32
- **Handlers**: 55
- **ملاحظات (أول 5)**:
  - 🟠 POST /payments/:id/pay (عملية مالية) بدون idempotency key
  - 🟠 POST /deposits (عملية مالية) بدون idempotency key
  - 🟠 PATCH /deposits/:id/refund (عملية مالية) بدون idempotency key
  - 🔴 الحدث المُطلَق "auto_journal" غير مسجَّل في eventCatalog.ts
  - 🔴 الحدث المُطلَق "legal_case_assigned" غير مسجَّل في eventCatalog.ts

### `recruitment` — ✅ Pass (89%)

- **Entities**: job_applications, job_postings
- **States**: closed, interview, new, open, withdrawn_due_to_job_closure
- **Events**: recruitment.application.created, recruitment.application.deleted, recruitment.application.updated, recruitment.posting.closed, recruitment.posting.created, recruitment.posting.deleted, recruitment.posting.reopened, recruitment.posting.updated
- **RBAC guards**: 100 _(عدد استدعاءات: 13 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 8
- **Handlers**: 13
- **ملاحظات (أول 5)**:
  - 🟠 POST /postings (عملية مالية) بدون idempotency key
  - 🟠 PATCH /postings/:id (عملية مالية) بدون idempotency key
  - 🟠 POST /postings/:id/close (عملية مالية) بدون idempotency key
  - 🟠 POST /postings/:id/reopen (عملية مالية) بدون idempotency key
  - 🟠 DELETE /postings/:id (عملية مالية) بدون idempotency key

### `requests` — 🛑 Stop Ship (89%)

- **Entities**: approval_actions, communications_log, request_types, requests, workflows
- **States**: approved, pending, rejected, returned
- **Events**: legal.case.created, legal_case_created, request.created, request.deleted, request.updated, request_approved, request_type.created, workflow.created
- **RBAC guards**: 100 _(عدد استدعاءات: 16 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 8
- **Handlers**: 16
- **ملاحظات (أول 5)**:
  - 🔴 الحدث المُطلَق "legal_case_created" غير مسجَّل في eventCatalog.ts
  - 🔴 الحدث المُطلَق "request_approved" غير مسجَّل في eventCatalog.ts

### `store` — ✅ Pass (89%)

- **Entities**: store_orders, store_products
- **States**: active, completed, pending
- **Events**: store.order.created, store.order.deleted, store.order.gl_posted, store.order.updated, store.product.created, store.product.deleted, store.product.updated
- **RBAC guards**: 100 _(عدد استدعاءات: 11 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 6
- **Handlers**: 11

### `support` — 🛑 Stop Ship (89%)

- **Entities**: email_queue, kb_articles, set, support_tickets, ticket_csat_ratings
- **States**: active, deleted, field_visit, open, published, resolved
- **Events**: alert, field_visit, support.kb.created, support.kb.deleted, support.kb.feedback, support.kb.updated, support.reply.created, support.sla.checked, support.ticket.assigned, support.ticket.created … (+2)
- **RBAC guards**: 100 _(عدد استدعاءات: 18 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 10
- **Handlers**: 18
- **ملاحظات (أول 5)**:
  - 🔴 الحدث المُطلَق "alert" غير مسجَّل في eventCatalog.ts
  - 🔴 الحدث المُطلَق "field_visit" غير مسجَّل في eventCatalog.ts
  - 🔴 الحدث المُطلَق "support.kb.feedback" غير مسجَّل في eventCatalog.ts
  - 🔴 الحدث المُطلَق "support.sla.checked" غير مسجَّل في eventCatalog.ts

### `tasks` — 🛑 Stop Ship (89%)

- **Entities**: idset
- **States**: active
- **Events**: task.created, task.deleted, task.updated
- **RBAC guards**: 100 _(عدد استدعاءات: 6 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 3
- **Handlers**: 6
- **ملاحظات (أول 5)**:
  - 🔴 الحدث المُطلَق "task.updated" غير مسجَّل في eventCatalog.ts

### `training` — ✅ Pass (89%)

- **Entities**: training_enrollments, training_programs
- **States**: active, approved, completed, rejected
- **Events**: training.enrollment.created, training.enrollment.deleted, training.enrollment.updated, training.program.created, training.program.deleted, training.program.updated
- **RBAC guards**: 100 _(عدد استدعاءات: 13 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 6
- **Handlers**: 13

### `umrah` — 🛑 Stop Ship (89%)

- **Entities**: umrah_agent_invoices, umrah_agents, umrah_import_logs, umrah_packages, umrah_penalties, umrah_pilgrims, umrah_seasons, umrah_transport, umrah_violations
- **States**: active, arrived, cancelled, completed, departed, invoiced, overstayed, pending, violated
- **Events**: active_pilgrims, list, overstay, umrah.agent.created, umrah.agent.deleted, umrah.agent.updated, umrah.daily_status.run, umrah.import.completed, umrah.invoice.gl_posted, umrah.package.created … (+16)
- **RBAC guards**: 100 _(عدد استدعاءات: 49 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 26
- **Handlers**: 49
- **ملاحظات (أول 5)**:
  - 🟠 POST /run-penalty-engine (عملية مالية) بدون idempotency key
  - 🟠 POST /agent-invoices/:id/record-payment (عملية مالية) بدون idempotency key
  - 🟠 POST /agent-invoices/generate (عملية مالية) بدون idempotency key
  - 🔴 الحدث المُطلَق "active_pilgrims" غير مسجَّل في eventCatalog.ts
  - 🔴 الحدث المُطلَق "list" غير مسجَّل في eventCatalog.ts

### `warehouse` — 🛑 Stop Ship (89%)

- **Entities**: inventory_count_items, inventory_counts, suppliers, warehouse_categories, warehouse_movements, warehouse_products
- **States**: active, completed
- **Events**: warehouse.category.created, warehouse.category.deleted, warehouse.category.updated, warehouse.inventory_count.created, warehouse.inventory_count_item.recorded, warehouse.movement.created, warehouse.product.created, warehouse.product.updated, warehouse.supplier.created, warehouse.supplier.deleted … (+2)
- **RBAC guards**: 100 _(عدد استدعاءات: 25 استدعاء)_
- **Settings**: —
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 12
- **Handlers**: 25
- **ملاحظات (أول 5)**:
  - 🟠 POST /transfers (عملية مالية) بدون idempotency key
  - 🔴 الحدث المُطلَق "warehouse.product.updated" غير مسجَّل في eventCatalog.ts

### `bi` — ✅ Pass (94%)

- **Entities**: alert_mute_rules, bi_dashboards, bi_kpis, bi_reports, set, smart_alerts
- **States**: absent, active, approved, completed, departed, late, occupied, open, pending, present
- **Events**: bi.alert.muted, bi.alert.unmuted, bi.dashboard.created, bi.insight.dismissed, bi.insight.read, bi.kpi.created, bi.report.created
- **RBAC guards**: 100 _(عدد استدعاءات: 32 استدعاء)_
- **Settings**: —
- **Reports**: 7 مرجع تقرير
- **Audit calls**: 7
- **Handlers**: 32

### `finance-zatca` — 🛑 Stop Ship (94%)

- **Entities**: invoices, journal_entries, zatca_settings
- **States**: accepted, rejected
- **Events**: zatca.settings.updated
- **RBAC guards**: 100 _(عدد استدعاءات: 9 استدعاء)_
- **Settings**: Code, Name, Number, RegistrationNumber
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 1
- **Handlers**: 0
- **ملاحظات (أول 5)**:
  - 🔴 الحدث المُطلَق "zatca.settings.updated" غير مسجَّل في eventCatalog.ts

### `settings` — ✅ Pass (94%)

- **Entities**: approval_chains, audit_logs, branches, companies, departments, settings, system_settings, user_roles
- **States**: active
- **Events**: company.created, settings.created, settings.deleted, settings.updated
- **RBAC guards**: 100 _(عدد استدعاءات: 31 استدعاء)_
- **Settings**: sByScope
- **Reports**: 0 مرجع تقرير
- **Audit calls**: 17
- **Handlers**: 31

### `umrah-entities` — 🛑 Stop Ship (94%)

- **Entities**: clients, employee_assignments, employee_commission_calculations, employee_commission_plans, employee_commission_tiers, official_letters, umrah_attachments, umrah_groups, umrah_import_batches, umrah_import_changes, umrah_nusk_invoices, umrah_payments … (+4)
- **States**: active, sent
- **Events**: umrah.agent.linked, umrah.attachment.created, umrah.commission.calculated, umrah.commission.simulated, umrah.commission_plan.created, umrah.commission_plan.updated, umrah.group.created, umrah.group.merged, umrah.group.split, umrah.invoice.generated … (+14)
- **RBAC guards**: 100 _(عدد استدعاءات: 50 استدعاء)_
- **Settings**: —
- **Reports**: 3 مرجع تقرير
- **Audit calls**: 27
- **Handlers**: 50
- **ملاحظات (أول 5)**:
  - 🟠 قراءة عابرة للحدود: umrah-entities يقرأ من جدول employee_assignments المملوك لمسار hr
  - 🔵 3 استجابة خطأ بدون مغلّف موحّد { error: { code, field, fix } }
  - 🟠 POST /nusk-invoices (عملية مالية) بدون idempotency key
  - 🟠 PATCH /nusk-invoices/:id (عملية مالية) بدون idempotency key
  - 🟠 DELETE /nusk-invoices/:id (عملية مالية) بدون idempotency key
