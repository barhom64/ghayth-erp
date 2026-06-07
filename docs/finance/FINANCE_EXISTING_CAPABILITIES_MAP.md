# FINANCE_EXISTING_CAPABILITIES_MAP.md

خريطة القدرات المالية الموجودة فعلاً في غيث — قبل التوحيد (#1715).

> المبدأ التنفيذي: **لا نُعيد البناء من الصفر.** نحصر الموجود، نصنّفه،
> نختار المصدر الأقوى، ننقله إلى خدمة مركزية، نربط الصفحات تدريجياً عبر
> Adapters، ثم نُعطّل/نُخفي المكرر بعد التأكد، ونضيف اختبارات تمنع رجوع
> التشعتر.

## 1. القدرات الموجودة (الحصر)

| القدرة | أين توجد | تعمل؟ | مكررة؟ | القرار |
|---|---|---|---|---|
| تخصيص الأبعاد للبند | `components/shared/line-allocation-panel.tsx` (`LineAllocation`, `buildAllocationPayload`, `deriveAllocationStatus`) | نعم | نمط مكرر داخل كل صفحة create | **المصدر الأقوى** — يُبقى ويُغلَّف بـ `AllocationTargetSelect` (#1715 PR-3) |
| حقل «ربط بـ» الموحّد | `components/shared/allocation-target-select.tsx` (PR-3) | نعم | — | المصدر المركزي الجديد للواجهة |
| محرك القيود | `lib/engines/financialEngine.ts` (`postJournalEntry`, `resolveAccountCode`) | نعم | لا | المصدر الوحيد للترحيل — لا يُكرَّر |
| مُحلِّل التخصيص الخلفي | `lib/accountingAllocation.ts` (`resolveLineAllocation`) | نعم | لا | المصدر المركزي للأبعاد + CC |
| تصنيف الحساب (usage) | `lib/financeAccountClassifier.ts` (#1715 PR-1) | نعم | كان مبعثراً كـ`code.startsWith` | المصدر المركزي — يُمنع `code.startsWith` كمنطق أساسي |
| سياسة الترحيل (دفع↔حساب) | `lib/financePostingPolicy.ts` (#1715 PR-1) | نعم | كان منطقاً متناثراً في الصفحات | المصدر المركزي للرفض الخلفي |
| ربط الواجهة (دفع↔حساب) | `lib/finance-account-usage.ts` (#1715 PR-2) | نعم | كان `code.startsWith("11"/"12")` | المصدر المركزي للفلترة الأمامية |
| مركز الترقيم | `lib/numberingService.ts` (`issueNumber`) | نعم | لا | المصدر الوحيد — يُمنع `Date.now` كرقم نهائي |
| رموز الضريبة | `tax_codes` + `lib/taxCodes.ts` + `lib/tax-math.ts` | نعم | كان VAT split مكرراً 3× (وُحِّد في #1524) | موحَّد — `amountTaxSplit`/`lineTaxSplit` |
| مراكز التكلفة | `routes/finance-cost-centers.ts` + auto-create | نعم | لا | المصدر الوحيد — يُستنتج آلياً عبر resolver |
| الاعتمادات | `lib/lifecycleEngine.ts` + `initiateApprovalChain` | نعم | لا | المصدر الوحيد |
| التدقيق | `createAuditLog` + `allocation_override_log` | نعم | لا | المصدر الوحيد |

## 2. الخدمات المركزية المستهدفة

| الخدمة | الحالة |
|---|---|
| `financeAccountClassifier.ts` | ✅ موجود (PR-1) |
| `financePostingPolicy.ts` | ✅ موجود (PR-1) |
| `financeOperationContext.ts` | ⏳ — يجمع نوع العملية + الطرف + المصدر/الوجهة + الربط + الأثر + القيد + التقرير + سبب التجاوز |
| `financeAllocationResolver.ts` | جزئياً عبر `accountingAllocation.resolveLineAllocation` — يُغلَّف باسم موحَّد |
| `financeLineClassifier.ts` | ⏳ — تصنيف بند المستند (منتج/خدمة/أصل/وقود/إيجار…) |
| `financeIntakeClassifier.ts` | ⏳ — تصنيف مدخلات العملية قبل الترحيل |

## 3. الـAdapters (بدل كسر القديم)

| Adapter | يحوّل من | إلى |
|---|---|---|
| `fromLegacyLineAllocation` | `LineAllocation` القديم | `FinanceOperationContext` |
| `fromLegacyVoucherForm` | حقول سند قديمة | `FinanceOperationContext` |
| `fromLegacyInvoiceLine` | بند فاتورة قديم | بند مُصنَّف + أبعاد |
| `fromLegacyExpenseForm` | نموذج مصروف قديم | `FinanceOperationContext` |

## 4. موجات التحويل

1. **الحسابات** — accountUsage + سياسة الوراثة + تقرير الفجوات. ✅ (PR-1)
2. **المصروفات والسندات** — ربط الدفع بالحساب + حقل «ربط بـ». ✅ (PR-2/3/4)
3. **الفواتير والمشتريات** — تعميم المكوّن + بنود من الكتالوج. (جزئياً #1519)
4. **الأصول والمخزون والعهد** — تعميم المكوّن + استنتاج CC.
5. **القوائم والتقارير** — توحيد الفلاتر + بوابة تقارير.
6. **القائمة الجانبية** — إعادة التصنيف حسب دورة العمل (13 مجموعة).

## 5. ضوابط منع رجوع التشعتر (Guardrails)

1. **ممنوع** فلترة الحسابات داخل الصفحة مباشرة — استخدم `finance-account-usage`.
2. **ممنوع** الاعتماد على `code.startsWith` كمنطق أساسي — استخدم `accountUsage`.
3. **ممنوع** عرض رقم الحساب بدون اسمه.
4. **ممنوع** رقم مستند بـ`Date.now` كرقم نهائي — استخدم `issueNumber`.
5. **ممنوع** إضافة صفحة مالية بدون تصنيفها في `FINANCE_PAGE_CLASSIFICATION_MATRIX.md`.
6. **ممنوع** عملية مالية بدون `FinanceOperationContext`.

> هذه الضوابط تُفرَض تدريجياً عبر اختبارات guard (lint-pattern) كلما حُوّلت
> موجة، فلا تعود الصفحات للتشعتر بعد توحيدها.

### الإنفاذ المُفعَّل حتى الآن

| الضابط | آلية الإنفاذ | الحالة |
|---|---|---|
| #6 — لا عملية مالية بدون `FinanceOperationContext` | قاعدة lint `direct-posting-policy-in-route` تمنع استدعاء `assertPaymentSourceAllowed` مباشرةً داخل أي route؛ السياسة تُبلَغ فقط عبر `assertOperationValid` | ✅ مُفعَّلة (المصروفات + السندات حُوِّلت) |
| #6 (مستوى الوحدة) | `financeJournalContextWiringSmoke` يثبّت تدفقَي الإنشاء على المحوّلات + `assertOperationValid` | ✅ |

> الموجات القادمة (الفواتير/المشتريات، الأصول/المخزون/العهد) تُضاف إلى نفس
> قاعدة الـlint بإسقاط استثناءاتها تدريجياً حتى يصبح كامل سطح الإنشاء المالي
> مارًّا عبر السياق.
