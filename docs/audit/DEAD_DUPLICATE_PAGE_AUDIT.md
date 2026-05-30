# Dead / Duplicate Page Audit — Ghaith System Deep Sweep
**Branch:** `claude/enterprise-hardening-roadmap-AOfO7`
**Run date:** 2026-05-30
**Scope:** `artifacts/ghayth-erp/src/{routes,pages,components/layout,components/shared}`
**Status of last cleanup:** commits `df22a6e6` (3 redirect pages removed), `79eee636` (5 orphan files removed), `b40474ca` (a11y sweep), `1da41ded` (hardcoded fallbacks dropped) — reference baseline.
**Mode:** AUDIT-ONLY. No code modified.

---

## ملخص (Summary)

| فئة | عدد |
| --- | --- |
| إجمالي ملفات الصفحات (`pages/**/*.tsx`) | 578 |
| مسارات مُسجَّلة في `routes/*.tsx` | 534 |
| روابط القائمة الجانبية (`path:` + `link:`) | 373 (بعد تطبيع `?query`) |
| روابط الـ TabsNav | 114 |
| **صفحات بدون route ولا importer (orphan)** | **0** |
| **routes بدون أي رابط ولا سترنغ ليتيرال** | **0** (after parameterized/create routes are excluded — see §3) |
| **sidebar entries تشير لـ route غير مسجّل** | **0** |
| صفحات routed بدون أي API call (هَبّ/دليل/تقويم) | 8 |
| pages with hardcoded mock/fake data | 0 (الـ 8 المشتبه بها = sample payloads أو قوائم قانونية ثابتة) |
| مجموعات صفحات بنفس الوظيفة | 6 (HR pairs + 1 import) |
| v1/v2 pairs | 2 (`fiscal-periods`, `umrah/import`) |
| صفحات يجب إخفاؤها من الإنتاج | 1 (`/umrah/import/legacy`) |

### أبرز 10 توصيات (Top 10)

1. **`/umrah/import/legacy`** — يبقى في القائمة الجانبية. **توصية: أوقف من الإنتاج** أو احذف بعد التأكد من اكتمال الهجرة (commits توضّح أن `/umrah/import` هو الـ wizard البديل).
2. **`pages/finance/account-statement.tsx`** و **`pages/finance/profitability.tsx`** — ليست في `routes/` ولكن مستخدمتان كـ shared parent عبر relative import من الـ wrappers (`customer-statement`, `vendor-statement`, `profitability-vehicle`, `-property`, `-project`, `-umrah-agent`). توثيق فقط: **احتفظ + وثّق** في JSDoc أنها shared base.
3. **`pages/finance/fiscal-periods.tsx` vs `pages/finance/fiscal-periods-v2.tsx`** — كلاهما routed ومستخدم. v1 = stats per month read-only، v2 = full close/lock/reopen workflow. **توصية: ادمج** v1 features داخل v2 لقطع التشتت، ثم redirect `/finance/fiscal-periods` → `/finance/fiscal-periods-v2`.
4. **`hr/performance.tsx`** vs **`hr/performance-advanced.tsx`** (المسار `/hr/performance/advanced`) — كلاهما يقرأ `/hr/performance`، الـ advanced يضيف توزيع وKPIs. **توصية: ادمج** كـ tab داخل صفحة الأداء الرئيسية.
5. **`hr/recruitment.tsx` / `recruitment-advanced.tsx`**، **`hr/training.tsx` / `training-advanced.tsx`** — نفس النمط (list page + analytics-only sister). **توصية: ادمج** كـ tab "تحليلات".
6. **`hr/violations.tsx` (529 LoC)** + **`hr/violations-management.tsx` (174 LoC)** + **`/hr/violations/penalty-escalation`** + **`/hr/violations/auto-detection`** — أربع صفحات تحت `/hr/violations/*`. **توصية: ادمج** management كtab.
7. **`hr/shifts.tsx`** vs **`hr/shifts-management.tsx`** و **`hr/leaves.tsx`** vs **`hr/leave-management.tsx`** — قائمة + إدارة. **توصية: ادمج**.
8. **`pages/admin.tsx`** — لا يستدعي API مباشرة، يحوي 13 بطاقة لا تنبعث منها navigation (cards-only). **توصية: أوقف** البطاقات الرمزية وحوّلها لروابط فعلية، أو **احتفظ + وثّق** أنها cosmetic.
9. **`pages/bi.tsx`** (يحوي 10 tabs داخلية) + **`pages/bi-dashboards.tsx`**/**`bi-kpis.tsx`**/**`bi-reports.tsx`** (wrappers على نفس الـ tabs الفرعية): تعارض هيكلي بين in-page Tabs و BiTabsNav. **توصية: ادمج** — اختر إما TabsNav (روتر) أو in-page Tabs، لا الاثنين.
10. **`pages/bi/shared.tsx`** — utility helpers في `pages/` ينتهك القاعدة (utilities لا تكون pages). **توصية: انقل** إلى `lib/` أو `components/shared/`.

---

## 2. صفحات بدون route ولا importer

بعد بناء graph الـ imports (absolute `@/pages/...` + relative `./` و `../` ضمن `pages/`) ومقارنته بـ routes:

**صفر صفحة (0) orphan.** كل ملفّ من 578 ملف tsx إما:
- مُسجَّل في `routes/*.tsx` (510 module imports)، أو
- مستورد من ملف آخر عبر relative path (e.g. tabs, cards, sections, shared parents).

التحقّق الدقيق:

```
all pages          : 578
pages in routes    : 510
pages imported by  : 68  (tabs, sections, shared parents)
truly orphan       : 0
```

التوكيدات الخاصة على ملفات بدت orphan في الفحص السطحي:

| ملف | لماذا ليس orphan |
| --- | --- |
| `pages/finance/account-statement.tsx` | imported by `customer-statement.tsx:6` و `vendor-statement.tsx:6` (relative `./account-statement`) |
| `pages/finance/profitability.tsx` | imported by `profitability-vehicle.tsx:4`, `-property.tsx:3`, `-project.tsx:3`, `-umrah-agent.tsx:3` |
| `pages/admin/rbac-v2-conditions-editor.tsx` | imported by `pages/admin/rbac-v2-tab.tsx:23` |
| `pages/bi/shared.tsx` | imported by `pages/bi/overview-tab.tsx`, `pages/bi/ceo-dashboard-tab.tsx` (utility module مكانه خاطئ) |
| `pages/login.tsx` | غير في route registry — تعبّأ كـ explicit case في `pages/App.tsx` (مسار `/login` ضمن IMPLICIT_PATHS في `routes/registry.ts:17`) |
| `pages/not-found.tsx` | imported by `pages/App.tsx:31`, used as wildcard fallback at `App.tsx:143` |

---

## 3. Routes بدون رابط في الواجهة (orphan routes)

استخراج: `routes/*.tsx` يصرّح 534 مسار. الـ Sidebar + TabsNav معاً يغطّيان 373 من المسارات المباشرة. الفرق = 161 مسار. **هذه ليست orphans حقيقية** لأنها واحدة من:

- **Parameterized detail routes** (`/clients/:id`, `/finance/invoices/:id`, ...) — يُوصل لها من list pages الأم.
- **`/create` و `/edit` routes** — يُوصل لها من زرّ "إضافة" في الـ list page.

بعد إقصاء `:` و `create|edit$`، يبقى 6 مسارات:

| Route | حال | Verdict |
| --- | --- | --- |
| `/finance` | hub page (routes/financeRoutes.tsx:186) — يُوصل لها عبر `/finance/workflows-hub` ضمن sidebar (sidebar-layout.tsx:214) + literal `/finance` في 124 موقع | **احتفظ** |
| `/hr` | hub (routes/hrRoutes.tsx:98) — sidebar:1044 يعرّف quick actions لـ `/hr` + 57 references | **احتفظ** |
| `/legal` | hub (routes/legalRoutes.tsx:15) — sidebar:1236 quick actions + 11 refs | **احتفظ** |
| `/fleet/telematics` | alias to live-map (routes/fleetRoutes.tsx:65) — يُغطّى عبر `match: ["/fleet/telematics"]` في `fleet-tabs-nav.tsx:19` | **احتفظ** |
| `/umrah/settings` | routed (umrahRoutes.tsx:61) — يُستدعى من `pages/umrah/settings.tsx:33` و:61 (API endpoint) — لكن لا يظهر في sidebar/tabs. **يصل له فقط من `/admin/...` أو deep link** | **احتفظ + أضِفه** إلى Umrah TabsNav أو admin sidebar |
| `/umrah/commission-plans/new` | linked from `pages/umrah/commission-plans.tsx:206` | **احتفظ** |

**خلاصة §3:** صفر orphan routes حقيقية.

---

## 4. Sidebar entries → 404 (broken sidebar)

اختبار: لكل `path` و `link` في `components/layout/sidebar-layout.tsx`، تحقّق من تطابقه مع pattern في `REGISTERED_PATTERNS` (راجع `routes/registry.ts:19`).

**نتيجة: 0 broken sidebar entries.** كل 373 path في الـ sidebar (بعد تطبيع `?query`) يطابق pattern صحيح.

---

## 5. صفحات routed بدون أي API (mock/pure-shell)

8 صفحات لا تستدعي `useApiQuery`/`useApiMutation`/`apiFetch` ولكنها مُسجَّلة في routes:

| الصفحة | LoC | الطبيعة | Verdict |
| --- | --- | --- | --- |
| `pages/admin.tsx` (`/admin`) | 110 | لوحة بطاقات تصويرية بدون navigation events فعليّة — البطاقات تعرض الرموز فقط، لا onClick. ثم Tabs الفرعية تستدعي API. | **احتفظ + نظّف** البطاقات الـ display-only |
| `pages/bi.tsx` (`/bi`) | 47 | حاوية tabs، الـ tabs الفرعية تستدعي API | **احتفظ** |
| `pages/bi-dashboards.tsx` (`/bi/dashboards`) | 12 | wrapper على DashboardsTab | **ادمج** مع `/bi` (تكرار هيكلي — راجع §7) |
| `pages/bi-kpis.tsx` (`/bi/kpis`) | 12 | wrapper على KPIsTab | **ادمج** مع `/bi` |
| `pages/bi-reports.tsx` (`/bi/reports`) | 12 | wrapper على ReportsTab | **ادمج** مع `/bi` |
| `pages/services.tsx` (`/services`) | 161 | "كل الخدمات" — يستهلك `useFilteredNavSections` (in-memory)، صفحة navigation pure | **احتفظ** (intentional) |
| `pages/properties-guide.tsx` (`/properties/guide`) | 1429 | دليل ثابت بـ screenshots + شرح | **احتفظ** (intentional content page) |
| `pages/print-verify.tsx` (`/print/verify/:jobId`) | — | يستدعي backend عبر `verifyDocument()` helper من `@/lib/print-client` (print-verify.tsx:4,173) — Not flagged | **احتفظ** |

**صفحات hub بدون API (intentional navigation pages — verified):**

| الصفحة | Route | السبب |
| --- | --- | --- |
| `pages/finance/finance-workflows-hub.tsx` | `/finance/workflows-hub` | فهرس روابط — `Pure navigation` (موثّق سطر 22 في الملف) |
| `pages/finance/zatca-reports-hub.tsx` | `/finance/reports/zatca` | فهرس لـ 8 reports — `no API call here` (سطر 19) |
| `pages/finance/tax-filing-calendar.tsx` | `/finance/tax-filing-calendar` | تقويم قانوني ثابت (مواعيد VAT/WHT/ZAKAT/GOSI) — `Pure-frontend` (سطر 26) |

---

## 6. Hardcoded fallback / placeholder data

بعد commit `1da41ded` (مايو 30) أُزيلت الـ hardcoded department + job-title + nationality fallbacks. الفحص الحالي:

- **`pages/settings/print-templates.tsx:605`** — `SAMPLE_PAYLOADS` ثابت ولكنه **payload preview للقالب**، ليس قائمة عرض في dropdown. **احتفظ** (intentional).
- **`pages/settings/print-templates.tsx:10`** — وثائق JSDoc تقول "visual surface is scaffolded with a 'coming soon' tab so the route is ready" — **اخفِ من الإنتاج** الـ tab الذي يقول "قريباً" أو wire feature flag.
- **`pages/fleet/telematics/settings.tsx:266`** — `<SelectItem value="wialon" disabled>Wialon — قريباً</SelectItem>` — placeholder vendor option. **احتفظ** (disabled، لا يتسبّب في bug) أو حذف عند توفر التكامل.

**لا توجد أي `length === 0 ? [<hardcoded>] : data` أنماط في الـ pages.**

---

## 7. التكرارات الوظيفية (Functional duplicates)

### 7.1 BI structural duplication
`pages/bi.tsx` (47 LoC) يستخدم in-page Tabs (10 tabs) **و** BiTabsNav (6 tabs) معاً. الـ wrappers `bi-dashboards.tsx`, `bi-kpis.tsx`, `bi-reports.tsx` (12 LoC each) كلّ منها يُعِيد render نفس `*-tab.tsx` من داخل `pages/bi/` بـ PageShell جديد و BiTabsNav.

| السلسلة | الملفات | LoC | Verdict |
| --- | --- | --- | --- |
| Hub vs routed tabs | `bi.tsx` + `bi-dashboards.tsx` + `bi-kpis.tsx` + `bi-reports.tsx` | 47+12+12+12 = 83 | **ادمج**: اعتمد TabsNav-as-router فقط، احذف Tabs من `bi.tsx` (أو العكس). الازدواجية تربك الـ deep-link state. |
| `pages/bi/*-tab.tsx` (12 tabs) | `ai-insights-tab`, `alert-fatigue-tab`, `branch-performance-tab`, `ceo-dashboard-tab`, `dashboards-tab`, `fleet-tco-tab`, `kpis-tab`, `leave-balance-tab`, `overview-tab`, `property-occupancy-tab`, `reports-tab`, `training-roi-tab`, `vendor-performance-tab` | — | كلها مسارها وحيد (مستوردة مرة واحدة) — **احتفظ** ولكن **انقلها** إلى `components/bi/tabs/` لتتسق مع موقعها الوظيفي |

### 7.2 HR pair pattern (list vs analytics/management)

| القائمة الرئيسية | السترة الموازية | المسار الموازي | Verdict |
| --- | --- | --- | --- |
| `pages/hr/recruitment.tsx` (368 LoC) | `pages/hr/recruitment-advanced.tsx` (87 LoC) | `/hr/recruitment/advanced` | **ادمج** كـ tab "تحليلات" داخل recruitment |
| `pages/hr/training.tsx` (285 LoC) | `pages/hr/training-advanced.tsx` (88 LoC) | `/hr/training/advanced` | **ادمج** |
| `pages/hr/performance.tsx` (142 LoC) | `pages/hr/performance-advanced.tsx` (96 LoC) | `/hr/performance/advanced` | **ادمج** — نفس endpoint `/hr/performance` |
| `pages/hr/shifts.tsx` (198 LoC) | `pages/hr/shifts-management.tsx` (190 LoC) | `/hr/shifts/management` | **ادمج** أو احتفظ بفصل واضح |
| `pages/hr/leaves.tsx` (294 LoC) | `pages/hr/leave-management.tsx` (178 LoC) | `/hr/leaves/management` | **ادمج** كـ tab |
| `pages/hr/violations.tsx` (529 LoC) | `pages/hr/violations-management.tsx` (174 LoC) + `penalty-escalation.tsx` + `auto-detection.tsx` | `/hr/violations/management` + `…/penalty-escalation` + `…/auto-detection` | **ادمج**: violations + management + auto-detection يمكن دمجهم؛ penalty-escalation له منطق مختلف، **احتفظ** |

### 7.3 Warehouse pair
| | LoC | API | Verdict |
| --- | --- | --- | --- |
| `pages/warehouse.tsx` | 534 | core CRUD | احتفظ |
| `pages/warehouse-advanced.tsx` | 465 | cycle-counts, lots, serials, ABC, reports — distinct surfaces | احتفظ (different scope) |

### 7.4 Dashboards plurality (intentional distinctions)
| الملف | المسار | الدور |
| --- | --- | --- |
| `pages/dashboard.tsx` | `/dashboard` | الصفحة الافتراضية للمستخدم |
| `pages/exec-dashboard.tsx` | `/exec-dashboard` | لوحة القيادة التنفيذية |
| `pages/module-dashboards.tsx` | `/module-dashboards` | لوحات لكل module |
| `pages/properties-dashboard.tsx` | `/properties/dashboard` | عقاري فقط |
| `pages/umrah/dashboard.tsx` | `/umrah` (؟) | عمرة |
| `pages/manager-board.tsx` | `/manager-board` | لوحة approvals للمدير |
| `pages/manager-workspace.tsx` | `/manager-workspace` | team pulse (موثّق JSDoc:1-7) |
| `pages/workspace.tsx` | `/workspace` | "day-of-work" employee view (موثّق JSDoc:1-8) |

**Verdict:** احتفظ. التمييز مذكور بصراحة في الـ JSDoc.

### 7.5 Requests duality
- `pages/my-requests.tsx` (199 LoC) → `/my-requests` (مُوجَّه ذاتيًا للموظّف).
- `pages/requests-page.tsx` (720 LoC) → `/requests` (عام مع DataTable + FormShell).

كلاهما mutually-distinct (employee vs admin). **احتفظ.**

---

## 8. v1/v2 pairs

### 8.1 `fiscal-periods` (v1) vs `fiscal-periods-v2`
- `routes/financeRoutes.tsx:316-317` — كلا المسارين مسجّل.
- `pages/finance/fiscal-periods.tsx` (249 LoC) — v1: قائمة شهرية + stats. JSDoc يقول "migrated in R.2 iter 2 to the unified template stack" — معاد تشكيله بصرياً ولكن لا يزال يستخدم endpoint `/finance/fiscal-periods` (read-only stats).
- `pages/finance/fiscal-periods-v2.tsx` (576 LoC) — full workflow: close, lock, reopen، endpoint `/finance/fiscal-periods-v2`.
- 11 صفحة أخرى تستهلك `/finance/fiscal-periods-v2` كمصدر بيانات.
- sidebar:291-292 يعرض كليهما بأسماء مختلفة ("الفترات المالية" + "إقفال الفترات") — مربك للمستخدم.

**Verdict:**
- v1 (`fiscal-periods.tsx`): **redirect** إلى `/finance/fiscal-periods-v2` أو **ادمج** stats كـ tab في v2.
- v2: **احتفظ** كـ canonical.
- ⚠️ commit `2de13d2f` (fiscal-periods-v2: adopt shared useDirtyGuard hook) و JSDoc:18-32 يشيران لمسار هجرة نشط — انتظر الإشارة قبل الحذف.

### 8.2 `umrah/import` (wizard, جديد) vs `umrah/import/legacy` (v1)
- `routes/umrahRoutes.tsx:78` — `/umrah/import/legacy` → `UmrahImport` (نسخة v1).
- `routes/umrahRoutes.tsx:91` — `/umrah/import` → `UmrahImportWizard` (نسخة الجديدة).
- sidebar-layout.tsx:465-466 يعرض كليهما (`استيراد البيانات` + `الاستيراد القديم`).

**Verdict:**
- `/umrah/import/legacy` + `pages/umrah/import.tsx`: **اخفِ من الإنتاج** (احذف entry "الاستيراد القديم" من sidebar) + **احذف بعد الهجرة** (احذف الملف والروت بعد تأكيد التبنّي).
- `/umrah/import` (wizard): **احتفظ** كـ canonical.

### 8.3 `admin/rbac-v2-*` tabs
- 5 ملفات تحت `pages/admin/`: `rbac-v2-tab.tsx`, `rbac-v2-users-tab.tsx`, `rbac-v2-sod-tab.tsx`, `rbac-v2-jit-tab.tsx`, `rbac-v2-conditions-editor.tsx`.
- لا يوجد `rbac-v1-tab.tsx` — الـ "v2" نسبة لـ RBAC الإصدار 2 (نظام صلاحيات جديد متكامل).
- جميعها imported من `pages/admin.tsx:14-17` كtabs داخلية.

**Verdict:** **احتفظ.** ليست v1/v2 ولكن إصدار من نظام صلاحيات. أعد التسمية من `rbac-v2-*` → `rbac-*` متى استقرّت RBAC v2 كـ canonical.

---

## 9. صفحات يجب إخفاؤها من الإنتاج (incomplete/demo/test)

| الصفحة | الموقع | السبب | Verdict |
| --- | --- | --- | --- |
| `/umrah/import/legacy` | sidebar:466, route:umrahRoutes.tsx:78 | v1 معروف، wizard استبدله | **اخفِ من الإنتاج** الآن، **احذف بعد الهجرة** |
| `/settings/print-templates` "visual" tab | settings/print-templates.tsx:10 (JSDoc يقول "coming soon") | feature غير مكتمل في v1 | **اخفِ من الإنتاج** الـ tab أو ضع feature flag |
| `pages/fleet/telematics/settings.tsx:266` Wialon disabled option | داخل Select | placeholder لـ vendor غير متاح | **احتفظ** (disabled لا يضر) أو احذف |

لا توجد صفحات `*-test.tsx` أو `*-demo.tsx` أو scaffolded stubs.

---

## 10. صفحات صغيرة تستحق الدمج (small wrappers)

| الملف | LoC | الوظيفة | Verdict |
| --- | --- | --- | --- |
| `pages/bi-dashboards.tsx` | 12 | wrapper بـ PageShell على `DashboardsTab` | **ادمج** مع نمط BiTabsNav الموحّد |
| `pages/bi-kpis.tsx` | 12 | wrapper على `KPIsTab` | **ادمج** |
| `pages/bi-reports.tsx` | 12 | wrapper على `ReportsTab` | **ادمج** |
| `pages/finance/customer-statement.tsx` | 10 | `<AccountStatementPage entityType="customer" />` | **احتفظ** (polymorphic wrapper موثّق) |
| `pages/finance/vendor-statement.tsx` | 10 | `<AccountStatementPage entityType="vendor" />` | **احتفظ** |
| `pages/finance/profitability-{vehicle,property,project,umrah-agent}.tsx` | 6-7 | `<ProfitabilityPage entityType=… />` | **احتفظ** (polymorphic wrapper موثّق) |

---

## 11. مكان خاطئ (location anti-pattern)

| الملف | المشكلة | Verdict |
| --- | --- | --- |
| `pages/bi/shared.tsx` | utility hooks (`useChartExport`, `TrendBadge`) داخل `pages/`. غير routed، مستورد من 2 tabs فقط. | **انقل** إلى `components/bi/shared.tsx` أو `lib/bi-shared.ts` |
| 13 ملف `pages/bi/*-tab.tsx` | sub-components — ليست pages | **انقل** إلى `components/bi/tabs/` |
| 16 ملف `pages/my-space/*-card.tsx` و `*-section.tsx` | sub-components تحت `my-space/` (مستوردة من `my-space.tsx`) | **انقل** إلى `components/my-space/` |
| 12 ملف `pages/admin/*-tab.tsx` | sub-components | **انقل** إلى `components/admin/tabs/` |
| 13 ملف `pages/settings/*-tab.tsx` | sub-components | **انقل** إلى `components/settings/tabs/` |
| 7 ملف `pages/governance/*-tab.tsx` | sub-components + `stats-cards.tsx` | **انقل** إلى `components/governance/` |

> ⚠️ هذا تنظيم هيكلي وليس dead-code — كلها فعّالة وtested. التوصية = تنظيف معماري.

---

## 12. التوصيات لكل عنصر (Arabic-first verdicts)

| الفئة | البند | Verdict |
| --- | --- | --- |
| Orphan files | لا يوجد | — |
| Orphan routes | لا يوجد بعد إقصاء `:id` و `/create` و `/edit` | — |
| Broken sidebar | لا يوجد | — |
| v1/v2 redirect candidate | `/finance/fiscal-periods` → v2 | **redirect** (بعد دمج stats كtab) |
| v1/v2 remove candidate | `/umrah/import/legacy` | **اخفِ من الإنتاج**، ثم **احذف بعد الهجرة** |
| Hub merge | `/bi/dashboards`, `/bi/kpis`, `/bi/reports` + Tabs في `/bi` | **ادمج**: TabsNav-as-router فقط، أو in-page Tabs فقط |
| HR pairs | `recruitment`, `training`, `performance`, `shifts`, `leaves` (advanced/management) | **ادمج** كـ tabs |
| Violations cluster | violations + management + auto-detection | **ادمج**؛ penalty-escalation يبقى منفصلاً |
| Polymorphic wrappers | finance statement + profitability sub-pages | **احتفظ** |
| Hub pages بدون API | finance-workflows-hub, zatca-reports-hub, tax-filing-calendar, services, properties-guide | **احتفظ** |
| Sub-components تحت `pages/` | bi tabs, my-space cards, admin tabs, settings tabs, governance tabs, bi/shared | **انقل** إلى `components/` (تنظيمي) |
| `/admin` لوحة بطاقات | display-only cards | **احتفظ + نظّف**: اجعل البطاقات روابط فعلية أو احذفها |
| `/umrah/settings` orphan-from-nav | routed ولكن لا يوجد رابط في sidebar/tabs | **احتفظ + أضِف** entry في UmrahTabsNav |
| Coming-soon tabs | print-templates visual tab | **اخفِ من الإنتاج** بـ feature flag |

---

## 13. حدود الفحص (Caveats)

- لم يتم تنفيذ الواجهة فعلياً — التحليل static-graph فقط.
- مسارات مبنيّة ديناميكياً (`navigate(\`/foo/${id}\`)`) قد تربط route سرّاً بطريقة لا يكتشفها grep — تحققت يدوياً من 100+ template literal، لم أجد orphan.
- صفحات لها feature flag (rate-limited via Permission/Guard) لا يمكن قياسها بدون runtime.
- التصنيف "صفحات بدون API" لا يتضمّن استدعاءات `fetch()` خام أو وسطاء آخرين خارج `@/lib/api` — تحققت يدوياً من الـ 8 المذكورة.

---

## ملخّص 5 أسطر (5-line summary)

1. **0 orphan files** — جميع 578 page tsx file إما routed أو imported من ملف آخر.
2. **0 orphan routes** و **0 broken sidebar entries** — بعد إقصاء `:id` و `/create`/`/edit` المسارات.
3. **6 مجموعات HR pair pattern** (recruitment, training, performance, shifts, leaves, violations) — analytics-only sister pages قابلة للدمج كـ tabs.
4. **2 v1/v2 pairs**: `fiscal-periods` (ادمج → redirect)، `umrah/import/legacy` (أوقف من الإنتاج، احذف بعد الهجرة).
5. **انحياز معماري واحد**: ~60 sub-component (tabs/cards/sections) موجودة تحت `pages/` بدلاً من `components/` — تنظيف هيكلي مُوصى به، ليس dead code.
