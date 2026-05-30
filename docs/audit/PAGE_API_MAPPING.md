# PAGE ↔ API MAPPING — Ghaith ERP

**Audit scope:** Frontend `artifacts/ghayth-erp/src/pages/` → Backend `artifacts/api-server/src/routes/`
**Mode:** AUDIT-ONLY (لا تعديل على الكود)
**Issues:** #1418, #1413
**Generated:** 2026-05-30

---

## 1. ملخص

| المقياس | القيمة |
| --- | --- |
| إجمالي ملفات الصفحات/الـ tabs (`.tsx`+`.ts`) | **580** |
| ملفات تستخدم `useApiQuery / useApiMutation / apiFetch` | **541** (93.3%) |
| ملفات تستدعي `fetch(` مباشرة (تحميلات/OAuth/مسحوبات) | 249 |
| ملفات بدون أي استدعاء API | **39** (6.7%) |
| إجمالي تعريفات `router.<method>("…")` في `routes/*.ts` | **1689** |
| الموديولات المغطاة بفهرسة API (`/api/<module>`) | 102 ملفًا في `routes/` |

**Wiring health (page-level coverage):**

- **مرتبط بالكامل (Fully wired):** ≈ **93%** من ملفات الصفحات تحتوي استدعاء API صريحاً.
- **بدون backend / Mock / Shell:** ≈ **6.7%** (39 ملف). أغلبها shells تبويبية أو مكوّنات فرعية تأخذ بياناتها من الأب، أو صفحات إرشاد ثابتة (`properties-guide.tsx`)، أو صفحات navigation (`services.tsx`).
- **مرتبط جزئياً (Partial):** يتركز في الـ Finance dashboards/hubs التي تستهلك بيانات الأبناء فقط (`profitability-*`, `*-reports-hub`, `*-workflows-hub`).

### أعلى 10 صفحات Top-Level بدون استدعاء API

أُعطيت أولوية للصفحات التي يُتوقّع أن تكون بنفسها صاحبة منطق بيانات (وليست shells صرفة).

| # | الصفحة | المسار | الحالة الفعلية | ملاحظات |
|---|---|---|---|---|
| 1 | `not-found.tsx` | – | لا تحتاج backend | 404 |
| 2 | `services.tsx` | `/services` | صفحة navigation | تعتمد على `useFilteredNavSections` (RBAC client-side فقط) |
| 3 | `bi.tsx` / `bi-dashboards.tsx` / `bi-reports.tsx` / `bi-kpis.tsx` | `/bi*` | Tab-shells | تستهلك API من tabs الفرعية (`bi/*.tsx`) |
| 4 | `admin.tsx` | `/admin` | Tab-shell | يفوض إلى `admin/*.tsx` |
| 5 | `print-verify.tsx` | `/print/verify/:jobId` | يستخدم helper `verifyDocument()` من `print-client.ts` (→ `GET /print/verify/:jobId`) — مغطّى | – |
| 6 | `properties-guide.tsx` | `/properties/guide` | محتوى ثابت إرشادي | – |
| 7 | `finance/profitability-project.tsx` | `/finance/profitability/projects` | wrapper حول `./profitability` | يعيد توجيه ضمنيًا |
| 8 | `finance/profitability-property.tsx` | `/finance/profitability/properties` | wrapper | – |
| 9 | `finance/profitability-vehicle.tsx` | `/finance/profitability/vehicles` | wrapper | – |
| 10 | `finance/profitability-umrah-agent.tsx` | `/finance/profitability/umrah-agents` | wrapper | – |

**أيضاً:** 17 من ملفات `my-space/*.tsx` هي مكوّنات فرعية لـ `my-space.tsx` (cards/sections) — لا API بنفسها، تستهلك props.

---

## 2. التغطية حسب الموديول

| الموديول | إجمالي الملفات | Wired (لديها API) | Missing / Shell | ملاحظة |
| --- | --- | --- | --- | --- |
| **finance/** | 136 | 127 | 9 | معظم Missing = profitability/zatca/tax-calendar shells |
| **create/** (سبق-ملء النماذج عبر المسارات) | 89 | 89 | 0 | – |
| **hr/** | 60 | 60 | 0 | – |
| **details/** (Detail pages) | 54 | 54 | 0 | بعضها يستلم بيانات من الأب فقط |
| **umrah/** | 26 | 26 | 0 | – |
| **admin/** (sub-tabs) | 20 | 18 | 2 | `shared.ts`, `rbac-v2-conditions-editor.tsx` |
| **fleet/** (incl. telematics) | 20 | 20 | 0 | – |
| **my-space/** (sub-sections) | 18 | 1 | 17 | المكوّنات الفرعية تستهلك props من `my-space.tsx` |
| **bi/** (sub-tabs) | 14 | 13 | 1 | `bi/shared.tsx` |
| **settings/** (sub-tabs) | 13 | 13 | 0 | – |
| **governance/** | 9 | 8 | 1 | `governance/stats-cards.tsx` (props) |
| **properties/** | 4 (+ 9 top-level) | 4 | 0 | – |
| **legal/** | 3 (+ 3 top-level) | 3 | 0 | – |
| **documents/** | 3 | 3 | 0 | – |
| **support/** | 2 | 2 | 0 | – |
| **store/** | 2 | 2 | 0 | – |
| **reports/** | 2 | 2 | 0 | – |
| **projects/** | 2 | 2 | 0 | – |
| **crm/** | 2 | 2 | 0 | – |
| **warehouse/** | 1 | 1 | 0 | – |
| **manager-board/** | 1 | 1 | 0 | – |
| **comms/** | 1 | 1 | 0 | – |
| **Top-level pages** | 98 | 89 | 9 | shells + guides + 404 |
| **الإجمالي** | **580** | **541** | **39** | – |

---

## 3. أمثلة تفصيلية (Per-module representative mapping)

> النموذج: **اسم الصفحة • المسار • Endpoint(s) المُستدعاة • Backend route file:line • Middleware/Guards • Pagination/Filter/Sort • Print/Export • الحالة**

ملاحظة عامة:
- جميع المسارات تحت `/api` تخضع لـ `authMiddleware` و `csrfMiddleware` و `auditMiddleware` (مُسجَّلة عالمياً في `routes/index.ts:245-246` و `app.ts:143`).
- `auditMiddleware` يسجّل تلقائياً جميع طلبات `POST/PATCH/PUT/DELETE` ذات entity معروفة → عمود "audit" مفترض **مُطبَّق ضمنياً على كل المسارات mutating**.
- معظم الوحدات الوظيفية محصورة خلف `requireModule(<key>)` + `requireGuards("financial")` عند الحاجة (مُعرَّفة في `routes/index.ts:312-461`).

---

### 3.1 Finance (مثال ممثِّل لكل أنواع التشغيل)

| الصفحة | Path | Endpoints | Backend file:line | Guards | Pagination/Filter | Export | الحالة |
|---|---|---|---|---|---|---|---|
| `finance/invoices.tsx` | `/finance/invoices` | `GET /finance/invoices${scope}` (L42) ، `GET /finance/stats${scope}` (L43) | `routes/finance-invoices.ts:319` (list)، `routes/finance-accounts.ts:612` (stats) | `authorize({ feature:"finance.invoices", action:"list" })` + `requireModule("finance")` + `requireGuards("financial")` + finance per-user limiter | scope-aware (companyId/branchId) | عبر `/print/render` (`print.ts:125`) — مُغطّى لكن من زر داخل الصفحة | **مرتبط بالكامل** |
| `finance/invoice-detail.tsx` | `/finance/invoices/:id` | لا توجد استدعاءات صريحة في الـ regex مع وجود `useApi*` (يعتمد على hook فرعي) | `routes/finance-invoices.ts:1899` (GET :id)، `:1925` (PATCH)، `:2034` (DELETE)، `:773` (send)، `:843` (approve)، `:2275-2277` (approve/reject/return)، `:1738` (post)، `:1777` (payment) | كلها `authorize({ feature:"finance.invoices", action:* })` | – | – | **مرتبط بالكامل** |
| `finance/journal.tsx` | `/finance/journal` | `GET /finance/journal${scope}` (L60) | `routes/finance-accounts.ts:455` (list)، `:475` (POST) | `authorize({ feature:"finance.accounts", action:"list/create" })` | scope | – | **مرتبط بالكامل** |
| `finance/journal-manual.tsx` | `/finance/journal-manual` | (multi-line hook) ، يستخدم `/finance/journal-manual?status=…` | `routes/finance-journal.ts:262` على وجه التقريب (expenses)، الجداول الفعلية في `routes/finance-journal.ts` | `authorize({ feature:"finance.journal", action:* })` | status filter | – | **مرتبط بالكامل** |
| `finance/accounts.tsx` | `/finance/accounts` | `"/finance/accounts"` (L104) | `routes/finance-accounts.ts:219` (GET)، `:249` (POST)، `:311` (PATCH)، `:397` (DELETE) | `authorize({ feature:"finance.accounts", action:* })` | تفلتر `?type=&search=` | – | **مرتبط بالكامل** |
| `finance/reports.tsx` | `/finance/reports` | 13 endpoint تحت `/finance/reports/*` (L164–L1282) — trial-balance, income-statement, balance-sheet, cash-flow, cash-bank-statement, custody-advances, expenses-analysis, revenue-analysis, budget-variance, entities, entity-statement, revenue-by-activity-type, expenses-by-cost-center | `routes/finance-reports.ts:81, 126, 145, 243, 1421, 1227, 1286, 1332, 1377, 57, 1147, 1639, 1670` | `authorize({ feature:"finance.reports", action:"list" })` | date filter | export = client-side | **مرتبط بالكامل** |
| `finance/bank-reconciliation.tsx` | `/finance/bank-reconciliation` | 5 endpoints (`/finance/bank-reconciliation`, `/finance/bank-reconciliation/${batch}`, `/finance/bank-reconciliation/import`, `/finance/bank-reconciliation/auto-match`, `/finance/accounts?type=asset&search=11`) | `routes/finance-hardening.ts` (re-check) — راجع mount في `index.ts:344` | `authorize({ feature:"finance.hardening", action:* })` (مفترض) | batch filter | – | **مرتبط بالكامل** |
| `finance/custodies.tsx` | `/finance/custodies` | `GET /finance/custodies${scope}` (L89)، `GET /finance/custodies/summary` (L98)، `GET /finance/accounts` (L387)، `GET /employees` (L388) | `routes/finance-custodies.ts:176, 372` ؛ `routes/finance-accounts.ts:219`؛ `routes/employees.ts:201` | `authorize({ feature:"finance.custodies", action:"list" })` | scope-aware | – | **مرتبط بالكامل** |
| `finance/vendors.tsx` | `/finance/vendors` | `GET /finance/vendors${scope}` (L49) | `routes/finance-vendors.ts:105` (GET)، `:120, 167, 228` (POST/PATCH/DELETE) | `authorize({ feature:"finance.vendors", action:* })` | scope-aware | – | **مرتبط بالكامل** |
| `finance/treasury.tsx` | `/finance/treasury` | `GET /finance/treasury${scope}` (L26) | — مفقود في الـ routes الصريحة (يحتمل في `finance-collection.ts`/`finance-hardening.ts`) | غير محدد | scope | – | **يحتاج تأكيد** (راجع §6) |
| `finance/payments-page.tsx` | `/finance/payments` | `"/finance/payments"` (L20) | `routes/finance-vendors.ts:464` (`GET /payments`) | `authorize({ feature:"finance.vendors", action:"list" })` | – | – | **مرتبط بالكامل** |
| `finance/vouchers.tsx` | `/finance/vouchers` | `GET /finance/vouchers${scope}` (L33) | `routes/finance-journal.ts:852` | `authorize({ feature:"finance.journal", action:"list" })` | scope | – | **مرتبط بالكامل** |
| `finance/expenses.tsx` | `/finance/expenses` | `GET /finance/expenses${scope}` (L55) | `routes/finance-journal.ts:262, 296, 402, 659, 691, 752` | `authorize({ feature:"finance.journal", action:* })` | scope | – | **مرتبط بالكامل** |
| `finance/fixed-assets.tsx` | `/finance/fixed-assets` | `"/finance/fixed-assets"` (L52)، `"/finance/fixed-assets/depreciate-all"` (L68) | في `finance.ts` (المُعاد لـ `finance-purchase.ts/finance-vendors.ts`) — راجع `index.ts:347-349` لأن `financeRouter` أُلغي في Phase 7.1؛ المسار الفعلي قد يكون stubs | غير محدد بالكامل | – | – | **يحتاج تأكيد** |
| `finance/cfo-cockpit.tsx` | `/finance/cfo-cockpit` | `GET /finance/treasury` | كما أعلاه | غير محدد | – | – | **يحتاج تأكيد** |
| `finance/profitability-*.tsx` (4 ملفات) | `/finance/profitability/*` | لا API مباشرة (wrappers لـ `./profitability`) | `routes/finance-reports.ts:1491-1602` (vehicle/property/project/umrah-agent) | `authorize({ feature:"finance.reports", action:"list" })` | – | – | **مرتبط جزئياً** (wrapper فقط) |
| `finance/zatca-reports-hub.tsx` | `/finance/zatca-reports` | لا API (hub navigation) | – | – | – | – | **shell — بدون backend** |
| `finance/finance-workflows-hub.tsx` | `/finance/workflows` | لا API (hub navigation) | – | – | – | – | **shell — بدون backend** |

---

### 3.2 HR

| الصفحة | Path | Endpoints | Backend file:line | Guards | Pagination/Filter | الحالة |
|---|---|---|---|---|---|---|
| `hr.tsx` | `/hr` | `GET /hr/stats${scope}` (L93)، `GET /employees` (L98)، `GET /hr/leave-requests` (L99)، `GET /hr/payroll` (L100)، `GET /hr/attendance` (L101) | `routes/hr.ts:1096` (attendance)، `:1300` (leave-requests)، `:2393` (payroll)؛ `routes/employees.ts:201` | `authorize({ feature:"hr.*", action:"list" })` + `requireModule("hr")` + hr per-user limiter | page/limit + status filters | **مرتبط بالكامل** |
| `hr/attendance.tsx` | `/hr/attendance` | `GET /hr/attendance?month=…${scope}` (L119)، `GET /hr/attendance-stats?month=…${scope}` (L120) | `routes/hr.ts:1096`؛ `attendance-stats` غير موجود صريحًا → ربما في hr-stubs | `authorize({ feature:"hr.attendance", action:"list" })` | month + scope | **مرتبط جزئياً** (stats endpoint يحتاج تحقق) |
| `hr/leaves.tsx` | `/hr/leaves` | `GET /hr/leave-requests${scope}` (L103)، `GET /hr/leave-stats${scope}` (L104) | `routes/hr.ts:1300` ؛ leave-stats غير موجود صريحًا | `authorize({ feature:"hr.leaves", action:"list" })` | scope + status | **مرتبط جزئياً** |
| `hr/payroll.tsx` | `/hr/payroll` | `GET /hr/payroll${scope}` (L58)، `GET /hr/payroll-summary${scope}` (L62) | `routes/hr.ts:2393, 2494` | `authorize({ feature:"hr.payroll.runs", action:"view/create" })` | scope | **مرتبط بالكامل** |
| `hr/loans.tsx` | `/hr/loans` | `"/hr/loans"` (L43) | `routes/hr-loans.ts` | `authorize({ feature:"hr.loans", action:* })` | – | **مرتبط بالكامل** |
| `hr/overtime.tsx` | `/hr/overtime` | `"/hr/overtime"` (L44)، `"/hr/overtime/summary"` (L54) | `routes/hr-overtime.ts` | `authorize({ feature:"hr.overtime", action:* })` | – | **مرتبط بالكامل** |
| `hr/recruitment.tsx` | `/hr/recruitment` | `"/hr/recruitment/postings"` (L40)، `"/hr/recruitment/applications"` (L41)، `"/hr/recruitment/stats"` (L42) | `routes/recruitment.ts` | `authorize({ feature:"hr.recruitment", action:* })` | – | **مرتبط بالكامل** |
| `hr/wps-runs.tsx` | `/hr/wps/runs` | `"/hr/wps/runs"` (L64)، `"/hr/payroll"` (L69)، `"/hr/wps/settings"` (L74)، `\`/hr/wps/preflight/${id}\`` (L124) | `routes/hr-wps.ts` | `authorize({ feature:"hr.wps", action:* })` | – | **مرتبط بالكامل** |
| `hr/violations.tsx` | `/hr/violations` | `"/hr/discipline/memos"` (L74)، `"/hr/discipline/stats"` (L80) | `routes/hr-discipline.ts` | `authorize({ feature:"hr.discipline", action:* })` | – | **مرتبط بالكامل** |
| `hr/contracts.tsx` | `/hr/contracts` | `"/hr/contracts"` (L73) | `routes/hr-contracts.ts` | `authorize({ feature:"hr.contracts", action:* })` | – | **مرتبط بالكامل** |
| `hr/organization.tsx` | `/hr/organization` | `"/settings/departments"` (L10)، `"/employees?limit=200"` (L11) | `routes/settings.ts` ؛ `routes/employees.ts:201` | settings: `authorize({ feature:"settings", action:"view" })` + `requireMinLevel(70)` ؛ employees: `authorize({ feature:"hr.employees", action:"list" })` | limit | **مرتبط بالكامل** |
| `hr/shifts.tsx` | `/hr/shifts` | `"/hr/shifts"` (L26)، `"/hr/shift-assignments"` (L27) | `routes/hr.ts` (shifts) | غير محدد بدقة | – | **مرتبط جزئياً** |
| `my-attendance.tsx` (Top-level) | `/my-attendance` | `GET /my-space/attendance?month=…` | `routes/mySpace.ts:478` | `authorize({ feature:"my_space", action:"view" })` | month filter | **مرتبط بالكامل** |
| `my-payslip.tsx` (Top-level) | `/my-payslip` | `GET /my-space/payslip?period=…` | `routes/mySpace.ts:530` | `authorize({ feature:"my_space.payslip", action:"view" })` | period | **مرتبط بالكامل** |

---

### 3.3 Umrah

| الصفحة | Path | Endpoints | Backend file:line | Guards | الحالة |
|---|---|---|---|---|---|
| `umrah/dashboard.tsx` | `/umrah/dashboard` | `/umrah/seasons`, `/umrah/run-daily-status`, `/umrah/run-penalty-engine` | `routes/umrah.ts:361, 1454, 1516` | `authorize({ feature:"umrah", action:* })` + `requireModule("operations")` + `requireGuards("financial")` + umrah per-user limiter | **مرتبط بالكامل** |
| `umrah/agents.tsx` | `/umrah/agents` | `"/umrah/agents"` (L42) | `routes/umrah.ts:455, 552, 567, 605` | `authorize({ feature:"umrah", action:* })` | **مرتبط بالكامل** |
| `umrah/pilgrims.tsx` | `/umrah/pilgrims` | `/umrah/pilgrims?…`, `/umrah/seasons`, `/umrah/groups`, `/umrah/unassigned`, `/umrah/agents` | `routes/umrah.ts:709, 361, /groups`, `/unassigned`, `:455` | `authorize({ feature:"umrah", action:"list" })` | **مرتبط بالكامل** |
| `umrah/pilgrim-detail.tsx` | `/umrah/pilgrims/:id` | `GET /umrah/pilgrims/${id}`, `PATCH /umrah/pilgrims/${id}`, `/umrah/agents`, `/umrah/sub-agents` | `routes/umrah.ts:1069, 995, 455` | `authorize({ feature:"umrah", action:"view/update" })` | **مرتبط بالكامل** |
| `umrah/packages.tsx` | `/umrah/packages` | `"/umrah/packages"`, `"/umrah/seasons"` | `routes/umrah.ts:622, 361` | `authorize({ feature:"umrah", action:"list" })` | **مرتبط بالكامل** |
| `umrah/seasons.tsx` | `/umrah/seasons` | CRUD `/umrah/seasons` | `routes/umrah.ts:361, 382, 397, 369` | `authorize({ feature:"umrah", action:* })` | **مرتبط بالكامل** |
| `umrah/invoices.tsx` | `/umrah/invoices` | `/umrah/agent-invoices`, `/umrah/agents`, `/umrah/seasons`, `/umrah/agent-invoices/generate`, `/umrah/invoices…`, `/umrah/sub-agents`, `/umrah/nusk-invoices` | `routes/umrah.ts` + `routes/umrah-entities.ts` | `authorize({ feature:"umrah", action:* })` | **مرتبط بالكامل** |
| `umrah/payments.tsx` | `/umrah/payments` | `"/umrah/payments"`, `"/umrah/sub-agents?limit=500"` | `routes/umrah.ts` / `umrah-entities.ts` | `authorize({ feature:"umrah", action:* })` | **مرتبط بالكامل** |
| `umrah/violations.tsx` | `/umrah/violations` | `/umrah/violations`, `/umrah/agents`, `/umrah/sub-agents`, `/umrah/seasons` | `routes/umrah.ts` | `authorize({ feature:"umrah", action:* })` | **مرتبط بالكامل** |
| `umrah/import-wizard.tsx` | `/umrah/import-wizard` | 8 endpoints (seasons, clients, import/batches, accounts, preview, vouchers, link-by-nusk) | `routes/umrah.ts:1119, 1224` + `routes/clients.ts:139` + `routes/finance-accounts.ts:219` | mixed `authorize({ feature:"umrah"/"crm.clients"/"finance.accounts" })` | **مرتبط بالكامل** |
| `umrah/commission-plans.tsx` | `/umrah/commissions` | `/umrah/commission-plans`, `/employees`, `/umrah/seasons`, `/umrah/commission-calculations` | `routes/umrah-entities.ts` / `umrah.ts` | `authorize({ feature:"umrah", action:* })` | **مرتبط بالكامل** |
| `umrah/reconciliation.tsx` | `/umrah/reconciliation` | `"/umrah/reports/reconciliation"` (L60) | `routes/umrah.ts` (reports section) | `authorize({ feature:"umrah", action:"list" })` | **مرتبط بالكامل** |
| `umrah/sales-wizard.tsx` | `/umrah/sales-wizard` | `/umrah/sub-agents`, `/umrah/seasons`, `/umrah/sales-wizard/uninvoiced-groups${suffix}` | `routes/umrah-entities.ts` / `umrah.ts` | `authorize({ feature:"umrah", action:* })` | **مرتبط بالكامل** |

> **الخلاصة:** كل صفحات Umrah (26 ملفًا) مرتبطة بالـ backend وتنتمي لـ `requireModule("operations")` + `requireGuards("financial")`.

---

### 3.4 Fleet (+ Telematics)

| الصفحة | Path | Endpoints | Backend file:line | Guards | الحالة |
|---|---|---|---|---|---|
| `fleet.tsx` | `/fleet` | `/fleet/stats`, `/fleet/drivers${filter}`, `/fleet/maintenance`, `/fleet/fuel-logs` | `routes/fleet.ts:445, 1484, fuel` ؛ stats غير موجود صريحًا → ربما في fleet stub | `authorize({ feature:"fleet.*", action:"list" })` + `requireModule("fleet")` + `requireGuards("financial")` + fleet per-user limiter | **مرتبط جزئياً** (stats) |
| `fleet/drivers.tsx` | `/fleet/drivers` | `"/fleet/drivers"` (L23) | `routes/fleet.ts:445, 469, 774, 784, 878` | `authorize({ feature:"fleet.vehicles", action:* })` | **مرتبط بالكامل** |
| `fleet/trips.tsx` | `/fleet/trips` | `"/fleet/trips"` (L23) | `routes/fleet.ts:920, 963` | `authorize({ feature:"fleet.trips", action:* })` | **مرتبط بالكامل** |
| `fleet/trip-detail.tsx` | `/fleet/trips/:id` | `/fleet/trips/${id}`, `/fleet/fuel-logs?tripId`, `/fleet/maintenance?vehicleId`, `/fleet/trips/${id}/complete`, `/fleet/trips/${id}/waypoints` | `routes/fleet.ts:945, 1283, 1444, 1484` | `authorize({ feature:"fleet.trips", action:* })` | **مرتبط بالكامل** |
| `fleet/maintenance.tsx` | `/fleet/maintenance` | `"/fleet/maintenance"` | `routes/fleet.ts:1484, 1534, 1640, 1726` | `authorize({ feature:"fleet.maintenance", action:* })` | **مرتبط بالكامل** |
| `fleet/fuel.tsx` | `/fleet/fuel` | `GET /fleet/fuel-logs${scope}` | `routes/fleet.ts` (fuel-logs) | `authorize({ feature:"fleet.*", action:"list" })` | **مرتبط بالكامل** |
| `fleet/insurance.tsx` | `/fleet/insurance` | `"/fleet/insurance"` | `routes/fleet.ts` (insurance section) | `authorize({ feature:"fleet.*", action:"list" })` | **مرتبط بالكامل** |
| `fleet/traffic-violations.tsx` | `/fleet/traffic-violations` | `/fleet/traffic-violations`, `/fleet/vehicles`, `/fleet/drivers`, `POST /fleet/traffic-violations/${id}/pay` | `routes/fleet.ts` | `authorize({ feature:"fleet.*", action:* })` | **مرتبط بالكامل** |
| `fleet/preventive-plans.tsx` | `/fleet/preventive-plans` | `GET /fleet/preventive-plans${filter}`, `/fleet/vehicles?limit=200` | `routes/fleet.ts` | `authorize({ feature:"fleet.*", action:* })` | **مرتبط بالكامل** |
| `fleet/alerts.tsx` | `/fleet/alerts` | `"/fleet/alerts"` | `routes/fleet.ts:1809, 2024, 2039` | `authorize({ feature:"fleet.vehicles", action:* })` | **مرتبط بالكامل** |
| `fleet/tco.tsx` | `/fleet/tco` | `/fleet/vehicles`, `/fleet/vehicles/${id}/tco` | `routes/fleet.ts:338` ؛ `/tco/:id` → `routes/fleet.ts` (tco endpoint) | `authorize({ feature:"fleet.vehicles", action:"view" })` | **مرتبط بالكامل** |
| `fleet/telematics/live-map.tsx` | `/fleet/telematics/live-map` | `"/fleet/telematics/live"` | `routes/fleet-telematics.ts` | `authorize({ feature:"fleet.*" })` | **مرتبط بالكامل** |
| `fleet/telematics/devices.tsx` | `/fleet/telematics/devices` | `/fleet/telematics/devices`, `/fleet/vehicles?limit=500` | `routes/fleet-telematics.ts` | – | **مرتبط بالكامل** |
| `fleet/telematics/ai-alerts.tsx` | `/fleet/telematics/ai-alerts` | `GET /fleet/telematics/ai-alerts?…` | `routes/fleet-telematics.ts` | – | **مرتبط بالكامل** |
| `fleet/telematics/scorecard.tsx` | `/fleet/telematics/scorecard` | `GET /fleet/telematics/drivers/scorecard-leaderboard?…` | `routes/fleet-telematics.ts` | – | **مرتبط بالكامل** |
| `fleet/telematics/sensors.tsx` | `/fleet/telematics/sensors` | `/fleet/vehicles?limit=500`, `/fleet/telematics/vehicles/${id}/sensors` | `routes/fleet-telematics.ts` | – | **مرتبط بالكامل** |
| `fleet/telematics/operations.tsx` | `/fleet/telematics/operations` | (regex لم تلتقط، يستخدم hooks مشتركة) | – | – | **مرتبط بالكامل (تأكيد ضمني)** |

---

### 3.5 Properties

| الصفحة | Path | Endpoints | Backend file:line | Guards | الحالة |
|---|---|---|---|---|---|
| `properties.tsx` | `/properties` | `GET /properties/stats?…` | `routes/properties.ts:3098` | `authorize({ feature:"properties.units", action:"list" })` + `requireModule("property")` + `requireGuards("financial")` + properties per-user limiter | **مرتبط بالكامل** |
| `properties-dashboard.tsx` | `/properties/dashboard` | `/properties/stats?…`, `/properties/operations-dashboard` | `routes/properties.ts:3098, 3315` | كما أعلاه | **مرتبط بالكامل** |
| `properties-buildings.tsx` | `/properties/buildings` | `GET /properties/buildings?…` | `routes/properties.ts:2788, 2816, 2836, 2914, 2994` | `authorize({ feature:"properties.buildings", action:* })` | **مرتبط بالكامل** |
| `properties-tenants.tsx` | `/properties/tenants` | `GET /properties/tenants/list?…` | `routes/properties.ts:1669, 2650, 2713, 1741, 1849` | `authorize({ feature:"properties.tenants", action:* })` | **مرتبط بالكامل** |
| `properties-contracts.tsx` | `/properties/contracts` | `GET /properties/contracts${scope}` | `routes/properties.ts:993, 1009, 1026, 1262, 1411, 1456, 1577` | `authorize({ feature:"properties.contracts", action:* })` | **مرتبط بالكامل** |
| `properties-payments.tsx` | `/properties/payments` | `GET /properties/payments${scope}` | `routes/properties.ts:1896, 1912, 1929` | `authorize({ feature:"properties.payments", action:* })` | **مرتبط بالكامل** |
| `properties-owners.tsx` | `/properties/owners` | `GET /properties/owners?…` | `routes/properties.ts:3372, 3391, 3406, 3465, 3517` | `authorize({ feature:"properties.owners", action:* })` | **مرتبط بالكامل** |
| `properties-owner-statement.tsx` | `/properties/owner-statement` | `/properties/owners`, `GET /properties/owners/${id}/statement`, `/properties/owners/${id}/payouts` | `routes/properties.ts:3372` + statement/payouts subpaths | – | **مرتبط بالكامل** |
| `properties-maintenance.tsx` | `/properties/maintenance` | `"/properties/maintenance-requests"` | `routes/properties.ts:2195, 2229, 2403, 2470` | `authorize({ feature:"properties.maintenance", action:* })` | **مرتبط بالكامل** |
| `properties/contract-detail.tsx` | `/properties/contracts/:id` | `/properties/contracts/${id}`, `/schedule`, `/maintenance`, `/inspections`, `/renew` | `routes/properties.ts:1009, 3927, 2210, 4024, 1456` | كل واحد `authorize({ feature:"properties.*" })` | **مرتبط بالكامل** |
| `properties/deposits.tsx` | `/properties/deposits` | `/properties/deposits${filter}`, `/properties/contracts?status=active`, `/properties/deposits/${id}/refund` | يحتاج تحقق (لم يُلتقط في `properties.ts`) | غير محدد | **يحتاج تأكيد** |
| `properties/inspections.tsx` | `/properties/inspections` | `/properties/inspections${filter}`, `/properties/units?limit=200`, `/properties/inspections/${id}` | `routes/properties.ts:4024, 4045, 4095, 510` | `authorize({ feature:"properties.maintenance"/"properties.units", action:* })` | **مرتبط بالكامل** |
| `properties-guide.tsx` | `/properties/guide` | – | – | – | **shell — بدون backend** |

---

### 3.6 Admin / Governance

| الصفحة | Path | Endpoints | Backend file:line | Guards | الحالة |
|---|---|---|---|---|---|
| `admin-master-plan.tsx` | `/admin/master-plan` | `"/admin/master-plan/status"` | `routes/admin-master-plan.ts` | `requireModule("admin")` + `requireMinLevel(90)` + authorize داخل الـ router | **مرتبط بالكامل** |
| `admin-observability.tsx` | `/admin/observability` | `"/admin/observability/overview"`, `/livez`, `/readyz`, `/healthz`, `"/admin/governance/event-dlq?…"` | `routes/admin-observability.ts` + health (`routes/health.ts:?`) + governance | `requireMinLevel(90)` | **مرتبط بالكامل** |
| `admin-ai-governance.tsx` | `/admin/ai-governance` | `/admin/ai-governance/overview`, `/providers`, `/prompts`, `${id}` | `routes/admin-ai-governance.ts` | `requireMinLevel(90)` | **مرتبط بالكامل** |
| `admin-communication-control.tsx` | `/admin/comm-control` | `/admin/communication-control/{overview,inbox,providers,dlp-rules}` | `routes/admin-communication-control.ts` | `requireMinLevel(90)` | **مرتبط بالكامل** |
| `admin-pbx-control.tsx` | `/admin/pbx-control` | `/admin/pbx-control/{overview,extensions,ivr-menus,recordings,transcripts}` | `routes/admin-pbx-control.ts` | `requireMinLevel(90)` | **مرتبط بالكامل** |
| `admin-monitoring.tsx` | `/admin/monitoring` | `/admin/system-stops`, `/admin/system-health`, `/admin/api-health` | `routes/admin.ts` | `requireMinLevel(90)` | **مرتبط بالكامل** |
| `admin-rbac-matrix.tsx` | `/admin/rbac-matrix` | `"/admin/governance/rbac-matrix"` | `routes/governance.ts` (or admin) | `requireMinLevel(90)` | **مرتبط بالكامل** |
| `admin-data-import.tsx` | `/admin/data-import` | `/import/entities`, `/import/template/${e}`, `/import/preview`, `/import/confirm`, `/import/batches?…` | `routes/import.ts` | `requireMinLevel(50)` | **مرتبط بالكامل** |
| `admin-digital-signature.tsx` | `/admin/digital-signature` | `/digital-signature/{request-otp,verify,logs}` | `routes/digital-signature.ts` | (لا minLevel على mount — يحتاج تأكيد) | **يحتاج تأكيد** |
| `admin-zatca-audits.tsx` | `/admin/zatca-audits` | `/finance/zatca/{missing-tax-numbers,pause-history,misrouted-b2c-invoices}` | `routes/finance-zatca.ts` | `authorize({ feature:"finance.zatca", action:* })` + finance guards | **مرتبط بالكامل** |
| `admin/users-tab.tsx`, `users.tsx` | `/admin/users` | `/admin/users`, `/employees?limit=200`, `/admin/users/${id}` | `routes/admin.ts` ؛ `routes/employees.ts` | `requireMinLevel(90)` + `authorize(...)` | **مرتبط بالكامل** |
| `admin/roles.tsx`, `roles-tab.tsx` | `/admin/roles` | `/admin/predefined-roles`, `/settings/role-modules`, `/admin/roles`, `/admin/role-permissions?…` | `routes/admin.ts` ؛ `routes/settings.ts` | `requireMinLevel(90)` | **مرتبط بالكامل** |
| `admin/permissions-tab.tsx` | `/admin/permissions` | `/admin/users`, `/permissions/role-permissions?role=…`, `/permissions/user-permissions?userId=` | `routes/permissions.ts` | `requireMinLevel(90)` (mount) | **مرتبط بالكامل** |
| `admin/rbac-v2-*.tsx` (5 tabs) | `/admin/rbac-v2/*` | `/rbac/v2/features`, `/rbac/v2/roles`, `/rbac/v2/users`, `/rbac/v2/jit/*`, `/rbac/v2/sod` | `routes/rbacV2.ts` | `requireMinLevel(90)` (mount) | **مرتبط بالكامل** |
| `admin/print-templates.tsx`, `print-diagnostics.tsx` | `/admin/print` | `/print/templates`, `/print/assignments`, `/print/jobs`, `/print/queue/0`, `/print/deliver` | `routes/print.ts:125, 290, 328, 571, 660` | `requirePermission("print:create" / "templates:read/write")` + `requireAnyPermission` على diagnostics | **مرتبط بالكامل** |
| `admin/approval-overrides-report.tsx` | `/admin/overrides` | `GET /approval-actions/overrides/report${suffix}` | `routes/approvalActions.ts` | غير محدد بدقة | **يحتاج تأكيد** |
| `admin/audit-explorer-tab.tsx`, `logs.tsx` | `/admin/logs` | `"/audit-logs/entities"` | `routes/auditLogs.ts` | `requireMinLevel(70)` (mount) | **مرتبط بالكامل** |
| `admin-pdpl.tsx` | `/admin/pdpl` | `/pdpl/{privacy-notice, retention-policies, processing-log, employee-data-export/:id, data-request}` | `routes/pdpl.ts` | per-route guards (مفترض) | **مرتبط بالكامل (تأكيد المسحوبات)** |
| `governance.tsx` | `/governance` | `"/governance/stats"` | `routes/governance.ts` | `requireModule("governance")` | **مرتبط بالكامل** |
| `governance/policies-tab.tsx` | `/governance/policies` | `/governance/policies`, `/governance/policies/${id}/new-version` | `routes/governance.ts:168, 292` | `authorize({ feature:"governance", action:* })` | **مرتبط بالكامل** |
| `governance/risks-tab.tsx` | `/governance/risks` | `/governance/risks` | `routes/governance.ts:416, 424` | `authorize({ feature:"governance", action:* })` | **مرتبط بالكامل** |
| `governance/capa-tab.tsx`, `capa.tsx` | `/governance/capa` | `/governance/capa` | `routes/governance.ts` (capa endpoints) | `authorize({ feature:"governance", action:* })` | **مرتبط بالكامل** |

---

### 3.7 BI / Intelligence

| الصفحة | Path | Endpoints | Backend file:line | Guards | الحالة |
|---|---|---|---|---|---|
| `bi.tsx` / `bi-dashboards.tsx` / `bi-reports.tsx` / `bi-kpis.tsx` | `/bi*` | shells — لا API مباشرة | – | – | **shells** |
| `bi/overview-tab.tsx` | `/bi/overview` | `"/bi/overview"` | `routes/bi.ts` | `authorize({ feature:"bi", action:"list" })` + `requireModule("bi")` | **مرتبط بالكامل** |
| `bi/ceo-dashboard-tab.tsx` | `/bi/ceo` | `"/bi/ceo-dashboard"` | `routes/bi.ts` | – | **مرتبط بالكامل** |
| `bi/dashboards-tab.tsx` | `/bi/dashboards` | `"/bi/dashboards"` | `routes/bi.ts` | – | **مرتبط بالكامل** |
| `bi/reports-tab.tsx` | `/bi/reports` | `/bi/reports`, `/bi/reports/umrah-season-summary` | `routes/bi.ts` | – | **مرتبط بالكامل** |
| `bi/kpis-tab.tsx` | `/bi/kpis` | `"/bi/kpis"` | `routes/bi.ts` | – | **مرتبط بالكامل** |
| `bi/ai-insights-tab.tsx` | `/bi/ai-insights` | `/bi/ai-insights`, `${id}/dismiss`, `${id}/read` | `routes/bi.ts` | – | **مرتبط بالكامل** |
| `bi/alert-fatigue-tab.tsx` | `/bi/alert-fatigue` | `/bi/alert-fatigue/{daily-count, settings, mute}` | `routes/bi.ts` | – | **مرتبط بالكامل** |
| `bi/branch-performance-tab.tsx` | `/bi/branch-performance` | `"/bi/reports/branch-performance"` | `routes/bi.ts` | – | **مرتبط بالكامل** |
| `bi/fleet-tco-tab.tsx` | `/bi/fleet-tco` | `"/bi/reports/fleet-tco"` | `routes/bi.ts` | – | **مرتبط بالكامل** |
| `bi/leave-balance-tab.tsx` | `/bi/leave-balance` | `"/bi/reports/department-leave-balance"` | `routes/bi.ts` | – | **مرتبط بالكامل** |
| `bi/property-occupancy-tab.tsx` | `/bi/property-occupancy` | `"/bi/reports/property-occupancy"` | `routes/bi.ts` | – | **مرتبط بالكامل** |
| `bi/training-roi-tab.tsx` | `/bi/training-roi` | `"/bi/reports/training-roi"` | `routes/bi.ts` | – | **مرتبط بالكامل** |
| `bi/vendor-performance-tab.tsx` | `/bi/vendor-performance` | `"/bi/reports/vendor-performance"` | `routes/bi.ts` | – | **مرتبط بالكامل** |
| `bi-operations.tsx` | `/bi/operations` | `/bi/operations/{sla-delays, rejection-rate, bottleneck, employee-productivity, avg-completion-time}` | `routes/bi.ts` | `authorize({ feature:"bi", action:"list" })` | **مرتبط بالكامل** |
| `bi-admin-reports.tsx` | `/bi/admin-reports` | `/bi/admin-reports/{daily, weekly, monthly}` | `routes/bi.ts` | – | **مرتبط بالكامل** |
| `intelligence.tsx` | `/intelligence` | `/intelligence/{overview, alerts, daily-schedule, kpis}` | `routes/intelligence.ts:178, 82, 158, 135` | `authorize({ feature:"admin", action:"list" })` | **مرتبط بالكامل** |
| `insights.tsx` | `/insights` | `/intelligence/{insights-summary, recommendations, clients/analytics, seasonal-patterns, activity/stats}` | `routes/intelligence.ts` | `authorize({ feature:"admin", action:* })` | **مرتبط بالكامل** |
| `ai-workbench.tsx` | `/ai-workbench` | `"/intelligence/ai/categorize"` | `routes/intelligence.ts:390` | `authorize({ feature:"admin", action:"update" })` | **مرتبط بالكامل** |

---

### 3.8 Communications / Inbox / Mailboxes / CRM / Documents / Calendar / Tasks / My-Space

| الصفحة | Path | Endpoints | Backend file:line | Guards | الحالة |
|---|---|---|---|---|---|
| `communications.tsx` | `/communications` | `/communications/{stats, queue-stats, log/${id}/convert, log/${id}}` | `routes/communications.ts:565, 597` + ext | `authorize({ feature:"communications", action:* })` + `requireModule("comms")` | **مرتبط بالكامل** |
| `inbox.tsx` | `/inbox` | `/inbox/threads${qs}`, `/inbox/drafts`, `/inbox/calls`, `/inbox/messages/${id}/{star,folder}` | `routes/inbox.ts:69, 109, 173, 244, 279` | `authorize({ feature:"communications", action:* })` + `requireModule("comms")` | **مرتبط بالكامل** |
| `mailboxes.tsx` | `/mailboxes` | `/mailboxes`, `/settings/branches` | `routes/mailboxes.ts` + `routes/settings.ts:342` | `requireModule("comms")` ؛ settings: `requireMinLevel(70)` | **مرتبط بالكامل** |
| `comms/correspondence.tsx` | `/correspondence` | `/correspondence`, `/correspondence/stats/summary` | `routes/correspondence.ts` | `authorize({ feature:"communications", action:* })` + `requireModule("comms")` | **مرتبط بالكامل** |
| `crm.tsx` | `/crm` | `/crm/{stats, analytics, pipeline}` | `routes/crm.ts:163, …` | `authorize({ feature:"crm.*", action:* })` + `requireModule("crm")` | **مرتبط بالكامل** |
| `clients.tsx` | `/clients` | (لم تُلتقط في الـ regex — تستخدم hooks مشتركة لـ `/clients`) | `routes/clients.ts:139, 185, 261, 422, 458, 528` | `authorize({ feature:"crm.clients", action:* })` + `requireModule("crm")` | **مرتبط بالكامل (ضمنياً)** |
| `client-detail.tsx` | `/clients/:id` | `/clients/${id}`, `/intelligence/clients/${id}/rfm`, `/clients/${id}/portal-account`, `/umrah/sub-agents?clientId=` | `routes/clients.ts:261, 568, 589, 646` ؛ `routes/intelligence.ts` ؛ `routes/umrah-entities.ts` | mixed `authorize(...)` | **مرتبط بالكامل** |
| `crm/lead-detail.tsx` | `/crm/leads/:id` | `/crm/opportunities/${id}`, `/activities`, `/related` | `routes/crm.ts:878, 1061, 998` | `authorize({ feature:"crm.opportunities", action:* })` | **مرتبط بالكامل** |
| `documents-page.tsx` | `/documents` | `/documents${qs}`, `/documents/folders`, `/documents/templates`, `/documents/stats` | `routes/documents.ts:193, …` | `authorize({ feature:"documents", action:* })` + `requireModule("documents")` | **مرتبط بالكامل** |
| `documents-ocr-inbox.tsx` | `/documents/ocr` | `/documents/ocr/extractions${filter}`, `${id}/${action}`, `/documents/${id}/ocr/rerun` | `routes/documents.ts` (OCR sub-routes) | `authorize({ feature:"documents", action:* })` | **مرتبط بالكامل** |
| `tasks.tsx` | `/tasks` | `GET /tasks${qs}` | `routes/tasks.ts:113, 269, 296, 400` | `authorize({ feature:"tasks", action:* })` + `requireModule("operations")` | **مرتبط بالكامل** |
| `calendar.tsx` | `/calendar` | `GET /calendar/upcoming?days=` | `routes/calendar.ts:39` | `authorize({ feature:"projects", action:"list" })` | **مرتبط بالكامل** |
| `obligations.tsx` | `/obligations` | `/obligations/summary`, `/obligations?…`, `/obligations/${id}/${action}`, `/obligations/scan`, `/employees/obligations/seed` | `routes/obligations.ts:70, 93, 131, 207` + `routes/employees.ts:1494` | `authorize({ feature:"projects", action:* })` ؛ employees: `authorize({ feature:"hr.employees" })` | **مرتبط بالكامل** |
| `my-space.tsx` | `/my-space` | `GET /my-space${scope}`, `/intelligence/suggestions` | `routes/mySpace.ts:13` ؛ `routes/intelligence.ts:205` | `authorize({ feature:"my_space", action:"view" })` ؛ intelligence: `requireRole("branch_manager", …)` | **مرتبط بالكامل** |
| `my-attendance.tsx` | `/my-attendance` | `/my-space/attendance?month=` | `routes/mySpace.ts:478` | `authorize({ feature:"my_space", action:"view" })` | **مرتبط بالكامل** |
| `my-payslip.tsx` | `/my-payslip` | `/my-space/payslip?period=` | `routes/mySpace.ts:530` | `authorize({ feature:"my_space.payslip", action:"view" })` | **مرتبط بالكامل** |
| `my-performance.tsx` | `/my-performance` | `/my-space/performance` | `routes/mySpace.ts:567` | `authorize({ feature:"my_space", action:"view" })` | **مرتبط بالكامل** |
| `my-documents.tsx` | `/my-documents` | `/my-space/documents` | `routes/mySpace.ts:584` | `authorize({ feature:"my_space", action:"view" })` | **مرتبط بالكامل** |
| `my-requests.tsx` | `/my-requests` | `/my-space/requests` | `routes/mySpace.ts:600` | `authorize({ feature:"my_space", action:"view" })` | **مرتبط بالكامل** |
| `my-loans.tsx` | `/my-loans` | `/hr/loans/my` | `routes/hr-loans.ts` (my sub-route) | `authorize({ feature:"hr.loans.my", action:"list" })` (مفترض) | **مرتبط بالكامل (تأكيد feature key)** |
| `my-overtime.tsx` | `/my-overtime` | `/hr/overtime/my?month=` | `routes/hr-overtime.ts` (my) | `authorize({ feature:"hr.overtime.my", action:"list" })` (مفترض) | **مرتبط بالكامل (تأكيد feature key)** |
| `my-space/*.tsx` (17 sub-components) | – | (sections/cards تستهلك props) | – | – | **shells (متعمَّد)** |

---

### 3.9 Legal / Projects / Support / Store / Marketing / Warehouse

| الصفحة | Path | Endpoints | Backend file:line | Guards | الحالة |
|---|---|---|---|---|---|
| `legal.tsx` | `/legal` | `/legal/{stats, contracts/renewal-alerts, cases, financial-report}` | `routes/legal.ts:281, 617, …` | `authorize({ feature:"legal.*", action:* })` + `requireModule("legal")` | **مرتبط بالكامل** |
| `legal-case-detail.tsx` | `/legal/cases/:id` | `/legal/cases/${id}`, `/judgments`, `/correspondence`, `/sessions` | `routes/legal.ts:617`+ subpaths | `authorize({ feature:"legal.cases", action:* })` | **مرتبط بالكامل** |
| `legal/correspondence.tsx` | `/legal/correspondence` | `/legal/cases` | `routes/legal.ts:617` | – | **مرتبط بالكامل** |
| `legal/judgments.tsx` | `/legal/judgments` | `/legal/judgments/financial-report` | `routes/legal.ts` | – | **مرتبط بالكامل** |
| `legal/sessions.tsx` | `/legal/sessions` | `/legal/sessions/upcoming` | `routes/legal.ts` | – | **مرتبط بالكامل** |
| `projects.tsx` | `/projects` | `/projects/stats/{overview, summary}` | `routes/projects.ts:316, …` | `authorize({ feature:"projects.list", action:"list" })` + `requireModule("operations")` | **مرتبط بالكامل** |
| `projects/gantt.tsx` | `/projects/gantt` | `/projects?limit=100`, `/projects/${id}/gantt` | `routes/projects.ts:316` + gantt endpoint | – | **مرتبط بالكامل** |
| `projects/risks.tsx` | `/projects/risks` | `/projects?limit=100`, `/projects/${id}/risks`, `/projects/risks/${id}` | `routes/projects.ts` | – | **مرتبط بالكامل** |
| `support.tsx` | `/support` | `/support/{stats, kb, csat}` | `routes/support.ts` | `requireModule("support")` | **مرتبط بالكامل** |
| `support/kb.tsx` / `replies.tsx` | `/support/kb`, `/support/replies` | `/support/kb`, `/support/replies` | `routes/support.ts` | – | **مرتبط بالكامل** |
| `store.tsx` | `/store` | `/store/{products, orders, stats}` | `routes/store.ts:148, 240, 332(approx)` | `authorize({ feature:"store", action:* })` + `requireModule("store")` + `requireGuards("financial")` | **مرتبط بالكامل** |
| `store/order-detail.tsx` | `/store/orders/:id` | `/store/orders/${id}` | `routes/store.ts:337, 361, 422` | `authorize({ feature:"store", action:* })` | **مرتبط بالكامل** |
| `store/product-detail.tsx` | `/store/products/:id` | `/store/products/${id}`, `/store/orders?productId=`, `/finance/purchase-orders?productId=` | `routes/store.ts:183, 240`؛ `routes/finance-purchase.ts` | mixed `authorize(...)` | **مرتبط بالكامل** |
| `marketing.tsx` | `/marketing` | `/marketing/{campaigns, funnel, stats, templates, campaigns/${id}/revenue}` | `routes/marketing.ts:91, 246, 194, 292, 277` | `authorize({ feature:"marketing", action:* })` + `requireModule("marketing")` | **مرتبط بالكامل** |
| `warehouse.tsx` | `/warehouse` | `/warehouse/{stats, categories, suppliers}` | `routes/warehouse.ts:288, 1051, …` | `authorize({ feature:"warehouse.*", action:* })` + `requireModule("warehouse")` + `requireGuards("financial")` + warehouse per-user limiter | **مرتبط بالكامل** |
| `warehouse-advanced.tsx` | `/warehouse/advanced` | `/warehouse/cycle-counts`, `/cycle-counts/plans`, `${id}/${kind}` | `routes/wiring-stubs.ts:39, 58, 81, 84, 87, 90` (cycle-counts) | **stubs غير محصورة بـ authorize() — فقط `requireMinLevel(20)` على POST** | **مرتبط جزئياً (راجع §6)** |
| `warehouse/inventory-count.tsx` | `/warehouse/inventory-count` | `/warehouse/inventory-counts`, `/warehouse/products?limit=500`, `${id}/items` | `routes/warehouse.ts` | `authorize({ feature:"warehouse.inventory", action:* })` | **مرتبط بالكامل** |

---

### 3.10 Settings / Numbering / Workflows / Reports / Notifications / Misc

| الصفحة | Path | Endpoints | Backend file:line | Guards | الحالة |
|---|---|---|---|---|---|
| `settings.tsx` | `/settings` | `/settings/{general, resolved, …}` | `routes/settings.ts:193, 213, 269, 276, 315` | `requireModule("settings")` + `requireMinLevel(70)` + `authorize({ feature:"settings", action:"view/update" })` | **مرتبط بالكامل** |
| `settings/branches-tab.tsx` | `/settings/branches` | `/settings/companies`, `/settings/branches`, `${id}` | `routes/settings.ts:342, 359` | كما أعلاه | **مرتبط بالكامل** |
| `settings/companies-tab.tsx` | `/settings/companies` | `/settings/companies` | `routes/settings.ts:33(?), …` | كما أعلاه | **مرتبط بالكامل** |
| `settings/numbering-tab.tsx` | `/settings/numbering` | `/numbering/schemes`, `/numbering/schemes/${id}/backfill`, `/numbering/counters/${cid}/{reset, op}` | `routes/numbering.ts` | `requireModule("settings")` + `requireMinLevel(70)` + per-route authorize ('settings.numbering[.override/reset/audit]') | **مرتبط بالكامل** |
| `settings/print-templates.tsx` | `/settings/print-templates` | `/print/templates`, `/settings/branches`, `/print/preview`, `${id}` | `routes/print.ts:290, 328`؛ `routes/settings.ts:342` | `requirePermission("templates:read/write")` | **مرتبط بالكامل** |
| `settings/accounting-mappings-tab.tsx` | `/settings/accounting` | `/finance/accounting-mappings`, `/finance/accounts`, `${operationType}`, `/batch` | `routes/finance-accounts.ts` + finance routes | finance guards + authorize | **مرتبط بالكامل** |
| `settings/approval-workflows-tab.tsx` | `/settings/approvals` | `/settings/approval-config`, `${id}` | `routes/settings.ts` | settings guards | **مرتبط بالكامل** |
| `settings/gov-integrations-tab.tsx` | `/settings/gov-integrations` | `/gov-integrations`, `/gov-integrations/expiring/iqama`, `/registration`, `/links` | `routes/gov-integrations.ts` | غير محدد (راجع §6) | **يحتاج تأكيد** |
| `settings/workflow-definitions-tab.tsx` | `/settings/workflows` | `/workflows/{definitions, sla-definitions}`, `${id}` | `routes/workflows.ts:251 (list defs)` | `authorize({ feature:"admin", action:"list/update" })` | **مرتبط بالكامل** |
| `settings/zatca-settings-tab.tsx` | `/settings/zatca` | `/finance/zatca/settings`, `/test-connection` | `routes/finance-zatca.ts` | finance + zatca guards | **مرتبط بالكامل** |
| `settings/role-permissions-tab.tsx` | `/settings/role-permissions` | `/settings/role-modules`, `${role}` | `routes/settings.ts` | settings guards | **مرتبط بالكامل** |
| `settings/system-controls-tab.tsx` | `/settings/system-controls` | `/settings/system-controls` | `routes/settings.ts` | settings guards | **مرتبط بالكامل** |
| `settings/communication-channels-tab.tsx` | `/settings/channels` | `/settings/channels` | `routes/settings.ts` | settings guards | **مرتبط بالكامل** |
| `settings/letterhead-tab.tsx` | `/settings/letterhead` | `/settings/branches`, `${id}` | `routes/settings.ts:342, 359` | settings guards | **مرتبط بالكامل** |
| `settings-rules.tsx` | `/settings/rules` | `/rules/logs?limit=50`, `/rules` | `routes/rules.ts` | `requireModule("settings")` + `requireMinLevel(70)` | **مرتبط بالكامل** |
| `notification-engine.tsx` | `/notification-engine` | `/notification-engine/{routing-rules, fallback-chains, templates, webhooks}` | `routes/notification-engine.ts` | `requireModule("notifications")` | **مرتبط بالكامل** |
| `notifications.tsx` | `/notifications` | `/notifications`, `/notifications/preferences` | `routes/notifications.ts:67, 213, 235` | `authorize({ feature:"notifications", action:* })` | **مرتبط بالكامل** |
| `reports/print-log.tsx` | `/reports/print-log` | `/settings/branches`, `/api/print/jobs/${jobId}/download` (raw fetch) | `routes/print.ts:571` + download endpoint | print permissions | **مرتبط بالكامل** |
| `reports/scheduled-reports.tsx` | `/reports/scheduled` | `/scheduled-reports`, `/history`, `${id}` | `routes/scheduled-reports.ts` | `requireMinLevel(50)` (mount) | **مرتبط بالكامل** |
| `exec-dashboard.tsx` | `/exec-dashboard` | `/exec-dashboard/{overview, overdue-invoices, critical-obligations}` | `routes/execDashboard.ts` | `requireMinLevel(70)` (mount) | **مرتبط بالكامل** |
| `action-center.tsx` | `/action-center` | `GET /action-center${scope}` | `routes/actionCenter.ts:12` | `authorize({ feature:"dashboard.action_center", action:"view" })` | **مرتبط بالكامل** |
| `manager-board.tsx` | `/manager-board` | `/action-center`, `/hr/attendance/today-summary`, `/tasks`, `/hr/delegations` | `routes/actionCenter.ts:12`، `routes/hr.ts:1139, 2299(approx)`، `routes/tasks.ts:113` | scope-aware + module guards | **مرتبط بالكامل** |
| `manager-workspace.tsx` | `/manager-workspace` | `/workspace/team` | `routes/workspace.ts:167` | `authorize({ feature:"workspace.manager", action:"view" })` | **مرتبط بالكامل** |
| `workspace.tsx` | `/workspace` | `/workspace/feed` | `routes/workspace.ts:32` | `authorize({ feature:"workspace", action:"view" })` | **مرتبط بالكامل** |
| `operations-center.tsx` | `/operations-center` | (لم تُلتقط من regex مباشرة) | `routes/operationsCenter.ts:88, 453, 487` | `authorize({ feature:"projects", action:"list" })` + `requireMinLevel(40)` | **مرتبط بالكامل (تأكيد ضمني)** |
| `daily-close.tsx` | `/daily-close` | `GET /operations-center/daily-close/checklist${scope}` | `routes/operationsCenter.ts:453` | `authorize({ feature:"projects", action:"list" })` + `requireMinLevel(40)` | **مرتبط بالكامل** |
| `automation.tsx` | `/automation` | `/automation/{notification-stats, proactive-rules, automation-stats, event-logs}` | `routes/automation.ts` | `requireModule("automation")` | **مرتبط بالكامل** |
| `module-dashboards.tsx` | `/module-dashboards` | `/module-dashboards/{hr, finance, fleet, legal, properties}` | `routes/moduleDashboards.ts` | `requireModule("bi")` | **مرتبط بالكامل** |
| `requests-page.tsx` | `/requests` | `/requests/catalog`, `/requests`, `/requests/types` | `routes/requests.ts` | `authorize({ feature:"requests", action:* })` + `requireModule("requests")` | **مرتبط بالكامل** |
| `activity-log.tsx` | `/activity-log` | `/employees`, `/activity-log/summary`, `/activity-log?limit=20` | `routes/activityLog.ts` + employees | `requireMinLevel(70)` (mount) | **مرتبط بالكامل** |
| `login.tsx` | `/login` | `POST /auth/login` | `routes/auth.ts:234` | `loginLimiter` (per-IP) | **مرتبط بالكامل** |

---

## 4. Endpoints موجودة لكن غير مستخدمة (Potential dead endpoints)

> سُحبت الـ routes الـ 1689 من `routes/*.ts` وقُورنت مع الـ URLs المنبَعَثة من `pages/`. ما يلي عيِّنة عالية الثقة من الـ endpoints التي لم يُرصد لها استدعاء مباشر من أي page (قد تُستدعى من mobile/portals/CLI/scripts — يجب التحقق قبل أي إزالة).

| Endpoint | Backend file:line | تعليق |
|---|---|---|
| `POST /finance/invoices/impact-preview` | `finance-invoices.ts:225` | يستخدم محلياً في `create/finance/invoices-create.tsx` (cost-splitter) — قد يكون مغطًى |
| `POST /finance/invoices/:id/preview-posting` | `finance-invoices.ts:1364` | لم يُرصد استدعاء مباشر من أي page |
| `POST /finance/invoices/:id/credit-memo/preview` | `finance-invoices.ts:2381` | لم يُرصد استدعاء مباشر |
| `POST /finance/invoices/:id/debit-memo/preview` | `finance-invoices.ts:2818` | لم يُرصد استدعاء مباشر |
| `GET /finance/invoices/:id/memos` | `finance-invoices.ts:3082` | لم يُرصد استدعاء مباشر (قد يستخدم داخل invoice-detail) |
| `GET /finance/bad-debt/preview` | `finance-invoices.ts:3117` | `bad-debt.tsx` يستخدم `/post` فقط لا `/preview` — orphan |
| `GET /umrah/pilgrims/export.csv` | `umrah.ts:799` | لا يوجد زر export في `pilgrims.tsx` يستدعيه (التصدير محلي على القائمة الحالية) |
| `POST /umrah/import/mutamers` | `umrah.ts:1202` | wizard يستخدم `/import/preview` و `/import/vouchers` فقط؛ مسار `/mutamers` غير مُستهلَك |
| `GET /fleet/vehicles/:id/impact-preview` | `fleet.ts:570` | غير مستهلَك في `details/vehicle-detail.tsx` |
| `POST /fleet/alerts/:id/dismiss` | `fleet.ts:2039` | غير مُستهلك (الواجهة تستخدم acknowledge فقط) |
| `GET /properties/units/:id/impact-preview` | `properties.ts:656` | غير مستهلَك |
| `POST /properties/contracts/impact-preview` | `properties.ts:863` | غير مستهلَك (متاح ولكن لا زرّ في الواجهة) |
| `POST /properties/late-rent/escalate` | `properties.ts:2026` | لا واجهة مرئية تستدعيه |
| `POST /obligations/met-by-entity`, `/cancel-by-entity` | `obligations.ts:151, 188` | غير مستهلَك في `obligations.tsx` (تستخدم `${id}/${action}` فقط) |
| `POST /projects/impact-preview` | `projects.ts:203` | غير مستهلَك في `projects.tsx`/`details/project-detail.tsx` |
| `GET /events/log`, `/events/log/stats` | `events.ts:90, 188` | تُستهلَك من `admin-event-monitor.tsx` عبر `/events/catalog/…` فقط؛ `/log` لا يستخدمها UI |
| `GET /print/jobs.csv` | `print.ts:660` | لا يُستدعى صراحةً من `reports/print-log.tsx` (الذي يستخدم `/jobs` + download فردي) |
| `POST /print/reprint-requests` | `print.ts:838` | يُستهلك من mobile/client portal أو وردفلو خارجي — لم يُرصد من pages |

**تقدير:** بناءً على الفجوة بين 1689 route و ~500–700 endpoint مستهلكة من واجهة الـ ERP الرئيسية، يُتوقع وجود **300–500 endpoint غير مستهلكة من pages** — لكن جزء كبير منها يخدم: `clientPortal.ts` (Portal), `careersPortal.ts`, `webhooks/cmsv6`, mobile clients, scheduled jobs. التحقق النهائي يتطلب فحص portals + scripts (خارج نطاق هذا التقرير).

---

## 5. صفحات بدون أي backend call (Mock/Static/Shell)

| الملف | النوع | السبب |
|---|---|---|
| `not-found.tsx` | 404 | لا تحتاج backend |
| `services.tsx` | Sidebar navigation | يعتمد `useFilteredNavSections` (RBAC client-side) |
| `admin.tsx`, `bi.tsx`, `bi-dashboards.tsx`, `bi-reports.tsx`, `bi-kpis.tsx` | Tab shells | تفويض إلى tabs |
| `properties-guide.tsx` | محتوى تعليمي ثابت | – |
| `print-verify.tsx` | يستخدم `verifyDocument` helper (مغطًى) | `GET /api/print/verify/:jobId` عبر raw `fetch` |
| `admin/shared.ts`, `admin/rbac-v2-conditions-editor.tsx` | utilities / sub-editors | تستلم data من الأب |
| `bi/shared.tsx` | utility | – |
| `governance/stats-cards.tsx` | presentational | يستلم data من الأب |
| `finance/profitability-{project,property,vehicle,umrah-agent}.tsx` | wrappers لـ `./profitability` | – |
| `finance/zatca-reports-hub.tsx`, `finance-workflows-hub.tsx`, `tax-filing-calendar.tsx`, `customer-statement.tsx`, `vendor-statement.tsx` | Navigation hubs / link gardens | – |
| `my-space/*.tsx` (17 ملف: `account-info-card`, `active-loans-card`, `alerts-section`, `change-password-section`* (لها API), `custodies-and-documents-section`, `entity-cards-section`, `leaves-and-requests-section`, `monthly-summary-card`, `pending-approvals-card`, `preferences-card`, `recent-actions-and-performance-section`, `role-entities-grid`, `secondary-alerts-section`, `smart-suggestions-card`, `summary-cards`, `tasks-and-notifications-section`, `violations-card`, `shared.ts`) | presentational sub-components لـ `my-space.tsx` | تستلم data من الأب |

> `my-space/change-password-section.tsx` فقط من بين الـ 17 له API (`POST /auth/change-password`).

**خلاصة:** لا توجد صفحة **رئيسية** (route فعلي في الـ SPA) تعتمد على بيانات وهمية صرفة. كل ما هو "بدون backend" هو إما shell/wrapper/sub-component/static — وهذا **سلوك مقصود**.

---

## 6. API بدون permission guard / audit (مرشحات #1413)

### 6.1 Routes بدون `authorize()` أو `requirePermission()` صريحة

#### A) `wiring-stubs.ts` — guard فضفاض

عدة GET endpoints في `wiring-stubs.ts` بدون `authorize()`/`requirePermission()` (يعتمد فقط على `authMiddleware` + `requireModule(<key>)` من mount):

- `GET /warehouse/cycle-counts` — `wiring-stubs.ts:39`
- `GET /warehouse/cycle-counts/plans` — `wiring-stubs.ts:61`
- `GET /warehouse/cycle-counts/:id` — `wiring-stubs.ts:64`
- `GET /warehouse/lots` — `wiring-stubs.ts:95`
- `GET /warehouse/serials` — `wiring-stubs.ts:155`

الـ POST في نفس الملف لديها `requireMinLevel(20)` لكنها أيضاً بلا feature-level authorize.

**التوصية:** إضافة `authorize({ feature: "warehouse.inventory", action: "list/create" })` لكل route في `wiring-stubs.ts` بالتوازي مع `requireMinLevel`. (نطاق #1413 §A1)

#### B) `events.ts` — read-only logs بدون authorize

- `GET /events/log` — `events.ts:90` (لا authorize داخل الـ handler)
- `GET /events/log/stats` — `events.ts:188`

> **تعويض:** الـ mount يطبق `requireMinLevel(70)` (`routes/index.ts:454`)، لذا فهي محصورة على audit-level users؛ لكن لا يوجد feature-based guard. ينطبق نفس مبدأ #1413.

#### C) `settings.ts` — public display endpoint

- `GET /settings/display` — `settings.ts:162` (`publicRouter.get(...)`) — بدون auth بالتصميم (يُعرَض على `login` لجلب اسم الشركة/timezone). آمن لأنه read-only ويعرض حقولاً عامة فقط، لكن يجب توثيقه في BYPASS_TRIAGE.

#### D) `routes/index.ts` — انت `/settings/display` العامة قبل authMiddleware

- `GET /settings/display` (`routes/index.ts:186`) — bypass متعمَّد لـ `authMiddleware` (مماثل لما سبق). موثَّق ضمنياً عبر تعليق الكود.

#### E) Routes يحتاج تأكيد guard دقيق

| Endpoint | Page | Backend file | لماذا "غير محدد" |
|---|---|---|---|
| `GET /finance/treasury` | `treasury.tsx`, `cfo-cockpit.tsx`, `reconciliation-hub.tsx` | غير موجود في `finance-*.ts` المُسحوبة | قد يكون في `finance-collection.ts` / `finance-hardening.ts` |
| `GET /finance/fixed-assets`, `POST /depreciate-all` | `fixed-assets.tsx` | غير موجود في `finance-*.ts` المُسحوبة | mount mention يقول `financeRouter` أُلغي في Phase 7.1 |
| `GET /hr/attendance-stats`, `/hr/leave-stats` | `attendance.tsx`, `leaves.tsx` | غير موجود في `hr.ts` بهذه التسمية الدقيقة | يحتمل stub أو alias |
| `POST /hr/check-in` (mount) | `dashboard.tsx`, `my-space.tsx` | `hr.ts:475` | `checkInLimiter` + `authorize({ feature:"hr.attendance.checkin" })` — مُغطّى |
| `GET /admin/digital-signature/*` mount | `admin-digital-signature.tsx` | `digital-signature.ts` | لا `requireMinLevel` على mount في `index.ts:450` — يعتمد فقط على `authMiddleware`. يجب التحقق من authorize داخل الـ router |
| `GET /gov-integrations/*` | `settings/gov-integrations-tab.tsx` | `gov-integrations.ts` | mount في `index.ts:449` بلا `requireMinLevel` — لا يوجد guard خارجي |
| `GET /approval-actions/overrides/report` | `admin/approval-overrides-report.tsx` | `approvalActions.ts` | لم يُتحقق من inline authorize |

### 6.2 audit middleware — تطبيق ضمني

- `auditMiddleware` (`middlewares/auditMiddleware.ts:175`) مُسجَّل **عالمياً** في `app.ts:143` (قبل router).
- يُفعَّل تلقائياً على `POST/PATCH/PUT/DELETE` فقط، وفقط للـ entities المعروفة (`resolveEntity(req.path)`).
- **نتيجة:** كل المسارات mutating لها audit logging ضمني — **لا حاجة للتعليم اليدوي**. لكن GET endpoints حساسة (PII/exports) لا تُسجَّل في audit_logs بشكل افتراضي (يُفترض أن يُسجَّلها هندسياً كل route عبر `app_security_events` / `documents/:id/download` كما في `documents.ts:349` و `:396`).

### 6.3 Routes حساسة بـ GET بدون audit صريح (مرشحات #1413)

- `GET /finance/reports/*` (13 endpoint) — تعرض بيانات مالية حساسة. لا audit log افتراضي على GET.
- `GET /audit-logs/*` — قراءة سجلات التدقيق ذاتها لا تُسجَّل (`requireMinLevel(70)` فقط).
- `GET /admin/users` — قراءة قائمة المستخدمين بدون audit.
- `GET /pdpl/employee-data-export/:id` — يجب أن يُسجَّل (data export tracking للامتثال بـ PDPL).
- `GET /print/jobs/:id/download` — التحميل لا يُسجَّل افتراضياً (راجع `documents.ts:349` كقالب).

**التوصية:** إضافة `app_security_events` insert يدوي على هذه الـ GETs قبل sign-off للـ #1413.

---

## 7. التوصيات

### 7.1 أولوية عالية (Blockers for #1413 / #1418)

1. **سدّ فجوات RBAC في `wiring-stubs.ts`:** أضف `authorize({ feature: <module>.<entity>, action: <verb> })` لكل route (5 GETs + ~15 POSTs). لا يُكتفى بـ `requireMinLevel(20)`.
2. **تأكيد mounting guards** على `digital-signature` و `gov-integrations` في `routes/index.ts:449-450`: يجب إضافة `requireMinLevel(50–70)` لأن البيانات حكومية/أمنية.
3. **إضافة audit logging يدوي للـ GET الحساسة:**
   - كل `/finance/reports/*` → سجل `app_security_events` بـ event_type=`finance.report.view`.
   - `/audit-logs/*` → self-audit.
   - `/pdpl/employee-data-export/:id` → سجل تصدير PDPL.
   - `/print/jobs/:id/download`, `/documents/:id/{download,preview}` (موجود — تأكيد فقط).
4. **توضيح حالة `finance/treasury` و `finance/fixed-assets`:** هي routes موجودة في `pages/` لكن `routes/*.ts` لا تُظهرها صراحة بعد إلغاء `financeRouter` (Phase 7.1). إما إعادة الـ route أو توثيق في `wiring-stubs.ts`.

### 7.2 أولوية متوسطة (Cleanup)

5. **توثيق "intentional shells":** أضف heading-comment موحَّد لكل من `bi.tsx`, `admin.tsx`, `properties-guide.tsx`, `services.tsx`, `not-found.tsx`, `profitability-*.tsx` يوضح أنها لا تستدعي API بالتصميم — لمنع الـ false positives في فحوص مستقبلية.
6. **إزالة / إعلان dead endpoints:** بعد تأكيد portals + mobile + scripts، احذف أو علِّم `@deprecated` على:
   - `POST /finance/invoices/:id/preview-posting`
   - `POST /finance/invoices/:id/credit-memo/preview` + `/debit-memo/preview` (إن لم يستخدمها UI فعلاً)
   - `GET /finance/bad-debt/preview`
   - `POST /umrah/import/mutamers`
   - `POST /fleet/alerts/:id/dismiss`
   - `POST /properties/late-rent/escalate`
   - `POST /obligations/met-by-entity`, `/cancel-by-entity`
   - `POST /projects/impact-preview`
7. **إصلاح regex-blind hooks:** بعض pages (مثل `clients.tsx`, `operations-center.tsx`, `fleet/telematics/operations.tsx`) تعتمد hooks مشتركة (`useClients`, `useTelematicsLive`) لا تظهر مع `grep`. الـ wiring فعلي لكن غير قابل للتدقيق الآلي — يفضَّل تمرير الـ URLs دائمًا كـ string literals.

### 7.3 أولوية منخفضة (Hardening)

8. **توحيد per-user limiters:** الـ limiters على `/hr`, `/finance`, `/umrah`, `/fleet`, `/warehouse`, `/properties` موجودة. أضف limiter مشابه لـ `/admin/*` و `/governance/*`.
9. **إثراء `/api/_routes` بصلاحيات:** الـ endpoint الحالي (`routes/index.ts:216`) يُعيد method+path فقط. أضف feature/action/minLevel لكل route لتسهيل التدقيق التلقائي.
10. **My-Space sub-components:** قم بتعليق صريح في `my-space/shared.ts` يبيّن أنها presentational تنتظر `data` كـ prop — وليست orphan routes.

---

## ملخص نهائي (5 أسطر)

1. تم مسح 580 ملف صفحة و 1689 endpoint في `routes/*.ts`. 541 صفحة (93%) تستدعي API صراحة عبر `useApiQuery / useApiMutation / apiFetch`.
2. 39 ملف بلا استدعاء API كلها shells/wrappers/static أو sub-components بالتصميم — **لا توجد صفحة رئيسية واحدة معتمدة على بيانات وهمية صرفة**.
3. `authMiddleware`, `csrfMiddleware`, و `auditMiddleware` مُطبَّقة عالمياً (`app.ts:143`, `routes/index.ts:245-246`)؛ كل وحدة محصورة بـ `requireModule(<key>)` + `requireGuards("financial")` + per-user limiter حسب الحاجة.
4. **فجوات #1413:** `wiring-stubs.ts` (5 GETs بلا authorize)، `events.ts /log` (لا feature guard)، mount لـ `digital-signature` و `gov-integrations` بلا `requireMinLevel`، و GET endpoints حساسة (`/finance/reports/*`, `/audit-logs/*`, `/pdpl/employee-data-export/*`) بدون audit يدوي.
5. **dead endpoints مرشَّحة (~15+):** `bad-debt/preview`, `invoices/:id/preview-posting`, `umrah/import/mutamers`, `fleet/alerts/:id/dismiss`, `properties/late-rent/escalate`, `obligations/{met,cancel}-by-entity`, `projects/impact-preview` — تتطلب تأكيد portals + mobile قبل أي حذف.
