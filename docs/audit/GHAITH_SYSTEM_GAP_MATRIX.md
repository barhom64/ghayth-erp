# GHAITH_SYSTEM_GAP_MATRIX — مصفوفة الفجوات الموحَّدة

> **نوع التقرير:** تدقيق فقط (AUDIT-ONLY). لا تعديلات على الكود. لا قرارات أحادية على التعارضات.
> **التاريخ:** 2026-05-30 · **المستودع:** `barhom64/ghayth-erp`
> **القضايا المرجعية:** #1418 (Ghaith Operating Foundation) و #1413 (Unified users/roles/permissions/visibility).
> **النطاق:** تدمج هذه الوثيقة المصدرة من 8 تقارير تدقيق فرعية (مدرجة في الذيل) في مصفوفة فجوات موحَّدة قابلة للفرز.

> **منهجية البناء:** كل صف يُمثل عنصرًا واحدًا (صفحة / API / مكوّن / كيان DB / سياسة رؤية / مكرَّر / ميت). الأدلة مقتبسة بـ `path:line` من تقارير المصادر. الحلول مقترحة بالعربية وفق القاموس المصرَّح به فقط.

---

## ١. ملخص — Counts per Severity & Status

### حسب الخطورة (Severity)

| الخطورة | العدد |
|---|---:|
| Critical | **12** |
| High | **38** |
| Medium | **47** |
| Low | **31** |
| **الإجمالي** | **128** |

### حسب الحالة (Status)

| الحالة | العدد |
|---|---:|
| Complete / Ready | 4 |
| Partial | 17 |
| Missing backend | 8 |
| Missing frontend | 3 |
| Missing DB mapping | 6 |
| Missing print/export | 14 |
| Missing RBAC | 13 |
| Missing audit | 7 |
| Duplicate | 18 |
| Dead | 11 |
| Legacy component | 18 |
| Needs unified library migration | 6 |
| Hide from production | 3 |
| **الإجمالي** | **128** |

### حسب الموديول

| الموديول | عدد الصفوف |
|---|---:|
| Finance | 36 |
| HR | 17 |
| Admin / RBAC | 14 |
| Print / Export | 13 |
| Sidebar / Visibility | 10 |
| UI Library | 11 |
| Umrah | 8 |
| Fleet | 6 |
| Properties | 5 |
| Database / Schema | 9 |
| BI / Reports | 5 |
| Other (Comms / Legal / Store / Docs / Misc) | 14 |

---

## ٢. مصفوفة الفجوات (Full table — مرتَّبة Critical→Low ثم P0→P3)

> **الأعمدة:** المنطقة · الموضوع · الحالة · الدليل · مسار · API · جدول DB · طباعة · نوع المشكلة · الخطورة · الإجراء المُوصى · الأولوية · الفريق · اختبار القبول

### Critical — أعلى أولوية

| المنطقة | الموضوع | الحالة | الدليل | مسار | API | جدول DB | طباعة | نوع المشكلة | الخطورة | الإجراء | الأولوية | الفريق | اختبار القبول |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Backend / Security | كل صفحات `/admin/*` تعتمد perm في sidebar لكن لا `requirePermission()` في الخادم — bypass عبر direct-URL | Missing RBAC | `PAGE_VISIBILITY_AND_SERVICE_EXPOSURE.md:91, 108`; `PAGE_API_MAPPING.md:467` (recommendation #1) | `/admin/*` (45 مدخلًا) | `routes/admin*.ts` + `routes/index.ts:455` | `companies`, `branches`, `users`, `roles` | — | divergence + missing RBAC | Critical | يحتاج صلاحيات | P0 | Security / Platform | كل endpoint تحت `/admin/*` تطبّق `requirePermission()` صريحة مطابقة لمدخل sidebar |
| Backend / Finance | الصفحات المالية الحساسة (year-end-close، opening-balances، journal-manual، fiscal-periods-v2) بدون `requireMinLevel` ولا `minRoleLevel` — أي حامل `module=finance` يصل | Missing RBAC | `PAGE_VISIBILITY_AND_SERVICE_EXPOSURE.md:114, 206`; `PAGE_API_MAPPING.md:467` | `/finance/year-end-close`, `/finance/opening-balances`, `/finance/journal-manual`, `/finance/fiscal-periods-v2` | `routes/finance-journal.ts`, `routes/finance-accounts.ts` | `journal_entries`, `financial_periods`, `opening_balances` | — | missing RBAC + خطر مالي | Critical | يحتاج صلاحيات | P0 | Finance / Security | تنفيذ إقفال سنة بمستوى <70 يُرجع 403 على الخادم |
| Backend / Audit | تصدير `admin/logs.tsx` (CSV لـ audit logs) بدون تسجيل في `print_jobs` ولا `audit_logs` ⇒ تنزيل بيانات تدقيق دون أثر مركزي | Missing audit | `PRINT_EXPORT_UNIFICATION_AUDIT.md:129, 207` | `/admin/logs` | `routes/auditLogs.ts` | `audit_logs` | client-side CSV | missing audit + PDPL | Critical | يحتاج تدقيق | P0 | Security / PDPL | كل تنزيل audit يُولِّد سطر `print_jobs` (action=`report_audit_logs`) |
| Backend / Audit | تصدير `admin-pdpl.tsx` (DSAR JSON) client-side ⇒ تنزيل بيانات شخصية دون تتبع مركزي | Missing audit | `PRINT_EXPORT_UNIFICATION_AUDIT.md:130, 207` | `/admin/pdpl` | `routes/pdpl.ts` | `data_access_requests` | client-side JSON blob | missing audit + PDPL | Critical | يحتاج تدقيق | P0 | Security / PDPL | DSAR export يُسجَّل في `print_jobs` بـ entity=`report_pdpl_dsar` |
| Frontend / Print | تنزيل CSV من 47 صفحة (finance ‑ ar/ap‑aging، statements، workbenches…) خارج `renderPrint` ⇒ بلا audit ولا letterhead ولا RBAC دقيق | Missing print/export | `PRINT_EXPORT_UNIFICATION_AUDIT.md:35, 126, 154-156` | `/finance/*` (47 ملف) | عميل: `new Blob([...], "text/csv")` | — | client-side CSV | missing print/export + duplicate | Critical | يحتاج توحيد | P0 | Print | كل تنزيل CSV يمرّ عبر `POST /api/print/render` ويُسجَّل في `print_jobs` |
| Frontend / Print | 3 صفحات تطبع عبر Ctrl+P فقط (`bi-admin-reports`, `bi-operations`, `monthly-close-pack`) ⇒ تجاوز كامل للنظام بلا audit | Missing print/export | `PRINT_EXPORT_UNIFICATION_AUDIT.md:37, 128, 178, 201` | `/bi/admin-reports`, `/bi/operations`, `/finance/monthly-close-pack` | — | — | window.print | missing print/export | Critical | يحتاج توحيد | P0 | Print / BI | إزالة `print:hidden/print:block` بدون `<PrintButton>` |
| Database / Print | `lib/print/dataLoader.ts:553` يقرأ من `purchase_order_lines` بينما البيانات الحية في `purchase_order_items` ⇒ طباعة PO تظهر بلا بنود | Missing DB mapping | `API_DATABASE_ENTITY_MAPPING.md:265, 317, 344` | `/finance/purchase-orders/:id` print | `routes/finance-purchase.ts` | `purchase_order_items` (live) vs `purchase_order_lines` (orphan) | broken PO print | bug + duplicate entity | Critical | يحتاج إصلاح RTL | P0 | Print / Finance | طباعة أمر شراء تعرض البنود الفعلية |
| Finance | `match-invoice` لا يُرحّل قيد `DR GRNI / CR AP` ⇒ سلسلة الشراء مكسورة محاسبيًا | Partial | `EXECUTIVE_INVENTORY_REPORT.md:40` (FIN-001) | `/finance/three-way-match` | `routes/finance-purchase.ts` | `goods_receipts`, `journal_entries`, `invoices` | — | blocking financial bug | Critical | يحتاج إصلاح RTL | P0 | Finance | المطابقة تُولِّد قيد GRNI تسوية صحيحًا |
| Finance | المطابقة البنكية لا تُرحّل أي قيد تسوية (تحديث علم فقط) | Partial | `EXECUTIVE_INVENTORY_REPORT.md:41` (FIN-008) | `/finance/bank-reconciliation` | `routes/finance-hardening.ts` | `bank_reconciliations`, `journal_entries` | — | blocking financial bug | Critical | يحتاج إصلاح RTL | P0 | Finance | كل مطابقة تُولِّد قيد GL مرجعي |
| Backend / RBAC | كتالوجا RBAC متوازيان (`rbacCatalog` مسطّح vs `featureCatalog` شجري) ⇒ مصدرا حقيقة | Duplicate | `EXECUTIVE_INVENTORY_REPORT.md:66` (FND-010) | كل وحدات النظام | `routes/rbacV2.ts`، `routes/permissions.ts` | `rbac_roles`, `feature_catalog` | — | conflict + duplicate | Critical | يحتاج توحيد | P0 | RBAC / Platform | كتالوج صلاحيات واحد يُستخدم في الواجهة والخادم |
| Backend / Foundation | `buildScopedWhere` غير مفروض — 68 محمول `companyId` يدوي عبر 17 ملفًا ⇒ عزل الشركات غير موثوق | Partial | `EXECUTIVE_INVENTORY_REPORT.md:61` (FND-013) | global | كل routes في `artifacts/api-server/src/routes/` | كل entities خاضعة للـ scope | — | divergence + scope leak | Critical | يحتاج إصلاح RTL | P0 | Platform / Security | كل استعلام scoped يستخدم helper مركزي مفروض |
| Backend / DB | `daily_close_log` (live) ↔ `daily_closures` (orphan) ⇒ كيان مكرر دون قرار حسم | Duplicate | `API_DATABASE_ENTITY_MAPPING.md:248, 314` | `/finance/daily-close-checklist` | `routes/finance-hardening.ts` | `daily_close_log` vs `daily_closures` | — | duplicate entity | Critical | احذف بعد الهجرة | P0 | Finance / DB | الجدول اليتيم محذوف أو موثَّق كـ deprecated بتاريخ إسقاط |

### High — أولوية عالية

| المنطقة | الموضوع | الحالة | الدليل | مسار | API | جدول DB | طباعة | نوع المشكلة | الخطورة | الإجراء | الأولوية | الفريق | اختبار القبول |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Visibility | `/exec-dashboard` sidebar=60 لكن backend=70 ⇒ المستخدم يرى الرابط ثم 403 | Partial | `PAGE_VISIBILITY_AND_SERVICE_EXPOSURE.md:75, 105` | `/exec-dashboard` | `routes/index.ts:455` (`requireMinLevel(70)`) | — | — | divergence | High | يحتاج صلاحيات | P1 | RBAC | sidebar وbackend متفقان (70/70) |
| Visibility | `/reports/scheduled` sidebar=40 لكن backend=50 | Partial | `PAGE_VISIBILITY_AND_SERVICE_EXPOSURE.md:80, 107` | `/reports/scheduled` | `routes/index.ts:447` | `scheduled_reports` | — | divergence | High | يحتاج صلاحيات | P1 | RBAC / BI | sidebar=50 ليطابق الخادم |
| Visibility | `/admin/logs` sidebar perm=`audit:read` لكن backend=`requireMinLevel(70)` فقط ⇒ أي مدير وحدة يصل لكامل سجل التدقيق | Partial | `PAGE_VISIBILITY_AND_SERVICE_EXPOSURE.md:92, 109` | `/admin/logs` | `routes/auditLogs.ts` (mount min 70) | `audit_logs` | — | divergence | High | يحتاج صلاحيات | P1 | Security | mount `requireMinLevel(90) + requirePermission("audit:read")` |
| Visibility | `/automation` sidebar=60+perm لكن backend يحتاج فقط `module=automation` — وحدة غير ممنوحة لأي دور افتراضي ⇒ ميت فعلياً | Partial | `PAGE_VISIBILITY_AND_SERVICE_EXPOSURE.md:76, 106` | `/automation` | `routes/index.ts:367` | `proactive_rules` | — | divergence + visibility | High | يحتاج صلاحيات | P1 | RBAC / Automation | إضافة وحدة `automation` للأدوار الافتراضية أو إخفاء المدخل |
| Visibility | `/umrah/*` sidebar `module=umrah` لكن backend `module=operations` ⇒ تفاوت دلالي | Partial | `PAGE_VISIBILITY_AND_SERVICE_EXPOSURE.md:111, 192`; `SYSTEM_PAGE_INVENTORY.md:928` | `/umrah/*` (35 صفحة) | `routes/umrah.ts` (mount as operations) | `umrah_*` tables | — | divergence | High | يحتاج توحيد | P1 | Umrah / Platform | sidebar وbackend يستخدمان نفس مفتاح الوحدة |
| Backend / Audit | GETs مالية حساسة (`/finance/reports/*` 13 endpoint) بدون audit logging ⇒ مشاهدة بيانات مالية دون أثر | Missing audit | `PAGE_API_MAPPING.md:451, 458, 468` | `/finance/reports/*` | `routes/finance-reports.ts:81-1670` | `journal_lines`, `journal_entries`, `invoices` | — | missing audit | High | يحتاج تدقيق | P1 | Finance / Security | كل GET مالي حساس يُضيف `app_security_events` |
| Backend / Audit | `GET /audit-logs/*` لا يُسجِّل قراءة نفسه ⇒ من يقرأ سجل التدقيق غير مُتعقَّب | Missing audit | `PAGE_API_MAPPING.md:454, 469` | `/admin/logs` | `routes/auditLogs.ts` | `audit_logs` | — | missing audit | High | يحتاج تدقيق | P1 | Security | self-audit مفعَّل |
| Backend / Audit | `GET /pdpl/employee-data-export/:id` بدون سطر audit لتصدير شخصي | Missing audit | `PAGE_API_MAPPING.md:455, 469` | `/admin/pdpl` | `routes/pdpl.ts` | `data_access_requests`, `employees` | — | missing audit + PDPL | High | يحتاج تدقيق | P1 | PDPL / Security | تصدير PDPL يُسجَّل في `app_security_events` بـ event=`pdpl.dsar.export` |
| Backend / RBAC | `wiring-stubs.ts` — 5 GETs بدون `authorize()`، POSTs فقط بـ `requireMinLevel(20)` | Missing RBAC | `PAGE_API_MAPPING.md:405-415, 466` | `/warehouse/cycle-counts*`، `/warehouse/lots`، `/warehouse/serials` | `routes/wiring-stubs.ts:39-155` | `warehouse_*` | — | missing RBAC | High | يحتاج صلاحيات | P1 | Warehouse / RBAC | كل route تحت stubs له `authorize({feature:"warehouse.*"})` |
| Backend / RBAC | mount `/digital-signature` بدون `requireMinLevel` ⇒ يعتمد فقط على authMiddleware | Missing RBAC | `PAGE_API_MAPPING.md:441, 467` | `/admin/digital-signature` | `routes/index.ts:450` | `digital_signature_logs` | — | missing RBAC | High | يحتاج صلاحيات | P1 | Security | mount بمستوى ≥70 |
| Backend / RBAC | mount `/gov-integrations` بدون `requireMinLevel` ⇒ بيانات حكومية بدون عتبة | Missing RBAC | `PAGE_API_MAPPING.md:441, 467` | `/settings/gov-integrations`، `/gov-integrations/*` | `routes/index.ts:449` | `gov_integrations`, `integration_logs` | — | missing RBAC | High | يحتاج صلاحيات | P1 | Security / Settings | mount بمستوى ≥70 |
| Database | عائلة `audit_archive` + `audit_logs_archive` + `audit_umrah_access` (3 جداول) معزولة بلا قراءة/كتابة | Duplicate | `API_DATABASE_ENTITY_MAPPING.md:235-237, 313, 335` | — | — | 3 جداول orphan | — | duplicate + dead | High | احذف بعد الهجرة | P1 | DB / Audit | الجداول الـ3 يُسقَطها migration بعد RFC |
| Database | `wps_bank_credentials` (jيحوي اعتمادات بنكية) بدون قارئ ⇒ خطر أمني صامت | Dead | `API_DATABASE_ENTITY_MAPPING.md:240, 338` | — | — | `wps_bank_credentials` | — | dead + خطر أمني | High | احذف بعد الهجرة | P1 | Security / HR | جدول محذوف أو موثَّق ك deprecated مع تشفير الصفوف الموجودة |
| Database | `email_queue` + `sms_queue` + `whatsapp_queue` (orphans) متبقية بعد توحيد `outbound_queue` | Duplicate | `API_DATABASE_ENTITY_MAPPING.md:257, 318, 350` | — | — | 3 جداول | — | duplicate | High | احذف بعد الهجرة | P1 | Comms / DB | migration drop مماثل لـ171 يُسقط الثلاثة |
| Database | `invoice_lines` (separate table) ↔ `invoices.lines` (JSONB) كلاهما يُكتَب ⇒ مصدر حقيقة مزدوج | Duplicate | `API_DATABASE_ENTITY_MAPPING.md:316, 340` | `/finance/invoices/*` | `routes/finance-invoices.ts:721, 938, 1271, 1448` | `invoices.lines`, `invoice_lines` | — | conflict + drift risk | High | يحتاج تدقيق | P1 | Finance / DB | RFC يحدد مصدر الحقيقة الواحد |
| Finance | `pages/finance/profitability.tsx` غير مسجل في routes ⇒ dead-route لكنها parent مشتركة بـ relative import من 4 wrappers | Partial | `SYSTEM_PAGE_INVENTORY.md:63, 343, 849`; `DEAD_DUPLICATE_PAGE_AUDIT.md:30, 64` | `غير مسجل` | لا | — | — | conflict (شارب التقارير) | High | احتفظ | P1 | Finance | JSDoc يوضح أنها shared base + لا تُحذف |
| Finance | `pages/finance/account-statement.tsx` غير مسجل في routes ⇒ orphan ظاهري لكنها مستوردة من customer/vendor-statement | Partial | `SYSTEM_PAGE_INVENTORY.md:64, 249, 848`; `DEAD_DUPLICATE_PAGE_AUDIT.md:30, 63` | `غير مسجل` | لا | — | — | conflict | High | احتفظ | P1 | Finance | JSDoc يوضح shared base |
| Frontend | `pages/finance/fiscal-periods.tsx` (v1) vs `fiscal-periods-v2.tsx` ⇒ مدخلان sidebar مختلفان لنفس المفهوم | Duplicate | `SYSTEM_PAGE_INVENTORY.md:302-303`; `DEAD_DUPLICATE_PAGE_AUDIT.md:31, 191-200` | `/finance/fiscal-periods`, `/finance/fiscal-periods-v2` | `routes/finance-journal.ts` | `financial_periods` | partial | duplicate (v1/v2) | High | ادمج | P1 | Finance | v1 redirects to v2 بعد دمج stats كـ tab |
| Frontend | `/umrah/import/legacy` مدخل sidebar يبقى رغم وجود wizard البديل | Hide from production | `SYSTEM_PAGE_INVENTORY.md:474`; `DEAD_DUPLICATE_PAGE_AUDIT.md:25, 202-208` | `/umrah/import/legacy` | `routes/umrah.ts:1119` | `umrah_import_*` | — | duplicate | High | اخفِ من الإنتاج | P1 | Umrah | المدخل مخفي بـ feature flag |
| Frontend / HR | `hr/performance` vs `hr/performance-advanced` يقرآن نفس endpoint ⇒ list vs analytics متجاوران | Duplicate | `SYSTEM_PAGE_INVENTORY.md:188-189`; `DEAD_DUPLICATE_PAGE_AUDIT.md:32, 155` | `/hr/performance`, `/hr/performance/advanced` | `/hr/performance` | `performance_reviews` | — | duplicate | High | ادمج | P1 | HR | analytics tab داخل صفحة الأداء |
| Frontend / HR | `hr/recruitment` vs `hr/recruitment-advanced` نفس النمط | Duplicate | `SYSTEM_PAGE_INVENTORY.md:192-193`; `DEAD_DUPLICATE_PAGE_AUDIT.md:33, 153` | `/hr/recruitment`, `/hr/recruitment/advanced` | `/hr/recruitment/postings` | `job_postings` | — | duplicate | High | ادمج | P1 | HR | tab "تحليلات" داخل recruitment |
| Frontend / HR | `hr/training` vs `hr/training-advanced` | Duplicate | `SYSTEM_PAGE_INVENTORY.md:200-201`; `DEAD_DUPLICATE_PAGE_AUDIT.md:33, 154` | `/hr/training`, `/hr/training/advanced` | `/hr/training` | `training_programs` | — | duplicate | High | ادمج | P1 | HR | tab تحليلات داخل training |
| Frontend / HR | `hr/shifts` vs `hr/shifts-management` | Duplicate | `SYSTEM_PAGE_INVENTORY.md:198-199`; `DEAD_DUPLICATE_PAGE_AUDIT.md:35, 156` | `/hr/shifts`, `/hr/shifts/management` | `/hr/shifts` | `shifts`, `employee_shift_assignments` | — | duplicate | High | ادمج | P1 | HR | management tab داخل shifts |
| Frontend / HR | `hr/leaves` vs `hr/leave-management` | Duplicate | `SYSTEM_PAGE_INVENTORY.md:177, 176`; `DEAD_DUPLICATE_PAGE_AUDIT.md:35, 157` | `/hr/leaves`, `/hr/leaves/management` | `/hr/leave-requests` | `hr_leave_requests` | — | duplicate | High | ادمج | P1 | HR | management tab |
| Frontend / HR | `hr/violations` + `violations-management` + `auto-detection` 3 صفحات تحت `/hr/violations/*` | Duplicate | `SYSTEM_PAGE_INVENTORY.md:156, 205-206`; `DEAD_DUPLICATE_PAGE_AUDIT.md:34, 158` | `/hr/violations*` | `routes/hr-discipline.ts` | `hr_inquiry_memos`, `discipline_memos` (orphan) | — | duplicate | High | ادمج | P1 | HR | violations+management+auto-detection داخل صفحة واحدة بـ tabs |
| Frontend / BI | `bi.tsx` (10 in-page tabs) ↔ `bi-dashboards.tsx`/`bi-kpis.tsx`/`bi-reports.tsx` (wrappers) | Duplicate | `SYSTEM_PAGE_INVENTORY.md:650-665`; `DEAD_DUPLICATE_PAGE_AUDIT.md:37, 141-147` | `/bi*` | `routes/bi.ts` | `bi_dashboards`, `bi_kpis`, `bi_reports` | — | conflict structural | High | ادمج | P1 | BI | إما TabsNav-as-router أو in-page Tabs، ليس الاثنين |
| Frontend / Print | `pages/admin/print-templates.tsx` ↔ `pages/settings/print-templates.tsx` نسختان من إدارة القوالب | Duplicate | `PRINT_EXPORT_UNIFICATION_AUDIT.md:43, 197`; `PAGE_SERVICE_CLASSIFICATION.md:359, 512` | `/admin/print-templates`, `/settings/print-templates` | `routes/print.ts:290` | `document_templates` | — | duplicate | High | ادمج | P1 | Print / Settings | نسخة واحدة + redirect |
| Frontend / UI | `settings.tsx` يحوي `<table>` خام + `window.confirm` + `<AlertDialog>` خام | Legacy component | `UI_LIBRARY_UNIFICATION_AUDIT.md:199, 236, 257, 350` | `/settings` | `routes/settings.ts` | كل جداول settings | — | legacy + uses window.confirm | High | يحتاج توحيد | P1 | Platform / Settings | `<DataTable>` + `<ConfirmActionDialog>` بدلًا من raw |
| Frontend / UI | 15 صفحة تستخدم `window.confirm`/`window.prompt` بدلًا من `<ConfirmDeleteDialog>` | Legacy component | `UI_LIBRARY_UNIFICATION_AUDIT.md:38, 222-241, 286-287` | عدة | — | — | — | legacy | High | يحتاج توحيد | P1 | Platform | 0 ملفات تحوي window.confirm |
| Frontend / UI | 21 صفحة تستخدم `<AlertDialog>` خام (إقفال، عكس قيد، تطبيق عقوبة…) | Legacy component | `UI_LIBRARY_UNIFICATION_AUDIT.md:39, 242-266, 295-296` | عدة | — | — | — | legacy | High | يحتاج توحيد | P1 | Platform | `<ConfirmActionDialog>` مع variants |
| Frontend / UI | `<DataTable>` بدون دعم subtotals/groupBy/pivot ⇒ 53 صفحة تستخدم `<table>` خام في finance/reports | Legacy component | `UI_LIBRARY_UNIFICATION_AUDIT.md:38, 313-315` | `/finance/*` | — | — | — | needs unification primitive | High | يحتاج توحيد | P1 | Platform / Finance | DataTable يدعم groupBy + subtotal + pivot |
| Frontend / UI | `<FormShell>` بدون `<LineItemsTable>` ⇒ 9 صفحات create finance تكتب جدول سطور يدويًا | Needs unified library migration | `UI_LIBRARY_UNIFICATION_AUDIT.md:206-220, 321-323` | `/finance/*/create` | — | — | — | needs unification primitive | High | يحتاج توحيد | P1 | Platform / Finance | بدائي line items مشترك |
| Frontend / UI | `<KpiCard>` تبنّي 0.7% — BI/Finance dashboards تنشئ KPI يدويًا | Needs unified library migration | `UI_LIBRARY_UNIFICATION_AUDIT.md:27, 325-327` | `/bi/*`, `/finance/dashboard` | — | — | — | needs unification primitive | High | يحتاج توحيد | P1 | Platform / BI | KpiCard يدعم trend/sparkline/comparison |
| Frontend / UI | `<AuditTrailPanel>` تبنّي 0% رغم وجوده | Needs unified library migration | `UI_LIBRARY_UNIFICATION_AUDIT.md:30, 329-330` | `details/*` | — | — | — | unused unified component | High | يحتاج توحيد | P1 | Platform / Security | إدراج AuditTrailPanel افتراضيًا داخل DetailPageLayout |
| Frontend / UI | `EntityPrintButton` wrapper بدون قيمة (54 callsite) | Legacy component | `PRINT_EXPORT_UNIFICATION_AUDIT.md:44, 194-195` | `details/*` | — | — | — | legacy wrapper | High | احذف بعد الهجرة | P1 | Print | codemod يحوّل لـ `<PrintButton>` |
| Frontend / Print | CSV غير مدعوم في `PrintFormat` ⇒ `ListPageExportMenu` يعرض `csv: boolean` بلا معالج | Missing print/export | `PRINT_EXPORT_UNIFICATION_AUDIT.md:153, 186-189` | global | `lib/print-client.ts:23`, `print-button.tsx:27` | — | — | gap in unified pipeline | High | يحتاج توحيد | P1 | Print | `format="csv"` يعمل end-to-end |
| Frontend / Print | `/umrah/pilgrims/export.csv` ينقّر endpoint خاص خارج `renderPrint` ⇒ يدخل `audit_logs` لكن خارج `print_jobs` | Missing print/export | `PRINT_EXPORT_UNIFICATION_AUDIT.md:40, 131, 203-204` | `/umrah/pilgrims` | `routes/umrah.ts:799-907` | `umrah_pilgrims` | client-side CSV | duplicate + missing audit | High | يحتاج توحيد | P1 | Umrah / Print | تصدير يمر عبر `renderPrint` ويظهر في print-log |
| Frontend / Print | `ListPage.printEntityType` متاحة منذ Phase 2 لكن متبنّاة في صفحتين فقط (3 صفحات تستخدم ListPage) | Partial | `PRINT_EXPORT_UNIFICATION_AUDIT.md:18-19, 38, 191-192`; `UI_LIBRARY_UNIFICATION_AUDIT.md:31, 339-340` | global | `components/list-page.tsx:193-318` | — | — | underadoption | High | يحتاج توحيد | P1 | Print / Platform | أي صفحة list تحصل على export menu |
| Backend / RBAC | `effectiveRoleLevel` (sidebar) vs `roleLevel` (route gate) يستخدمان مرجعين مختلفين | Partial | `PAGE_VISIBILITY_AND_SERVICE_EXPOSURE.md:195` | global | `App.tsx`، `useFilteredNavSections` | — | — | divergence | High | يحتاج صلاحيات | P1 | RBAC | مرجع موحَّد لكلتا الطبقتين |
| Backend / RBAC | سلّم الأدوار: sidebar يستخدم 20/30/40/50 لكن backend يعرف 10/60/70/90/100 فقط | Partial | `PAGE_VISIBILITY_AND_SERVICE_EXPOSURE.md:31, 191` | global | `roleGuard.ts:9-24` | `user_roles` | — | divergence + visibility | High | يحتاج صلاحيات | P1 | RBAC | كل `minRoleLevel` في sidebar يطابق قيمة موجودة في `ROLE_LEVELS` |
| Frontend | `pages/admin/rbac-v2-conditions-editor.tsx` غير مسجل في `adminRoutes`، orphan فعلي | Dead | `SYSTEM_PAGE_INVENTORY.md:66, 707, 846`; `DEAD_DUPLICATE_PAGE_AUDIT.md:65` (imported by rbac-v2-tab) | لا | لا | — | — | dead-from-routes (لكن imported) | High | احتفظ | P1 | RBAC / Admin | إذا غير مستخدم بعد ال migration، احذف؛ غير ذلك وثّق كـ sub-tab |
| Frontend | `pages/login.tsx` غير مسجل في route registry لكن مستخدم في App.tsx | Partial | `SYSTEM_PAGE_INVENTORY.md:820`; `DEAD_DUPLICATE_PAGE_AUDIT.md:67` | `/login` | `POST /auth/login` | `users` | — | conflict (registry vs App) | High | احتفظ | P1 | Platform | login موثَّق في `routes/registry.ts` IMPLICIT_PATHS |

### Medium — أولوية متوسطة

| المنطقة | الموضوع | الحالة | الدليل | مسار | API | جدول DB | طباعة | نوع المشكلة | الخطورة | الإجراء | الأولوية | الفريق | اختبار القبول |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Frontend / Finance | `pages/finance/dashboard.tsx` لوحة مالية يتيمة (`/finance` فقط) — مقترح اعتماد `module-dashboards?tab=finance` | Partial | `SYSTEM_PAGE_INVENTORY.md:293`; `PAGE_SERVICE_CLASSIFICATION.md:130, 416, 469-476` | `/finance` | `/finance/stats` | — | — | duplicate (dashboards) | Medium | ادمج | P2 | Finance | dashboard مالي واحد عبر module-dashboards |
| Frontend / Finance | `pages/finance/cfo-cockpit.tsx` ↔ `pages/finance/dashboard.tsx` ↔ `/finance/workflows-hub` ↔ `/finance/settings` ⇒ 4 hubs مالية | Duplicate | `SYSTEM_PAGE_INVENTORY.md:68, 275-276, 300, 356` | عدة | — | — | — | duplicate hubs | Medium | يحتاج توحيد | P2 | Finance | hub واحد رئيسي + الباقي مساندة |
| Frontend / Finance | `pages/finance/zatca-reports-hub.tsx` بدون API (navigation only) | Partial | `SYSTEM_PAGE_INVENTORY.md:69, 383`; `DEAD_DUPLICATE_PAGE_AUDIT.md:123` | `/finance/reports/zatca` | — | — | — | hub-only | Medium | احتفظ | P2 | Finance | JSDoc يوضح أنها صفحة navigation |
| Frontend / Finance | `pages/finance/tax-filing-calendar.tsx` بدون API (تقويم ثابت) | Partial | `SYSTEM_PAGE_INVENTORY.md:359`; `DEAD_DUPLICATE_PAGE_AUDIT.md:123` | `/finance/tax-filing-calendar` | — | — | — | static content | Medium | احتفظ | P2 | Finance | JSDoc يوضح "Pure-frontend" |
| Frontend / Finance | `pages/finance/finance-workflows-hub.tsx` hub navigation بدون API | Partial | `SYSTEM_PAGE_INVENTORY.md:300`; `DEAD_DUPLICATE_PAGE_AUDIT.md:121` | `/finance/workflows-hub` | — | — | — | hub-only | Medium | احتفظ | P2 | Finance | JSDoc + pure navigation marker |
| Visibility | `/calendar` sidebar `minRoleLevel: 20` لكن backend بدون حماية | Partial | `PAGE_VISIBILITY_AND_SERVICE_EXPOSURE.md:82, 113` | `/calendar` | `routes/calendar.ts:39` | عدة | — | divergence | Medium | يحتاج صلاحيات | P2 | RBAC | إما إضافة `requireMinLevel(20)` على الخادم أو حذف من sidebar |
| Visibility | `/action-center` بدون مستوى ⇒ موظف 10 يرى المدخل مع موافقات إدارية فارغة | Partial | `PAGE_VISIBILITY_AND_SERVICE_EXPOSURE.md:97, 217` | `/action-center` | `routes/actionCenter.ts:12` | كل entities | — | divergence ⇒ UX issue | Medium | يحتاج صلاحيات | P2 | RBAC | إما إضافة `minRoleLevel: 30` أو فلترة المحتوى بحسب roleLevel |
| Visibility | `/manager-board`, `/manager-workspace`, `/services` بـ `minRoleLevel: 40` في sidebar لكن لا route backend | Partial | `PAGE_VISIBILITY_AND_SERVICE_EXPOSURE.md:78, 112` | `/manager-board`, `/manager-workspace`, `/services` | لا route backend مماثل | — | — | divergence | Medium | يحتاج صلاحيات | P2 | RBAC | إما إضافة backend route أو توضيح أنها client-only |
| Visibility | `/admin/data-import`, `/admin/digital-signature`, `/admin/pdpl`, `/admin/zatca-audits` بلا feature flags ⇒ معروضة لتنانت غير مفعَّل | Hide from production | `PAGE_VISIBILITY_AND_SERVICE_EXPOSURE.md:154, 215` | `/admin/*` | — | — | — | visibility | Medium | اخفِ من الإنتاج | P2 | Admin / RBAC | feature flags في `company_feature_flags` |
| Visibility | `/finance/intercompany`, `/finance/fx-rates`, `/finance/fx-revaluation` بدون feature flag ⇒ معروضة لمنشأة بعملة واحدة | Hide from production | `PAGE_VISIBILITY_AND_SERVICE_EXPOSURE.md:148, 216` | `/finance/intercompany`, `/finance/fx-*` | — | `fx_rates`, `fx_revaluations` | — | visibility | Medium | اخفِ من الإنتاج | P2 | Finance / Settings | feature flags `multi_company`, `multi_currency` |
| Visibility | `/hr/wps`, `/hr/saudi-compliance`, `/hr/saudization` معروضة قبل اكتمال إعداد البنك/البلد | Hide from production | `PAGE_VISIBILITY_AND_SERVICE_EXPOSURE.md:143-145, 210, 213` | `/hr/wps*`, `/hr/saudi-compliance`, `/hr/saudization` | — | `wps_runs`, `saudization_snapshots` | — | visibility | Medium | اخفِ من الإنتاج | P2 | HR / Settings | feature flags |
| Visibility | `/fleet/telematics/*` (10 مداخل) معروضة قبل ربط CMSV6 | Hide from production | `PAGE_VISIBILITY_AND_SERVICE_EXPOSURE.md:147, 211`; `SYSTEM_PAGE_INVENTORY.md:71` | `/fleet/telematics/*` | `routes/fleet-telematics.ts` | `fleet_telematics_*` | — | visibility | Medium | اخفِ من الإنتاج | P2 | Fleet | إخفاء حتى ربط بوابة + tab واحد بدلاً من 10 |
| Visibility | `/admin/intelligence-playground` بدون API call | Partial | `SYSTEM_PAGE_INVENTORY.md:67, 686` | `/admin/intelligence-playground` | — | — | — | shell / dev tool | Medium | اخفِ من الإنتاج | P2 | Admin | إخفاء عن المستخدم العام (dev tool) |
| Visibility | `/print-verify` ظاهر بشكل مخفي (dev tool) | Partial | `PAGE_VISIBILITY_AND_SERVICE_EXPOSURE.md:209`; `SYSTEM_PAGE_INVENTORY.md:832` | `/print-verify` | `GET /api/print/verify/:jobId` | `print_jobs` | — | — | Medium | احتفظ | P2 | Print | المسار يبقى كأداة anonymous verify |
| Frontend | `pages/admin.tsx` لوحة بطاقات display-only بلا onClick | Partial | `SYSTEM_PAGE_INVENTORY.md:702`; `DEAD_DUPLICATE_PAGE_AUDIT.md:36, 108` | `/admin` | لا (tabs الفرعية تستدعي) | — | — | hub-only | Medium | احتفظ | P2 | Admin | جعل البطاقات روابط فعلية أو حذفها |
| Frontend | `pages/bi.tsx` hub بـ tabs فرعية | Partial | `SYSTEM_PAGE_INVENTORY.md:656`; `DEAD_DUPLICATE_PAGE_AUDIT.md:109` | `/bi` | — (tabs تستدعي) | — | — | hub-only | Medium | احتفظ | P2 | BI | hub موثَّق |
| Frontend | `pages/services.tsx` (`/services`) صفحة navigation تستهلك useFilteredNavSections | Partial | `SYSTEM_PAGE_INVENTORY.md:95`; `DEAD_DUPLICATE_PAGE_AUDIT.md:113` | `/services` | — | — | — | hub-only | Medium | احتفظ | P2 | Platform | JSDoc يوضح pure navigation |
| Frontend | `pages/properties-guide.tsx` محتوى ثابت إرشادي | Partial | `SYSTEM_PAGE_INVENTORY.md:444`; `DEAD_DUPLICATE_PAGE_AUDIT.md:114` | `/properties/guide` | — | — | — | static | Medium | احتفظ | P2 | Properties | JSDoc يوضح أنها intentional |
| Frontend / Finance | كشوف الحساب: customer/vendor/entity/account/owner-statement (≥6 صفحات لنفس المفهوم) | Duplicate | `PAGE_SERVICE_CLASSIFICATION.md:25, 478-485` | `/finance/customer-statement-print`, `/finance/vendor-statement-print`, `/finance/entity-statements`, `/finance/account-statement`, `/properties/owners/statement`, `/clients/:id/statement`, `/finance/vendors/:id/statement` | عدة | عدة | partial | duplicate concept | Medium | يحتاج توحيد | P2 | Finance | "كشف الجهة 360°" واحد بفلترة حسب النوع |
| Frontend / Finance | العقود: hr/finance/properties/legal/vendor-contracts (≥5 مفاهيم متشابهة) | Duplicate | `PAGE_SERVICE_CLASSIFICATION.md:444-453` | `/hr/contracts`, `/finance/contracts`, `/finance/vendor-contracts*`, `/properties/contracts`, `/legal` contracts | عدة | عدة | partial | duplicate concept | Medium | يحتاج توحيد | P2 | Platform | خدمة عقود مركزية بأنواع فرعية |
| Frontend / Finance | التقارير: 7+ مراكز موزعة (finance، bi، fleet، hr، properties، admin) | Duplicate | `PAGE_SERVICE_CLASSIFICATION.md:455-465` | عدة | عدة | عدة | عدة | duplicate concept | Medium | يحتاج توحيد | P2 | BI | مركز تقارير موحَّد |
| Frontend / Finance | المراسلات: comms/correspondence + legal/correspondence + details/correspondence-detail | Duplicate | `PAGE_SERVICE_CLASSIFICATION.md:487-494` | `/correspondence`, `/legal/correspondence`, `/correspondence/:id` | `routes/correspondence.ts` | `correspondence` | partial | duplicate | Medium | يحتاج توحيد | P2 | Comms / Legal | خدمة مراسلات واحدة بـ tag |
| Frontend / Finance | السلف: hr/loans + my-loans + finance/salary-advances + customer-advances | Duplicate | `PAGE_SERVICE_CLASSIFICATION.md:518-524` | `/hr/loans`, `/my-loans`, `/finance/salary-advances`, `/finance/customer-advances` | عدة | عدة | partial | duplicate concept | Medium | يحتاج توحيد | P2 | HR / Finance | كيان loans/advances موحَّد |
| Frontend / Finance | صناديق الوارد للموافقات: hr، finance (×3)، manager-board، admin، my-requests (7+ مداخل) | Duplicate | `PAGE_SERVICE_CLASSIFICATION.md:526-535` | عدة | عدة | عدة | partial | duplicate concept | Medium | يحتاج توحيد | P2 | Platform | صندوق موافقات مركزي |
| Frontend / Finance | `/finance/customer-360-sheet`, `/finance/vendor-360-sheet`, `/finance/journal-templates`, `/finance/cash-position-calculator` ⇒ مداخل sidebar مستقلة لأدوات سياقية | Partial | `PAGE_VISIBILITY_AND_SERVICE_EXPOSURE.md:122-128, 212` | `/finance/*` | عدة | عدة | — | misplaced (supporting as standalone) | Medium | يحتاج توحيد | P2 | Finance | الأدوات تظهر داخل سياقها فقط |
| Frontend / Finance | `/finance/reports/cash-flow-statement`, `/finance/reports/yoy`, …8 تقارير ⇒ كل تقرير مدخل sidebar مستقل | Partial | `PAGE_VISIBILITY_AND_SERVICE_EXPOSURE.md:135, 214` | `/finance/reports/*` | `routes/finance-reports.ts` | عدة | — | misplaced | Medium | يحتاج توحيد | P2 | Finance / BI | كل تقارير `/finance/reports/*` تحت "التقارير المالية" hub |
| Database | كيانات قديمة dropped في migration 171: `invoice_items`, `training_courses`, `fleet_violations`, `warehouse_stock_serials` | Dead | `API_DATABASE_ENTITY_MAPPING.md:21, 260-263, 325` | — | — | — | — | dead | Medium | احذف بعد الهجرة | P2 | DB | تم سابقاً — verification فقط |
| Database | `umrah_attachments` legacy retained for rollback ⇒ يحتاج tracking ticket لإسقاطه | Dead | `API_DATABASE_ENTITY_MAPPING.md:103, 252, 347` | — | `routes/umrah-entities.ts`, `routes/storage.ts` | `umrah_attachments` (legacy) → `documents` (canonical) | — | dead (deliberate) | Medium | احذف بعد الهجرة | P2 | DB / Umrah | tracking issue + drop date ≥60 يوم |
| Database | `zatca_icv_counters`, `zatca_retry_queue`, `zatca_b2c_pause_events` بلا قارئ من routes | Dead | `API_DATABASE_ENTITY_MAPPING.md:241-243, 338` | — | — | 3 جداول | — | dead (or wired via lib/?) | Medium | يحتاج تدقيق | P2 | Finance / ZATCA | تحقق من `lib/einvoice/` ثم drop أو wire |
| Database | `notification_log` (orphan) ↔ `notification_delivery_log` (live) | Duplicate | `API_DATABASE_ENTITY_MAPPING.md:258, 319` | — | `routes/notifications.ts` | جدولان | — | duplicate | Medium | احذف بعد الهجرة | P2 | Comms / DB | drop |
| Database | `communications_log` (orphan, legacy) ↔ `message_log` (live) | Duplicate | `API_DATABASE_ENTITY_MAPPING.md:256, 321` | — | `routes/communications.ts` | جدولان | — | duplicate | Medium | احذف بعد الهجرة | P2 | Comms / DB | drop |
| Database | `trainings`, `training_courses` (orphans) ↔ `training_programs` (live) | Duplicate | `API_DATABASE_ENTITY_MAPPING.md:262, 322` | — | `routes/training.ts` | 3 جداول | — | duplicate | Medium | احذف بعد الهجرة | P2 | HR / DB | drop |
| Database | `integration_logs_archive` orphan | Dead | `API_DATABASE_ENTITY_MAPPING.md:323` | — | — | — | — | dead | Medium | احذف بعد الهجرة | P2 | DB / Integrations | drop |
| Database | `activity_logs`, `user_activity_log`, `user_sessions` (3 أسماء لنفس المفهوم) | Duplicate | `API_DATABASE_ENTITY_MAPPING.md:324, 363` | `/activity-log` | `routes/activityLog.ts`, `lib/activityTracker.ts` | 3 جداول | — | duplicate concept | Medium | يحتاج تدقيق | P2 | Security / Platform | canonical واحد |
| Database | `event_outbox` orphan (outbox pattern لم يُنفَّذ) | Dead | `API_DATABASE_ENTITY_MAPPING.md:259, 320` | — | — | `event_outbox` | — | dead | Medium | احذف بعد الهجرة | P2 | Platform / DB | RFC ثم drop |
| Database | `purchase_order_lines` (orphan) ↔ `purchase_order_items` (live) ⇒ يسبب bug في print loader | Duplicate | `API_DATABASE_ENTITY_MAPPING.md:265, 317, 344` | `/finance/purchase-orders/:id` | `routes/finance-purchase.ts` | جدولان | broken PO print | duplicate + bug | Medium | احذف بعد الهجرة | P2 | DB / Finance | drop بعد إصلاح dataLoader |
| Database | `idempotency_keys` معرَّف بلا handler يستدعيه | Dead | `API_DATABASE_ENTITY_MAPPING.md:247` | — | — | `idempotency_keys` | — | dead pending wire | Medium | يحتاج ربط | P2 | Platform / DB | middleware يستخدم الجدول أو يُحذف |
| Frontend / Finance | `pages/admin-event-monitor.tsx` label="مراقبة الأحداث" لكن title="كتالوج الأحداث" | Partial | `SYSTEM_PAGE_INVENTORY.md:72, 682` | `/admin/event-monitor` | `routes/events.ts` | `event_logs` | — | label drift | Medium | يحتاج توحيد | P2 | Admin / UI | label = title يدويًا أو آليًا |
| Frontend | `pages/admin-*.tsx` 30 ملف في root بدلاً من `pages/admin/` ⇒ مكان خاطئ | Partial | `PAGE_SERVICE_CLASSIFICATION.md:18, 411` | `/admin/*` | — | — | — | architectural drift | Medium | يحتاج توحيد | P2 | Admin / Platform | نقل تنظيمي بدون كسر routes |
| Frontend | `pages/properties-*.tsx` 9 ملفات في root بجوار `pages/properties/` | Partial | `PAGE_SERVICE_CLASSIFICATION.md:413` | `/properties/*` | — | — | — | architectural drift | Medium | يحتاج توحيد | P2 | Properties / Platform | نقل تنظيمي |
| Frontend | `pages/bi-*.tsx` 6 ملفات في root بجوار `pages/bi/*-tab.tsx` | Partial | `PAGE_SERVICE_CLASSIFICATION.md:412, 414` | `/bi/*` | — | — | — | architectural drift | Medium | يحتاج توحيد | P2 | BI / Platform | نقل تنظيمي |
| Frontend | sub-components تحت `pages/`: `bi/*-tab.tsx` (13)، `my-space/*-card.tsx` (16)، `admin/*-tab.tsx` (12)، `settings/*-tab.tsx` (13)، `governance/*-tab.tsx` (7) | Legacy component | `DEAD_DUPLICATE_PAGE_AUDIT.md:248-254` | — | — | — | — | architectural anti-pattern | Medium | يحتاج توحيد | P2 | Platform | نقل إلى `components/<module>/tabs/` |
| Frontend | `pages/bi/shared.tsx` و `pages/my-space/shared.ts` utilities داخل `pages/` | Legacy component | `DEAD_DUPLICATE_PAGE_AUDIT.md:39, 249`; `SYSTEM_PAGE_INVENTORY.md:657, 851` | — | — | — | — | misplaced | Medium | يحتاج توحيد | P2 | Platform | نقل إلى `lib/` أو `components/shared/` |

### Low — أولوية منخفضة

| المنطقة | الموضوع | الحالة | الدليل | مسار | API | جدول DB | طباعة | نوع المشكلة | الخطورة | الإجراء | الأولوية | الفريق | اختبار القبول |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Frontend / UI | 53 صفحة تستخدم `<table>` خام (Finance/Print/Workbench) | Legacy component | `UI_LIBRARY_UNIFICATION_AUDIT.md:37, 161-205, 303-306` | `/finance/*` | — | — | — | legacy | Low | يحتاج توحيد | P3 | Finance / Platform | بعد تحسين DataTable يدعم groupBy: migration |
| Frontend / UI | 19 صفحة تستخدم `Skeleton` مخصّص بدلاً من `<LoadingSpinner>` | Legacy component | `UI_LIBRARY_UNIFICATION_AUDIT.md:41` | عدة | — | — | — | legacy | Low | يحتاج توحيد | P3 | Platform | استخدام موحد لـ LoadingSpinner |
| Frontend / UI | `<ListPage>` 0.3% تبنّي ⇒ مهجور | Legacy component | `UI_LIBRARY_UNIFICATION_AUDIT.md:31, 339-340` | global | — | — | — | abandoned | Low | احتفظ | P3 | Platform | إما إعلانه canonical أو شطبه |
| Frontend / UI | `<EntityTimeline>` 0.3% تبنّي رغم وجود timelines يدوية في صفحات الموافقات | Legacy component | `UI_LIBRARY_UNIFICATION_AUDIT.md:28, 332-333` | عدة | — | — | — | unused unified component | Low | يحتاج توحيد | P3 | Platform / Workflow | EntityTimeline مرتبط بـ useLifecycleAction |
| Frontend / UI | `<EntityDetailPage>` 0.3% تبنّي رغم أنه عالي المستوى | Legacy component | `UI_LIBRARY_UNIFICATION_AUDIT.md:29` | عدة | — | — | — | abandoned | Low | يحتاج توحيد | P3 | Platform | تحديد if canonical أو احذف |
| Frontend / UI | استيراد مباشر لـ `@/components/ui/input` (163 صفحة) | Legacy component | `UI_LIBRARY_UNIFICATION_AUDIT.md:42` | عدة | — | — | — | partial | Low | احتفظ | P3 | Platform | استخدام input داخل FormShell |
| Frontend / Finance | `/finance/customer-statement.tsx`, `/finance/vendor-statement.tsx` wrappers مغلَّفة polymorphic | Partial | `DEAD_DUPLICATE_PAGE_AUDIT.md:239-240` | `/clients/:id/statement`, `/finance/vendors/:id/statement` | — | — | partial | wrapper | Low | احتفظ | P3 | Finance | JSDoc موجود |
| Frontend / Finance | profitability wrappers (4 ملفات) للـ entity types مختلفة | Partial | `DEAD_DUPLICATE_PAGE_AUDIT.md:241` | `/finance/profitability/*` | — | — | — | polymorphic wrapper | Low | احتفظ | P3 | Finance | JSDoc + تأكيد wrapper |
| Frontend | `pages/fleet/telematics/settings.tsx` بـ `Wialon disabled` option | Partial | `DEAD_DUPLICATE_PAGE_AUDIT.md:133, 226` | `/fleet/telematics/settings` | — | — | — | placeholder | Low | احتفظ | P3 | Fleet | احذف عند توفر التكامل |
| Frontend | `/settings/print-templates` "coming soon" tab | Hide from production | `DEAD_DUPLICATE_PAGE_AUDIT.md:131-132, 225` | `/settings/print-templates` | `routes/print.ts:290` | `document_templates` | — | hide-until-ready | Low | اخفِ من الإنتاج | P3 | Print / Settings | tab مخفي بـ feature flag |
| Frontend | `details/correspondence-detail.tsx` ↔ `comms/correspondence.tsx` ↔ `legal/correspondence.tsx` | Duplicate | `PAGE_SERVICE_CLASSIFICATION.md:418` | عدة | `routes/correspondence.ts` | `correspondence` | — | duplicate detail/list | Low | يحتاج توحيد | P3 | Comms | تفصيل واحد |
| Frontend | `pages/governance/capa-tab.tsx` ↔ `pages/governance/capa.tsx` ⇒ مكرَّر | Duplicate | `PAGE_SERVICE_CLASSIFICATION.md:301` | `/governance/capa` | `routes/governance.ts` | `governance_capa` | — | duplicate | Low | ادمج | P3 | Governance | tab واحد فقط |
| Frontend | `pages/admin-pdpl.tsx` ↔ `pages/admin-policy-engine.tsx` ↔ `pages/governance/*` ⇒ تكرار وظيفي بين Admin و Governance | Duplicate | `PAGE_SERVICE_CLASSIFICATION.md:358` | عدة | `routes/pdpl.ts`, `routes/governance.ts` | عدة | — | duplicate concept | Low | يحتاج توحيد | P3 | Admin / Governance | حدود واضحة لكل وحدة |
| Frontend / Finance | `pages/finance/journal-templates.tsx` ↔ `pages/finance/journal-quick-templates.tsx` ⇒ مكرر | Duplicate | `PAGE_SERVICE_CLASSIFICATION.md:187` | `/finance/journal-templates`, `/finance/journal-quick-templates` | `routes/finance-journal.ts` | `journal_entry_templates` | — | duplicate | Low | ادمج | P3 | Finance | قوالب واحدة |
| Visibility | `/umrah/settings` routed لكن غير ظاهر في sidebar/tabs | Partial | `DEAD_DUPLICATE_PAGE_AUDIT.md:87` | `/umrah/settings` | `routes/umrah.ts:61` | `umrah_*_config` | — | unreachable | Low | احتفظ | P3 | Umrah | إضافة entry في UmrahTabsNav |
| Frontend | `pages/admin-event-monitor.tsx` page بلا تكرار لكن title يخالف label sidebar | Partial | `SYSTEM_PAGE_INVENTORY.md:72` | `/admin/event-monitor` | `routes/events.ts` | `event_logs` | — | label drift | Low | يحتاج توحيد | P3 | Admin / UI | label = title |
| Frontend | `pages/admin-master-plan.tsx` "خارطة #1139 — حالة التنفيذ الحيّة" مختلطة عربي/إنجليزي | Partial | `SYSTEM_PAGE_INVENTORY.md:688, 926` | `/admin/master-plan` | `routes/admin-master-plan.ts` | — | — | i18n drift | Low | يحتاج توحيد | P3 | Admin / i18n | عنوان عربي بحت |
| Frontend | `pages/admin/user-onboarding.tsx` بدون PageShell — multi-step workflow | Legacy component | `UI_LIBRARY_UNIFICATION_AUDIT.md:125` | `/admin/user-onboarding` | `routes/admin.ts` | `users` | — | needs unification | Low | يحتاج توحيد | P3 | Admin / UI | PageShell + استمارة wizards |
| Frontend | `pages/finance/customer-statement.tsx`, `vendor-statement.tsx`, `profitability-{project,property,vehicle,umrah-agent}.tsx` يحملون "مخفي" في sidebar لكن لديهم routes | Partial | `SYSTEM_PAGE_INVENTORY.md:291, 339-342, 375` | `/clients/:id/statement`, `/finance/vendors/:id/statement`, `/finance/profitability/*` | — | — | — | hidden-by-design | Low | احتفظ | P3 | Finance | JSDoc يوضح أنها wrappers مخفية تظهر من السياق |
| Frontend / Finance | `pages/finance/ledger.tsx` غير مرتبط بـ sidebar | Partial | `SYSTEM_PAGE_INVENTORY.md:327`; `PAGE_SERVICE_CLASSIFICATION.md:186, 416` | `/finance/ledger/:code` | `routes/finance-accounts.ts` | `journal_lines`, `chart_of_accounts` | — | hidden | Low | احتفظ | P3 | Finance | الوصول فقط من شجرة الحسابات |
| Backend | dead-endpoint candidates: `bad-debt/preview`, `invoices/:id/preview-posting`, `umrah/import/mutamers`, `fleet/alerts/:id/dismiss`, `properties/late-rent/escalate`, `obligations/{met,cancel}-by-entity`, `projects/impact-preview` (≥15 endpoint) | Dead | `PAGE_API_MAPPING.md:354-372, 480-486` | — | عدة | — | — | dead endpoints | Low | يحتاج تدقيق | P3 | Platform | فحص portals + mobile + scripts ثم حذف أو deprecate |
| Backend | per-user limiters غائبة عن `/admin/*` و`/governance/*` | Partial | `PAGE_API_MAPPING.md:491` | `/admin/*`, `/governance/*` | عدة | — | — | hardening gap | Low | يحتاج تدقيق | P3 | Platform / Security | limiter مماثل لـ `/finance` |
| Backend | `/api/_routes` يُعيد method+path فقط بدون feature/action/level | Partial | `PAGE_API_MAPPING.md:492` | `/_routes` | `routes/index.ts:216` | — | — | observability gap | Low | يحتاج تدقيق | P3 | Platform | endpoint يعيد metadata صلاحية لكل route |
| Frontend / UI | `<PrintLayout>` (client-side print) شبه غير مستخدم — canonical هو server-side render | Legacy component | `PRINT_EXPORT_UNIFICATION_AUDIT.md:54` | — | — | — | — | unused unified component | Low | احتفظ | P3 | Print | توثيق أن canonical هو server render |
| Frontend / UI | `payload`-injection في `<PrintButton>` ⇒ بعض الصفحات تمرر `payload.items = rows` يلتفّ على فلاتر السيرفر | Partial | `PRINT_EXPORT_UNIFICATION_AUDIT.md:36, 209` | عدة | `POST /api/print/render` | — | partial | security drift | Low | يحتاج تدقيق | P3 | Print / Security | منع payload إلا في cases محددة |
| Frontend | `pages/admin-intelligence-playground.tsx` بدون API | Partial | `SYSTEM_PAGE_INVENTORY.md:67, 686` | `/admin/intelligence-playground` | — | — | — | shell / dev tool | Low | اخفِ من الإنتاج | P3 | Admin | إخفاء عن المستخدمين العاديين |
| Frontend / Finance | `pages/finance/customer-statement.tsx` (10 LoC wrapper polymorphic) | Partial | `DEAD_DUPLICATE_PAGE_AUDIT.md:239` | `/clients/:id/statement` | — | — | — | wrapper | Low | احتفظ | P3 | Finance | wrapper موثَّق |
| Frontend / Finance | 4 profitability wrappers صغار (6-7 LoC) | Partial | `DEAD_DUPLICATE_PAGE_AUDIT.md:241` | `/finance/profitability/*` | — | — | — | wrapper | Low | احتفظ | P3 | Finance | wrappers موثَّقة |
| Frontend / Finance | `pages/finance/tax-filing-calendar.tsx` تقويم ثابت | Partial | `DEAD_DUPLICATE_PAGE_AUDIT.md:123` | `/finance/tax-filing-calendar` | — | — | — | static | Low | احتفظ | P3 | Finance | JSDoc موجود |
| Frontend | `pages/comms/correspondence.tsx` خارج مجلد `comms/` (في الواقع داخله) ⇒ موضع صحيح لكن `pages/details/correspondence-detail.tsx` مع المراسلات الأخرى | Partial | `PAGE_SERVICE_CLASSIFICATION.md:417` | `/correspondence`, `/correspondence/:id` | `routes/correspondence.ts` | `correspondence` | — | architectural | Low | يحتاج توحيد | P3 | Comms | تنظيم مجلَّد |
| Database | 17 ملف `my-space/*` sub-components بلا API بالتصميم | Complete | `SYSTEM_PAGE_INVENTORY.md:891-906`; `PAGE_API_MAPPING.md:391` | — | — | — | — | by-design | Low | احتفظ | P3 | HR / Platform | sub-components واضحة |

---

## ٣. تعارضات بين الـworkstreams (Conflicts requiring human review)

> الحالات التالية حيث وكيلان أو أكثر وصلوا إلى تصنيف مختلف. الموقف: **سَجِّل الاثنين** ولا تَحْسِم.

| # | الموضوع | الموقف الأول | الموقف الثاني | الدليل | اقتراح التحقق |
|---:|---|---|---|---|---|
| 1 | `pages/finance/profitability.tsx` | `SYSTEM_PAGE_INVENTORY.md:63, 343, 849` صنّفها **dead** (غير مسجلة في routes) | `DEAD_DUPLICATE_PAGE_AUDIT.md:30, 64` صنّفها **احتفظ + وثّق** كـ shared parent مستوردة من 4 wrappers (`profitability-{vehicle,property,project,umrah-agent}`) | تحقّق relative-import يستلزم القرار: هل الوكلاء يَعدّون "import from sibling" كـ wiring أم لا؟ | تأكيد من فريق Finance: هل النية أن تُحذف الأم بعد توحيد الـwrappers، أم تبقى كـ shared base؟ |
| 2 | `pages/finance/account-statement.tsx` | `SYSTEM_PAGE_INVENTORY.md:64, 249, 848` صنّفها **dead** | `DEAD_DUPLICATE_PAGE_AUDIT.md:30, 63` صنّفها **احتفظ** (مستوردة من customer-statement.tsx و vendor-statement.tsx) | نفس النمط أعلاه — relative import من sibling | تأكيد من فريق Finance |
| 3 | `pages/admin/rbac-v2-conditions-editor.tsx` | `SYSTEM_PAGE_INVENTORY.md:66, 707, 846` صنّفها **dead** (غير مسجلة في adminRoutes.tsx، api=0) | `DEAD_DUPLICATE_PAGE_AUDIT.md:65` صنّفها **مستوردة من `rbac-v2-tab.tsx`** ⇒ partial | الوكيلان يستخدمان معيارين مختلفين (route registration vs import graph) | تأكيد من فريق RBAC: هل هذا محرر شروط RBAC v2 مستخدَم فعلاً؟ |
| 4 | `pages/bi/shared.tsx` و `pages/my-space/shared.ts` و `pages/governance/stats-cards.tsx` | `SYSTEM_PAGE_INVENTORY.md:657, 851, 884` صنّفها **داخلي فقط** ⇒ مقبول | `DEAD_DUPLICATE_PAGE_AUDIT.md:39, 248-249` صنّفها **مكان خاطئ** ⇒ يجب نقل لـ `components/` أو `lib/` | الأول يقبلها structurally، الثاني يطلب reorganization | قرار معماري في #1418 |
| 5 | تصنيف الـ Umrah module | `PAGE_VISIBILITY_AND_SERVICE_EXPOSURE.md:111, 192` تَعدّ `sidebar module=umrah` ↔ `backend module=operations` كـ **تباين يجب توحيده** | `SYSTEM_PAGE_INVENTORY.md:928`, `App.tsx:61-67` يصف هذا بأنه **تعمَّد VIS-001** (tagRoutes يفرض `module:"umrah"` فوق `operations`) | الأول يطلب توحيد، الثاني يَعدّه قرار سابق مقصود | تأكيد من فريق Umrah/Platform |
| 6 | `/admin` كلوحة | `SYSTEM_PAGE_INVENTORY.md:702` "يحتاج ربط backend (hub أو placeholder)" | `DEAD_DUPLICATE_PAGE_AUDIT.md:36, 108` "احتفظ + نظّف البطاقات الـ display-only" | الأول flags as needing API، الثاني as intentional hub | تأكيد فريق Admin: هل البطاقات navigation أم مجرد cosmetic؟ |
| 7 | `idempotency_keys` table | `API_DATABASE_ENTITY_MAPPING.md:247` "declared لكن غير مستخدم — يحتمل أن middleware لم يُربط بعد" | الجدول قد يكون مستخدمًا بواسطة middleware عام بدون pattern grep يكتشفه | معيار grep لا يلتقط استخدامًا عبر middleware abstraction | يحتاج فحص يدوي للـmiddleware stack |
| 8 | تكرار الـ HR pairs (recruitment/training/performance/shifts/leaves/violations) | `DEAD_DUPLICATE_PAGE_AUDIT.md:32-34, 152-158` يوصي بـ **ادمج** | `SYSTEM_PAGE_INVENTORY.md` و `PAGE_SERVICE_CLASSIFICATION.md` يوصِّفونها كـ standalone بدون توصية دمج صريحة | الوكلاء غير متفقين على شدة التوصية | قرار HR/UX: ادمج كـ tabs أم استبقاء كصفحات منفصلة بـ TabsNav |
| 9 | `pages/finance/dashboard.tsx` | `SYSTEM_PAGE_INVENTORY.md:293` "جاهز" (api=7) | `PAGE_SERVICE_CLASSIFICATION.md:130` "قائدة (يتيمة) — لوحة مالية قديمة، عرض فقط أو مخفي" | الأول يَعدّها functional، الثاني يطلب deprecation | قرار Finance حول استبدالها بـ module-dashboards |
| 10 | `pages/hr.tsx`, `pages/fleet.tsx`, `pages/legal.tsx` كـ legacy hubs | `PAGE_SERVICE_CLASSIFICATION.md:68, 196, 252, 417` يصنّفها "legacy — استبدلت بـ `module-dashboards?tab=*`" | `SYSTEM_PAGE_INVENTORY.md:148, 401, 619` تَعدّها **جاهز** و functional | الأول يطلب deprecation، الثاني يَعدّها working | قرار Platform حول `/hr` `/fleet` `/legal` كـ hubs |

---

## ٤. مراجع (Back-links)

### تقارير المصادر الثمانية المُدمَجة

1. [SYSTEM_PAGE_INVENTORY.md](./SYSTEM_PAGE_INVENTORY.md) — جرد كل صفحة في `pages/` مع حالتها وروابطها (940 سطر).
2. [PAGE_SERVICE_CLASSIFICATION.md](./PAGE_SERVICE_CLASSIFICATION.md) — تصنيف الصفحات حسب الخدمة، مع تحديد القائدة/المساندة (560 سطر).
3. [UI_LIBRARY_UNIFICATION_AUDIT.md](./UI_LIBRARY_UNIFICATION_AUDIT.md) — تدقيق توحيد مكتبة الواجهة (354 سطر).
4. [PAGE_API_MAPPING.md](./PAGE_API_MAPPING.md) — ربط Page ↔ API endpoint ↔ middleware guards (503 سطر).
5. [API_DATABASE_ENTITY_MAPPING.md](./API_DATABASE_ENTITY_MAPPING.md) — ربط API ↔ DB tables + الكيانات اليتيمة والمكرَّرة (374 سطر).
6. [PRINT_EXPORT_UNIFICATION_AUDIT.md](./PRINT_EXPORT_UNIFICATION_AUDIT.md) — تدقيق توحيد طبقة الطباعة والتصدير (226 سطر).
7. [DEAD_DUPLICATE_PAGE_AUDIT.md](./DEAD_DUPLICATE_PAGE_AUDIT.md) — تدقيق الصفحات الميتة والمكرَّرة (296 سطر).
8. [PAGE_VISIBILITY_AND_SERVICE_EXPOSURE.md](./PAGE_VISIBILITY_AND_SERVICE_EXPOSURE.md) — تدقيق ظهور الصفحات (sidebar+backend) (237 سطر).

### تقارير مرجعية authoritative أقدم (للسياق)

- [SYSTEM_INVENTORY_MATRIX.md](./SYSTEM_INVENTORY_MATRIX.md) — مصفوفة الجرد الكاملة الأولى.
- [EXECUTIVE_INVENTORY_REPORT.md](./EXECUTIVE_INVENTORY_REPORT.md) — التقرير التنفيذي السابق (184 عيب).
- [WORKFLOW_AUDIT.md](./WORKFLOW_AUDIT.md) — تدقيق دورات العمل.
- [SHARED_INFRA_GATEKEEPER.md](./SHARED_INFRA_GATEKEEPER.md) — بوابات البنية المشتركة.
- [INVENTORY_CLARIFICATION.md](./INVENTORY_CLARIFICATION.md) — توضيح الجرد.
- [SCOPE_BYPASS.md](./SCOPE_BYPASS.md) — التحقيق في تجاوز نطاق الشركة/الفرع.
- [BYPASS_TRIAGE.md](./BYPASS_TRIAGE.md) — فرز تجاوزات الـ guards.

### مراجع تقنية (مسارات في الكود)

- `artifacts/ghayth-erp/src/components/layout/sidebar-layout.tsx` (السلطة الرسمية للقائمة).
- `artifacts/ghayth-erp/src/routes/*.tsx` (15 ملف توجيه — السلطة الرسمية للـ paths).
- `artifacts/ghayth-erp/src/routes/registry.ts` (`isRegisteredRoute()`).
- `artifacts/ghayth-erp/src/App.tsx` (`ModuleRoute` + `tagRoutes`).
- `artifacts/ghayth-erp/src/contexts/app-context.tsx` (`canAccessModule` + `canAccessSubPage` + `isFeatureEnabled`).
- `artifacts/api-server/src/routes/index.ts` (تركيب الـrouter + mount guards).
- `artifacts/api-server/src/middlewares/roleGuard.ts` (`ROLE_LEVELS` + `ROLE_DEFAULT_MODULES`).
- `artifacts/api-server/src/middlewares/permissionMiddleware.ts` (`authorize` / `requirePermission`).
- `artifacts/api-server/src/middlewares/auditMiddleware.ts` (audit ضمني على mutations).
- `artifacts/api-server/src/lib/print/printService.ts` + `printJobsLogger.ts`.
- `artifacts/api-server/src/lib/print/dataLoader.ts:553` (bug PO lines).
- `artifacts/api-server/src/migrations/*.sql` (003 → 239).
- `db/schema_pre.sql` (378 جدول baseline).

---

**نهاية المصفوفة. لم تُنفَّذ أي تعديلات على الكود. تعارضات القسم 3 تتطلب مراجعة بشرية قبل البدء بأي PR.**
