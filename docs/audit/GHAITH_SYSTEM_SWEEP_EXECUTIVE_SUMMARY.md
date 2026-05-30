# GHAITH_SYSTEM_SWEEP_EXECUTIVE_SUMMARY — الملخص التنفيذي للمسح الشامل

> **نوع التقرير:** ملخص تنفيذي عربي (audit-only). يُجمع نتائج 8 تقارير تدقيق فرعية لتقديم صورة موحَّدة لقرار #1418 + #1413.
> **التاريخ:** 2026-05-30 · **المستودع:** `barhom64/ghayth-erp`
> **المرفق:** [GHAITH_SYSTEM_GAP_MATRIX.md](./GHAITH_SYSTEM_GAP_MATRIX.md) — مصفوفة الفجوات الكاملة (128 صفًا).

---

## ١. أرقام النظام في سطر واحد لكل سؤال

> الأرقام جميعها مأخوذة مباشرة من التقارير الثمانية. عند تباين الـ baselines (مثلاً 578 ملف tsx مقابل 580 ملف tsx+ts) يُحفَظ المصدر.

### كم صفحة موجودة؟

- **578 ملف `.tsx`** تحت `artifacts/ghayth-erp/src/pages/` (مصدر: `SYSTEM_PAGE_INVENTORY.md:48`).
- منها **59 ملف sub-component** (`*-tab/-section/-card/-row/-grid/-panel/-strip`) تُستبعد من جدول الصفحات الرئيسية (`SYSTEM_PAGE_INVENTORY.md:49`).
- **519 صفحة رئيسية** بعد الاستبعاد (`SYSTEM_PAGE_INVENTORY.md:50`).
- عند ضم ملفات `.ts` (utilities)، يصير المجموع **580 ملف** (`PAGE_API_MAPPING.md:14`).
- **534 مسار** (path entries) مُسجَّل في `routes/*.tsx` (`SYSTEM_PAGE_INVENTORY.md:57`).
- **352 رابط sidebar** في `getAllNavigationPages()` (`SYSTEM_PAGE_INVENTORY.md:58`).

### كم منها جاهزة للإنتاج؟

- **510 صفحة مرتبطة بـ route مسجَّل** (`SYSTEM_PAGE_INVENTORY.md:51`).
- **503 صفحة تستخدم `<PageShell>` أو ما يكافئها** (`SYSTEM_PAGE_INVENTORY.md:55`).
- **491 صفحة تستخدم `useApiQuery` / `useApiMutation`** (`SYSTEM_PAGE_INVENTORY.md:54`).
- **541 ملف من 580 (93.3%)** يستدعي API صراحة (`PAGE_API_MAPPING.md:15`).
- **التقدير:** ما يقارب **480–490 صفحة جاهزة بنيوياً** (PageShell + API + route)؛ الباقي يحوي فجوة واحدة على الأقل (UI، أو RBAC، أو طباعة، أو divergence).

### كم منها جزئية؟

- **~50 صفحة جزئية** (مرتبطة بـ route لكن إما `api=0` كمراكز navigation أو لا تستخدم القوالب الموحَّدة).
- صفحات "hub-only" intentional: `services.tsx`, `bi.tsx`, `admin.tsx`, `properties-guide.tsx`, `finance/finance-workflows-hub.tsx`, `finance/zatca-reports-hub.tsx`, `finance/tax-filing-calendar.tsx`, `bi-dashboards.tsx`, `bi-reports.tsx`, `bi-kpis.tsx` — 10 صفحات (`PAGE_API_MAPPING.md:380-395`).
- صفحات v1/v2 partial: `fiscal-periods` (v1)، `umrah/import` (legacy) — 2 (`DEAD_DUPLICATE_PAGE_AUDIT.md:24, 191-208`).

### كم ميتة؟

- **0 ملف orphan** بالمعنى الصارم (`DEAD_DUPLICATE_PAGE_AUDIT.md:18, 46`). كل 578 ملف tsx إما routed أو imported.
- **3 ملفات بدت orphan لكنها imported من sibling**: `finance/profitability.tsx`, `finance/account-statement.tsx`, `admin/rbac-v2-conditions-editor.tsx` (`SYSTEM_PAGE_INVENTORY.md:846-851`) — موضع **تعارض** بين الوكلاء (انظر القسم 3 من المصفوفة).
- **3 صفحات shared "dead" بحسب route فقط**: `login.tsx`, `not-found.tsx`, `print-verify.tsx` — `SYSTEM_PAGE_INVENTORY.md:820, 831-832` تصنّفها dead بينما `DEAD_DUPLICATE_PAGE_AUDIT.md` يَعدّها مستخدمة في `App.tsx` / wildcard / explicit.
- **9 صفحات لا route لها** أصلاً (`SYSTEM_PAGE_INVENTORY.md:52`).
- **≥15 endpoint backend مرشَّحة dead** (`PAGE_API_MAPPING.md:354-372`) — تتطلب فحص portals + mobile قبل الحذف.

### كم مكررة؟

- **6 مجموعات HR pair pattern** (`recruitment`، `training`، `performance`، `shifts`، `leaves`، `violations`) — كل zoج فيها list + analytics-only sister (`DEAD_DUPLICATE_PAGE_AUDIT.md:24, 150-158`).
- **2 v1/v2 pairs**: `fiscal-periods` و `umrah/import` (`DEAD_DUPLICATE_PAGE_AUDIT.md:24, 188-208`).
- **BI structural duplication**: `bi.tsx` (in-page Tabs) + `bi-dashboards.tsx`/`bi-kpis.tsx`/`bi-reports.tsx` (wrappers على نفس الـtabs) (`DEAD_DUPLICATE_PAGE_AUDIT.md:37, 141-147`).
- **مكرَّرات مفاهيمية كبرى** (لا duplicate code بل duplicate concept):
  - عقود (HR / finance/vendor / properties / legal) — 4-5 مفاهيم متشابهة (`PAGE_SERVICE_CLASSIFICATION.md:444-453`).
  - كشوف حساب (customer / vendor / entity / account / owner) — ≥6 صفحات (`PAGE_SERVICE_CLASSIFICATION.md:478-485`).
  - مراكز تقارير (finance/bi/fleet/hr/properties/admin) — 7+ (`PAGE_SERVICE_CLASSIFICATION.md:455-465`).
  - مراسلات (comms/legal/details) — 3 (`PAGE_SERVICE_CLASSIFICATION.md:487-494`).
  - السلف (hr loans/my-loans/salary-advances/customer-advances) — 4 (`PAGE_SERVICE_CLASSIFICATION.md:518-524`).
  - صناديق وارد الموافقات — 7+ مداخل (`PAGE_SERVICE_CLASSIFICATION.md:526-535`).
  - 4 hubs مالية (`dashboard`, `cfo-cockpit`, `workflows-hub`, `settings-hub`).
- **`admin/print-templates.tsx` ↔ `settings/print-templates.tsx`** نسختان من إدارة القوالب (`PRINT_EXPORT_UNIFICATION_AUDIT.md:43, 197`).
- **مكرَّرات DB**: 15+ كيان مكرر أو dead (`API_DATABASE_ENTITY_MAPPING.md:308-325`).

### كم بدون backend؟

- **39 ملف من 580 (6.7%)** بدون أي استدعاء API (`PAGE_API_MAPPING.md:16, 24`).
- منها: **17 ملف my-space sub-components** (تستهلك props من الأب) (`PAGE_API_MAPPING.md:44`).
- **22 ملف baseline** تشمل: shells/wrappers/static/404 (`PAGE_API_MAPPING.md:380-394`).
- **خلاصة:** لا توجد **صفحة رئيسية** واحدة بـ route فعلي تستخدم بيانات وهمية صرفة (`PAGE_API_MAPPING.md:394, 500`).

### كم بدون database mapping؟

- **~88% تغطية** (334 من 378 جدول baseline مرتبط بـ route) (`API_DATABASE_ENTITY_MAPPING.md:20`).
- **44 raw orphan** (`API_DATABASE_ENTITY_MAPPING.md:20`)، **~31 منها مؤكَّد orphan** بعد التحقق من lib/.
- **4 جداول dropped بـ migration 171**: `invoice_items`, `training_courses`, `fleet_violations`, `warehouse_stock_serials` (`API_DATABASE_ENTITY_MAPPING.md:21, 261-263`).
- **~12 جدول يَستخدمها `lib/` فقط** (cron schedulers، engines) — ليست orphan لكنها بلا API (`API_DATABASE_ENTITY_MAPPING.md:269-280`).
- **حالات حرجة**: `wps_bank_credentials` يحوي اعتمادات بنكية وبلا قارئ — خطر أمني صامت (`API_DATABASE_ENTITY_MAPPING.md:240, 338`).

### كم بدون مكونات UI موحَّدة؟

- **`<PageShell>` تبنّي 56.2%** (326/580 صفحة) (`UI_LIBRARY_UNIFICATION_AUDIT.md:15`).
- **`<DataTable>` تبنّي 45.7%** (265/580) (`UI_LIBRARY_UNIFICATION_AUDIT.md:16`).
- **`<FormShell>` تبنّي 12.2%** (71/580) (`UI_LIBRARY_UNIFICATION_AUDIT.md:22`).
- **53 صفحة بـ `<table>` خام** داخل Finance/Print/Workbench (`UI_LIBRARY_UNIFICATION_AUDIT.md:37`).
- **15 صفحة بـ `window.confirm`/`window.prompt`** (`UI_LIBRARY_UNIFICATION_AUDIT.md:38, 222-241`).
- **21 صفحة بـ `<AlertDialog>` خام** بدون `<ConfirmDeleteDialog>` (`UI_LIBRARY_UNIFICATION_AUDIT.md:39, 242-266`).
- **details/** و **create/** نظيفان: ~100% تبنّي `DetailPageLayout` و `CreatePageLayout`.
- **`<KpiCard>` تبنّي 0.7%** — تجاوز جماعي يُولِّد بطاقات يدوية في BI/Finance dashboards.
- **`<AuditTrailPanel>` تبنّي 0%** رغم وجوده.
- **`<EntityTimeline>` 0.3%، `<ListPage>` 0.3%، `<EntityDetailPage>` 0.3%** — مكوّنات مهجورة.
- **التقدير الإجمالي للتوحيد: ~56%** (`UI_LIBRARY_UNIFICATION_AUDIT.md:48`).

### كم بدون نظام طباعة/تصدير موحَّد؟

- **131 ملف فقط** يستخدم `PrintButton`/`EntityPrintButton` (`PRINT_EXPORT_UNIFICATION_AUDIT.md:15`).
- **54 من 54 صفحة في `pages/details/`** تستخدم الموحَّد (100%) (`PRINT_EXPORT_UNIFICATION_AUDIT.md:16`).
- **47 صفحة تبني CSV client-side** بـ `new Blob([...], "text/csv")` (`PRINT_EXPORT_UNIFICATION_AUDIT.md:20`).
- **3 صفحات تطبع عبر Ctrl+P فقط** (`bi-admin-reports`, `bi-operations`, `monthly-close-pack`) (`PRINT_EXPORT_UNIFICATION_AUDIT.md:21`).
- **2 صفحات فقط** تمرر `printEntityType=` إلى `ListPage` (Phase 2 export menu) (`PRINT_EXPORT_UNIFICATION_AUDIT.md:18`).
- **`PrintFormat` لا يحوي قيمة `csv`** ⇒ الأكبر فجوة (`PRINT_EXPORT_UNIFICATION_AUDIT.md:153`).
- **التغطية على details/**: ~100%. **finance/**: ~85% (PDF موحَّد لكن CSV لا).

---

## ٢. أعلى 20 إصلاحاً حرجاً (Top 20 Critical Fixes)

> مرتَّبة Critical→High حسب الأثر. كل إصلاح له دليل `file:line` ومسار قبول.

1. **سدّ thغرة RBAC في كل `/admin/*`** — الـ sidebar يضع `perm` لكل مدخل (`admin:list`/`view`/`update`) لكن routers الإدمن لا تستخدم `requirePermission` ⇒ مَن يحمل `level=90+module=admin` يصل لكل endpoint إدمن عبر URL مباشر. الدليل: `PAGE_VISIBILITY_AND_SERVICE_EXPOSURE.md:91, 108, 193`. **القبول:** كل GET تحت `/admin/*` تطبّق `requirePermission()` صريحة مطابقة للمدخل.
2. **رفع الحماية على الصفحات المالية الحساسة** (`year-end-close`, `opening-balances`, `journal-manual`, `fiscal-periods-v2`) — حالياً بدون `requireMinLevel` على الخادم ولا `minRoleLevel` على الواجهة، أي حامل `module=finance` يُقفل سنة. الدليل: `PAGE_VISIBILITY_AND_SERVICE_EXPOSURE.md:114, 194-206`. **القبول:** تنفيذ إقفال سنة بمستوى <70 يُرجع 403.
3. **توحيد كتالوج RBAC** — `rbacCatalog` (مسطّح) ↔ `featureCatalog` (شجري) مصدرَا حقيقة. الدليل: `EXECUTIVE_INVENTORY_REPORT.md:66` (FND-010). **القبول:** كتالوج صلاحيات واحد يُستخدم في الواجهة والخادم.
4. **إصلاح bug `purchase_order_lines` في print loader** — `lib/print/dataLoader.ts:553` يقرأ جدول orphan ⇒ طباعة PO بلا بنود. الدليل: `API_DATABASE_ENTITY_MAPPING.md:265, 317, 344`. **القبول:** طباعة أمر شراء تعرض البنود الفعلية من `purchase_order_items`.
5. **سدّ سلسلة GRN/match/payment** — `match-invoice` لا يُرحّل قيد `DR GRNI / CR AP` ⇒ AP منقوصة، GRNI متراكم. الدليل: `EXECUTIVE_INVENTORY_REPORT.md:40` (FIN-001). **القبول:** المطابقة تُولِّد قيد GRNI تسوية صحيح.
6. **سدّ thغرة المطابقة البنكية** — `bank-reconciliation` يحدّث علماً فقط بلا قيد GL. الدليل: `EXECUTIVE_INVENTORY_REPORT.md:41` (FIN-008). **القبول:** كل مطابقة تُولِّد قيد GL مرجعي.
7. **توحيد CSV download path** — 47 صفحة تبني CSV client-side خارج `renderPrint` ⇒ لا audit ولا letterhead ولا RBAC دقيق. الدليل: `PRINT_EXPORT_UNIFICATION_AUDIT.md:35, 126`. **القبول:** كل تنزيل CSV يمرّ عبر `POST /api/print/render` ويظهر في `print_jobs`.
8. **إضافة `csv` إلى `PrintFormat`** — البنية موجودة في `ListPageExportMenu` لكن `PrintFormat` يفتقد قيمة `csv`. الدليل: `PRINT_EXPORT_UNIFICATION_AUDIT.md:153, 186-189`. **القبول:** `<PrintButton format="csv">` يعمل end-to-end.
9. **إلغاء Ctrl+P بدون `<PrintButton>`** — 3 صفحات (`bi-admin-reports`, `bi-operations`, `monthly-close-pack`) تتجاوز النظام كاملاً. الدليل: `PRINT_EXPORT_UNIFICATION_AUDIT.md:37, 128, 201`. **القبول:** لا ملف يحوي `print:hidden` بدون استيراد `<PrintButton>` أو `directPrint()`.
10. **تسجيل تنزيل audit logs** — `admin/logs.tsx` يولِّد CSV عميل-جانب لـ `audit_logs` بدون تسجيل ⇒ من يقرأ سجل التدقيق غير مُتعقَّب (PDPL). الدليل: `PRINT_EXPORT_UNIFICATION_AUDIT.md:129, 207`. **القبول:** كل تنزيل يولِّد سطر `print_jobs` بـ entity=`report_audit_logs`.
11. **تسجيل تصدير PDPL DSAR** — `admin-pdpl.tsx` يولِّد JSON عميل-جانب لبيانات شخصية. الدليل: `PRINT_EXPORT_UNIFICATION_AUDIT.md:130, 207`. **القبول:** DSAR يُسجَّل في `print_jobs`.
12. **سدّ thغرة `/umrah/pilgrims/export.csv`** — endpoint مخصَّص خارج `renderPrint` يسجَّل في `audit_logs` لكنه لا يظهر في `/reports/print-log`. الدليل: `PRINT_EXPORT_UNIFICATION_AUDIT.md:40, 131, 204`. **القبول:** التصدير يمر عبر `renderPrint` ويظهر في `print-log`.
13. **سدّ thغرة scope** — `buildScopedWhere` غير مفروض ⇒ 68 محمول `companyId` يدوي عبر 17 ملفًا. الدليل: `EXECUTIVE_INVENTORY_REPORT.md:61` (FND-013). **القبول:** كل استعلام scoped يستخدم helper مركزي.
14. **مزامنة `/exec-dashboard` بين sidebar (60) والخادم (70)** — divergence. الدليل: `PAGE_VISIBILITY_AND_SERVICE_EXPOSURE.md:75, 105`. **القبول:** sidebar وbackend متفقان (70/70).
15. **مزامنة `/reports/scheduled` بين sidebar (40) والخادم (50)**. الدليل: `PAGE_VISIBILITY_AND_SERVICE_EXPOSURE.md:80, 107`. **القبول:** sidebar=50.
16. **مزامنة `/admin/logs` ↔ `/api/audit-logs`** — sidebar perm=`audit:read` لكن backend=`requireMinLevel(70)` فقط. الدليل: `PAGE_VISIBILITY_AND_SERVICE_EXPOSURE.md:92, 109`. **القبول:** mount `requireMinLevel(90) + requirePermission("audit:read")`.
17. **إضافة guards على `wiring-stubs.ts`** — 5 GETs بدون `authorize()`. الدليل: `PAGE_API_MAPPING.md:405-415, 466`. **القبول:** كل route تحت stubs له `authorize({feature:"warehouse.*"})`.
18. **إضافة `requireMinLevel` على mount `/digital-signature` و `/gov-integrations`** — بيانات حكومية/أمنية بلا عتبة. الدليل: `PAGE_API_MAPPING.md:441, 467`. **القبول:** mount بمستوى ≥70.
19. **حذف `wps_bank_credentials` أو تشفير الصفوف** — جدول اعتمادات بنكية بلا قارئ ⇒ خطر صامت. الدليل: `API_DATABASE_ENTITY_MAPPING.md:240, 338`. **القبول:** الجدول محذوف أو موثَّق deprecation date.
20. **توحيد مفهوم العمرة بين الواجهة والخادم** — sidebar `module=umrah` لكن backend `module=operations`. الدليل: `PAGE_VISIBILITY_AND_SERVICE_EXPOSURE.md:111, 192`. **القبول:** sidebar وbackend يستخدمان نفس مفتاح الوحدة (إما umrah فصل كامل أو operations دمج كامل).

---

## ٣. ما الذي يجب فعله أولاً؟ (PR Sequence — حسب workflow #1418)

```
PR 1: Inventory & Matrix (DONE — هذا التقرير + المصفوفة)
   ↓
PR 2: UI Library Unification
   - تحسين <DataTable> (groupBy, subtotal, pivot)
   - <ConfirmActionDialog> يعمم <ConfirmDeleteDialog>
   - <LineItemsTable> داخل FormShell
   - توسيع <KpiCard> (trend/sparkline/comparison)
   - <AuditTrailPanel> داخل DetailPageLayout
   - حذف <ListPage>/<EntityDetailPage> أو إعلانها canonical
   - codemod EntityPrintButton → PrintButton
   ↓
PR 3: Route + Sidebar + Visibility Cleanup
   - مزامنة sidebar minRoleLevel مع backend (exec-dashboard, reports/scheduled, admin/logs)
   - توحيد سلّم الأدوار (إزالة 20/30/40/50 أو إضافتها backend)
   - feature flags للـ /umrah/* /hr/wps /fx-* /intercompany /fleet/telematics/*
   - إعادة تنظيم admin-*.tsx من root إلى pages/admin/
   - إعادة تنظيم properties-*.tsx, bi-*.tsx
   ↓
PR 4: Page-to-API Wiring
   - سدّ سلسلة GRN/match/payment (FIN-001/002/003)
   - إصلاح المطابقة البنكية (FIN-008)
   - إصلاح PROP-001/002/003 (terminate, edit, late-rent)
   - إصلاح FLT-001/010 (close trip, GPS)
   - إصلاح PRJ-001/003 (task progress, costing)
   - HR-005 (recruitment→employee bridge)
   ↓
PR 5: Print + Export Unification
   - إضافة format="csv" إلى PrintFormat + csvAdapter
   - migration 47 finance CSVs إلى renderPrint
   - إلغاء Ctrl+P في bi-admin-reports/bi-operations/monthly-close-pack
   - تسجيل تنزيل audit/PDPL في print_jobs
   - توحيد /umrah/pilgrims/export.csv تحت renderPrint
   - دمج admin/print-templates ↔ settings/print-templates
   ↓
PR 6: Dead + Duplicate Cleanup
   - إخفاء /umrah/import/legacy ثم حذفه
   - دمج HR pairs (recruitment/training/performance/shifts/leaves/violations) كـ tabs
   - دمج BI hubs (bi-dashboards/bi-kpis/bi-reports داخل bi.tsx)
   - دمج fiscal-periods v1 ↔ v2
   - حذف DB orphans (audit family, email_queue family, communications_log, etc.)
   - drop umrah_attachments بعد فترة استقرار
   ↓
PR 7: Acceptance Tests
   - e2e per-role: عدد المداخل المرئية + 200 لكل URL مرئي + 403 لكل URL مخفي
   - script sidebar vs backend minRoleLevel diff
   - regression: PO print loader + invoice GRNI posting
   - print_jobs trace: كل تنزيل بـ row
   - PDPL trace: DSAR + audit export
```

---

## ٤. ما الذي يجب إخفاؤه من الإنتاج؟

> آلية `isFeatureEnabled` موجودة في `app-context.tsx:450` وتدعم default-ON. التوصية في #1413: تحويلها إلى default-OFF لتنانت جديد، مع تفعيل تدريجي.

| الصفحة / المسار | السبب | الدليل |
|---|---|---|
| `/umrah/import/legacy` | wizard البديل يعمل، v1 مكرَّر | `DEAD_DUPLICATE_PAGE_AUDIT.md:25, 202-208` |
| `/settings/print-templates` "visual" tab | "coming soon" غير مكتمل | `DEAD_DUPLICATE_PAGE_AUDIT.md:131-132` |
| `/umrah/*` (29 مدخلًا) | تنانت غير سعودي أو غير عمرة | `PAGE_VISIBILITY_AND_SERVICE_EXPOSURE.md:150` |
| `/hr/wps`, `/hr/saudi-compliance`, `/hr/saudization` | تنانت غير سعودي | `PAGE_VISIBILITY_AND_SERVICE_EXPOSURE.md:143-145` |
| `/finance/wht-*`, `/finance/reports/wht-summary` | WHT غير مفعَّل | `PAGE_VISIBILITY_AND_SERVICE_EXPOSURE.md:145` |
| `/finance/reports/zatca`, `/finance/vat-filing-readiness`, `/admin/zatca-audits` | onboarding ZATCA لم يكتمل | `PAGE_VISIBILITY_AND_SERVICE_EXPOSURE.md:146` |
| `/fleet/telematics/*` (10 مداخل) | بدون ربط CMSV6 | `PAGE_VISIBILITY_AND_SERVICE_EXPOSURE.md:147, 211` |
| `/finance/fx-rates`, `/finance/fx-revaluation` | منشأة بعملة واحدة | `PAGE_VISIBILITY_AND_SERVICE_EXPOSURE.md:148` |
| `/finance/intercompany` | منشأة وحيدة | `PAGE_VISIBILITY_AND_SERVICE_EXPOSURE.md:149` |
| `/properties/*` | لا مبنى مُسجَّل | `PAGE_VISIBILITY_AND_SERVICE_EXPOSURE.md:151` |
| `/store/*` | لا منتج مُسجَّل | `PAGE_VISIBILITY_AND_SERVICE_EXPOSURE.md:152` |
| `/marketing` | CRM غير مفعَّل | `PAGE_VISIBILITY_AND_SERVICE_EXPOSURE.md:153` |
| `/admin/data-import`, `/admin/digital-signature` | بدون feature flag مناسب | `PAGE_VISIBILITY_AND_SERVICE_EXPOSURE.md:154` |
| `/admin/intelligence-playground` | dev tool — للمشغلين فقط | `PAGE_SERVICE_CLASSIFICATION.md:559`; `SYSTEM_PAGE_INVENTORY.md:686` |
| `/admin/system-governor`, `/print-verify` (للعرض العام) | أدوات تشغيل/تحقق | `PAGE_SERVICE_CLASSIFICATION.md:559` |

---

## ٥. ما الذي يجب دمجه أو حذفه؟

### يحتاج دمج (Merge)

| العنصر | الوضع | الإجراء |
|---|---|---|
| `bi.tsx` + `bi-dashboards.tsx` + `bi-kpis.tsx` + `bi-reports.tsx` | 4 صفحات لنفس الـtabs | TabsNav-as-router فقط أو in-page Tabs فقط |
| `hr/performance` + `hr/performance-advanced` | list + analytics | tab "تحليلات" داخل الأداء |
| `hr/recruitment` + `hr/recruitment-advanced` | نفس النمط | tab |
| `hr/training` + `hr/training-advanced` | نفس النمط | tab |
| `hr/shifts` + `hr/shifts-management` | قائمة + إدارة | management tab |
| `hr/leaves` + `hr/leave-management` | قائمة + إدارة | management tab |
| `hr/violations` + `violations-management` + `auto-detection` | 3 صفحات | tabs داخل violations؛ penalty-escalation يبقى منفصلاً |
| `finance/fiscal-periods` (v1) + `fiscal-periods-v2` | redirect | v1 → v2 بعد دمج stats كـ tab |
| `finance/dashboard.tsx` + `cfo-cockpit.tsx` + `workflows-hub` + `settings-hub` | 4 hubs مالية | hub واحد رئيسي |
| `admin/print-templates` + `settings/print-templates` | نسختان | نسخة واحدة + redirect |
| `governance/capa-tab.tsx` + `governance/capa.tsx` | مكرر | tab واحد |
| `finance/journal-templates` + `journal-quick-templates` | مكرر | قوالب واحدة |
| كشوف الحساب (customer/vendor/entity/account/owner) | ≥6 صفحات لنفس المفهوم | "كشف الجهة 360°" واحد |
| العقود (HR/finance/properties/legal/vendor) | 5 مفاهيم متشابهة | خدمة عقود مركزية بأنواع فرعية |
| مراكز التقارير | 7+ موزعة | مركز BI واحد |
| المراسلات (comms/legal/details) | 3 صفحات | خدمة واحدة بـtag |
| السلف (hr loans/my-loans/salary-advances/customer-advances) | 4 مفاهيم | كيان loans/advances موحَّد |
| صناديق الوارد للموافقات | 7+ مداخل | صندوق مركزي |
| `EntityPrintButton` (54 callsite) | wrapper بلا قيمة | codemod → `PrintButton` |
| 9 صفحات `create/finance/*` تكتب جدول سطور يدويًا | تكرار 9 تنفيذات | `<LineItemsTable>` مشترك |
| sub-components تحت `pages/` (bi-tabs، my-space-cards، admin-tabs، settings-tabs، governance-tabs) | تنظيم خاطئ | نقل إلى `components/<module>/tabs/` |

### يحتاج حذف (Delete after migration)

| العنصر | الوضع | الإجراء |
|---|---|---|
| `/umrah/import/legacy` | استبدل بـwizard | اخفِ ثم احذف |
| `daily_closures` (DB) | superseded بـ `daily_close_log` | drop migration |
| `audit_archive` + `audit_logs_archive` + `audit_umrah_access` | 3 orphans | RFC ثم drop |
| `wps_bank_credentials` + `wps_skip_alerts` | orphans + خطر أمني | drop أو تشفير |
| `zatca_icv_counters` + `zatca_retry_queue` + `zatca_b2c_pause_events` | بلا قارئ | تحقق lib/ ثم drop |
| `email_queue` + `sms_queue` + `whatsapp_queue` | استبدلت بـ `outbound_queue` | drop migration |
| `communications_log` + `notification_log` | استبدلت بـ live counterparts | drop |
| `trainings` + `training_courses` (orphans) | استبدلت بـ `training_programs` | drop |
| `integration_logs_archive` | orphan | drop |
| `user_activity_log` + `user_sessions` (orphan part) | استبدلت بـ `activity_logs` | drop |
| `event_outbox` | outbox pattern لم يُنفذ | drop أو wire |
| `purchase_order_lines` | استبدلت بـ `purchase_order_items` | drop بعد إصلاح dataLoader |
| `umrah_attachments` (legacy) | retained for rollback | drop بعد فترة استقرار |
| `umrah_payment_allocations` | لم تُستخدم | drop |
| `product_valuation_settings`, `lot_expiry_alerts`, `warehouse_cycle_count_plans` | orphans | تحقق lib/ ثم drop |
| `fx_revaluation_lines` | parent مستخدم، الجدول لا | drop |
| `smart_recommendations` | behavioral AI لم يُربط | drop أو wire |
| dead endpoints (~15 endpoint) | غير مُستهلكة من pages | تحقق portals/mobile ثم deprecate |

### يحتاج احتفاظ (Keep — wrappers/intentional shells)

| العنصر | السبب |
|---|---|
| `finance/customer-statement.tsx`, `vendor-statement.tsx` | polymorphic wrappers موثَّقة |
| `finance/profitability-{vehicle,property,project,umrah-agent}.tsx` | polymorphic wrappers |
| `finance/finance-workflows-hub.tsx`, `zatca-reports-hub.tsx`, `tax-filing-calendar.tsx` | hub navigation موثَّق |
| `services.tsx`, `properties-guide.tsx`, `bi.tsx`, `admin.tsx` | intentional shells |
| `login.tsx`, `not-found.tsx`, `print-verify.tsx` | special-case pages |
| `manager-board`, `manager-workspace`, `workspace`, `dashboard` | JSDoc يميّز بينها |

---

## ٦. شرائح الـ PR المقترحة (PR Slicing — Arabic descriptions)

### PR 1 — الجرد والمصفوفة (Inventory & Matrix only) — **مكتمل**

- ✅ `docs/audit/GHAITH_SYSTEM_GAP_MATRIX.md` (هذا الـPR).
- ✅ `docs/audit/GHAITH_SYSTEM_SWEEP_EXECUTIVE_SUMMARY.md` (هذا الـPR).
- ✅ المصادر الـ8 المرتبطة بـ #1418.

### PR 2 — توحيد مكتبة واجهة المستخدم (UI Library Unification)

**القيمة:** نقلة من 56% إلى >90% تبنّي للنمط الموحَّد + بدائي مفقودة.

**التسليمات (مستمَدَّة من المصفوفة):**
- `<ConfirmActionDialog>` (تعميم `<ConfirmDeleteDialog>` للحالات غير-الحذف).
- `<DataTable>` يدعم `groupBy`, `subtotalColumns`, `pivotConfig`.
- `<LineItemsTable>` بدائي داخل `FormShell` للـ `useFieldArray`.
- `<KpiCard>` يدعم `trend`, `comparison`, `currency`, `secondaryValue`, `sparkline`.
- `<AuditTrailPanel>` يُدمج افتراضيًا في `<DetailPageLayout>` كـ tab.
- `<EntityTimeline>` مرتبط تلقائيًا بـ `useLifecycleAction`.
- codemod: 54 `<EntityPrintButton>` → `<PrintButton>`.
- استبدال `window.confirm`/`window.prompt` بـ `<ConfirmActionDialog>` في 15 ملف.
- استبدال 21 `<AlertDialog>` خام بـ `<ConfirmActionDialog>` (variants).
- توحيد إعدادات الـ settings: استبدال `<table>` خام داخل `settings.tsx` و13 `*-tab.tsx`.

### PR 3 — تنظيف المسارات + الـsidebar + الرؤية (Route / Sidebar / Visibility Cleanup)

**القيمة:** إزالة divergence بين الواجهة والخادم.

**التسليمات:**
- مزامنة `minRoleLevel` بين sidebar وbackend (9 حالات تباين موثَّقة).
- توحيد سلّم الأدوار (إزالة 20/30/40/50 من sidebar أو إضافتها backend).
- إضافة `requirePermission()` في كل router إدمن مطابقًا للـsidebar (45 مدخلًا).
- إضافة `requireMinLevel(50–70)` على `/finance/year-end-close`, `/finance/opening-balances`, `/finance/journal-manual`, `/finance/fiscal-periods-v2`.
- إضافة feature flags في `disabledFeatures` للوحدات: umrah, wps, saudi_compliance, multi_currency, multi_company, telematics, zatca، intelligence-playground.
- إخفاء `/umrah/import/legacy` من sidebar.
- نقل تنظيمي: 30 ملف `admin-*.tsx` من root إلى `pages/admin/`، 9 `properties-*.tsx`، 6 `bi-*.tsx`.
- نقل sub-components: `bi/*-tab.tsx`, `my-space/*-card.tsx`, `admin/*-tab.tsx`, `settings/*-tab.tsx`, `governance/*-tab.tsx` إلى `components/<module>/`.

### PR 4 — ربط الصفحات بالـAPI (Page-to-API Wiring)

**القيمة:** إغلاق فجوات وظيفية + إصلاح الـ blockers المالية.

**التسليمات (من مصفوفة #1418 الموجة 1):**
- FIN-001: سلسلة GRN/match/payment تُولِّد `DR GRNI / CR AP`.
- FIN-002: تصحيح `chk_purchase_orders_status` ليشمل الحالتين المستخدمتين.
- FIN-003: `schedule-payment` ينفّذ `applyTransition` قبل قيد GL.
- FIN-008: المطابقة البنكية تُرحّل قيد تسوية فعلي.
- PROP-001: مسار `/terminate` لإنهاء عقد الإيجار + زر في الواجهة.
- PROP-002/003/004: تصحيح الأعمدة المفقودة في `pay`/`escalate`/edit building.
- FLT-001: زر إغلاق الرحلة من الواجهة + قبول backend.
- FLT-010: تصحيح GPS tracking SQL.
- PRJ-001/003: تصحيح `progress` column في tasks + إنشاء project-costing.
- HR-005: جسر التوظيف → موظف.
- COM-003: إرسال الخطاب الرسمي.
- WH-007: حقن `branchId` على كل حركة مخزون.
- CRM-013: قيد UNIQUE على `clients` + توحيد `totalRevenue` writer.
- إصلاح bug `purchase_order_lines` في `lib/print/dataLoader.ts:553`.

### PR 5 — توحيد الطباعة والتصدير (Print + Export Unification)

**القيمة:** سدّ ثغرة CSV + تأمين audit التصدير.

**التسليمات:**
- إضافة `"csv"` إلى `PrintFormat` في `lib/print-client.ts:23` و `components/shared/print-button.tsx:27`.
- إنشاء `csvAdapter.ts` يأخذ نفس `RenderContext` كـ `excelAdapter`.
- تعديل `ListPageExportMenu.runCsv` (stub موجود) ليستدعي `downloadDocument({format:"csv"})`.
- migration 47 صفحة finance من `exportCSV` يدوي إلى `<PrintButton format="csv">`.
- إلغاء `print:hidden`/`print:block` بدون `<PrintButton>` في bi-admin-reports, bi-operations, monthly-close-pack.
- توحيد `/umrah/pilgrims/export.csv` تحت `renderPrint`.
- تأمين تصدير audit logs و PDPL DSAR بسطر `print_jobs`.
- توحيد `admin/print-templates.tsx` ↔ `settings/print-templates.tsx`.
- تطبيق `ListPage` adoption (213 صفحة `DataTable` بلا export menu).

### PR 6 — تنظيف الميت والمكرَّر (Dead + Duplicate Cleanup)

**القيمة:** تخفيف الـcognitive load + إزالة drift.

**التسليمات:**
- دمج HR pairs (recruitment, training, performance, shifts, leaves, violations) كـ tabs.
- دمج BI hubs (bi-dashboards/bi-kpis/bi-reports → داخل bi.tsx).
- دمج fiscal-periods v1 → v2 (redirect بعد دمج stats).
- حذف /umrah/import/legacy (بعد فترة استقرار).
- DB drops: audit family (3 جداول)، email_queue/sms_queue/whatsapp_queue، communications_log، notification_log، trainings/training_courses، integration_logs_archive، user_activity_log، event_outbox، purchase_order_lines، daily_closures، discipline_memos، umrah_payment_allocations، product_valuation_settings، lot_expiry_alerts، fx_revaluation_lines، smart_recommendations، rbac_cache_version.
- drop `umrah_attachments` بعد فترة استقرار من migration 237.
- deprecate dead endpoints (~15 endpoint) بعد فحص portals + mobile + scripts.

### PR 7 — اختبارات القبول (Acceptance Tests)

**القيمة:** ضمان عدم regression + قياس النجاح.

**التسليمات:**
- e2e per-role (`employee`, `branch_manager`, `hr_manager`, `finance_manager`, `general_manager`, `owner`): عدد المداخل المرئية + 200 لكل URL مرئي + 403 لكل URL مخفي.
- script يقارن `allNavSections` (`sidebar-layout.tsx`) مع `routes/index.ts` (`backend`) ويُخرج `minRoleLevel` و`perm` غير متطابق.
- regression unit:
  - PO print loader: طباعة أمر شراء تعرض البنود الفعلية.
  - GRNI posting: المطابقة تُولِّد قيد GRNI.
  - bank reconciliation: قيد GL مرجعي.
- print_jobs trace: كل تنزيل CSV/Excel/PDF يولِّد سطر `print_jobs`.
- PDPL trace: DSAR export + audit log export يُسجَّلان في `app_security_events`.
- e2e: feature flags `disabledFeatures` تخفي مداخل sidebar فعليًا.
- e2e: مصفوفة العمرة (sidebar=umrah ↔ backend=operations) — موحَّدة بعد PR 3.

---

## ٧. ملخص ٥ أسطر

1. **النظام كبير ومرتبط:** 578 ملف صفحة، 510 منها مسجَّل في routes، 503 تستخدم PageShell، 491 (84%) تستدعي API صراحةً ⇒ غالبية الصفحات working bnyويًا.
2. **الفجوات الأكبر طبقية وليست في الصفحات:** RBAC bypass في `/admin/*` (45 مدخلًا)، CSV خارج audit pipeline (47 صفحة)، divergence بين sidebar وbackend في 9 حالات، 15 endpoint dead، 31 DB orphan، ~30 صفحة بـ legacy components.
3. **12 إصلاحًا critical** (P0) و**38 high** (P1) — هي قلب الـ workflow؛ معالجتها بالموجات 1-3 من خارطة PR 2-7 يُغلق ~80% من المخاطر.
4. **10 تعارضات بين الوكلاء** موثَّقة في القسم 3 من المصفوفة — تتطلب مراجعة بشرية قبل أي قرار حذف/دمج (خاصة `profitability.tsx`، `account-statement.tsx`، `rbac-v2-conditions-editor.tsx`، تصنيف Umrah module، HR pairs).
5. **تنفيذ سريع موصى:** PR 2 (UI bdaiyt) + PR 3 (visibility) + PR 5 (CSV gap) قابلة للتوازي وذات أعلى ROI؛ PR 4 (wiring) يحتاج موجة 1 من #1418 وله ترتيب صارم؛ PR 6 (cleanup) و PR 7 (tests) ختاميان.

---

**نهاية الملخص التنفيذي. لم تُنفَّذ أي تعديلات على الكود. التعارضات في القسم 3 من المصفوفة تتطلب مراجعة بشرية.**
