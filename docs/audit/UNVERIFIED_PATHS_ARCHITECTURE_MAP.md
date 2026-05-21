# Unverified Paths — Architecture Map

> خريطة معمارية للمسارات غير المفحوصة في نظام غيث (خارج HR / Finance / Umrah)
> Read-only architecture map of unverified paths in Ghayth ERP.

| | |
|---|---|
| التاريخ / Date | 2026-05-21 |
| النوع / Type | Documentation only — architecture map (no code, no fixes) |
| النطاق / Scope | كل المسارات خارج HR · Finance · Umrah |
| الحالة / Status | معتمد كـ backlog معماري موجّه — **ليس تنفيذًا** |
| المنهجية / Method | 4 وكلاء استكشاف read-only + سكربتات `audit-domain-boundaries` / `audit-domain-routes` / `audit-routes` |

---

## 1. Executive Summary

هذه الوثيقة تحوّل نتائج جولة فهرسة read-only إلى مرجع معماري ثابت. الغرض **التوثيق والتوجيه**، لا الإصلاح.

الخلاصات الرئيسية:

- **لا توجد orphan APIs.** كل ملفات الـ routes (85 ملفًا) مستوردة ومُركّبة في `routes/index.ts`. سكربت `audit-domain-routes` يؤكد: 14 domain، كل ملفات الـ routes مُركّبة.
- **لا توجد cross-domain writes.** سكربت `audit-domain-boundaries` نظيف — لا كتابة مباشرة عبر حدود الـ domains (مع التحفّظ أدناه على تغطية السكربت).
- **لا APIs معطوبة في عيّنة الواجهة.** فحص تمثيلي لـ 12 صفحة: كل نداءات البيانات تُحَل لمسارات backend قائمة.
- توجد **فجوات تشغيلية ومنهجية حقيقية**: تكرار حساب مالي، فجوات أثر تدقيق في التحوّلات الجانبية، وعدم اتّساق في حُرّاس المسارات.
- بعض البنود **تخصّ مسارات قائمة** (#685 Scope Normalization · Observability / Runtime Verification) — **لا يجوز فتح وكلاء منافسين لها**.
- بنود منخفضة الأثر (dead code · تنظيف) **لا تستحق عملًا الآن**.

**قاعدة الإغلاق المعتمدة:** لا يُسمّى أي مسار مكتملًا إلا بـ: (1) دمج PR في main، (2) نجاح guard، (3) نجاح runtime verification بعد الدمج، (4) مطابقة API/UI للعقد، (5) أثر واضح (state transition / audit / event / reports)، (6) تقرير إغلاق صحيح وغير قديم. هذه الوثيقة لا تُغلق أي مسار.

---

## 2. API Route Inventory — خارج HR / Finance / Umrah

الـ backend: `artifacts/api-server`. الـ routes في `src/routes/*.ts`، التركيب والحُرّاس في `src/routes/index.ts`.
الحُرّاس العامة: `authMiddleware` + `csrfMiddleware` مُركّبة عالميًا (index.ts:209-210). دوال الحماية: `requireModule(name)` · `requireMinLevel(n)` (`roleGuard.ts`) · `requireGuards(...)` (`systemGovernor.ts`).

~54 ملف route داخل النطاق — **كلها مُركّبة، لا orphan**.

| Route file | Mount prefix | حُرّاس التركيب | Endpoints |
|---|---|---|---|
| health.ts | (root) | pre-auth | 2 GET |
| storage.ts | (root) | pre-auth + inline `authMiddleware` | 3 |
| activityIngest.ts | (root) | pre-auth + inline `authMiddleware` | 1 |
| auth.ts | /auth | mixed anon/auth (limiters داخليّة) | 7 |
| clientPortal.ts | /portal | portal JWT خاص | 16 |
| careersPortal.ts | /careers | careers JWT خاص | 9 |
| publicData.ts | /public | anonymousIpLimiter | 3 |
| pdpl.ts | /pdpl | mixed (limiters داخليّة) | 5 |
| dashboard.ts | /dashboard | **auth فقط** | 7 GET |
| clients.ts | /clients | requireModule(crm) | 9 |
| crm.ts | /crm | requireModule(crm) | 16 |
| fleet.ts | /fleet | requireModule(fleet) + requireGuards(financial) | 46 |
| warehouse.ts | /warehouse | requireModule(warehouse) + requireGuards(financial) | 27 |
| properties.ts | /properties | requireModule(property) + requireGuards(financial) | 55 |
| legal.ts | /legal | requireModule(legal) | 30 |
| projects.ts | /projects | requireModule(operations) | 27 |
| support.ts | /support | requireModule(support) | 18 |
| intelligence.ts | /intelligence | requireModule(bi) | 27 |
| automation.ts | /automation | requireModule(automation) | 10 |
| communications.ts | /communications | requireModule(comms) | 19 |
| governance.ts | /governance | requireModule(governance) | 35 |
| bi.ts | /bi | requireModule(bi) | 44 |
| store.ts | /store | requireModule(store) + requireGuards(financial) | 11 |
| documents.ts | /documents | requireModule(documents) | 23 |
| requests.ts | /requests · /request-catalog | requireModule(requests) | 16 |
| marketing.ts | /marketing | requireModule(marketing) | 12 |
| settings.ts | /settings | requireModule(settings) + requireMinLevel(70) | 35 |
| rules.ts | /rules | requireModule(settings) + requireMinLevel(70) | 6 |
| moduleDashboards.ts | /module-dashboards | requireModule(bi) | 11 GET |
| admin.ts | /admin | requireModule(admin) + requireMinLevel(90) | 51 |
| permissions.ts | /permissions | **auth فقط** | 7 |
| rbacV2.ts | /rbac/v2 | **auth فقط** | 34 |
| auditLogs.ts | /audit-logs | requireMinLevel(70) | 3 GET |
| search.ts | /search | **auth فقط** | 1 GET |
| activityLog.ts | /activity-log | requireMinLevel(70) | 2 GET |
| approvalActions.ts | /approval-actions | **auth فقط** | 2 GET |
| workflows.ts | /workflows | **auth فقط** | 18 |
| impactPreview.ts | /impact-preview | **auth فقط** | 1 POST |
| mySpace.ts | /my-space | **auth فقط** | 6 GET |
| actionCenter.ts | /action-center | **auth فقط** | 1 GET |
| entityMeta.ts | /entity-meta | **auth فقط** | 9 |
| operationsCenter.ts | /operations-center | requireModule(operations) + requireMinLevel(40) | 3 |
| export.ts | /export | requireMinLevel(30) | 12 GET |
| import.ts | /import | requireMinLevel(50) | 6 |
| scheduled-reports.ts | /scheduled-reports | requireMinLevel(50) | 5 |
| notification-engine.ts | /notification-engine | requireModule(notifications) | 20 |
| notifications.ts | /notifications | **auth فقط** | 6 |
| gov-integrations.ts | /gov-integrations | **auth فقط** | 9 |
| digital-signature.ts | /digital-signature | **auth فقط** | 3 |
| events.ts | /events | **auth فقط** | 4 GET |
| execDashboard.ts | /exec-dashboard | requireMinLevel(70) | 3 GET |
| obligations.ts | /obligations | **auth فقط** | 8 |
| calendar.ts | /calendar | **auth فقط** | 1 GET |
| correspondence.ts | /correspondence | requireModule(comms) | 7 |
| print.ts | /print | **auth فقط** | 17 |
| tasks.ts | /tasks | requireModule(operations) | 9 |

**ملاحظة:** الـ routers الموسومة «auth فقط» تعتمد على فحوص `authorize(...)` inline داخل ملفاتها. الفحص الموضعي يؤكد أن هذه الفحوص قائمة فعليًا حاليًا (انظر §5 بند P2) — الفجوة **هيكلية** (أي route جديد يُضاف بلا `authorize` سيُكشف لأي مستخدم مُصادَق).

---

## 3. Frontend Page Inventory

التطبيق: `artifacts/ghayth-erp` — موجِّه `wouter`، نقطة الدخول `src/App.tsx`، تعريفات المسارات في `src/routes/*.tsx` (15 ملفًا)، وكل الصفحات `React.lazy`.
إجمالي ملفات الصفحات: 428 (كلها مستوردة — سكربت `audit-routes` نظيف).

| المنطقة | عدد الصفحات | مُوجَّهة؟ |
|---|---|---|
| admin | 19 (16 top-level + admin/) | نعم |
| bi | 3 صفحات + 13 tab داخلي | نعم |
| crm | crm, clients, client-detail, crm/* | نعم |
| fleet | fleet + 11 fleet/* | نعم |
| properties | 9 `properties-*` + 4 properties/* | نعم |
| projects · legal · support · store | صفحات + تفاصيل فرعية | نعم |
| governance | 2 صفحة + 8 tabs داخلية | نعم |
| documents · comms · settings · warehouse | صفحات + tabs | نعم |
| لوحات/عرضية | dashboard, exec-dashboard, module-dashboards, calendar, tasks, obligations, action-center, operations-center, marketing, automation, intelligence, notifications, activity-log | نعم |

**Orphan pages (dead code):** 3 ملفات فقط — `pages/bi/dashboards-tab.tsx` · `pages/bi/kpis-tab.tsx` · `pages/bi/reports-tab.tsx` (بقايا تخطيط BI سابق، صفر مراجع في `src/`). بقية الملفات غير المُوجَّهة هي مكوّنات فرعية داخلية (`*-tab`, `*-card`, `*-section`) — ليست orphans.

**ملاحظة وثائقية:** `docs/ui-page-registry.md` قديم (يذكر 80 صفحة HR و monolith `/finance`) — ملفات `src/routes/*.tsx` هي المرجع الموثوق.

---

## 4. Services / Engines / Cron / Events / RBAC Map

### 4.1 Engines
`lifecycleEngine` (state-machine مُلزِم، `applyTransition` مُجهَّز بالكامل event+audit) · `journeyEngine` (تتبّع غير مُلزِم — صريح في `journeyEngine.ts:14-16`) · `workflowEngine` (موافقات، ~44KB) · `rulesEngine` (مدفوع بـ `business_rules`، تفاعلي) · `proactiveEngine` (مدفوع بـ cron) · `autoViolationEngine`→`disciplineEngine` (سلسلة كشف→عقوبة) · `policyEngine` (SoD/privilege) · `selfAuditEngine` (سلامة بيانات cross-module) · `obligationsEngine` · `notificationEngine` · `kpiEngine` · `pricingEngine`.

### 4.2 Cron
~70 وظيفة في `cronScheduler.ts:3428-3497` (`JOB_DEFINITIONS`). `runJob()` يأخذ قفل DB (`cron_locks`، TTL 30د)، وعند الفشل يكتب `cron_logs` + يحدّث `cron_jobs.lastStatus/lastError` + `logger.error`. **فشل الوظيفة لا يُولّد تنبيهًا فعّالًا** (الرصد عبر السجلّات والجداول فقط).
وظائف داخل النطاق (~30): فحوص fleet/inventory/property/legal/project/crm · SLA & approval escalation · self-audit · KPI snapshot · cleanup/archiving · queue workers (email/sms/whatsapp/notifications/scheduled-reports).

### 4.3 Events
`eventBus` (in-process `EventEmitter`, maxListeners 200, مع DLQ) · `eventCatalog` (~1000+ تعريف، علم `critical`) · `eventListeners.registerEventListeners()` (~200 handler، معظمها `logEvent`+`logAudit`).
**`emitEvent`** (`businessHelpers.ts:268-280`): يُثبِّت في `event_logs` فقط إذا كان الحدث `critical` أو `PERSIST_ALL_EVENTS=true`. الأحداث غير الحرجة بلا listener قد لا تترك أثرًا في `event_logs` عند إطفاء العلم.

### 4.4 Audit
ثلاثة مسارات: (أ) `auditMiddleware` — يولّد `audit.{entity}.{action}` تلقائيًا لكن لـ **42 بادئة `ENTITY_MAP` فقط**؛ (ب) استدعاءات `createAuditLog` صريحة؛ (ج) `logAudit` في الـ listeners.

### 4.5 RBAC
كتالوجان: `rbacCatalog.ts` (سلاسل صلاحيات مسطّحة + خريطة دور→صلاحية) و`featureCatalog.ts` (شجرة features لـ `authorize({feature,action})`). يغطّيان معظم الوحدات؛ توجد فجوات granularity (انظر §5 بند P2).

---

## 5. Findings Table

| # | النتيجة | الموقع | Severity |
|---|---|---|---|
| F1 | حساب التكلفة المرجّحة مكرّر ومتباعد — helper + inline في `POST /movements` | `warehouse.ts:148` ↔ `:679` | 🔴 High |
| F2 | تبنّي `scopedQuery` غير متّسق — 8 وحدات تكتب فلاتر `companyId/branchId` يدويًا | properties, legal, store, governance, bi, marketing, documents, automation | 🟠 Medium (منهجي) |
| F3 | استعلام HR-assignment مكرّر ~10× + قراءات مباشرة لجداول `employees` من وحدات غير HR | fleet, properties, projects, crm, support, communications, documents | 🟠 Medium |
| F4 | lifecycle بلا audit — تحوّلات حالة جانبية: مركبة/سائق في الرحلات والصيانة، جدول دفعات العقد، تتالي حالة الوحدة، حركات مخزون store | `fleet.ts:1077/1173/1413…` · `properties.ts:1583/1591/3525` · `store.ts:296/373` | 🟠 Medium |
| F5 | `auditMiddleware.ENTITY_MAP` يُغفل legal/store/governance/automation/bi/marketing | `auditMiddleware.ts:8-50` | 🟠 Medium |
| F6 | فجوات حُرّاس على مستوى التركيب — routers حسّاسة بـ auth فقط (الحماية inline قائمة حاليًا) | rbacV2, permissions, workflows, gov-integrations, digital-signature, events — `index.ts:341-366` | 🟠 Medium (هيكلي) |
| F7 | `events.ts /log` و`/log/stats` — أي مستخدم مُصادَق يقرأ سجل أحداث شركته بلا فحص دور | `events.ts` | 🟡 Low-Med |
| F8 | أحداث غير حرجة تُفقد من `event_logs` عند `PERSIST_ALL_EVENTS=false` وغياب listener | `businessHelpers.ts:268-280` | 🟡 Low-Med |
| F9 | فشل cron يُسجَّل ولا يُنبَّه | `cronScheduler.ts:138-142` | 🟡 Low |
| F10 | fleet/properties يستوردان `accounting-engine` (ملف route مالي) — اقتران cross-domain (fire-and-forget) | `fleet.ts:20` · `properties.ts:20` | 🟢 Low |
| F11 | فجوات كتالوج RBAC — لا عائلة صلاحيات مخصّصة لـ automation/rules/intelligence/calendar/digital-signature (تسقط على `admin:*` الأشدّ) | `rbacCatalog.ts` · `featureCatalog.ts` | 🟢 Low |
| F12 | 3 صفحات BI orphan (dead code) | `pages/bi/{dashboards,kpis,reports}-tab.tsx` | 🟢 Low |
| F13 | `store.ts` يعيد تعريف `VALID_ORDER_TRANSITIONS` inline بدل التسجيل في `lifecycleEngine` | `store.ts:355-358` | 🟢 Low |
| F14 | تجميل — `gov-integrations` فيه helpers ميتة (`requireGovAdmin/Read`)، ويستخدم `action:"update"` لـ GETs · `/request-catalog` remount هشّ · `ui-page-registry.md` قديم | متعدّد | 🟢 Low |

**نتائج سليمة (no-finding):** لا orphan APIs · لا cross-domain writes · لا APIs معطوبة في عيّنة الواجهة · لا تظليل مسارات · GL posting نظيف (لا `INSERT INTO journal_entries` inline في أي route داخل النطاق).

**تحفّظ على التغطية:** سكربت `audit-domain-boundaries` يطابق `INSERT/UPDATE/DELETE` فقط مقابل قائمة `DOMAIN_TABLES` ثابتة وداخل 10 ملفات route مصنّفة — لا يكشف cross-domain `SELECT`s ولا imports. «النجاح الأخضر» لا يعني نظافة كاملة للحدود.

---

## 6. Ownership Routing

التصنيف المعتمد. **هذه الوثيقة لا تُحوَّل إلى إصلاحات قبل إغلاق المسارات الحرجة المفتوحة.**

### P0 — أعلى أولوية لاحقة: Warehouse/Store Weighted-Average Costing Integrity
- يشمل: **F1** (تكرار حساب التكلفة المرجّحة)، ومعه **F13** (انتقالات طلبات store inline).
- السبب: خطر صحّة مالية مباشر على المخزون والتقارير التشغيلية.
- **لا يبدأ الآن.** شرط البدء: إغلاق
  - Finance `workflow_requests` schema drift
  - HR `employee_violations` runtime redo
  - قرار Foundation **#739**
  - حسم **#743** transfers

### P1 — لاحقًا: Audit/Event Side-Effect Completeness
- يشمل: **F4** (تحوّلات fleet/properties/store الجانبية بلا audit/event كافٍ) · **F5** (`ENTITY_MAP` ناقص) · **F8** (فجوات ثبات الأحداث).

### P2 — لاحقًا: Route Guard Hardening
- يشمل: **F6** (routers حسّاسة بـ auth فقط + حماية inline) · **F7** (بوّابة دور لـ `events/log`) · **F11** (عائلات RBAC لـ automation/rules/intelligence/calendar/digital-signature).

### مسارات قائمة — لا يُفتح لها وكيل جديد
- **F2 + F3** (عدم اتّساق `scopedQuery` + قراءات HR cross-domain) → تابعة لمسار **#685 Scope Normalization**.
- **F9** (تنبيه فشل cron) → تابع لمسار **Observability / Production Hardening** لاحقًا، ويتقاطع مع **Runtime Verification**.

### تجاهَل الآن — منخفض، لا عمل
- **F10** (اقتران يعمل) · **F11** (السقوط على `admin:*` آمن) · **F12** (dead code) · **F14** (تجميل/تنظيف).

| البند | القرار |
|---|---|
| Warehouse/store weighted-average (F1,F13) | P0 لاحق |
| Audit/event side-effects (F4,F5,F8) | P1 لاحق |
| Route guards (F6,F7,F11) | P2 لاحق |
| scopedQuery + HR cross-reads (F2,F3) | يتبع #685 |
| cron alerting (F9) | يتبع Observability / Runtime |
| BI orphan pages (F12) | تجاهل الآن |
| dead helpers / cleanup (F10,F14) | تجاهل الآن |

---

## 7. Stop Rules & Forbidden Scope

### Stop rules
- هذه الوثيقة **توثيقية فقط**؛ لا تُحوَّل مباشرة إلى إصلاحات.
- لا يبدأ أي من P0/P1/P2 إلا بتكليف صريح، وبعد إغلاق المسارات الحرجة المفتوحة (Finance schema drift · HR violations runtime · #739 · #743).
- لا يُفتح أكثر من وكيل واحد دفعةً واحدة.
- لا يُسمّى أي مسار مكتملًا إلا بقاعدة الإغلاق السداسية (دمج · guard · runtime verification · مطابقة العقد · أثر واضح · تقرير غير قديم).

### Forbidden scope (في أي عمل ينبثق عن هذه الوثيقة)
- لا تعديل HR / Finance / Umrah إلا كإشارات ownership/status.
- لا توسيع نطاق النظام، لا migrations، لا تغيير package/lockfile، لا workers، لا event-bus redesign.
- لا فتح وكلاء منافسين لمسار #685 Scope Normalization أو Observability / Runtime Verification.
- لا إنشاء agents داخل المستودع.

---

*مرجع معماري قابل للرجوع — read-only. مُولّد من جولة فهرسة بـ 4 وكلاء استكشاف read-only وسكربتات التدقيق القائمة في المستودع.*
