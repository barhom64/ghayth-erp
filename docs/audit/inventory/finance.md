# جرد المسار — المالية (Finance)

جردٌ ثابت (static) لمسار المالية في نظام غيث، يغطّي 17 ملف routes خلفية + `accounting-engine.ts`، ومحرّك الترحيل `lib/gl/posting.ts` + `financialEngine`، وصفحات الواجهة المسجّلة في `financeRoutes.tsx`. لم يُشغَّل النظام؛ كل حكم مُسنَد بدليل `file:line`. حُقِّقت ادعاءات التقارير السابقة (C1–C15) ودُمج فحص الـ PRs المدموجة (#762/#767/#771/#772/#776/#778 + موجات الإصلاح #728–#736) سطرًا بسطر.

الخلاصة: المسار يحوي backend حقيقيًا وغنيًا، وقد أُغلقت الثقوب الكارثية في النسخة الحالية: اعتماد الفاتورة يرحّل GL فعليًا، القيد اليدوي لم يعد يلوّث الدفتر عند المسودة، طلب التمويل يستهدف الجدول الصحيح، المطابقة البنكية اليدوية صار عقدها متطابقًا، تقرير التدفقات النقدية يعرض بياناته، وZATCA صار قابلًا للتفعيل. لكن تبقى عيوب جوهرية: السلف لا تزال تُخفي حالتها، المطابقة الثلاثية للمشتريات لا تُرحّل قيد تصفية GRNI، قيد CHECK لأوامر الشراء يرفض حالتين، تقادم الموردين يبالغ في الالتزامات، والمطابقة البنكية لا تُرحّل أي قيد عند التأكيد.

---

## جدول 1 — الصفحات (Pages)

| المعرّف | route | الملف | الحالة | APIs المستدعاة | عيب رئيسي |
|---|---|---|---|---|---|
| P-01 | `/finance` | `pages/finance/dashboard.tsx` | ناقص | `GET /finance/summary`, activity logs | مؤشّر النشاط يعتمد دور ≥70 وفلترة عميل |
| P-02 | `/finance/accounts` | `pages/finance/accounts.tsx` | ناقص | `GET /chart-of-accounts`, `GET /accounts` | أزرار تعديل/حذف الشجرة بلا `GuardedButton` |
| P-03 | `/finance/accounts/create` | `pages/create/finance/...` | ناقص | `POST /accounts` | زر الحفظ غير مُحاط بحارس على مستوى الزر |
| P-04 | `/finance/accounts/:id/edit` | `pages/finance/accounts...` | ناقص | `GET /accounts` (القائمة كاملة) | لا يوجد `GET /accounts/:id` |
| P-05 | `/finance/accounts/:id` | `pages/finance/accounts...` | ناقص | `GET /accounts` (فلترة عميل) | `balance` يُعرَض دائمًا `—` |
| P-06 | `/finance/ledger/:code` | `pages/finance/ledger.tsx` | شغّال | `GET /ledger/:accountCode` (`finance-accounts.ts:440`) | فلتر التاريخ على `createdAt` لا `date` |
| P-07 | `/finance/gl-posting-queue` | `pages/finance/gl-posting-queue.tsx` | شغّال | `GET /gl-helpers/*/pending` | الطابور مقيّد دون فلاتر |
| P-08 | `/finance/journal` | `pages/finance/journal.tsx` | ناقص | `GET /journal` (`finance-journal.ts:1014`) | نقر الصف → `/finance/journal/:id` غير مسجّل في `financeRoutes.tsx` |
| P-09 | `/finance/journal/create` | `pages/create/finance/journal-create.tsx` | ناقص | `POST /journal` (`finance-journal.ts:1036`) | `FileDropZone` يجمع مرفقات لا تُرسَل |
| P-10 | `/finance/journal-manual` | `pages/finance/journal-manual.tsx` | شغّال | `GET/POST /journal-manual` (`finance-hardening.ts:411`) | — |
| P-11 | `/finance/journal-manual/create` | `pages/create/finance/...` | شغّال | `POST /journal-manual` | القيد يُنشأ مسودة دون أثر GL (مُصلَح) |
| P-12 | `/finance/journal-manual/:id` | `pages/finance/journal-manual-detail.tsx` | ناقص | `GET /journal-manual/:id`, reverse | أزرار submit/review/post غائبة عن صفحة التفصيل |
| P-13 | `/finance/fiscal-periods` | `pages/finance/fiscal-periods.tsx` | مكسور | `GET /fiscal-periods` (`finance-budget.ts:665`) | حالة "مقفلة" تجميلية؛ لا UI لإقفال فترة فعليًا |
| P-14 | `/finance/opening-balances` | `pages/finance/opening-balances.tsx` | شغّال | `GET/POST /opening-balances` | — |
| P-15 | `/finance/opening-balances/create` | `pages/create/finance/...` | ناقص | `POST /opening-balances` | لا `createAuditLog` على الإنشاء |
| P-16 | `/finance/year-end-close` | `pages/finance/year-end-close.tsx` | ناقص | `POST /fiscal-periods/:period/year-end-close` | يُرحّل قيود إقفال حقيقية بلا audit log |
| P-17 | `/finance/vouchers` | `pages/finance/vouchers.tsx` | ناقص | `GET /vouchers` | زر التوسعة بلا `onClick` |
| P-18 | `/finance/vouchers/create` | `pages/create/finance/...` | ناقص | `POST /vouchers` | لا `createAuditLog`؛ المرفقات تُسقَط |
| P-19 | `/finance/vouchers/:id` | `pages/finance/voucher-detail.tsx` | مكسور | `PATCH /vouchers/:id/approve` (`finance-vendors.ts:624`) | فلتر `ref LIKE 'VOUCHER%'` لا يطابق `RV-/PV-` |
| P-20 | `/finance/expenses` | `pages/finance/expenses.tsx` | شغّال | `GET /expenses` | — |
| P-21 | `/finance/expenses/create` | `pages/create/finance/...` | ناقص | `POST /expenses` | لا `createAuditLog`؛ المرفقات تُسقَط |
| P-22 | `/finance/expenses/:id` | `pages/finance/expense-detail.tsx` | ناقص | `GET /expenses` | زر تعديل → route `/expenses/:id/edit` غير مسجّل |
| P-23 | `/finance/salary-advances` | `pages/finance/salary-advances.tsx` | مكسور | `GET /salary-advances` (`finance-journal.ts:864`) | القائمة تُثبّت `'active' AS status` — أزرار الاعتماد لا تظهر |
| P-24 | `/finance/salary-advances/:id` | `pages/finance/salary-advances...` | مكسور | `GET /salary-advances/:id` | الرفض لا يعكس GL؛ حقول مفقودة |
| P-25 | `/finance/invoices` | `pages/finance/invoices.tsx` | شغّال | `POST /invoices/:id/approve` (`finance-invoices.ts:570`) | يستخدم POST الآن — يُرحّل GL (مُصلَح) |
| P-26 | `/finance/invoices/create` | `pages/create/finance/...` | ناقص | `POST /invoices` | المرفقات تُسقَط |
| P-27 | `/finance/invoices/:id` | `pages/finance/invoice-detail.tsx` | شغّال | `POST /invoices/:id/approve` (`invoice-detail.tsx:449`) | `approveMethod="POST"` — يُرحّل GL (مُصلَح) |
| P-28 | `/finance/tax` | `pages/finance/tax-system.tsx` | ناقص | `GET /tax/summary`, `/tax/declarations` | `inputVat` مثبّت على حساب `1400` |
| P-29 | `settings → zatca` | `pages/settings/zatca-settings-tab.tsx` | شغّال | `PUT /zatca/settings` | `enabled` يُرسَل boolean الآن (مُصلَح) |
| P-30 | `/finance/purchase-orders` | `pages/finance/purchase-orders.tsx` | ناقص | `GET /purchase-orders`, bulk-action | `purchase-order` غائب عن `tableMap` للإجراء الجماعي |
| P-31 | `/finance/purchase-orders/create` | `pages/create/finance/...` | ناقص | `POST /purchase-requests` | يُنشئ PR لا PO؛ `copyFrom` يُسقِط البنود |
| P-32 | `/finance/purchase-orders/:id` | `pages/finance/purchase-order-detail.tsx` | ناقص | `GET /purchase-orders/:id` | GRN/مطابقة/دفع غير قابلة للوصول من UI |
| P-33 | `/finance/vendors` | `pages/finance/vendors.tsx` | ناقص | `GET /vendors` | مؤشّر "نشط" = الإجمالي دائمًا |
| P-34 | `/finance/vendors/create` | `pages/create/finance/...` | ناقص | `POST /vendors` | المرفقات تُسقَط |
| P-35 | `/finance/vendors/:id` | `pages/finance/vendor-detail.tsx` | مكسور | `GET /invoices?vendorId=`, `/payments?vendorId=` | الـ handlers تتجاهل `vendorId` — تبويبا الفواتير/المدفوعات فارغان دائمًا |
| P-36 | `/finance/receivables` | `pages/finance/receivables.tsx` | شغّال | `GET /receivables` (`finance-vendors.ts:253`) | بطاقات KPI تعمل بعد إضافة `summary` (مُصلَح) |
| P-37 | `/finance/receivables/:id` | `pages/finance/receivables...` | ناقص | `GET /receivables/:id` | زر تعديل ميت؛ تاريخ المدفوعات فارغ |
| P-38 | `/finance/payments` | `pages/finance/payments-page.tsx` | ناقص | `GET /payments` | لا scope للفروع؛ `/payables` بلا UI |
| P-39 | `/finance/commitments` | `pages/finance/commitments.tsx` | شغّال | `GET /commitments` | `summary` مُضاف (مُصلَح) |
| P-40 | `/finance/commitments/:id` | `pages/finance/commitments...` | ناقص | `GET /commitments/:id` | زر تعديل ميت |
| P-41 | `/finance/financial-requests` | `pages/finance/financial-requests.tsx` | ناقص | `GET /financial-requests` (`finance-vendors.ts:498`) | بعض الأعمدة تظل فارغة |
| P-42 | `/finance/financial-requests/:id` | `pages/finance/financial-requests...` | شغّال | `PATCH /financial-requests/:id/approve` (`finance-vendors.ts:651`) | يستهدف `workflow_requests` (مُصلَح) |
| P-43 | `/finance/budget` | `pages/finance/budget.tsx` | ناقص | `GET /budget` | لا فلتر فترة من الخادم؛ `/budget/approval-requests` بلا UI |
| P-44 | `/finance/budget/create` | `pages/create/finance/...` | شغّال | `POST /budget` | — |
| P-45 | `/finance/budget/:id` | `pages/finance/budget...` | ناقص | `GET /budget/:id`, `PATCH /budgets/:id/approve` | مسار الاعتماد يعبر إلى vendorsRouter |
| P-46 | `/finance/reports` | `pages/finance/reports.tsx` | شغّال | `GET /reports/cash-flow` (`finance-reports.ts:191`) | تبويب التدفقات يقرأ `inflows/outflows` المُعادة الآن (مُصلَح) |
| P-47 | `/finance/custodies` | `pages/finance/custodies.tsx` | شغّال | `GET/POST /custodies` (`finance-custodies.ts:176`) | `POST /custodies/:id/settle` بلا زر |
| P-48 | `/finance/custodies/report` | `pages/finance/custody-aging-report.tsx` | ناقص | `GET /custodies/report` | لا فلتر تاريخ ولا تصدير |
| P-49 | `/finance/custodies/:id` | `pages/finance/custody-detail.tsx` | ناقص | `GET /custodies/:id` | لا إجراء تسوية/اعتماد من التفصيل |
| P-50 | `/finance/recurring-journals` | `pages/finance/recurring-journals.tsx` | شغّال | `GET /recurring-journals`, `run-now` | `run-now` يُرحّل قيدًا فعليًا |
| P-51 | `/finance/recurring-journals/create` | `pages/create/finance/...` | شغّال | `POST /recurring-journals` | — |
| P-52 | `/finance/recurring-journals/:id` | `pages/finance/recurring-journal-detail.tsx` | ناقص | `GET /recurring-journals/:id` | `runDate` يُعرَض `—` (الحقل `createdAt`) |
| P-53 | `/finance/ar-aging` | `pages/finance/ar-aging.tsx` | شغّال | `GET /ar-aging` (`finance-algorithms.ts:123`) | — |
| P-54 | `/finance/ap-aging` | `pages/finance/ap-aging.tsx` | مكسور | `GET /ap-aging` (`finance-algorithms.ts:213`) | `paidAmount` مثبّت `0` — المستحقات مبالَغ فيها |
| P-55 | `/finance/bank-reconciliation` | `pages/finance/bank-reconciliation.tsx` | مكسور | `POST /bank-reconciliation/auto-match` | لا قيد GL عند تأكيد المطابقة |
| P-56 | `/finance/bank-reconciliation/manual-match/...` | `pages/create/finance/bank-manual-match.tsx` | شغّال | `POST /bank-reconciliation/manual-match` | العقد متطابق الآن (`bankStatementId`+`journalLineId`) (مُصلَح) |
| P-57 | `/finance/fixed-assets` | `pages/finance/fixed-assets.tsx` | شغّال | `GET/POST /fixed-assets`, `depreciate` | الإهلاك يُرحّل GL |
| P-58 | `/finance/fixed-assets/batch-depreciate` | `pages/finance/fixed-assets...` | شغّال | `POST /fixed-assets/depreciate-all` | — |
| P-59 | `/finance/fixed-assets/:id` | `pages/finance/...` | مكسور | `GET /fixed-assets/:id` | زر تعديل → القائمة؛ جدول الإهلاك لا يُعرَض |
| P-60 | `/finance/inventory-costing` | `pages/finance/inventory-costing.tsx` | ناقص | `GET /inventory-costing` | `rounding-differences/apply` بلا UI |
| P-61 | `/finance/bank-guarantees` | `pages/finance/bank-guarantees.tsx` | ناقص | `GET/POST /bank-guarantees` | لا قيد GL لالتزام محتمل |
| P-62 | `/finance/intercompany` | `pages/finance/intercompany.tsx` | ناقص | `POST /intercompany` | يُرحّل ساقَي GL؛ لا مسار إلغاء |
| P-63 | `/finance/intercompany/consolidation/create` | `pages/create/finance/...` | ناقص | `GET /intercompany/consolidation` | مُسمّى "create" لكنه تقرير قراءة فقط |
| P-64 | `/finance/cash-flow-forecast` | `pages/finance/cash-flow-forecast.tsx` | ناقص | `GET /cash-flow-forecast` | توقّع 60/90 يومًا يعيد رقم 30 يومًا |
| P-65 | `/finance/project-costing` | `pages/finance/project-costing.tsx` | مكسور | `POST /finance/projects/:id/costs` | الـ endpoint غير موجود — إضافة تكلفة تعطي 404 |
| P-66 | `/finance/project-costing/:id` | `pages/finance/project-costing-detail.tsx` | ناقص | `GET /projects/:id/costs` | قراءة فقط؛ `spentAmount` قد يخالف الدفتر |
| P-67 | `/finance/cashflow` | `pages/finance/cashflow-dashboard.tsx` | ناقص | `GET /finance/summary` | معامل `?period=` مُتجاهَل خادميًا |
| P-68 | `/finance/treasury` | `pages/finance/treasury.tsx` | شغّال | `GET /treasury` (`finance-algorithms.ts:1790`) | — |
| P-69 | `settings → mappings` | `pages/settings/accounting-mappings-tab.tsx` | ناقص | `GET/POST /accounting-mappings` | journal-templates و subsidiary-accounts بلا UI |

---

## جدول 2 — الأزرار والإجراءات (Actions)

| الصفحة الأم | اسم الزر | الإجراء المتوقّع | API المستهدف | الحالة | نوع العيب |
|---|---|---|---|---|---|
| invoice-detail | اعتماد | ترحيل GL + فحص حد المبلغ | `POST /invoices/:id/approve` | شغّال | — |
| invoice-detail | رفض/إرجاع | عكس GL + نقل حالة | `PATCH /invoices/:id/reject` | شغّال | — |
| invoices (قائمة) | اعتماد | ترحيل GL | `POST /invoices/:id/approve` | شغّال | — |
| invoice-detail | إرسال | نقل draft→sent | `POST /invoices/:id/send` | غير قابل للتحقق | dead |
| invoice-detail | ترحيل نهائي | approved→posted | `POST /invoices/:id/post` | شغّال | — |
| voucher-detail | اعتماد السند | نقل حالة السند | `PATCH /vouchers/:id/approve` | مكسور | dead |
| journal-manual-detail | عكس القيد | قيد عكسي | `POST /journal/:id/reverse` | شغّال | — |
| journal-manual-detail | إرسال/مراجعة/ترحيل | تسلسل دورة الحياة | `PATCH /journal-manual/:id/submit|review|post` | مكسور | dead |
| salary-advances (قائمة) | اعتماد السلفة | نقل حالة السلفة | `PATCH /salary-advances/:id/approve` | مكسور | dead |
| project-costing | إضافة تكلفة | تسجيل تكلفة مشروع | `POST /finance/projects/:id/costs` | مكسور | dead |
| purchase-orders | اعتماد/رفض جماعي | إجراء جماعي | `POST /entity-meta/bulk-action` | مكسور | mismatch |
| purchase-order-detail | استلام/مطابقة/دفع | دورة GRN | `PATCH /purchase-orders/:id/receive` … | غير قابل للتحقق | dead |
| bank-reconciliation | تأكيد المطابقة | ترحيل قيد تسوية | `POST /bank-reconciliation/auto-match` | مكسور | dead |
| bank-manual-match | مطابقة يدوية | ربط سطر بنكي بسطر قيد | `POST /bank-reconciliation/manual-match` | شغّال | — |
| fiscal-periods | إقفال فترة | إقفال محاسبي | (لا زر) | مكسور | dead |
| custodies | تسوية العهدة | تسوية + GL | `POST /custodies/settle` | شغّال | — |
| custody-detail | تسوية/اعتماد | إجراء من التفصيل | (لا زر) | مكسور | dead |
| year-end-close | إقفال السنة | قيود إقفال | `POST /fiscal-periods/:period/year-end-close` | ناقص | — |
| recurring-journals | تشغيل الآن | ترحيل قيد دوري | `POST /recurring-journals/:id/run-now` | شغّال | — |
| expense-detail / receivable-detail / commitment-detail | تعديل | فتح صفحة تعديل | route غير مسجّل | مكسور | dead |
| accounts (شجرة) | تعديل/حذف حساب | CRUD حساب | `PATCH/DELETE /accounts/:id` | ناقص | — |

---

## جدول 3 — APIs

| Endpoint | Method | الـ handler | الـ schema | UI المستهلكة | الجدول الأساسي | الحالة | عيب |
|---|---|---|---|---|---|---|---|
| `/finance/invoices` | GET | `finance-invoices.ts:253` | query params | invoices.tsx | invoices | شغّال | يتجاهل `vendorId` |
| `/finance/invoices` | POST | `finance-invoices.ts:307` | createInvoiceSchema | invoices/create | invoices | شغّال | المرفقات تُسقَط |
| `/finance/invoices/:id` | GET | `finance-invoices.ts:808` | — | invoice-detail | invoices | شغّال | — |
| `/finance/invoices/:id` | PATCH | `finance-invoices.ts:834` | updateInvoiceSchema | invoice-detail | invoices | شغّال | — |
| `/finance/invoices/:id` | DELETE | `finance-invoices.ts:924` | — | invoices | invoices | شغّال | — |
| `/finance/invoices/:id/approve` | POST | `finance-invoices.ts:570` | — | invoice-detail/invoices | invoices+journal_entries | شغّال | يُرحّل GL ويفرض حد المبلغ |
| `/finance/invoices/:id/approve` | PATCH | `finance-invoices.ts:1073` | invoiceApprovalActionSchema | (لا UI) | invoices | غير قابل للتحقق | لا يُرحّل GL ولا حد مبلغ — بلا مستهلك |
| `/finance/invoices/:id/reject` | PATCH | `finance-invoices.ts:1074` | invoiceApprovalActionSchema | invoice-detail | invoices | شغّال | يعكس GL في `onApply` |
| `/finance/invoices/:id/post` | POST | `finance-invoices.ts:665` | — | invoice-detail | invoices | شغّال | — |
| `/finance/invoices/:id/send` | POST | `finance-invoices.ts:500` | — | (لا UI) | invoices | غير قابل للتحقق | dead |
| `/finance/invoices/:id/payment` | POST | `finance-invoices.ts:704` | createPaymentSchema | invoice-detail | invoices | شغّال | لا `createAuditLog` |
| `/finance/invoices/:id/credit-memo` | POST | `finance-invoices.ts:1107` | — | (لا UI) | invoices | غير قابل للتحقق | dead UI |
| `/finance/invoices/:id/debit-memo` | POST | `finance-invoices.ts:1246` | — | (لا UI) | invoices | غير قابل للتحقق | dead UI |
| `/finance/invoices/:id/memos` | GET | `finance-invoices.ts:1369` | — | (لا UI) | — | غير قابل للتحقق | dead UI |
| `/finance/bad-debt/preview` | GET | `finance-invoices.ts:1404` | — | (لا UI) | invoices | غير قابل للتحقق | dead UI |
| `/finance/bad-debt/post` | POST | `finance-invoices.ts:1456` | — | (لا UI) | journal_entries | غير قابل للتحقق | dead UI |
| `/finance/customer-advances` | GET/POST | `finance-invoices.ts:1579,1774` | — | (لا UI) | journal_entries | غير قابل للتحقق | dead UI |
| `/finance/customer-advances/:id/apply` | POST | `finance-invoices.ts:1680` | — | (لا UI) | — | غير قابل للتحقق | dead UI |
| `/finance/dunning/preview\|send\|history` | GET/POST | `finance-invoices.ts:1879+` | — | (لا UI) | — | غير قابل للتحقق | dead UI |
| `/finance/tax/summary` | GET | `finance-invoices.ts:1077` | — | tax-system | invoices | شغّال | — |
| `/finance/tax/declarations` | GET | `finance-invoices.ts:2055` | — | tax-system | — | ناقص | `inputVat`=0 |
| `/finance/expenses` | GET/POST | `finance-journal.ts:233,373` | createExpenseSchema | expenses | expenses | شغّال | المرفقات تُسقَط |
| `/finance/expenses/:id/approve` | PATCH | `finance-journal.ts:579` | approvalSchema | expense-detail | expenses | شغّال | — |
| `/finance/vouchers` | GET/POST | `finance-journal.ts:653,702` | createVoucherSchema | vouchers | journal_entries | ناقص | يُرحّل GL عند الإنشاء بلا دورة اعتماد |
| `/finance/vouchers/:id` | GET | `finance-journal.ts:680` | — | voucher-detail | journal_entries | شغّال | — |
| `/finance/vouchers/:id` | DELETE | `finance-journal.ts:851` | — | vouchers | journal_entries | ناقص | حارس `status='draft'` |
| `/finance/salary-advances` | GET | `finance-journal.ts:864` | — | salary-advances | journal_entries | مكسور | يُثبّت `'active' AS status` |
| `/finance/salary-advances/:id` | GET | `finance-journal.ts:874` | — | salary-advance-detail | journal_entries | ناقص | — |
| `/finance/salary-advances` | POST | `finance-journal.ts:894` | createSalaryAdvanceSchema | salary-advances/create | journal_entries | ناقص | الرصيد يتحرك عند الإنشاء قبل الاعتماد |
| `/finance/salary-advances/:id/approve` | PATCH | `finance-journal.ts:954` | approvalSchema | salary-advances | journal_entries | ناقص | الرفض لا يعكس GL |
| `/finance/journal` | GET/POST | `finance-journal.ts:1014,1036` | createJournalSchema | journal | journal_entries | شغّال | — |
| `/finance/journal/:id` | GET | `finance-journal.ts:1105` | — | (route غير مسجّل) | journal_entries | مكسور | UI ينقل إلى route غير موجود |
| `/finance/journal/:id/reverse` | POST | `finance-journal.ts:1145` | — | journal-manual-detail | journal_entries | شغّال | — |
| `/finance/opening-balances` | GET/POST | `finance-journal.ts:1478,1592` | — | opening-balances | journal_entries | شغّال | لا audit log |
| `/finance/fiscal-periods/:period/year-end-close` | POST | `finance-journal.ts:1331` | — | year-end-close | journal_entries | ناقص | لا audit log |
| `/finance/journal-manual` | POST | `finance-hardening.ts:411` | createManualJournalSchema | journal-manual/create | journal_entries | شغّال | يُنشأ مسودة بلا أثر دفتر |
| `/finance/journal-manual` | GET | `finance-hardening.ts:494` | — | journal-manual | journal_entries | شغّال | لا scope فروع |
| `/finance/journal-manual/:id/submit` | PATCH | `finance-hardening.ts:561` | — | (لا زر تفصيل) | journal_entries | غير قابل للتحقق | لا UI تفصيل |
| `/finance/journal-manual/:id/review` | PATCH | `finance-hardening.ts:598` | reviewJournalSchema | (لا زر تفصيل) | journal_entries | غير قابل للتحقق | تكرار مع `/approve` |
| `/finance/journal-manual/:id/approve` | PATCH | `finance-hardening.ts:662` | approveJournalSchema | (لا زر تفصيل) | journal_entries | غير قابل للتحقق | تكرار مع `/review` |
| `/finance/journal-manual/:id/post` | PATCH | `finance-hardening.ts:714` | — | (لا زر تفصيل) | journal_entries | شغّال | يُرحّل الأثر هنا |
| `/finance/fiscal-periods-v2` | GET/POST | `finance-hardening.ts:133,153` | — | (لا UI) | financial_periods | غير قابل للتحقق | dead UI |
| `/finance/fiscal-periods-v2/:id/close\|reopen` | POST | `finance-hardening.ts:190,260` | — | (لا UI) | financial_periods | غير قابل للتحقق | dead UI |
| `/finance/bank-guarantees` | GET/POST | `finance-hardening.ts:778,811` | — | bank-guarantees | bank_guarantees | ناقص | لا قيد GL |
| `/finance/intercompany` | GET/POST | `finance-hardening.ts:1063,1083` | — | intercompany | journal_entries | ناقص | لا مسار إلغاء |
| `/finance/projects` | GET/POST | `finance-hardening.ts:1262,1284` | — | project-costing | projects | ناقص | — |
| `/finance/projects/:id/costs` | GET | `finance-hardening.ts:1339` | — | project-costing-detail | — | شغّال | — |
| `/finance/projects/:id/costs` | POST | (غير موجود) | — | project-costing | — | مكسور | الـ endpoint غير موجود |
| `/finance/cash-flow-forecast` | GET | `finance-hardening.ts:1376` | — | cash-flow-forecast | — | ناقص | 60/90 يومًا يعيد 30 |
| `/finance/purchase-requests` | GET/POST | `finance-purchase.ts:211,254` | — | purchase-orders/create | purchase_requests | شغّال | — |
| `/finance/purchase-requests/:id/convert` | POST | `finance-purchase.ts:456` | — | — | purchase_orders | شغّال | تكرار مع `convert-to-po` |
| `/finance/purchase-requests/:id/convert-to-po` | POST | `finance-purchase.ts:1213` | — | — | purchase_orders | ناقص | لا ينسخ البنود |
| `/finance/purchase-orders` | GET/POST | `finance-purchase.ts:531,570` | — | purchase-orders | purchase_orders | ناقص | — |
| `/finance/purchase-orders/:id/approve` | PATCH | `finance-purchase.ts:677` | — | purchase-order-detail | purchase_orders | شغّال | — |
| `/finance/purchase-orders/:id/receive` | PATCH | `finance-purchase.ts:688` | — | (لا UI) | warehouse_movements | غير قابل للتحقق | dead UI |
| `/finance/purchase-orders/:id/match-invoice` | POST | `finance-purchase.ts:1408` | matchInvoiceSchema | (لا UI) | purchase_orders | مكسور | لا قيد تصفية GRNI؛ حالة `invoice_mismatch` تخالف CHECK |
| `/finance/purchase-orders/:id/schedule-payment` | POST | `finance-purchase.ts:1510` | schedulePaymentSchema | (لا UI) | purchase_orders+journal_entries | مكسور | حالة `payment_scheduled` تخالف CHECK؛ GL قبل النقل → قيد يتيم |
| `/finance/payment-run/execute` | POST | `finance-purchase.ts:1027` | — | (لا UI) | journal_entries | غير قابل للتحقق | dead UI؛ يخصم AP لم يُقيَّد |
| `/finance/ar-aging` | GET | `finance-algorithms.ts:123` | — | ar-aging | invoices | شغّال | — |
| `/finance/ap-aging` | GET | `finance-algorithms.ts:213` | — | ap-aging | purchase_orders | مكسور | `paidAmount` مثبّت `0` |
| `/finance/bank-reconciliation/auto-match` | POST | `finance-algorithms.ts:413` | — | bank-reconciliation | bank_statements | مكسور | لا قيد GL عند المطابقة |
| `/finance/bank-reconciliation/manual-match` | POST | `finance-algorithms.ts:543` | bankManualMatchSchema | bank-manual-match | bank_statements | شغّال | لا قيد GL لكن العقد متطابق |
| `/finance/journal-lines/search` | GET | `finance-algorithms.ts:598` | query | bank-manual-match | journal_lines | شغّال | — |
| `/finance/fixed-assets` | GET/POST | `finance-algorithms.ts:660,673` | — | fixed-assets | fixed_assets | شغّال | — |
| `/finance/fixed-assets/:id/depreciate` | POST | `finance-algorithms.ts:927` | — | fixed-assets | journal_entries | شغّال | يُرحّل GL |
| `/finance/fx/rates` | GET/POST | `finance-algorithms.ts:1391,1412` | fxRateUpsertSchema | (لا UI) | fx_rates | غير قابل للتحقق | dead UI؛ schema drift مُصلَح (#776) |
| `/finance/fx/revaluation/preview\|post` | GET/POST | `finance-algorithms.ts:1456,1582` | — | (لا UI) | fx_revaluations | غير قابل للتحقق | dead UI |
| `/finance/rounding-differences/apply` | POST | `finance-algorithms.ts:1291` | — | (لا UI) | journal_lines | غير قابل للتحقق | dead UI |
| `/finance/treasury` | GET | `finance-algorithms.ts:1790` | — | treasury | journal_entries | شغّال | — |
| `/finance/accounts` | GET/POST | `finance-accounts.ts:148,178` | createAccountSchema | accounts | chart_of_accounts | شغّال | لا `GET /:id` |
| `/finance/journal` | GET/POST | `finance-accounts.ts:328,348` | createJournalSchema | (لا UI) | journal_entries | مكسور | dead — مُظلَّل بـ journalRouter |
| `/finance/ledger/:accountCode` | GET | `finance-accounts.ts:440` | — | ledger | journal_lines | شغّال | — |
| `/finance/stats` | GET | `finance-accounts.ts:485` | — | dashboard | — | شغّال | — |
| `/finance/summary` | GET | `finance-accounts.ts:500` | — | cashflow-dashboard | — | ناقص | يتجاهل `?period=` |
| `/finance/receivables` | GET | `finance-vendors.ts:253` | — | receivables | invoices | شغّال | `summary` مُضاف |
| `/finance/payables` | GET | `finance-vendors.ts:298` | — | (لا UI) | purchase_orders | غير قابل للتحقق | dead UI |
| `/finance/payments` | GET | `finance-vendors.ts:397` | — | payments | journal_entries | ناقص | لا scope فروع |
| `/finance/commitments` | GET | `finance-vendors.ts:429` | — | commitments | purchase_orders | شغّال | `summary` مُضاف |
| `/finance/financial-requests` | GET | `finance-vendors.ts:498` | — | financial-requests | workflow_requests | ناقص | بعض الأعمدة فارغة |
| `/finance/financial-requests/:id/approve` | PATCH | `finance-vendors.ts:651` | — | financial-request-detail | workflow_requests | شغّال | يستهدف الجدول الصحيح |
| `/finance/vouchers/:id/approve` | PATCH | `finance-vendors.ts:624` | — | voucher-detail | journal_entries | مكسور | `ref LIKE 'VOUCHER%'` لا يطابق `RV-/PV-` |
| `/finance/budgets/:id/approve` | PATCH | `finance-vendors.ts:680` | — | budget-detail | budgets | شغّال | يعبر routers |
| `/finance/budget` | GET/POST | `finance-budget.ts:114,176` | — | budget | budgets | شغّال | — |
| `/finance/budget/approval-requests` | GET/POST | `finance-budget.ts:403,472` | — | (لا UI) | budget_approval_requests | غير قابل للتحقق | dead UI |
| `/finance/fiscal-periods` | GET | `finance-budget.ts:665` | — | fiscal-periods | (استدلالي) | ناقص | تقرير قراءة فقط |
| `/finance/fiscal-periods/:period/close` | POST | `finance-budget.ts:703` | — | (لا UI) | — | غير قابل للتحقق | dead UI |
| `/finance/collection` | GET | `finance-collection.ts:78` | — | (محدود) | invoices | شغّال | — |
| `/finance/collection/:invoiceId/action` | POST | `finance-collection.ts:125` | — | (محدود) | — | شغّال | — |
| `/finance/recurring-journals` | GET/POST | `finance-recurring.ts:104,184` | — | recurring-journals | recurring_journals | شغّال | — |
| `/finance/recurring-journals/:id/run-now` | POST | `finance-recurring.ts:334` | — | recurring-journals | journal_entries | شغّال | يُرحّل قيدًا |
| `/finance/custodies` | GET | `finance-custodies.ts:176` | — | custodies | journal_entries | شغّال | `LIMIT 1000` مُضاف (#772) |
| `/finance/custodies/report` | GET | `finance-custodies.ts:273` | — | custody-aging-report | journal_entries | شغّال | `LIMIT 1000` مُضاف (#772) |
| `/finance/custodies` | POST | `finance-custodies.ts:519` | — | custodies | journal_entries | شغّال | — |
| `/finance/custodies/:id/settle` | POST | `finance-custodies.ts:789` | — | (لا زر) | journal_entries | غير قابل للتحقق | dead UI |
| `/finance/custodies/:id/approve` | PATCH | `finance-custodies.ts:934` | — | custodies | journal_entries | ناقص | `resource:{table:"custodies"}` جدول غير موجود |
| `/finance/cost-centers` | GET/POST/PATCH/DELETE | `finance-cost-centers.ts:57+` | — | (dropdown فقط) | cost_centers | ناقص | CRUD بلا UI كاملة |
| `/finance/accounting-mappings` | GET/POST | `accounting-engine.ts:127,148` | — | accounting-mappings-tab | accounting_mappings | شغّال | — |
| `/finance/journal-templates` | GET/POST/PUT/DELETE | `accounting-engine.ts:287+` | — | (لا UI) | journal_templates | غير قابل للتحقق | dead UI |
| `/finance/subsidiary-accounts` | GET/POST/DELETE | `accounting-engine.ts:463+` | — | (لا UI) | subsidiary_accounts | غير قابل للتحقق | dead UI |
| `/finance/contracts` | GET/POST/PATCH/DELETE | `finance-vendor-contracts.ts:60+` | — | (لا UI) | vendor_contracts | غير قابل للتحقق | dead UI |
| `/finance/gl-helpers/*/pending` | GET | `finance-gl-helpers.ts:96+` | — | gl-posting-queue | متعدّد | شغّال | — |

---

## جدول 4 — عدم التطابق UI ↔ API (Mismatches)

| الموقع | ما تُرسله الواجهة | ما يتوقّعه الـ schema | تشخيص ثابت | الإصلاح المقترح |
|---|---|---|---|---|
| project-costing.tsx:56 | `POST /finance/projects/:id/costs` | لا handler — `finance-hardening.ts` فيه `GET` فقط (`:1339`) | لا توجد route POST مطابقة → 404 دائم عند إضافة تكلفة | إضافة `POST /projects/:id/costs` في `finance-hardening.ts` يُرحّل تكلفة المشروع |
| vendor-detail.tsx:70,79 | `GET /invoices?vendorId=`, `/payments?vendorId=` | `finance-invoices.ts:256` يقرأ `status/page/limit` فقط — `invoices` جدول عملاء (`clientId`) | `vendorId` مُتجاهَل؛ الفواتير جدول عملاء أصلًا → تبويبا المورد فارغان | استخدام endpoint مدفوعات/فواتير الموردين الفعلي أو إخفاء التبويبين |
| purchase-orders.tsx (bulk) | `POST /entity-meta/bulk-action` بـ `purchase-order` | `tableMap` لا يحوي `purchase-order` | الإجراء الجماعي يرجع 400 صامتًا | إضافة `purchase-order` إلى `tableMap` |
| journal.tsx (نقر صف) | تنقّل إلى `/finance/journal/:id` | `financeRoutes.tsx` لا يسجّل `/finance/journal/:id` | تنقّل ميت رغم وجود `GET /journal/:id` خادميًا | تسجيل route `/finance/journal/:id` في `financeRoutes.tsx` |
| reports.tsx — cashflow netCashFlow | `summary.netCashFlow` | `GET /reports/cash-flow` يعيد `openingCash/closingCash/inflows/outflows/sections` ولا حقل `summary` | بطاقة `netCashFlow` تقرأ كائن `summary` غير مُعاد | اشتقاق `netChange` من `closingCash-openingCash` في الواجهة أو إضافة `summary` خادميًا |
| recurring-journal-detail.tsx | `runDate` في سجل التشغيل | الـ API يعيد `createdAt` | الحقل يُعرَض دائمًا `—` | محاذاة اسم الحقل في الواجهة إلى `createdAt` |
| salary-advances.tsx (ApprovalActions) | `pendingStatuses:["pending"]` | `GET /salary-advances` يعيد `'active'` مثبَّتًا (`finance-journal.ts:867`) | الأزرار لا تظهر إطلاقًا — العمود لا يطابق أي حالة | إعادة `je.status` الحقيقي بدل `'active'` |

---

## جدول 5 — التكرار والتعارض (Duplication/Conflict)

| الوظيفة | الموقع 1 | الموقع 2 | نوع التداخل | اقتراح الحل |
|---|---|---|---|---|
| اعتماد الفاتورة | `POST /invoices/:id/approve` (`finance-invoices.ts:570`) — يُرحّل GL + حد مبلغ | `PATCH /invoices/:id/approve` (`:1073`) — نقل حالة فقط بلا GL ولا حد | duplicate | حذف `PATCH .../approve` (لا مستهلك بعد توجيه الواجهة إلى POST) والإبقاء على `reject/return` فقط |
| تحويل طلب الشراء إلى أمر | `POST /purchase-requests/:id/convert` (`finance-purchase.ts:456`) | `POST /purchase-requests/:id/convert-to-po` (`:1213`) — لا ينسخ البنود | duplicate | توحيد المنطق في handler واحد ينسخ البنود وحذف الآخر |
| دورة مراجعة القيد اليدوي | `PATCH /journal-manual/:id/review` (`finance-hardening.ts:598`) — `pending_review→approved` | `PATCH /journal-manual/:id/approve` (`:662`) — نفس `fromStates:["pending_review"]` ونفس `toState` | duplicate | دمج الخطوتين في خطوة اعتماد واحدة أو تمييز أدوار `fromStates` بوضوح |
| نظام الفترات المالية | `/finance/fiscal-periods` v1 استدلالي قراءة فقط (`finance-budget.ts:665`) | `/fiscal-periods-v2` CRUD حقيقي على `financial_periods` (`finance-hardening.ts:133`) | duplicate/conflict | اعتماد v2 كمصدر وحيد وربط صفحة `fiscal-periods` به وحذف v1 |
| ترحيل GL للسند/السلفة | `financialEngine.postJournalEntry` يُنشئ قيدًا ويحرّك `currentBalance` عبر `createJournalEntry` | دورة الاعتماد اللاحقة (`/approve`) تنقل الحالة فقط دون أثر دفتر | conflict | تأجيل تحريك الرصيد إلى الاعتماد (نمط القيد اليدوي الموجة 2) |
| ترحيل قيد المشتريات | GRN يُرحّل `DR Inventory / CR GRNI` | `match-invoice` لا يُرحّل `DR GRNI / CR AP` ثم `payment-run` يخصم AP لم يُقيَّد | conflict | إضافة قيد تصفية GRNI في `match-invoice` |
| فحص إقفال الفترة | `lib/gl/posting.ts:94` (#767) | `financialEngine.postJournalEntry:98` + `systemGovernor.ts` | duplicate (مقصود/دفاع بالعمق) | مقبول — توثيقه كنقاط اختناق متعدّدة متعمَّدة |

---

## يحتاج Runtime Verification

- وجود تسلسلات قاعدة البيانات `invoice_number_seq` / `journal_number_seq` / `pr_number_seq` / `po_number_seq` المستخدمة عبر `nextval()` مع fallback عشوائي.
- ما إذا كان قيد `chk_purchase_orders_status` المُطبَّق فعليًا في القاعدة الحيّة هو نسخة الترحيل 084 (التي تفتقر `invoice_mismatch` و`payment_scheduled`) — التحقق بإجراء transition فعلي.
- جدول `payment_runs` يُنشأ كسولًا عبر `CREATE TABLE IF NOT EXISTS` داخل الـ handler لا عبر ترحيل.
- بذور `accounting_mappings` (GRN/AP/GRNI/VAT) لكل شركة جديدة — لا تُبذَر إلا وقت الترحيل.
- سلوك `buildScopedWhere` مع `enforceBranchScope` للمستخدمين غير المقيّدين بفرع على `/journal-manual`, `/payments`, `/ledger/:code`.
- DDL الكسول لجداول `fx_rates` / `fx_revaluations` و`ALTER TABLE invoices ADD COLUMN currency` — لا يُنفَّذ إلا عند طرق endpoint للـ FX.
- ما إذا كان `resource:{table:"custodies"}` في `finance-custodies.ts:418,934` يُسقِط فحص الملكية بصمت أو يرمي خطأ — لا يوجد جدول `custodies` (بيانات العهد في `journal_entries`).
- ما إذا كان `journal_entries.status` يبقى `'draft'` فعليًا للسند والسلفة بعد `financialEngine.postJournalEntry` (لأن `applyHeaderOverrides` لا يكتب `status` ما لم يُمرَّر).
- ظهور 404 من `/finance/projects/:id/costs` كخطأ مرئي أم فشل صامت للمستخدم.
- فراغ جدول `financial_periods` مقابل فحص الإقفال السنوي 12 شهرًا.

---

## العيوب المُرقّمة (Defect Register)

- **FIN-001** · conflict · blocking · structural — `match-invoice` لا يُرحّل قيد تصفية `DR GRNI / CR AP`؛ ثم `payment-run` يخصم AP لم يُقيَّد فيتراكم GRNI وتُنقَص AP. الدليل: `finance-purchase.ts:1408-1508` (لا `postJournalEntry`). التبعية: محرّك GRN في `receive` و`payment-run`.
- **FIN-002** · conflict · blocking · structural — قيد `chk_purchase_orders_status` (ترحيل 084) لا يحوي `invoice_mismatch` ولا `payment_scheduled`؛ كل transition إليهما يرمي Postgres 23514. الدليل: `migrations/084_status_constraints_and_timestamps.sql:47` مقابل `finance-purchase.ts:1456,1572`. التبعية: FIN-003.
- **FIN-003** · conflict · blocking · structural — في `schedule-payment` يُرحَّل قيد GL قبل `applyTransition`؛ عند فشل CHECK (FIN-002) يبقى قيد GL يتيم دون أمر شراء مطابق. الدليل: `finance-purchase.ts:1550` (post) ثم `:1567` (transition). التبعية: FIN-002.
- **FIN-004** · dead · blocking · narrow — `GET /salary-advances` يُسقِط `'active' AS status` بدل `je.status` فلا تظهر أزرار الاعتماد في القائمة والمؤشّرات خاطئة. الدليل: `finance-journal.ts:867`. التبعية: لا.
- **FIN-005** · conflict · impairing · structural — رفض السلفة (`PATCH /salary-advances/:id/approve`) لا يستدعي `reverseAccountBalances` رغم أن الرصيد تحرّك عند الإنشاء (`createJournalEntry` يحرّك `currentBalance` دائمًا). الدليل: `finance-journal.ts:954-1008` (`onApply` بلا عكس) مقابل `businessHelpers.ts:559-568`. التبعية: لا.
- **FIN-006** · dead · blocking · narrow — `PATCH /vouchers/:id/approve` يفلتر `ref LIKE 'VOUCHER%'` بينما السندات الفعلية `RV-/PV-`؛ لا اعتماد/رفض ينجح. الدليل: `finance-vendors.ts:624-650` مقابل `finance-journal.ts:771-773`. التبعية: لا.
- **FIN-007** · conflict · impairing · structural — السند يُرحّل GL ويحرّك `currentBalance` عند الإنشاء عبر `financialEngine.postJournalEntry`؛ لا دورة مسودة/اعتماد فصرف نقدي بلا اعتماد مُلزَم. الدليل: `finance-journal.ts:814` + `businessHelpers.ts:559-568`. التبعية: FIN-006.
- **FIN-008** · dead · blocking · structural — المطابقة البنكية (`auto-match` و`manual-match`) تُحدّث `bank_statements.matchStatus` فقط ولا تُرحّل أي قيد تسوية/تصفية. الدليل: `finance-algorithms.ts:413-501`, `:543-596`. التبعية: لا.
- **FIN-009** · mismatch · impairing · narrow — `GET /ap-aging` يُثبّت `0::numeric AS "paidAmount"` في فروع UNION الثلاثة فيُعرَض كل التزام بكامل قيمته دون خصم المدفوعات. الدليل: `finance-algorithms.ts:225,245,266`. التبعية: لا.
- **FIN-010** · dead · blocking · narrow — `POST /finance/projects/:id/costs` غير موجود (يوجد `GET` فقط)؛ زر "إضافة تكلفة" في `project-costing.tsx` يعطي 404. الدليل: `project-costing.tsx:56` مقابل `finance-hardening.ts:1339` (GET فقط). التبعية: لا.
- **FIN-011** · dead · impairing · narrow — `journal.tsx` ينقل صفه إلى `/finance/journal/:id` غير المسجّل في `financeRoutes.tsx` رغم وجود `GET /journal/:id` خادميًا. الدليل: `financeRoutes.tsx:88-89` (لا `:id`) مقابل `finance-journal.ts:1105`. التبعية: لا.
- **FIN-012** · dead · cosmetic · narrow — `accountsRouter.get/post("/journal")` كود ميت مُظلَّل بـ `journalRouter` المُركَّب أبكر. الدليل: `finance-accounts.ts:328,348` مقابل `index.ts:293` (journal) قبل `:303` (accounts). التبعية: لا.
- **FIN-013** · dead · impairing · narrow — صفحة `journal-manual-detail.tsx` تحوي زر العكس فقط؛ لا أزرار submit/review/post فلا يمكن قيادة دورة الحياة من التفصيل. الدليل: `journal-manual-detail.tsx` (مطفّأ `useApiMutation` reverse فقط) مقابل `finance-hardening.ts:561,598,714`. التبعية: لا.
- **FIN-014** · dead · impairing · structural — لا واجهة لإقفال فترة مالية؛ `fiscal-periods.tsx` يستخدم v1 الاستدلالي قراءة فقط بينما CRUD الحقيقي `/fiscal-periods-v2` بلا UI. الدليل: `fiscal-periods.tsx:36-38` مقابل `finance-hardening.ts:190,260`. التبعية: لا.
- **FIN-015** · duplicate · impairing · structural — نظاما فترات ماليّة متوازيان: v1 استدلالي (`finance-budget.ts:665`) وv2 CRUD (`finance-hardening.ts:133`). الدليل: الملفان. التبعية: FIN-014.
- **FIN-016** · duplicate · impairing · structural — `match-invoice` و`schedule-payment` يبقيان بلا UI؛ دورة GRN/مطابقة/دفع كاملة غير قابلة للوصول. الدليل: لا route في `financeRoutes.tsx` لها. التبعية: FIN-001.
- **FIN-017** · mismatch · impairing · narrow — `vendor-detail.tsx` يطلب `/invoices?vendorId=` و`/payments?vendorId=`؛ الـ handlers تتجاهل `vendorId` وجدول `invoices` للعملاء فالتبويبان فارغان دائمًا. الدليل: `vendor-detail.tsx:70,79` مقابل `finance-invoices.ts:256`. التبعية: لا.
- **FIN-018** · mismatch · cosmetic · narrow — الإجراء الجماعي لأوامر الشراء يرسل `purchase-order` غير الموجود في `tableMap` فيعيد 400 صامتًا. الدليل: `purchase-orders.tsx` (bulk-action). التبعية: لا.
- **FIN-019** · duplicate · cosmetic · narrow — `PATCH /invoices/:id/approve` صار بلا مستهلك بعد توجيه الواجهة إلى `POST .../approve`؛ يبقى مسارًا ميتًا يُرحّل بلا GL ولا حد مبلغ لو استُدعي مباشرة. الدليل: `finance-invoices.ts:1073` مقابل `invoice-detail.tsx:449`. التبعية: لا.
- **FIN-020** · duplicate · cosmetic · narrow — `convert` و`convert-to-po` لتحويل طلب الشراء؛ الأحدث لا ينسخ البنود. الدليل: `finance-purchase.ts:456` و`:1213`. التبعية: لا.
- **FIN-021** · duplicate · impairing · narrow — `/journal-manual/:id/review` و`/journal-manual/:id/approve` يحملان نفس `fromStates:["pending_review"]` ونفس `toState` — خطوتان متطابقتان. الدليل: `finance-hardening.ts:638` و`:690`. التبعية: لا.
- **FIN-022** · mismatch · impairing · narrow — `resource:{table:"custodies"}` في فحص الملكية يشير إلى جدول غير موجود (العهد في `journal_entries`)؛ الفحص قد يُسقَط بصمت. الدليل: `finance-custodies.ts:418,934`. التبعية: لا.
- **FIN-023** · dead · cosmetic · narrow — `POST /custodies/:id/settle` لا زر يستدعيه؛ التسوية تتم عبر `POST /custodies/settle` فقط. الدليل: `finance-custodies.ts:789` بلا مستهلك. التبعية: لا.
- **FIN-024** · dead · cosmetic · strategic-decision — أنظمة فرعية كاملة بلا UI: FX (rates/revaluation)، dunning، bad-debt، customer-advances، credit/debit memos، payment-run، GRN، vendor-contracts، journal-templates، subsidiary-accounts، budget-approval-queue، fiscal-periods-v2. الدليل: `finance-invoices.ts:1404-2053`, `finance-purchase.ts:984-1211`, `accounting-engine.ts:287-557`, `finance-vendor-contracts.ts`. التبعية: قرار مالك حول بناء UI أو إزالة.
- **FIN-025** · scaling · cosmetic · narrow — توقّع التدفقات النقدية لـ60/90 يومًا يعيد رقم 30 يومًا حرفيًا؛ ودالة `cashflow-dashboard` تتجاهل `?period=`. الدليل: `finance-hardening.ts` (`cash-flow-forecast`) و`finance-accounts.ts:500`. التبعية: لا.
- **FIN-026** · scaling · impairing · narrow — `GET /salary-advances` مقيّد `LIMIT 500` و`GET /journal-manual`/`/payments` بلا scope فروع؛ تحت كثرة الفروع/الشركات يرى المستخدم المقيّد صفوفًا غير صفوفه أو قائمة مبتورة. الدليل: `finance-journal.ts:867`, `finance-hardening.ts:494`. التبعية: لا.
- **FIN-027** · dead · cosmetic · narrow — `FileDropZone` تجميلي على صفحات الإنشاء (journal/expenses/vouchers/invoices/vendors/purchase-orders)؛ يجمع مرفقات لا تُرسَل ولا endpoint لها. الدليل: صفحات `pages/create/finance/*`. التبعية: لا.

---

## خلاف مع تقارير سابقة

التقارير المرجعية: `FUNCTIONAL_FINANCE_VERIFICATION.md` و`FINANCE_CRITICAL_REMEDIATION_REPORT.md`. أُكِّد أن C1/C2/C3/C7/C9/C11/C14 و#767/#771/#772/#776 مُصلَحة فعليًا في الكود الحالي، وأن C10 أُصلِح بالموجة 8 (#734) لا بـ#778. لكن توجد خلافات جوهرية:

1. **خلاف على ادعاء فشل إنشاء السلفة (`FINANCE_CRITICAL_REMEDIATION_REPORT.md §3.2`).** التقرير يدّعي أن `POST /salary-advances` "يهارد-فيل" برمي `NotFoundError` لأن `UPDATE ... SET status='pending_approval' WHERE status='draft'` لا يطابق صفًا بزعم أن القيد `'posted'`. هذا **غير دقيق**: `financialEngine.postJournalEntry` يستدعي `createJournalEntry` الذي لا يكتب عمود `status` في الـ INSERT (`businessHelpers.ts:521-530`)، و`journal_entries.status` افتراضه `'draft'` في الـ schema (`schema_pre.sql:8596`)، و`applyHeaderOverrides` لا يكتب `status` ما لم يُمرَّر `request.status !== "draft"` (`financialEngine.ts:139`). إذن الصف يبقى `'draft'` والـ UPDATE في `finance-journal.ts:939` **يطابق فعلًا** ولا يرمي `NotFoundError`. العيب الحقيقي ليس فشل الإنشاء بل أن `currentBalance` يتحرّك عند الإنشاء قبل أي اعتماد (FIN-007) وأن الرفض لا يعكسه (FIN-005).

2. **خلاف على وصف C4/§3.1 لحالة السند بأنها `'posted'`.** التقريران يصفان `POST /vouchers` بأنه "يُرحّل فورًا والصف `status='posted'`". في الواقع — لنفس سلسلة الاستدلال أعلاه — صف السند يبقى `journal_entries.status='draft'` (لا يُمرَّر `status`)، بينما الأثر الفعلي على الدفتر (`currentBalance`) يحدث عند الإنشاء داخل `createJournalEntry`. التشخيص الأدق: ليست الحالة `'posted'` بل تعارض بين حالة `'draft'` المُعلَنة وأثر دفتري واقع بالفعل (FIN-007) — وهذا يجعل توصية "حذف نقطة الاعتماد" في الخيار A أخطر مما يبدو لأن الرصيد قد تحرّك بلا اعتماد.

3. **خلاف جزئي على C6.** `FUNCTIONAL_FINANCE_VERIFICATION.md` يصنّف C6 ضمن "يحتاج runtime verification" لقيد CHECK. الفحص الثابت لترحيل 084 **حاسم لا يحتاج runtime**: `chk_purchase_orders_status` يضيف `invoice_matched` فقط ويُغفِل `invoice_mismatch` و`payment_scheduled` صراحةً (`migrations/084:47`) — العيب مؤكَّد ثابتًا (FIN-002)، والـ runtime مطلوب فقط لتأكيد أيّ نسخة قيد مُطبَّقة في القاعدة الحيّة.

4. **تخفيف تقدير C15.** التقرير يعدّ `finance-vendors.ts:253 GET /stats` كودًا ميتًا مُظلَّلًا. الفحص الحالي **لا يجد** أي `GET /stats` في `finance-vendors.ts` (أُزيل في الموجة 8)؛ يبقى ميتًا فقط `accountsRouter` `/journal` (FIN-012). كما أن `GET /journal/:id` **موجود** خادميًا (`finance-journal.ts:1105`) خلافًا لإيحاء التقرير بغيابه — العيب الحقيقي هو غياب تسجيل route الواجهة فقط (FIN-011).
