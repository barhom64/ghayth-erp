# تدقيق توحيد الطباعة والتصدير — Print & Export Unification Audit

**النطاق:** كل صفحة في `artifacts/ghayth-erp/src/pages/` تُصدر إخراجاً مرئياً (طباعة / PDF / Excel / CSV / بريد).
**النوع:** تدقيق فقط (Audit-only). لم يتم تعديل أي كود.
**التاريخ:** 2026-05-30
**السياق:** Deep Sweep #1418 + #1413 — تقييم مدى تبنّي *Print Engine v2*.

---

## ١. ملخص — Executive Summary

| المؤشّر | القيمة | الدليل |
|---|---:|---|
| إجمالي ملفّات الصفحات `*.tsx` تحت `pages/` | **578** | `find … -name "*.tsx" \| wc -l` |
| صفحات تستخدم `PrintButton` أو `EntityPrintButton` (النظام الموحَّد) | **131** | `grep -rln "EntityPrintButton\|PrintButton"` |
| صفحات في `pages/details/` تستخدم النظام الموحَّد | **54 / 54** (100%) | كل ملف في `pages/details/` يستورد `PrintButton`/`EntityPrintButton` |
| صفحات تمرّر `printEntityType=` إلى `ListPage` (Phase 2 export menu) | **2** | `finance/fiscal-periods-v2.tsx:151`, `finance/journal-manual.tsx:174` |
| إجمالي صفحات تستخدم `ListPage` (نقطة الاندماج المتاحة) | **3** فقط | `hr/application-list.tsx`، أعلاه |
| صفحات تستخدم `ExportButton`/`MultiExportButton` (تمرّ عبر `/api/export/*` ⇒ proxy ⇒ `renderPrint`) | **6** | hr/attendance, hr/payroll, fleet/reports, finance/reports (×3), payroll-detail (تعليق فقط) |
| صفحات بنّاء CSV ذاتي عميل-جانب (`new Blob([...], { type: "text/csv" })`) | **47** | في الغالب صفحات finance reports — تُكمَّل بـ `PrintButton` للـ PDF لكن CSV يظلّ خارج خط الـ audit |
| صفحات بـ `print:hidden`/`print:block` لكن بدون `PrintButton` (تعتمد على Ctrl+P) | **3** | `bi-admin-reports.tsx`, `bi-operations.tsx`, `finance/monthly-close-pack.tsx` |
| صفحات بـ `window.print()` مباشر (تجاوز النظام الموحَّد) | **0** | المرجع الوحيد في `print-button.tsx:169` تعليق توثيقي |
| استخدام مكتبات PDF/Excel client-side (jspdf / pdfmake / html2canvas / xlsx-write / exceljs export) | **0** | اللينت `direct-pdf-generation` ينفّذ ذلك؛ `excel-import.ts` يقرأ فقط للـ Umrah imports |
| نقاط النهاية المسلكة (`/export/excel/*` & `/export/pdf/*`) — تمرّ عبر `renderPrint`؟ | **نعم** | `artifacts/api-server/src/routes/export.ts:43-70` (`proxyReport`) |
| إجمالي قوالب JSON منشورة | **35** قالب AR | `templates/{admin,finance,fleet,hr,legal,properties,umrah,_generic}` |
| إجمالي كيانات مُسجَّلة بصلاحية طباعة | **61** كيان (`hasTemplate: true`) | `artifacts/api-server/src/lib/entityRegistry.ts` |
| audit row في `print_jobs` لكل عملية | نعم — حتمي عبر `printJobsLogger.writePrintJob()` | `artifacts/api-server/src/lib/print/printJobsLogger.ts:42` |
| نسبة التبنّي للطباعة الموحَّدة على الصفحات التفصيلية | ~100% | كل `details/*.tsx` يمرّ بـ PrintButton |
| نسبة التبنّي على صفحات التقارير (`reports`/`finance/*.tsx`/`bi-*`) | ~85% | البعض يبني CSV على العميل ويستخدم PrintButton للـ PDF |

### أبرز 10 أنماط مضادة (Anti-Patterns) المرصودة

| # | النمط | الموقع (مثال) | الأثر |
|---:|---|---|---|
| 1 | CSV مولَّد client-side خارج `renderPrint` — لا يُسجَّل في `print_jobs` ولا يرث الـ letterhead أو الـ RBAC الدقيق | 47 ملف، مثال: `finance/ar-aging.tsx:26-38` ، `finance/account-statement.tsx:56-72`، `finance/customer-statement-print.tsx:102-130` | فاتورة CSV لا تظهر في `/reports/print-log`، لا توجد نسخة "مكررة" مختومة، ولا QR Verify |
| 2 | `payload={…}` المُمرَّر إلى `PrintButton` يُعيد بناء البيانات client-side بدلاً من ترك `dataLoader` يفعل ذلك server-side — أي قيود `allowedBranches` يتجاوزها العميل لو كان يعرض صفّاً واحداً فقط | `finance/ar-aging.tsx:98-110`, `finance/ar-collection-workbench.tsx:227-236` | احتمال leak بيانات فرع آخر إذا كان `rows` يحوي بيانات خارج نطاق المستخدم |
| 3 | `print:hidden / print:block` بدون `PrintButton` — يعتمد على Ctrl+P؛ بدون قالب موحَّد، بدون audit | `bi-admin-reports.tsx:91`, `bi-operations.tsx:480`, `finance/monthly-close-pack.tsx:141` | يمكن للمستخدم طباعة بيانات حسّاسة دون أن يظهر شيء في `print_jobs` |
| 4 | `ListPage.printEntityType` متبنَّاة في صفحتَيْن فقط رغم أن البنية موجودة وفعّالة منذ Phase 2 | `components/list-page.tsx:311-318` | 213 صفحة بـ `DataTable` بدون أي زر تصدير |
| 5 | `ListPageExportMenu.runPrint` يمرّر `rows: T[]` على هيئة `payload.items` — هذا يلتفّ على فلاتر السيرفر ويعتمد على ما تمّ تصفيته client-side | `components/list-page.tsx:485, 509` | حال وجود pagination، يطبع المستخدم الصفحة الحالية فقط ظنّاً أنه يطبع كل النتائج |
| 6 | `umrah/pilgrims.tsx → /umrah/pilgrims/export.csv` ينقّر صراحة على نقطة نهاية CSV مخصصة لا تمرّ عبر `renderPrint`؛ تسجَّل عبر `logSensitiveAccess` لكن لا تظهر في `/reports/print-log` | `umrah/pilgrims.tsx:387-390` + `api-server/src/routes/umrah.ts:799-907` | بصمة audit مزدوجة (نسجَّل في `audit_logs` بـ action=`export_csv` لكن ليس في `print_jobs`) |
| 7 | `admin-pdpl.tsx` يولّد DSAR JSON client-side عبر `new Blob([JSON.stringify(...)], "application/json")` | `admin-pdpl.tsx:194-198` | تصدير شخصي PDPL خارج خط الـ print pipeline؛ لا audit مركزي |
| 8 | `admin/logs.tsx` يولّد CSV client-side لسجلات التدقيق | `admin/logs.tsx:147-160` | تنزيل بيانات audit عينها لا يولِّد سطر audit |
| 9 | تَكْرار قالبَين لإدارة القوالب: `pages/admin/print-templates.tsx` و `pages/settings/print-templates.tsx` | كلاهما موجود | نسختان متباعدتان من نفس الواجهة (دليل على عدم انقضاء الـ Settings refactor) |
| 10 | `EntityPrintButton` كـ wrapper لا يضيف قيمة فوق `PrintButton` (54 استدعاء) | `components/shared/entity-print.tsx:29-47` | مستوى تجريد إضافي عديم الفائدة؛ ملاحظة مكتوبة في رأس الملف عن إبقائها فقط للتوافق |

---

## ٢. نظام الطباعة الموحَّد — ما هو متاح فعلاً

### ٢-١ الواجهة الأمامية (Frontend Primitives)

| المركّب | الملف | الدور |
|---|---|---|
| `PrintLayout` / `PrintDocument` / `PrintPreviewModal` / `PrintActions` / `directPrint` | `artifacts/ghayth-erp/src/components/print-layout.tsx:91-308` | مكوّن React مع `dir="rtl"`، letterhead header/footer، style sheet RTL متكامل (Noto Sans Arabic، A4 margins، watermark، @page page-counter). لكنه **شبه غير مستخدم في الصفحات** — تم العثور على 0 استدعاء له خارج `print-layout.tsx` و `print.css`. الـ canonical اليوم هو `PrintButton` (server-side rendering) |
| `PrintButton` | `artifacts/ghayth-erp/src/components/shared/print-button.tsx:82-313` | الموحَّد — يستدعي `POST /api/print/render` ويفتح المخرَج في نافذة جديدة. يدعم formats: `a4`, `thermal_80`, `thermal_58`, `label`, `excel`. يعرض dropdown إذا تعدّدت الـ formats. يعالج 403 / 409 (reprint approval) ويصدر toast بالعربية |
| `EntityPrintButton` | `artifacts/ghayth-erp/src/components/shared/entity-print.tsx:29-47` | wrapper رفيع فوق `PrintButton` (للتوافق مع 54 callsite قديمة). لا يضيف منطقاً، يُمكن إزالته |
| `ExportButton` / `MultiExportButton` | `artifacts/ghayth-erp/src/components/shared/export-buttons.tsx:35-143` | يضرب `/api/export/*` — هذه النقاط الخلفية أُعيد توجيهها لتمرّ هي الأخرى عبر `renderPrint` (`routes/export.ts:43-70`) فهي موحَّدة من جهة الخادم لكنها لا تستفيد من preview iframe ولا 409 reprint UX |
| `ListPage.printEntityType` + `ListPageExportMenu` | `artifacts/ghayth-erp/src/components/list-page.tsx:193-318, 442-551` | dropdown "تصدير" يدمج Print/PDF/Excel/CSV عبر `/print/render` (تستخدمها صفحتان فقط حتى الآن) |
| `print-client.ts` SDK | `artifacts/ghayth-erp/src/lib/print-client.ts:1-264` | wrappers TypeScript: `renderDocument`, `previewDocument`, `downloadDocument`, `verifyDocument`, `listJobs`, `listTemplates`. توثيق صريح يحظر توليد PDF client-side عبر lint rule `direct-pdf-generation` |

### ٢-٢ الواجهة الخلفية (Backend)

| المركّب | الملف | الدور |
|---|---|---|
| `POST /api/print/render` (authoritative) | `routes/print.ts:125-206` | يستقبل `{entityType, entityId, format, payload?}`، يمرّ بـ RBAC + reprint detection + template resolution + dataLoader + letterhead + adapter + storage + print_jobs |
| `POST /api/print/preview` | `routes/print.ts:225-289` | render سريع بدون audit (لاختبار القوالب فقط) — `requireAnyPermission("templates:read", "print:preview:create")` |
| `POST /api/print/deliver` | `routes/print.ts:994-1038` | يرسل المستند المُولَّد عبر قنوات: `download`, `email`, `whatsapp`, `sms`, `internal_inbox`, `webhook` — استخدام موحَّد لـ delivery + audit |
| `GET /api/print/jobs` + `/jobs.csv` | `routes/print.ts:571-655, 660+` | استعلام audit log مع pagination + filter (status, branch, user, date range) — متبنّى في `pages/reports/print-log.tsx` |
| `GET /api/print/verify/:jobId` | `routes/printVerify.ts` | تحقّق عام من QR code — anonymous + rate-limited 60/min/IP |
| reprint approval flow: `/reprint-requests`, `/reprint-requests/:id/{approve\|reject}` | `routes/print.ts:838-927` | تدفّق موافقة المدير قبل إعادة الطباعة (entities ذات `requiresApprovalForReprint: true`) |
| `printService.renderPrint` orchestrator | `lib/print/printService.ts:70-300` | الخطوات 8 المُعلَنة في رأس الملف: authz → countCopies → resolveTemplate → loadEntityData → buildLetterhead → adapter.render → storePrintArtifact → writePrintJob |
| Adapters | `lib/print/adapters/{a4,thermal,label,excel}Adapter.ts` | كل format له adapter منفصل |
| Delivery channels | `lib/print/delivery/{email,internalInbox,webhook}.ts` | قنوات تسليم منفصلة لكل قناة |
| Templates (35 ملف JSON) | `templates/{admin,finance,fleet,hr,legal,properties,umrah}/*.ar.json` + `_generic/universal-fallback.ar.json` | dataset التصميم؛ يُحلّ via `templateResolver.ts` |
| Entity registry | `lib/entityRegistry.ts` (61 entry بـ `hasTemplate: true`) | يحوي `templateKey`, `formats`, `defaultFormat`, `permission`, `requiresApprovalForReprint` |
| `print_jobs` table + `audit_logs` mirror | `lib/print/printJobsLogger.ts:42` | كل render يخلق صفّاً + يمرّر `action="print"` لـ `audit_logs` |

### ٢-٣ كيف يُفترض استخدام النظام (Canonical Usage)

```tsx
// أبسط استخدام — كيان بـ template مسجَّل في entityRegistry
<PrintButton entityType="invoice" entityId={invoice.id} />

// صفحة list — dropdown تصدير شامل
<ListPage
  ...
  printEntityType="report_ar_aging"
  exports={{ csv: true, excel: true, pdf: true, print: true }}
/>

// تقرير معدّ على العميل — payload يتجاوز dataLoader
<PrintButton
  entityType="report_trial_balance"
  entityId={dateRangeId(start, end)}
  payload={{ entity: {...}, items: rows }}
/>
```

---

## ٣. الصفحات التي تستخدم النظام الموحَّد

**131 ملف** يحوي على الأقل استدعاء واحداً لـ `PrintButton` أو `EntityPrintButton`. التغطية الكاملة لكل ملفات `pages/details/*.tsx` (54/54)، والغالبية العظمى من `pages/finance/*.tsx` (~58/136), كل `pages/hr/{discipline,evaluation,exit,job,loan,official-letters,overtime,training,violation}-detail.tsx`، `pages/umrah/{daily-runsheet,pilgrim-detail}.tsx`، `pages/properties/contract-detail.tsx`، `pages/store/{order,product}-detail.tsx`، `pages/legal-case-detail.tsx`، `pages/my-payslip.tsx`، إلخ.

نموذج كامل من قائمة الـ 131:

- `pages/details/employee-detail.tsx` — `EntityPrintButton entityType="employee"`
- `pages/finance/invoice-detail.tsx` — `EntityPrintButton entityType="invoice" formats=["a4","thermal_80"]`
- `pages/finance/ar-aging.tsx:95-117` — `PrintButton entityType="report_ar_aging" payload={...}`
- `pages/finance/customer-statement-print.tsx:201` — `PrintButton entityType="customer_statement" entityId={clientId:start..end}`
- `pages/finance/journal-detail.tsx:244` — `EntityPrintButton entityType="journal_entry"`
- `pages/umrah/daily-runsheet.tsx` — `PrintButton entityType="umrah_runsheet"`
- `pages/manager-board/reprint-approvals.tsx` — يستخدم flow الموافقة الموحَّد

---

## ٤. الصفحات التي تطبع بطريقة مخصصة — Custom / Legacy / Mixed

| # | الصفحة | المخرَج | يحترم الفلاتر؟ | يحترم الصلاحيات؟ | يخفي الحقول الحسّاسة؟ | RTL جاهز؟ | letterhead؟ | مسجَّل في audit؟ | الحكم |
|---:|---|---|---|---|---|---|---|---|---|
| 1 | `pages/finance/customer-statement-print.tsx:102-130` (`exportCSV`) | CSV | نعم (قراءة من `data`) | جزئيّاً (GuardedButton لكن CSV نفسه لا يُسجَّل) | لا (يصدّر كل الأعمدة) | لا (CSV لا rtl، لكن BOM موجود) | لا | لا | **مكرر** + **يحتاج تدقيق** |
| 2 | `pages/finance/ar-aging.tsx:26-38` (`exportCSV`) | CSV | نعم | gated بـ `perm="finance:export"` | لا | لا | لا | لا | **مكرر** — PDF عبر PrintButton موجود لكن CSV لا |
| 3 | `pages/finance/ap-aging.tsx:33` (`new Blob… text/csv`) | CSV | نعم | gated | لا | لا | لا | لا | **مكرر** |
| 4 | `pages/finance/account-statement.tsx:56-72` (`exportCSV`) | CSV | نعم | جزئيّاً | لا | لا | لا | لا | **مكرر** |
| 5 | `pages/finance/account-reconciliation-workpaper.tsx:198` | CSV | نعم | غير معروف | لا | لا | لا | لا | **مكرر** |
| 6 | `pages/finance/ap-payment-calendar.tsx`, `ar-collection-workbench.tsx`, `bank-accounts-watch.tsx`, `budget-heatmap.tsx`, `cash-13week.tsx`, `cash-flow-statement.tsx`, `cogs-summary.tsx`, `cost-center-pnl.tsx`, `custody-workbench.tsx`, `customer-360-sheet.tsx`, `customer-advances-workbench.tsx`, `daily-close-checklist.tsx`, `expense-burn-rate.tsx`, `fixed-asset-register.tsx`, `gl-integrity-gaps.tsx`, `income-statement-trend.tsx`, `income-statement-vs-budget.tsx`, `inventory-turnover.tsx`, `inventory-valuation.tsx`, `invoice-send-queue.tsx`, `ledger.tsx`, `lot-expiry-alerts.tsx`, `negative-stock.tsx`, `overrides-report.tsx`, `profitability.tsx`, `reports.tsx`, `trial-balance-comparison.tsx`, `trial-balance-drilldown.tsx`, `unmapped-lines.tsx`, `vat-filing-readiness.tsx`, `vat-reconciliation.tsx`, `vehicle-portfolio-dashboard.tsx`, `vendor-360-sheet.tsx`, `vendor-contracts-tracker.tsx`, `vendor-settlement-workbench.tsx`, `vendor-statement-print.tsx`, `wht-filing-workbench.tsx`, `wht-summary.tsx`, `yoy-comparison.tsx` | CSV (مولَّد client) | غالبيتها نعم | غالبيتها gated بـ `finance:export` | لا | لا | لا | لا | **مكرر** — جميعها لديها PrintButton يطبع PDF موحَّد، لكن CSV ينحرف عن الخط |
| 7 | `pages/finance/monthly-close-pack.tsx` | "طباعة" عبر Ctrl+P (يستخدم `print:hidden`/`print:block` فقط) | جزئيّاً (تواريخ من state) | لا (ضغط Ctrl+P لا يمرّ بأي gate) | لا | نعم (rtl موروث من body) | جزئيّاً (يحوي header يدوي) | **لا** | **legacy** + **يحتاج تدقيق** |
| 8 | `pages/bi-admin-reports.tsx`, `pages/bi-operations.tsx` | Ctrl+P (`print:hidden`/`print:block`) | جزئيّاً | لا | لا | نعم | لا | **لا** | **legacy** |
| 9 | `pages/admin/logs.tsx:147-160` (`exportCSV` للـ audit logs) | CSV | نعم | gated بـ `perm="admin:export"` | لا | لا | لا | لا (سجلّ التدقيق نفسه لا يولّد سجلّ تدقيق) | **مكرر** + **غير آمن** (PDPL: تصدير audit بدون trace) |
| 10 | `pages/admin-pdpl.tsx:194-198` (DSAR JSON download) | JSON | n/a | gated | n/a | n/a | لا | غير معروف (نقطة النهاية تفعل audit، لكن التحويل إلى ملف client-side خارج النطاق) | **يحتاج تدقيق** |
| 11 | `pages/umrah/pilgrims.tsx:387-390` (`window.location.href=/umrah/pilgrims/export.csv`) | CSV | نعم (يمرّر كل الفلاتر) | `authorize({feature:"umrah", action:"list"})` | (الحقول الحسّاسة تُفكّ التشفير: تفقّد `decrypted`) | لا (لكن BOM) | لا | جزئيّاً — يسجَّل في `audit_logs` بـ `action=export_csv` عبر `logSensitiveAccess` لكنه **خارج `print_jobs`** | **مكرر** + **غير آمن** |
| 12 | `pages/admin-integrations-diagnostics.tsx:339` (`<a href="/export/excel/invoices">`) | XLSX خام | لا (روابط ثابتة بدون فلاتر) | server-side | غير معروف | غير معروف | يمرّ بـ `proxyReport` ⇒ نعم | نعم (renderPrint) | **موحَّد** (لكن UX سيئ — رابط HTML خام في وحدة Diagnostics) |
| 13 | `pages/create/finance/opening-balances-create.tsx:69-116` | CSV | n/a (import وليس export) | gated | n/a | n/a | n/a | n/a | استبعاد — تحميل لا تصدير |
| 14 | `pages/umrah/import-wizard.tsx`, `pages/umrah/import.tsx` | يقرأ XLSX/CSV (read-only) | n/a | gated | n/a | n/a | n/a | n/a | استبعاد — تحميل لا تصدير |
| 15 | `pages/fleet/reports.tsx`, `pages/hr/payroll.tsx`, `pages/hr/attendance.tsx`, `pages/finance/reports.tsx` (×3) — `MultiExportButton`/`ExportButton` | XLSX / PDF | يحترم (يمرّر params) | server-side enforcement | server-side (`maskFields`) | نعم (server-side templates) | نعم | نعم (عبر `routes/export.ts → renderPrint`) | **موحَّد** (لكن لا preview/iframe — تنزيل فوري) |

---

## ٥. التصدير Excel/CSV — التغطية والاتّساق

### Excel
| نقطة الدخول | المسلك | موحَّدة؟ |
|---|---|---|
| `PrintButton format="excel"` | `/api/print/render` → `excelAdapter` | **نعم** |
| `ListPageExportMenu.runExcel` | `downloadDocument({format:"excel"})` ⇒ نفس النقطة | **نعم** |
| `ExportButton type="excel" endpoint="/export/excel/*"` | `/api/export/excel/X` → `proxyReport` → `renderPrint` (`routes/export.ts:43-70`) | **نعم** |
| **لا توجد** مكتبة xlsx مكتوبة client-side للتصدير | — | OK |

### CSV
| نقطة الدخول | المسلك | موحَّدة؟ |
|---|---|---|
| `PrintButton format="excel"` (للأسف لا توجد قيمة `csv` في `PrintFormat`) | — | **مفقود** — لم يُسلَّم `csv` كـ format داخل النظام |
| `ListPageExportMenu` يَعرض `csv: boolean` في props لكن لا يحوي معالجاً لـ CSV (`runPrint`/`runExcel` فقط) — `list-page.tsx:530-548` | dead-code | **مفقود** |
| 47 صفحة تبني CSV بـ `new Blob(["﻿"+rows], { type:"text/csv;charset=utf-8" })` يدوياً | client-side، خارج audit | **مكرر** + **غير آمن** |

> **خلاصة:** Excel موحَّد فعلياً ١٠٠%. CSV لم يُدمج بعد في الخط الموحَّد — هذا أكبر فجوة تَتْفيرة.

---

## ٦. التدقيق على عمليات الطباعة — Audit / `print_jobs`

### ما هو موجود
- جدول `print_jobs` يُملأ من `printJobsLogger.writePrintJob()` في `lib/print/printJobsLogger.ts:42-100`.
- كل سطر يحوي: `companyId`, `branchId`, `userId`, `entityType`, `entityId`, `format`, `paperSize`, `copyNumber`, `isReprint`, `watermark`, `pdfStorageKey`, `status`, `approvedBy`, `errorMessage`, `ipAddress`, `userAgent`, `jobId (UUID)`, `createdAt`.
- mirror إلى `audit_logs` بـ `action="print"` عبر نفس الـ logger.
- صفحة عرض موحَّدة: `pages/reports/print-log.tsx` + `pages/admin/print-diagnostics.tsx`.
- `pages/print-verify.tsx` + `/api/print/verify/:jobId` (anonymous + rate-limited 60/min) لكل وثيقة بـ QR code.
- نسخ مكررة (reprint): `copyNumber` يتزايد تلقائياً عبر `countCopies()` في `printService.ts:113-122`.

### الفجوات في الـ audit
| الفجوة | الموقع | الأثر |
|---|---|---|
| CSV client-side (47 صفحة) | كل صفحات finance reports | كل تنزيل CSV لكشف حساب أو aging أو ledger لا يولّد سطر `print_jobs` |
| `/umrah/pilgrims/export.csv` | `routes/umrah.ts:799-907` | يسجَّل في `audit_logs` بـ `export_csv` لكن **لا** يظهر في `/reports/print-log`. (انفصال خط audit) |
| `admin/logs.tsx` (CSV لسجلات التدقيق) | `admin/logs.tsx:147-160` | تنزيل سجلات التدقيق نفسها لا يترك أثراً — **خطر PDPL** |
| `admin-pdpl.tsx` DSAR JSON | `admin-pdpl.tsx:194-198` | تصدير بيانات الموظف الشخصية: نقطة النهاية الخلفية تسجِّل، لكن التحويل client-side لا |
| Ctrl+P في `bi-admin-reports`, `bi-operations`, `monthly-close-pack` | — | لا يمرّ بـ `/api/print/render` أصلاً ⇒ لا audit |

---

## ٧. التوصيات — Recommendations (لا تنفّذ — تدقيق فقط)

> الأهم أولاً. كل توصية لها رقم سطر مرجعي.

### ١. سَدّ ثغرة CSV (الأولوية القصوى)
- إضافة `"csv"` إلى `PrintFormat` في `lib/print-client.ts:23` و `components/shared/print-button.tsx:27`.
- بناء `csvAdapter.ts` يأخذ نفس `RenderContext` الذي يأخذه `excelAdapter`.
- تعديل `ListPageExportMenu.runCsv` (الـ stub موجود في `list-page.tsx:464`) ليستدعي `downloadDocument({format:"csv"})`.
- إزالة دوال `exportCSV` المحلّية في الـ 47 ملف وإحلال زر موحَّد. كل تنزيل سيُسجَّل في `print_jobs` ويرث الـ letterhead (للـ XLSX على الأقل، وللـ CSV: header rows لاسم الشركة + الفرع + تاريخ التقرير).

### ٢. دفع الـ ListPage adoption
- 213 صفحة بـ `DataTable` لا تستخدم `ListPage`. كل واحدة منها لا تحصل على dropdown التصدير الموحَّد. خطة الـ migration ينبغي وضعها كـ epic منفصل.

### ٣. إزالة `EntityPrintButton`
- 54 callsite ⇒ codemod مباشر إلى `PrintButton`. الـ wrapper نفسه يصرّح في رأسه أنه باقٍ "للتوافق فقط".

### ٤. توحيد `pages/admin/print-templates.tsx` ↔ `pages/settings/print-templates.tsx`
- إحداهما يجب أن تُحال إلى redirect أو إلى عرض read-only؛ الازدواجية تربك الإدارة.

### ٥. تجريم `print:hidden`/`print:block` بدون `PrintButton`
- إضافة قاعدة lint مخصصة: أي ملف يحوي `print:hidden` يجب أن يستورد `PrintButton` أو يستخدم `directPrint()`. الصفحات الثلاثة المذكورة (`bi-*`, `monthly-close-pack`) ينبغي ترحيلها إلى `PrintButton` بـ `entityType="report_*"`.

### ٦. توحيد `/umrah/pilgrims/export.csv` تحت `renderPrint`
- إنشاء `entityType: "report_umrah_pilgrims_list"` + template + loader، ثم استبدال `routes/umrah.ts:799-907` بـ proxy نحو `renderPrint`. سيظهر التنزيل في `print_jobs` ويحصل على QR Verify.

### ٧. تأمين تصدير الـ `admin/logs.tsx` و `admin-pdpl.tsx`
- بالحدّ الأدنى: استدعاء نقطة نهاية خادمية تسجِّل التنزيل في `print_jobs` بـ `entityType="report_audit_logs"` / `report_pdpl_dsar`. التصدير client-side من بيانات حسّاسة دون audit يخلق فجوة PDPL.

### ٨. مراجعة `payload`-injection في PrintButton
- بعض الصفحات تمرّر `payload: { items: rows }` حيث `rows` قد تكون مفلترة client-side. هذا يجعل المستخدم الذي يفلتر إلى فرع آخر يحصل على وثيقة لذلك الفرع — حتى لو كان `allowedBranches` على السيرفر يمنعه. التوصية: لا يُسمح بـ `payload` إلا حين `entityId="list"` (الموجود) أو حين تكون النقطة الخلفية تقطع الـ branch من الـ payload وتعيد التحقق.

### ٩. توحيد CSV download path للـ `print_jobs.csv`
- `routes/print.ts:660+` يعطي CSV للـ print log نفسه — هذا OK لكنه نفسه لا يمرّ بـ `renderPrint`، فيُنشئ ازدواجية صغيرة. توحيدها يبسّط المحاسبة.

### ١٠. توثيق "altitude" للقوالب
- `templates/README.md` موجود لكن لا يربط بين entity registry و JSON templates و dataLoaders. يستفيد الفريق من جدول واحد يربط الثلاثة.

---

## ٨. ملخّص ٥ أسطر — Five-Line Wrap-up

1. **النظام موحَّد جداً للطباعة + PDF + Excel:** `PrintButton` + `renderPrint()` + `print_jobs` + `entityRegistry` يشكّلون خطّاً متكاملاً؛ كل صفحات `details/*` (54) ونحو 85% من صفحات `finance/*` متبنّاة.
2. **الفجوة الكبرى هي CSV:** 47 صفحة تبني CSV client-side خارج `renderPrint` ⇒ لا audit ولا letterhead ولا RBAC دقيق؛ `PrintFormat` لا يحوي `"csv"` ويجب إضافته.
3. **3 صفحات** (bi-admin-reports / bi-operations / monthly-close-pack) تعتمد على Ctrl+P بدون أي زر طباعة ⇒ تجاوز كامل للنظام؛ لا تظهر في سجلّ الطباعة.
4. **مخاطر PDPL محدودة لكن حقيقية:** تصدير CSV لسجلات الـ audit نفسها (`admin/logs.tsx`) ولبيانات DSAR (`admin-pdpl.tsx`) وللتسعيرة العمرة (`umrah/pilgrims.tsx`) لا يُسجَّل في `print_jobs` ⇒ تنزيل بيانات حسّاسة بلا أثر مركزي.
5. **`ListPage.printEntityType` و `EntityPrintButton`:** الأولى متاحة منذ Phase 2 لكنها متبنّاة في صفحتَيْن فقط (3 صفحات إجمالاً تستخدم `ListPage`)، والثانية wrapper بلا قيمة مضافة (54 استدعاء قابل لإحلال آلي).
