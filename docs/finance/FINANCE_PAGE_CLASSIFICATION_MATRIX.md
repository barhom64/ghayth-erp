# FINANCE_PAGE_CLASSIFICATION_MATRIX.md

تصنيف كل صفحة مالية إلى مجموعتها الوحيدة + المكوّن المركزي الذي تستخدمه.
يمنع تكرار المنطق ويضمن «كل صفحة في مجموعة واحدة».

| الصفحة | المجموعة (1–13) | يستخدم FinanceOperationContextPanel | يستخدم AllocationResolver |
|---|---|---|---|
| dashboard | 1 لوحة المالية | — | — |
| cfo-cockpit | 1 | — | — |
| invoices-create | 4 العملاء والمقبوضات | ✓ | ✓ |
| invoices / invoice-detail | 4 | — | — |
| customer-receipt / voucher (قبض) | 4 | ✓ | ✓ |
| customer-advances | 4 | — | — |
| receivables / collection | 4 | — | — |
| customer-statement / 360 | 4 | — | — |
| purchase-orders-create | 5 الموردون والمدفوعات | ✓ | ✓ |
| vendors-create | 5 | — | — |
| vendor-invoices | 5 | ✓ | ✓ |
| vouchers-create (صرف) | 5 | ✓ | ✓ |
| payments / payment-run | 5 | ✓ | — |
| expenses-create | 6 المصروفات والعهد | ✓ | ✓ |
| expenses | 6 | — | — |
| cost-splitter | 6 | ✓ | ✓ |
| custodies / custody-workbench | 6 | ✓ | — |
| journal-create / journal-manual-create | 7 دفتر الأستاذ | ✓ | ✓ |
| journal / posting-activity | 7 | — | — |
| recurring-journals / templates | 7 | — | — |
| account-transfer | 3 الخزينة والبنوك | ✓ | — |
| treasury / bank-reconciliation | 3 | — | — |
| cost-centers / tree / rules | 8 مراكز التكلفة | — | — |
| allocation-coverage / results / override-log | 8 | — | — |
| fixed-assets / register / depreciate | 9 الأصول | ✓ (صرف الأصل) | — |
| inventory-costing / cip | 9 | — | — |
| tax-system / tax-codes / vat / wht / zatca | 10 الضرائب | — | — |
| budget / fiscal-periods / year-end | 11 الميزانيات والإقفالات | — | — |
| reports/* | 12 التقارير | — | — |
| accounts / accounts-create / settings | 13 الإعدادات | — | — |

## ملاحظات

- العمود «يستخدم FinanceOperationContextPanel» يحدّد صفحات الإنشاء التي
  تحتاج اختيار مصدر/وجهة المال + هدف الربط. هذه هي نقاط التعميم.
- العمود «AllocationResolver» يحدّد الصفحات التي تستدعي
  `financeAllocationResolver` لاستنتاج CC + الأبعاد + الأثر التشغيلي.
- لا صفحة في أكثر من مجموعة. أي صفحة جديدة تُضاف لمجموعة واحدة فقط.

## خطة التعميم (PRs متسلسلة)

- **PR-1 (الأساس):** migration accountUsage/childrenUsagePolicy + الخدمات
  المركزية الأربع + سياسة الترحيل (posting policy) + تقرير الفجوات + هذه
  الوثائق. (غير كاسر)
- **PR-2:** المكوّن `FinanceOperationContextPanel` + ربط طريقة الدفع
  بالحسابات المسموحة في expenses-create + vouchers-create.
- **PR-3:** إعادة بناء Allocation (الحقل الرئيسي «ربط بـ» + الحقول الشرطية)
  في expenses + vouchers + journal + PO.
- **PR-4:** تعميم على باقي الصفحات (custody/transfer/assets/receipt).
- **PR-5:** إعادة تنظيم القائمة المالية حسب المجموعات الـ13.
- **PR-6:** أثر صيانة المركبة/العقار (إنشاء/ربط تذكرة) + تقارير الفجوات.
