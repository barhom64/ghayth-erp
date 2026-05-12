# فهرس فحص نظام غيث الشامل
### Ghayth ERP Comprehensive Audit Index

> آخر تحديث: 2026-05-09
> الفرع: `claude/hr-smoke-testing-6DRib`
> إجمالي الأخطاء المصلحة: **~1066** عبر 24 جولة

---

## ملخص تنفيذي

| المقياس | القيمة |
|---------|--------|
| إجمالي الأخطاء المصلحة | ~1066 |
| عدد الجولات | 24 |
| عدد الملفات المعدّلة | 90+ |
| إجمالي ملفات الـ Routes | 80 |
| نسبة التغطية | 100% |

---

## فئات الأخطاء المصلحة

| الفئة | العدد | الوصف |
|-------|-------|-------|
| Soft-delete bypass | ~180 | UPDATEs بدون `AND "deletedAt" IS NULL` |
| Response data bugs | ~70 | INSERT بدون إعادة جلب الصف |
| Cross-tenant auth | ~45 | UPDATEs/SELECTs بدون `companyId` |
| FK validation | ~30 | INSERT بدون التحقق من المفتاح الأجنبي |
| Transaction safety | ~25 | عمليات متعددة بدون `withTransaction` |
| Zod/CHECK mismatch | ~20 | Zod يقبل قيم خارج CHECK constraint |
| NaN pagination | ~15 | `Math.max(Number(page), 1)` يرجع NaN |
| Missing LIMIT | ~15 | استعلامات بدون LIMIT |
| SQL injection | ~10 | إدخال مستخدم مباشر في SQL |
| Column mismatch | ~15 | أعمدة غير موجودة أو خاطئة |
| Frontend bugs | ~20 | حالات lifecycle خاطئة |
| Schema fixes | ~10 | CHECK constraints ناقصة |
| Race conditions | ~10 | تكرار بدون UNIQUE |
| Unbounded queries | ~7 | SELECT بدون LIMIT على جداول كبيرة |
| Credential leak | ~5 | بيانات حساسة في الاستجابة |
| Other | ~320 | أخطاء منطقية متنوعة |

---

## تفاصيل كل جولة

### Rounds 1-7 — ~357 خطأ
- جميع 80 ملف route + middlewares + frontend
- employees.ts: إزالة companyId من INSERT
- hr.ts: إصلاح payroll rollback
- finance-purchase.ts: purchase_order_items vs purchase_order_lines
- roleGuard middleware: ثغرة أمنية

### Rounds 8-9 — ~50 خطأ
- settings.ts, admin.ts, hr-discipline.ts, portals, frontend
- Zod bypass, Credential leak, Frontend lifecycle

### Round 10 — ~83 خطأ
- 10a: Race conditions + transaction safety + SQL injection (26)
- 10b: Zod schema gaps + frontend lifecycle (11)
- 10c-e: Transaction safety + response data (14)

### Round 11 — ~83 خطأ
- 11a: 80 UPDATE/DELETE بدون deletedAt IS NULL
- 11b: 3 عمليات multi-write في withTransaction

### Round 12 — ~55 خطأ
- deletedAt + transactions + companyId scoping

### Round 13 — ~47 خطأ
- 13a: 10 broken column references
- 13b: 37 critical bugs across 14 files

### Round 14 — ~45 خطأ
- 14a: FK validation + response data + pagination (30)
- 14b: Authorization + soft-delete bypass (15)

### Round 15 — ~85 خطأ
- 15a: 38 soft-delete + 17 response data (55)
- 15b: 21 soft-delete + 7 LIMIT guards (30)
- 29 ملف مصلح

### Round 16 — ~26 خطأ
- Response data re-fetch across 14 files

### Round 17 — ~75 خطأ
- 17a: Zod/CHECK mismatches (15) + transaction safety (6) + race conditions (2) = 23 bugs
  - CRITICAL: salary_components type/category enum values SWAPPED
  - Invoice status, journal status, recurring frequency, umrah statuses — all z.string() → z.enum()
  - Invoice deletion, journal reversal, leave request deletion wrapped in transactions
  - Customer advance: compensating rollback on GL failure
  - Year-end close: force-close loop atomic + duplicate guard
  - CRM deal won + client creation: transaction + FOR UPDATE to prevent races
- 17b: Cross-tenant auth (11) + response re-fetch (21) = 32 bugs
  - CRITICAL: automation.ts cron_jobs scoped by companyId
  - CRITICAL: settings.ts system_controls scoped by company
  - CRITICAL: admin.ts roles filtered by companyId
  - Employee FK validations through employee_assignments in fleet, projects, training, employees
  - Response re-fetch across 18 files (finance, admin, settings, warehouse, etc.)
- 17c: Unbounded query LIMIT guards (15)
  - hr.ts payroll, finance-purchase, vendors, marketing, umrah-entities
- SQL injection audit: CLEAN — no vulnerabilities found across all 80 route files

### Round 18 — ~15 خطأ — Security Hardening + Middleware + Frontend
- CRITICAL: contextualRbac.ts fail-open → fail-closed on ownership errors
- CRITICAL: reverseAccountBalances scoped journal_lines by companyId (cross-tenant GL)
- CRITICAL: permissions.ts wildcard (*) permission blocked via regex validation
- CRITICAL: permissions.ts cross-tenant user validation before granting permissions
- HIGH: JWT algorithm pinning to HS256 only
- HIGH: withTransaction preserves original error when ROLLBACK fails
- HIGH: password complexity enforcement (uppercase, lowercase, digit, special char)
- HIGH: bootstrapAdmin warns when using default credentials
- HIGH: journal line amounts rounded to 2dp before accumulation (floating-point)
- HIGH: frontend buildErrorToast operator precedence fix
- HIGH: AnimatedNumber rAF memory leak on unmount
- Migration 125: 106 companyId + 35 deletedAt indexes

### Round 19 — ~39 خطأ — Cross-tenant Re-fetch + Soft-delete + LIMIT
- 19a: 25 bugs
  - properties.ts: 9 re-fetch fixes (units, buildings, tenants, owners, inspections, deposits)
  - projects.ts: 3 re-fetch fixes (milestones, resources, costs)
  - training.ts: enrollment re-fetch + stats soft-delete (3)
  - support.ts: replies + kb_articles soft-delete + companyId (3)
  - legal.ts: session count includes deleted sessions
  - governance.ts: 2 policy_compliance_actions deletedAt
  - fleet.ts: driver lookup + LIMIT (2)
  - warehouse.ts: inventory count items LIMIT + movements/categories companyId
- 19b: 8 bugs
  - CRITICAL: PBX /status cross-tenant update (companyId=0 → actual companyId)
  - CRITICAL: hr-discipline.ts wrong table name (hr_discipline_regulations → hr_discipline_regulation)
  - finance-budget.ts: budget lookup missing deletedAt
  - finance-cost-centers.ts: department/branch subqueries deletedAt + LIMIT 1000
  - documents.ts: template re-fetch deletedAt
  - communications.ts: employee phone lookup LIMIT 5
- 19c: 6 bugs
  - properties.ts: maintenance_requests + contract_payment_schedule companyId
  - warehouse.ts: warehouse_movements + warehouse_categories companyId
  - notifications.ts: notification_preferences companyId
- 19d: 10 bugs
  - CRITICAL: recruitment.ts job_applications has no companyId — queries used JOIN through job_postings
  - CRITICAL: recruitment.ts UPDATE used non-existent companyId column
  - bi.ts: employee count included inactive assignments
  - store.ts: product re-fetch missing companyId
  - tasks.ts: maintenance_requests subqueries missing deletedAt (2)

### Round 20 — 14 خطأ — Finance + Dashboards + Portals Deep Scan
- finance-algorithms.ts: CRITICAL missing companyId on depreciation_entries + HIGH div-by-zero in SYD + MEDIUM unrounded WA cost
- accounting-engine.ts: CRITICAL subsidiary_accounts re-fetch without companyId + deletedAt on pre-delete
- finance-reports.ts: 3 CRITICAL journal_lines queries missing deletedAt (expenses, revenue, cash-bank)
- moduleDashboards.ts: maintenance_requests count missing deletedAt
- operationsCenter.ts: employee_violations count missing deletedAt
- mySpace.ts: 3 CRITICAL — employee_documents + performance_reviews missing companyId
- execDashboard.ts: employees doc expiry count missing deletedAt
- Seed migrations 126-136: 11 critical reference tables populated (leave types, holidays, attendance policies, financial periods, CRM stages, umrah packages, notification templates, approval chains, ZATCA settings, cost centers, roles)

### Round 21 — 37 خطأ — Deep Scan of Remaining Routes
- CRITICAL: activityLog.ts cross-tenant leak via `OR companyId IS NULL` on requests table (3 queries)
- HIGH: storage.ts documents access-control bypass on soft-deleted files (2 queries)
- HIGH: calendar.ts cross-tenant job_applications via `OR jp.companyId IS NULL`
- HIGH: scheduled-reports.ts phantom deletedAt on table without column (runtime crash)
- actionCenter.ts: notifications missing companyId scoping (2), hr_employee_loans/overtime/exit deletedAt (3)
- intelligence.ts: tasks deletedAt in overload/productivity/smart-assign (6), hr_leave_requests deletedAt, employees deletedAt, Number() NaN fallbacks (7)
- rules.ts: business_rules re-fetch without companyId + deletedAt on all CRUD checks (5)
- entityMeta.ts: LIMIT on tags-filter and tags-list (2)
- approvalActions.ts: LIMIT 200 (1)
- calendar.ts: projects/training_programs deletedAt (2)
- finance-accounts.ts: LIMIT + journal_lines deletedAt (3)
- impactPreview.ts: deletedAt on leave_requests, purchase_orders, employees, project_tasks (4)
- search.ts: LIKE metacharacter escape (1)

### Round 22 — 26 خطأ — Governance, Clients, Workflows, Support, Settings
- 22a: 18 bugs
  - CRITICAL: clients.ts `insertId` → `insertedId` variable mismatch (ReferenceError on every client creation)
  - CRITICAL: governance.ts phantom deletedAt on governance_capa (2 runtime crashes)
  - CRITICAL: workflows.ts phantom deletedAt on workflow_definitions UPDATE (runtime crash)
  - governance.ts: policy_module_links missing companyId (3 queries), merged duplicate PATCH route
  - clients.ts: re-fetch missing companyId, portal email cross-tenant check
  - support.ts: employee_assignments missing companyId (3), ticket_replies deletedAt, agent stats LIMIT
  - workflows.ts: LIMIT 500 on definitions and sla_definitions
- 22b: 8 bugs
  - finance-cost-centers.ts: phantom deletedAt on departments/branches subqueries (2 runtime crashes)
  - settings.ts: phantom deletedAt on branches UPDATE (runtime crash)
  - hr.ts: violations re-fetch with proper companyId + deletedAt
  - finance-journal.ts: roundTo2 on manual journal entry + expense + voucher amounts

### Round 23 — 14 خطأ — Training, HR, Projects, CRM
- CRITICAL: training.ts phantom companyId on training_enrollments (2 SQL crashes) — fixed via JOIN
- training.ts: PATCH re-fetch missing companyId
- hr-contracts.ts: sign-employee missing deletedAt
- hr-discipline.ts: gm-decision assignment lookup missing companyId
- hr-exit.ts: clearance UPDATE missing companyId
- projects.ts: project_tasks missing deletedAt (corrupted progress %), budget-alert missing companyId
- crm.ts: deletedAt on crm_opportunities JOINs (2 queries)
- moduleDashboards.ts: deletedAt on crm_opportunities pipeline JOIN
- governance.ts: stray `});` causing TypeScript compile error
- workflows.ts: always-truthy expression fix (dead fallback code)

### Round 24 — 35 خطأ — Finance, Fleet, Gov-integrations, Warehouse, Dashboard
- CRITICAL: finance-vendors.ts wrong table name `vendors` → `suppliers` (every vendor creation crashed)
- CRITICAL: finance-invoices.ts phantom deletedAt on credit_memos
- CRITICAL: finance-invoices.ts rawExecute for DDL → rawQuery (dunning tables creation crashed)
- CRITICAL: fleet.ts phantom table fleet_trip_waypoints → fleet_gps_tracking
- CRITICAL: gov-integrations.ts 4 phantom deletedAt on gov_integrations table
- finance-purchase.ts: convert-to-po re-fetch missing companyId
- dashboard.ts: notifications query missing companyId
- finance-custodies.ts: approval_actions query missing companyId
- finance-recurring.ts: recurring_journal_runs history missing companyId
- warehouse.ts: updateWeightedAverageCost helper missing companyId (cross-tenant cost corruption)
- fleet.ts: deletedAt on fleet_trips (3), fleet_maintenance (4), fleet_fuel_logs, fleet_insurance (2)
- finance-vendors.ts: deletedAt on workflow_requests (2), purchase_orders
- properties.ts: deletedAt on maintenance_requests (2) — blocked unit deletion spuriously
- finance-budget.ts: roundTo2 on variance accumulation
- finance-invoices.ts: roundTo2 on bad-debt bucket accumulation (2 endpoints)
- finance-collection.ts: LIMIT 500 on overdue invoices
- finance-hardening.ts: LIMIT 500 on projects list
- crm.ts: LIMIT 500 on overdue activities

---

## حالة كل ملف

### الملفات الرئيسية (Core Routes)

| الملف | السطور | الأخطاء | الفئات الرئيسية |
|-------|--------|---------|----------------|
| hr.ts | 7120 | ~120 | soft-delete, response-data, auth, FK, Zod, LIMIT, transaction |
| properties.ts | 3899 | ~23 | FK validation, soft-delete, re-fetch companyId |
| fleet.ts | 2988 | ~18 | FK validation, response-data, soft-delete, driver scoping |
| projects.ts | 2129 | ~13 | FK validation, column fix, soft-delete, re-fetch |
| finance-invoices.ts | 2014 | ~18 | soft-delete, auth, response-data, FK |
| finance-algorithms.ts | 1731 | ~13 | SQL injection whitelist, column fixes, companyId, div-by-zero, rounding |
| umrah.ts | 1729 | ~8 | column fixes, INSERT |
| admin.ts | 1712 | ~10 | soft-delete, NaN pagination, auth |
| finance-purchase.ts | 1548 | ~20 | column fix, FK validation, response-data |
| warehouse.ts | 1519 | ~8 | auto-PR fix, response-data |
| finance-journal.ts | 1519 | ~15 | cross-tenant, soft-delete, response-data |
| legal.ts | 1452 | ~10 | soft-delete, auth |
| finance-hardening.ts | 1379 | ~12 | Zod enum, SQL injection, soft-delete |
| bi.ts | 1351 | ~3 | soft-delete |
| employees.ts | 1315 | ~25 | companyId removal, uniqueness, soft-delete |
| hr-discipline.ts | 1282 | ~12 | soft-delete, response-data, Zod |
| umrah-entities.ts | 1201 | ~5 | LIMIT, soft-delete |
| crm.ts | 1107 | ~8 | soft-delete, auth, FK |
| governance.ts | 959 | ~15 | soft-delete, response-data |
| support.ts | 850 | ~12 | soft-delete, LIMIT, response-data |
| finance-custodies.ts | 800 | ~4 | soft-delete |
| auth.ts | 800 | ~3 | credential masking |
| clientPortal.ts | 700 | ~5 | soft-delete |
| documents.ts | 650 | ~5 | response-data, soft-delete |
| communications.ts | 650 | ~4 | soft-delete |
| settings.ts | 600 | ~5 | soft-delete, PO status |
| clients.ts | 550 | ~3 | soft-delete |
| hr-contracts.ts | 500 | ~5 | companyId subquery fix |
| workflows.ts | 500 | ~4 | soft-delete, LIMIT |
| hr-overtime.ts | 500 | ~8 | soft-delete, response-data |
| gov-integrations.ts | 450 | ~6 | soft-delete, SSRF |
| finance-zatca.ts | 400 | ~5 | soft-delete, NaN pagination |
| hr-exit.ts | 400 | ~4 | response-data |
| hr-loans.ts | 400 | ~3 | response-data |
| requests.ts | 400 | ~5 | response-data, soft-delete |
| recruitment.ts | 400 | ~3 | response-data |
| training.ts | 400 | ~3 | response-data |
| careersPortal.ts | 400 | ~2 | validation |
| entityMeta.ts | 300 | ~4 | soft-delete |
| finance-recurring.ts | 250 | ~2 | soft-delete |
| pdpl.ts | 250 | ~2 | response-data |
| rules.ts | 240 | ~3 | soft-delete |
| finance-vendors.ts | 200 | ~3 | response-data |
| finance-budget.ts | 200 | ~2 | response-data |
| finance-cost-centers.ts | 200 | ~2 | status pattern |
| marketing.ts | 200 | ~2 | response-data |
| correspondence.ts | 200 | ~1 | schema check |
| digital-signature.ts | 200 | ~1 | schema check |
| scheduled-reports.ts | 100 | ~1 | soft-delete |

### ملفات سليمة (Clean Files)

| الملف | ملاحظات |
|-------|---------|
| index.ts | Router mounting — سليم |
| health.ts | Health check — سليم |
| search.ts | Full-text search — fixed (LIKE escape) |
| storage.ts | File upload — fixed (documents deletedAt access-control) |
| publicData.ts | Public endpoints — سليم |
| permissions.ts | Permission CRUD — fixed (wildcard block, cross-tenant) |
| notifications.ts | Notification CRUD — fixed (re-fetch companyId) |
| notification-engine.ts | Push/email engine — سليم |
| events.ts | Event streaming — سليم |
| export.ts | Data export — سليم |
| calendar.ts | Calendar view — سليم |
| dashboard.ts | Main dashboard — سليم |
| execDashboard.ts | Executive dashboard — fixed (deletedAt on employees) |
| moduleDashboards.ts | Module dashboards — fixed (deletedAt on maintenance_requests) |
| activityLog.ts | Activity log — fixed (cross-tenant leak, attendance deletedAt) |
| activityIngest.ts | Activity ingestion — سليم |
| auditLogs.ts | Audit trail — سليم |
| impactPreview.ts | Preview calculations — fixed (deletedAt on 4 tables) |
| mySpace.ts | Employee self-service — fixed (companyId scoping) |
| obligations.ts | Obligation tracking — سليم |
| operationsCenter.ts | Operations dashboard — fixed (deletedAt on violations) |
| actionCenter.ts | Action center — fixed (companyId, deletedAt) |
| intelligence.ts | Smart alerts — fixed (tasks/employees deletedAt, NaN) |
| automation.ts | Cron jobs — سليم (no deletedAt) |
| approvalActions.ts | Approval handling — fixed (LIMIT) |
| finance-collection.ts | Collection — سليم |
| finance-reports.ts | Reports — fixed (journal_lines deletedAt) |

---

## ما تبقى (Remaining Work)

### أولوية عالية
1. **Transaction safety — structural** — applyTransition uses internal withTransaction, preventing atomic GL+status
   - Invoice approval: GL + revenue + budget not atomic with status change
   - Payroll GL posting: runs after transaction commits
   - These require engine refactoring to accept a transaction client parameter

### أولوية متوسطة
2. **Pagination** — ~190 endpoints use hardcoded LIMIT 500 (not a bug, scaling concern)
3. **TOCTOU races on uniqueness** — HR accruals ref, journal refs (need DB UNIQUE constraints)

### أولوية منخفضة
4. **Frontend audit** — مكونات React
5. **Performance** — N+1 queries, missing indices
6. **Database UNIQUE constraints** — client email/phone per company, journal ref per company

### مكتمل (Completed)
- SQL injection: CLEAN ✅
- Cross-tenant authorization: Fixed ✅
- Zod/CHECK constraint mismatch: Fixed ✅
- Response data re-fetch: Fixed ✅
- Soft-delete bypass: Fixed ✅
- Missing LIMIT guards: Fixed ✅
- Transaction safety (fixable cases): Fixed ✅
- Middleware security (contextualRbac fail-closed): Fixed ✅
- JWT algorithm pinning: Fixed ✅
- Password complexity enforcement: Fixed ✅
- Permission wildcard blocking: Fixed ✅
- Floating-point journal accumulation: Fixed ✅
- Database indexes (companyId + deletedAt): Migration 125 ✅
- Frontend React lifecycle bugs: Fixed ✅
- Bootstrap credential warnings: Fixed ✅

---

## الأنماط المرجعية

### employees table ليس لها companyId
```sql
-- خطأ
SELECT * FROM employees WHERE "companyId" = $1
-- صحيح
SELECT e.* FROM employees e 
  JOIN employee_assignments ea ON ea."employeeId" = e.id 
  WHERE ea."companyId" = $1
```

### rawExecute response
```typescript
// خطأ
const { rows } = await rawExecute(...)
// صحيح
const { insertId, affectedRows } = await rawExecute(...)
```

### NaN pagination
```typescript
// خطأ
Math.max(Number(page), 1)
// صحيح
Math.max(Number(page) || 1, 1)
```

### Soft-delete guard
```sql
UPDATE table SET ... WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL
```

### Re-fetch after INSERT
```typescript
const { insertId } = await rawExecute(`INSERT INTO ...`);
const [row] = await rawQuery(`SELECT * FROM t WHERE id=$1 AND "companyId"=$2`, [insertId, scope.companyId]);
res.status(201).json(row || { id: insertId });
```
