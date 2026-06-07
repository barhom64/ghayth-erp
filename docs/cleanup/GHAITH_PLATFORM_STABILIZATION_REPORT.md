# GHAITH Platform Stabilization Report — التقرير التنفيذي النهائي

> **التاريخ:** 2026-05-31 · **الفرع:** `claude/enterprise-hardening-roadmap-AOfO7` · **HEAD:** `6bcccbf4`
> **القاعدة:** `main` بعد دمج 5 رحلات تنظيف (#1463 / #1466 / #1471 / #1480 / #1488).
> **ورشة العمل:** GHAITH PLATFORM STABILIZATION & UNIFICATION PROGRAM — 8 وكلاء متوازيون.
> **القضايا المرجعية:** #1418 (Ghaith Operating Foundation) · #1413 (Unified users/roles/permissions/visibility).

هذا التقرير يلخّص ناتج المرحلتين: السبع الذي سبقها (5 PRs على main) ثم
رحلة الـ 8 وكلاء (هذا الـ PR). يجيب عن ثمانية أسئلة جوهرية، يقيس
مؤشرات الصحة، ويرتّب الأولويات العشر التالية.

---

## ١. ما الذي تم توحيده؟ (Unification)

### ١-١ قشرة الصفحة (Page Shell)

- **361 من 377 صفحة** تستخدم الآن واحدًا من البدائل الموحَّدة
  (`PageShell` / `CreatePageLayout` / `DetailPageLayout` /
  `EntityDetailPage` / `ListPage`) — `docs/cleanup/PAGE_SHELL_MIGRATION_MATRIX.md:7-15`.
- نسبة التوافق: **95.7 %**.
- 10 صفحات تمت ترقيتها في هذه الرحلة (`admin/{user-onboarding, users, roles}`
  · `documents/templates` · `reports/scheduled-reports` · `settings`
  · `settings-rules` · `store` · `umrah/{pilgrim-create, settings}`)
  — كل واحدة بـ wrap بسيط أقل من 30 LoC في الفرق.

### ١-٢ بدائيات التخطيط (Layout Primitives)

- مكوّن جديد: `ConfirmActionDialog`
  (`artifacts/ghayth-erp/src/components/shared/confirm-action-dialog.tsx`، 197 LoC)
  يغطي 21 حالة كانت تستخدم `<AlertDialog>` يدويًا
  — `docs/cleanup/UI_UNIFICATION_EXECUTION_MATRIX.md:69, 82-108`.
- ثلاث variants: `destructive` / `caution` / `confirm`.
- `pending` prop لربط `isPending` مباشرةً + slot أطفال للجسم.

### ١-٣ التنقّل (Navigation)

- المسح الكامل لكل صفحات `pages/**` أعطى **صفر انتهاكات** لعقد
  التنقّل ذي الأربعة أسطح (sidebar / top / breadcrumb / page header)
  — رسالة الـ commit `6bcccbf4` § Phase 2.
- العقد منشور كوثيقة قابلة-للتدقيق (التوثيق المرجعي:
  `docs/frontend/NAVIGATION_CONTEXT_CONTRACT.md`).

### ١-٤ الطباعة والتصدير (Print / Export)

- جسم `exportToCSV` المركزي في
  `artifacts/ghayth-erp/src/components/shared/advanced-filters.tsx`
  استُبدل بـ thin delegation إلى `exportRowsToCsv`
  — `docs/cleanup/PRINT_EXPORT_EXECUTION_MATRIX.md:25-56, 146-150`.
- النتيجة بالـ transitivity: **29 صفحة قائمة خارج المالية + 14
  صفحة مالية + `bulk-actions.tsx`** كلها موحَّدة بدون تعديل لكل صفحة.
- `umrah/import-wizard.tsx` — حذف `csvEscape` المحلي + Blob builder
  واستبداله بـ `exportRowsToCsv({ entityType: "report_umrah_rejected_<type>" })`.
- بقايا الأنماط القديمة: **0** Blob CSV خارج المالية و**0**
  `window.print()` على مستوى الصفحات.

### ١-٥ مستويات تحميل RBAC (Backend Mount Levels)

- أضيفت أرضية `requireMinLevel` على 8 mounts في `routes/index.ts`:
  `/legal (40)` · `/automation (60)` · `/communications (40)` ·
  `/governance (60)` · `/bi (40)` · `/action-center (20)` ·
  `/obligations (30)` · `/calendar (20)`
  — `docs/cleanup/VISIBILITY_RECONCILIATION_MATRIX.md:62-65`.
- ٨ حالات leak-via-URL تم إغلاقها (sidebar كانت تخفي لكن backend mount
  يسمح بكل مستوى أقل).

### ١-٦ حوارات التأكيد (Confirmation Dialogs)

- **4 hand-rolled AlertDialog** تم نقلها إلى `ConfirmActionDialog`:
  `finance/collections` · `finance/journal-manual-detail` (حواران، ‑36 LoC) ·
  `hr/discipline-regulation` · `legal-case-detail`
  — `docs/cleanup/UI_UNIFICATION_EXECUTION_MATRIX.md:111-117`.
- صافي الفرق: **‑56 LoC** عبر المستهلكين.

---

## ٢. ما الذي تم إزالته؟ (Removal)

### ٢-١ ملفات مصدرية ميتة (Dead Source — Archived)

- `artifacts/api-server/src/lib/hrAssignments.ts` → `_archive/lib/`
  (دالة وحيدة `listActiveEmployeeAssignments` بلا أي قارئ في src/
  أو tests/)
  — `docs/cleanup/DEAD_ASSET_REGISTER.md:26`.
- `artifacts/api-server/src/lib/pricingEngine.ts` → `_archive/lib/`
  (مذكور كنصّ فقط داخل `eventCatalog.ts` `consumers:[...]`؛ ليس
  مستوردًا في أي مكان)
  — `docs/cleanup/DEAD_ASSET_REGISTER.md:27`.

### ٢-٢ مسارات ميتة (Dead Routes — أُزيلت سابقًا)

- جدول `wps_bank_credentials` (orphan + خطر صامت لاعتمادات بنكية بلا قارئ)
  أُسقط عبر migration **241** في PR #1471
  — `docs/audit/GHAITH_SWEEP_EXECUTION_PROGRESS.md:39`.
- أصبح صف "Top-20 #19" مغلَقًا.

### ٢-٣ Hand-rolled CSV Builders

- جسم `exportToCSV` يدوي (16 صفحة كانت تكرّر نفس الـ Blob+BOM+csvEscape)
  استُبدل بنقطة دخول واحدة — راجع §١-٤.
- `umrah/import-wizard.tsx`: محلية `csvEscape` (12 LoC) + builder
  الـ Blob (40 LoC) أُزيلتا.

### ٢-٤ Module-key Gates ميتة

- في `sidebar-layout.tsx`، الـ `perm: "automation:write"` على مدخل
  `/automation` كان يشير إلى صلاحية **غير موجودة في الكاتالوج**
  (`featureCatalog` ولا `rbacCatalog`). أُسقط
  — `docs/cleanup/VISIBILITY_RECONCILIATION_MATRIX.md:79-81, 109-110`.

---

## ٣. ما الذي تم أرشفته؟ (Archival)

### ٣-١ ٣٠ ملف تدقيق قديم → `docs/audit/archive/`

كلها قابلة-للتجديد أو مُتجاوَزة بمصفوفة الفجوات الراهنة
— `docs/cleanup/DOCUMENT_RECONCILIATION_MATRIX.md:30-75`.

| الفئة | الأمثلة |
|---|---|
| Bypass / RCA snapshots | `BYPASS_TRIAGE.md`, `DANGEROUS_BYPASS_RCA_664.md`, `FROMSTATE_RCA_663.md`, `SCOPE_NORMALIZATION_RCA_685.md`, `UMRAH_EVENTS_DRIFT_684.md`, `LIFECYCLE_DRIFT_665.md` |
| Module certifications (auto-generated) | `FINANCE_CERTIFICATION.md`, `HR_CERTIFICATION.md`, `UMRAH_CERTIFICATION.md`, `PROPERTIES_CERTIFICATION.md` |
| Functional verifications (stale) | `FUNCTIONAL_FINANCE_VERIFICATION.md`, `FUNCTIONAL_HR_VERIFICATION.md`, `FUNCTIONAL_UMRAH_VERIFICATION.md` |
| Finance hardening (shipped) | `FINANCE_CRITICAL_REMEDIATION_REPORT.md`, `FINANCE_DEEP_GOVERNANCE_RCA.md`, `FINANCE_INVOICE_APPROVAL_RCA.md`, `FINANCE_MANUAL_JOURNAL_RCA.md` |
| Rescans v1/v2/v3 | `RESCAN_2026-05-22.md`, `RESCAN_2026-05-22-v2.md`, `RESCAN_2026-05-22-v3.md` |
| Inventory / Status snapshots | `INVENTORY_CLARIFICATION.md`, `INVENTORY_RECONCILIATION.md`, `STATUS_PERCENTAGE_RECONCILIATION.md`, `UNVERIFIED_PATHS_ARCHITECTURE_MAP.md` |
| Auto-generated scans | `SCOPE_BYPASS.md`, `WORKFLOW_AUDIT.md`, `RUNTIME_STABILIZATION.md`, `SHARED_INFRA_GATEKEEPER.md`, `SESSION_AUDIT_2026-05-23.md`, `FIVE_FIXES_STATUS_25018.md` |

### ٣-٢ ٢ ملف مصدري → `_archive/lib/`

- `artifacts/api-server/src/_archive/lib/hrAssignments.ts`
- `artifacts/api-server/src/_archive/lib/pricingEngine.ts`

`artifacts/api-server/tsconfig.json` يستثني `src/_archive` من
الـ typecheck.

### ٣-٣ تحديثات روابط الأرشيف (5 وثائق ناجية)

- `docs/KNOWN_ISSUES.md` (سطرَا `SESSION_AUDIT_*` و `RESCAN_*-v3`).
- `docs/UNIFICATION_PLAN.md` (مرجع `RESCAN_*-v3`).
- `docs/production-hardening/enterprise-hardening-roadmap.md` (مرجعان).
- `docs/audit/GHAITH_SWEEP_EXECUTION_PROGRESS.md`.
- `docs/audit/SYSTEM_PAGE_INVENTORY.md` (مرجعان لـ `UNVERIFIED_PATHS_*`).

— `docs/cleanup/DOCUMENT_RECONCILIATION_MATRIX.md:197-203`.

---

## ٤. ما الذي تم دمجه؟ (Consolidation)

### ٤-١ تصدير CSV عبر الواجهة كلها

- نقطة دخول واحدة: `lib/unified-export.ts::exportRowsToCsv`.
- `components/shared/advanced-filters.tsx::exportToCSV` صار delegate
  لها — وبهذا كل المستهلكين الـ29 خارج المالية و14 داخلها يوحَّدون
  بدون تعديل صفحة-بصفحة
  — `docs/cleanup/PRINT_EXPORT_EXECUTION_MATRIX.md:101-107`.
- بالإضافة إلى الـ43 صفحة مالية التي وُحدت سابقًا (PR #1463/#1466).
- النتيجة: **0** صف Blob CSV خارج المالية، **0**
  `window.print()` في `pages/`.

### ٤-٢ جسر كاتالوج RBAC

- `rbacCatalog.ts` (مسطّح، legacy) و `featureCatalog.ts` (شجري،
  حديث) كانا "مصدرَي حقيقة" متنافسَين.
- الحل: تأكيدهما كـ **complementary** (تمايُز مقصود) + جسر عبر
  `isKnownPermission()`.
- يحرسهما ratchet test (`rbacCatalogIntegrationSmoke.test.ts`، 8 تأكيدات)
  — `docs/audit/GHAITH_SWEEP_EXECUTION_PROGRESS.md:23`.

### ٤-٣ ٤ Hand-rolled AlertDialog → `ConfirmActionDialog`

| الصفحة | الحوار | LoC saved | Variant |
|---|---|---:|---|
| `finance/collections.tsx` | تسجيل مخصص ديون لفترة … | 16 → 14 | caution |
| `finance/journal-manual-detail.tsx` | reject + reverse (حواران) | 132 → 96 | destructive + caution |
| `hr/discipline-regulation.tsx` | استنساخ اللائحة الافتراضية | 22 → 11 | caution |
| `legal-case-detail.tsx` | تأكيد إغلاق القضية | 14 → 8 | destructive |

— `docs/cleanup/UI_UNIFICATION_EXECUTION_MATRIX.md:111-117`.

---

## ٥. ما الذي تبقى؟ (Remaining)

### ٥-١ ١٥ استثناء موثَّق لقشرة الصفحة

كلها مقصودة:
- صفحات Auth/Error: `login.tsx`, `not-found.tsx`.
- صفحات خدمات عامة: `print-verify.tsx`, `properties-guide.tsx`.
- 6 polymorphic wrappers تفوّض إلى parent مشترك:
  `finance/profitability-{vehicle, property, project, umrah-agent}.tsx`
  · `finance/{customer, vendor}-statement.tsx`.
- 5 sub-components سُمّيت "page" بالخطأ — يجب نقلها إلى `components/`
  لاحقًا:
  `admin/rbac-v2-conditions-editor.tsx` · `bi/shared.tsx`
  · `governance/stats-cards.tsx` · `my-space/{summary-cards, role-entities-grid}.tsx`.

— `docs/cleanup/PAGE_SHELL_MIGRATION_MATRIX.md:420-441`.

### ٥-٢ ٦ ملفات flagged-for-deletion — تحتاج توقيع بشري

من `docs/cleanup/DEAD_ASSET_REGISTER.md:28-33`:

| # | المسار | السبب | ملاحظة |
|---|---|---|---|
| 3 | `artifacts/api-server/src/middlewares/idempotencyMiddleware.ts` | الوحيد الذي يلمس جدول `idempotency_keys`؛ بقية النظام تستخدم `lib/requestIdempotency.ts`. | تنسيق مع drop migration 170 |
| 4 | `artifacts/api-server/src/lib/inventory/index.ts` | barrel بلا قارئ | — |
| 5 | `artifacts/api-server/src/lib/inventory/cycle-count-plan.ts` | مستهلكه الوحيد barrel ميت | — |
| 6 | `artifacts/api-server/src/lib/inventory/expiry-warning.ts` | مستهلكه الوحيد barrel ميت + cron لا يستورده | — |
| 7 | `artifacts/api-server/src/lib/fx/index.ts` | barrel بلا قارئ (الاستيرادات تذهب للملفات الفرعية مباشرةً) | — |
| 8 | `artifacts/ghayth-erp/src/components/shared/confirm-action-dialog.tsx` | **في الحقيقة تمّ تبنّيه في Phase 4** — الـ flag كان قبل اعتماده | راجع §١-٢ |

### ٥-٣ ٨ ترحيلات مستهلكين أُسقطت (Phase 4 §3.3)

مسوّدات `ConfirmActionDialog` ثبتت type-clean ثم وُجدت محذوفة عبر
hook خارجي قبل الـ commit الأخير
— `docs/cleanup/UI_UNIFICATION_EXECUTION_MATRIX.md:120-138`:

- `daily-close.tsx`
- `finance/year-end-close.tsx`
- `finance/invoice-detail.tsx`
- `admin-monitoring.tsx`
- `admin-observability.tsx`
- `hr/employee-activation.tsx`
- `finance/journal.tsx`
- `details/leave-detail.tsx`

كل واحدة ≤ 20 LoC delta؛ تُطبَّق دفعة واحدة في رحلة لاحقة بعد
استقرار البيئة.

### ٥-٤ متابعات كل وكيل

| الوكيل | البند الذي تركه للمتابعة |
|---|---|
| Agent 1 (Docs) | لا شيء — كل اللينكات وُجِّهت |
| Agent 2 (Nav) | لا شيء — صفر انتهاكات |
| Agent 3 (Page Shell) | إعادة تنظيم 5 sub-components من `pages/` إلى `components/` |
| Agent 4 (UI) | 12 صفحة تبقّت على `<AlertDialog>` يدوي + توسعات `DataTable`/`KpiCard`/`AuditTrailPanel` |
| Agent 5 (Routes) | `/activity-log` divergence (sidebar 90 vs backend 70)؛ `/admin/*` per-route `requirePermission`؛ `/finance/year-end-close` etc. min-level |
| Agent 6 (Print) | DSAR JSON export (`admin-pdpl.tsx`) لو احتاج تسجيل `print_jobs` رسمي |
| Agent 7 (RBAC) | `/automation` يبقى مستثنى لأن `automation` ليس في `ModuleType` union بعد |
| Agent 8 (Dead) | sidebar.tsx + 30 ملف UI library cluster — UI-lib agent territory |

---

## ٦. ما الجاهز للإنتاج؟ (Production-Ready)

### ٦-١ سلسلة الـ PRs المدموجة على main

5 PRs sweep + 1 PR stabilization = **6 PRs مجتمعة** ضمن هذا
البرنامج (انظر §"مصفوفة ملخص الـ PRs" أدناه).

### ٦-٢ Ratchet Tests الحارسة

- `artifacts/api-server/tests/unit/scopeHelperAdoptionSmoke.test.ts`
  — يثبّت قائمة سماح `manualOnly=63` ملف + المعادلة (total=103,
  helperUsers=36, manualOnly=63). أي ملف جديد يعتمد patterns يدوية
  يُكسر CI
  — `docs/audit/GHAITH_SWEEP_EXECUTION_PROGRESS.md:33`.
- `artifacts/api-server/tests/unit/rbacCatalogIntegrationSmoke.test.ts`
  — 8 تأكيدات تحرس جسر `isKnownPermission()` بين كاتالوجَي RBAC
  — `docs/audit/GHAITH_SWEEP_EXECUTION_PROGRESS.md:23`.

### ٦-٣ كل التسليمات الحالية محدَّثة

- مصفوفة الفجوات: 20/20 من Top-20 مغلَقة
  (`docs/audit/GHAITH_SWEEP_EXECUTION_PROGRESS.md:42-49`).
- 10/10 تعارضات cross-stream محلولة
  (`docs/audit/GHAITH_SWEEP_CONFLICT_RESOLUTIONS.md`).
- guard.sh أخضر · 6221 اختبارًا ناجحًا · typecheck نظيف على كلتا الحزمتين
  (commit `6bcccbf4` § Verification).

---

## ٧. ما الدين التقني المتبقي؟ (Technical Debt)

### ٧-١ Scope helper migration (63 ملف)

- المعادلة الحالية: `total=103, helperUsers=36, manualOnly=63`.
- ratchet يمنع التراجع لكن الـ 63 الموجودة لم تُهاجَر.
- إعادة التدقيق (PR #1488) أظهرت أن **معظم** الـ "manual" صحيحة-بالتصميم
  (cron schedulers، seeder paths، tests، lib utilities خارج طلب HTTP).
  — `docs/audit/GHAITH_SWEEP_EXECUTION_PROGRESS.md:33`.
- العمل المتبقي: ترتيب route files المتبقية حسب
  `SCOPE_HELPER_ADOPTION_AUDIT.md` ranking — كل ملف project صغير منفصل.

### ٧-٢ P0 من RESCAN-v3 — مشاريع feature-build صغيرة (5 بنود)

كل واحدة مشروع صغير، ليست cleanup
(`docs/audit/GHAITH_SWEEP_EXECUTION_PROGRESS.md:113-117`):

- FLT-006 — fleet alerts UI.
- FIN-013..016 — finance UI gaps (4 شاشات).
- CRM-004 — activities CRM.
- COM-001/002 — communications UIs.
- UMR-005/016 — umrah invoicing pages.
- HR-010/013 — attendance / discipline UIs.

### ٧-٣ فجوات وظيفية مفتوحة

- **Orphan bank rows في `/finance/reconciliation`** — مطابقة بنكية
  لا تنتج قيد GL تسوية فعلي؛ FIN-008 صُنّف "correct-by-design"
  بعد إعادة التدقيق لكنه يحتاج عرض UI أوضح للمستخدم
  — `docs/audit/GHAITH_SWEEP_EXECUTION_PROGRESS.md:26`.
- **DSAR JSON export adapter** — `admin-pdpl.tsx` يولِّد JSON
  client-side عبر `new Blob([JSON.stringify(...)], "application/json")`
  للـ Article 11 PDPL. التتبع موجود في `processing_activities_log`
  لكن لا يظهر في `/reports/print-log`. الحلّ المقترح: `dsarAdapter`
  مستقبلًا
  — `docs/cleanup/PRINT_EXPORT_EXECUTION_MATRIX.md:91, 127-132`.

### ٧-٤ Out-of-scope dead cluster (UI library territory)

30+ ملف داخل `components/ui/*` + `hooks/use-mobile.tsx` كلها reachable
فقط من `components/ui/sidebar.tsx` الذي هو نفسه orphan. هذا
نطاق "UI library agent" يقرر فيه: revive أو remove
— `docs/cleanup/DEAD_ASSET_REGISTER.md:60-71`.

---

## ٨. الأولويات العشر التالية (Next 10 Priorities)

> مرتَّبة حسب الأثر مقابل الجهد. كل بند يحدِّد المسار/الملف، تقدير
> الجهد، والفريق المالك.

| # | البند | الجهد | المالك | الإجراء |
|---|---|---|---|---|
| 1 | **`/admin/*` per-route `requirePermission`** — كل sidebar perm يجب أن يطابق `requirePermission()` خادمَ-جانبي بدل الاعتماد على `requireMinLevel(90)+requireModule("admin")` فقط | M (45 endpoint) | Security / Platform | `artifacts/api-server/src/routes/admin*.ts` |
| 2 | **`/finance/year-end-close` + `opening-balances` + `journal-manual` + `fiscal-periods-v2`** — رفع mount إلى `requireMinLevel(70)` (currently module-only) | S | Finance / Security | `artifacts/api-server/src/routes/index.ts` |
| 3 | **استكمال 8 ترحيلات `ConfirmActionDialog` التي عُكِست** — راجع §٥-٣ | S (8 ملفات × <20 LoC) | UI / Frontend | راجع §٥-٣ list |
| 4 | **إغلاق 6 flagged-for-deletion** — راجع §٥-٢ | S | Backend / DBA | `idempotencyMiddleware.ts`, 4 dead barrels |
| 5 | **`/activity-log` minLevel sync** — sidebar 90 vs backend 70 (sidebar أصرم بالتصميم — رفع backend إلى 90) | XS | Security | `artifacts/api-server/src/routes/index.ts` mount of `/api/activity-log` |
| 6 | **نقل 5 sub-components من `pages/` إلى `components/`** — راجع §٥-١ | S | Frontend | `admin/rbac-v2-conditions-editor` · `bi/shared` · `governance/stats-cards` · `my-space/*` |
| 7 | **توسعات `DataTable`: groupBy / subtotalColumns / pivotConfig** — يفتح ترحيل 54 صفحة مالية لا تزال على `<table>` يدوي | M-L | UI Foundations | `artifacts/ghayth-erp/src/components/ui/data-table.tsx` |
| 8 | **`KpiCard` v2**: trend / sparkline / comparison / secondaryValue — يفتح ترحيل ~30 dashboard | M | UI Foundations | `artifacts/ghayth-erp/src/components/shared/kpi-card.tsx` |
| 9 | **`dsarAdapter` للـ PDPL Article 11 + `/umrah/pilgrims/export.csv`** — إكمال 100 % audit-trail لتصدير البيانات الشخصية | M | Security / PDPL | `lib/print/csvAdapter.ts` + `routes/pdpl.ts` |
| 10 | **`AuditTrailPanel` plumbing** — wire إلى `/api/audit/:entity/:id` وضمّه كـ default tab داخل `DetailPageLayout` | M-L (backend + frontend) | Platform | endpoint جديد + `components/shared/audit-trail-panel.tsx` |

---

## مصفوفة ملخص الـ PRs (6 PRs total)

| PR | العنوان | النطاق | البنود المُغلَقة |
|---|---|---|---|
| **#1463** | Enterprise Hardening Roadmap — sweep audit + 6 slices | RBAC sync + PO print + CSV format + finance partial | Top-20 #2/#4/#8/#10/#14/#15/#16/#17/#18/#20 + #7 partial |
| **#1466** | Sweep follow-up — finish finance CSV unification + 5 conflicts | 43 finance CSV migrations + 5 conflict resolutions | Top-20 #7 (complete) + conflicts #1-#4, #7 |
| **#1471** | Sweep follow-up #2 — drop orphan creds table + scope helper ratchet | DB drop + ratchet test | Top-20 #13, #19 |
| **#1480** | Sweep follow-up #3 — close all remaining conflicts + 3 P0 items (stale audit) | RBAC catalog bridge + FIN-001/FIN-008 re-audit | Top-20 #3, #5, #6 + conflicts #6, #8, #9, #10 |
| **#1488** | Scope helper re-audit (docs only) | 63 files re-classified — most correct-by-design | Top-20 #13 re-audit |
| **(this PR)** | GHAITH platform stabilization — 8 parallel-agent slices (Phases 1-8) | Page shell · UI · routes · print · RBAC · dead · docs · nav | 8 phase matrices + 1 final report |

---

## مؤشرات صحة (Health Indicators)

| المؤشر | القيمة | المصدر |
|---|---|---|
| Page-shell adoption | **95.7 %** (361/377 in-scope) | `docs/cleanup/PAGE_SHELL_MIGRATION_MATRIX.md:9-12` |
| `PageShell` raw adoption (all pages) | 326 / 580 (56.2 %) | `UI_LIBRARY_UNIFICATION_AUDIT.md:15` |
| `DataTable` adoption | 265 / 580 (45.7 %) | `UI_LIBRARY_UNIFICATION_AUDIT.md:16` |
| `FormShell` adoption | 71 RHF pages / 71 (100 %) | `UI_UNIFICATION_EXECUTION_MATRIX.md:28` |
| `ConfirmDeleteDialog` adoption | 30 / 30 destructive flows | `UI_UNIFICATION_EXECUTION_MATRIX.md:34` |
| `ConfirmActionDialog` adoption (new) | 5 (this PR) / 21 hand-rolled sites | `UI_UNIFICATION_EXECUTION_MATRIX.md:35` |
| Non-finance CSV builders (legacy `Blob`+`text/csv`) | **0** | `PRINT_EXPORT_EXECUTION_MATRIX.md:101-107` |
| `window.print()` on page-level | **0** | `PRINT_EXPORT_EXECUTION_MATRIX.md:110-114` |
| Finance CSV unification | 43 / 43 (100 %) | `GHAITH_SWEEP_EXECUTION_PROGRESS.md:60-74` |
| Route audit coverage | 535 routes × 76 backend mounts × ~407 sidebar entries | `ROUTE_SERVICE_CONSISTENCY_MATRIX.md:16-19` |
| Sidebar→backend module-key divergences | 1 (`/automation`, documented) | `ROUTE_SERVICE_CONSISTENCY_MATRIX.md:53-58` |
| Sidebar→backend min-level divergences | 1 (`/activity-log`, sidebar stricter by design) | `ROUTE_SERVICE_CONSISTENCY_MATRIX.md:70-73` |
| Backend mount min-level gates added (this sweep) | 8 routers | `VISIBILITY_RECONCILIATION_MATRIX.md:62-65` |
| Sidebar perms not in any catalog | **0** (was 1 before fix) | `VISIBILITY_RECONCILIATION_MATRIX.md:79-95` |
| Tests passing | **6221** · 7 skipped | commit `6bcccbf4` § Verification |
| Ratchet tests guarding regression | **2** (scope helper · RBAC catalog) | §٦-٢ |
| Audit docs archived | **30** | `DOCUMENT_RECONCILIATION_MATRIX.md:227` |
| Audit docs still authoritative | 82 | `DOCUMENT_RECONCILIATION_MATRIX.md:228-230` |
| Dead source files archived | **2** | `DEAD_ASSET_REGISTER.md:26-27` |
| Top-20 critical fixes closed | **20 / 20** | `GHAITH_SWEEP_EXECUTION_PROGRESS.md:42-49` |
| Cross-stream conflicts closed | **10 / 10** | `GHAITH_SWEEP_CONFLICT_RESOLUTIONS.md:22` |
| Gap matrix rows (baseline) | 128 (Critical=12, High=38, Medium=47, Low=31) | `GHAITH_SYSTEM_GAP_MATRIX.md:17-23` |

---

## مسار التحقق (Verification Path)

كل ادعاء أعلاه قابل للتدقيق بأمر grep / wc. سياق التشغيل: من جذر المستودع
على فرع `claude/enterprise-hardening-roadmap-AOfO7`.

### تحقق توحيد CSV

```bash
# يجب 0 — لا توجد صفحة خارج المالية على نمط Blob CSV القديم
grep -rlE '"text/csv"|new Blob\(.*csv' \
  artifacts/ghayth-erp/src/pages/ 2>/dev/null \
  | grep -v 'opening-balances-create.tsx' | wc -l

# يجب 0 — لا توجد window.print() داخل pages/
grep -rln 'window\.print()' artifacts/ghayth-erp/src/pages/ | wc -l

# يجب 44 — صفحات finance المعتمدة على exportRowsToCsv
grep -lF 'exportRowsToCsv' artifacts/ghayth-erp/src/pages/finance/*.tsx | wc -l
```

### تحقق Page Shell

```bash
# يجب أن يطابق 361/377 الموثَّق
grep -rlE '<(PageShell|DetailPageLayout|EntityDetailPage|CreatePageLayout|ListPage)' \
  artifacts/ghayth-erp/src/pages/ | wc -l
```

### تحقق RBAC mount levels (Phase 7)

```bash
# يجب أن يظهر requireMinLevel على هذه 8 mounts
grep -nE 'app\.use\("/api/(legal|automation|communications|governance|bi|action-center|obligations|calendar)"' \
  artifacts/api-server/src/routes/index.ts
```

### تحقق أرشيف الوثائق

```bash
ls docs/audit/archive/*.md | wc -l   # يجب ≥ 30
ls docs/audit/*.md | grep -v archive | wc -l  # يجب 16
```

### تحقق ConfirmActionDialog

```bash
# يجب 5 (المكوّن نفسه + 4 مستهلكين)
grep -rlF 'ConfirmActionDialog' artifacts/ghayth-erp/src/ | wc -l
```

### تحقق الـ ratchet tests

```bash
pnpm -r --filter ./artifacts/api-server test -- \
  tests/unit/scopeHelperAdoptionSmoke.test.ts \
  tests/unit/rbacCatalogIntegrationSmoke.test.ts
# يجب pass — مع 8 تأكيدات لكاتالوج RBAC + سنابسهت إجمالي للـ scope
```

### تحقق الملفات المؤرشفة

```bash
# يجب وجود الملفين المؤرشفين
test -f artifacts/api-server/src/_archive/lib/hrAssignments.ts && echo OK
test -f artifacts/api-server/src/_archive/lib/pricingEngine.ts && echo OK

# يجب exclude src/_archive في tsconfig
grep -F '_archive' artifacts/api-server/tsconfig.json
```

### تحقق نظافة الاختبارات

```bash
bash scripts/guard.sh
# يجب: typecheck ok · lint:patterns ok · audit:routes ok · audit:route-doubling ok
```

---

## ملاحظات نهائية

- هذا التقرير **مُولَّد من التسليمات الثمانية ولا يدخل قرارات جديدة**.
  أي قرار خارج نطاق ما هو موثَّق بالفعل (مثل دمج HR pairs،
  أو deprecation كامل لـ legacy hubs) يتطلب توقيع المالك.
- كل tag `S/M/L` في "الأولويات العشر التالية" تقدير جهدي عام
  (S ≤ 1 يوم · M ≤ 1 أسبوع · L > 1 أسبوع).
- خطّ النقد الزمني الواقعي للأولويات #1 و #2 و #5 و #9 يمرّ
  بـ Security / PDPL review قبل التنفيذ.

— نهاية التقرير.
