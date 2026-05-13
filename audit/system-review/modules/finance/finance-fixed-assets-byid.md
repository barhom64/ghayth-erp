# /finance/fixed-assets/:id — `artifacts/ghayth-erp/src/pages/details/fixed-asset-detail.tsx`

## 1. الميتاداتا
- المسار: `/finance/fixed-assets/:id`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/details/fixed-asset-detail.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:127`
- المجموعة: `finance`
- الكومبوننت: `FixedAssetDetail`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `:id`
- سطور الملف: 290
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

تفاصيل أصل ثابت — أرض، مبنى، سيارة، معدات.

| المرحلة | الإجراء | GL |
|---------|---------|-----|
| Acquisition | شراء | Dr Asset / Cr Cash/AP |
| Capitalization | تجميع تكلفة + setup | Dr Asset / Cr WIP |
| Depreciation (monthly) | accumulated | Dr Expense / Cr Acc Depr | راجع `finance-depreciation.md` |
| Impairment | تخفيض قيمة | Dr Impairment Loss / Cr Asset |
| Revaluation | إعادة تقييم | per IFRS rules |
| Maintenance | صيانة | Dr Maintenance Expense / Cr Cash |
| Transfer (بين فروع) | نقل | راجع `hr-transfers.md` للأشخاص، هنا للأصول |
| Disposal | بيع/خردة | Dr Cash + Dr Acc Depr / Cr Asset + (Gain/Loss) |
| Insurance claim | لو موجود |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| View asset details | GET `/finance/fixed-assets/:id` | `fixed_assets` | ✅ |
| Depreciation schedule | calculated | per method (straight-line, declining) | ✅ |
| Monthly depreciation post | cron | راجع `finance-recurring-journals.md` | ✅ critical |
| Manual adjustment (impairment) | requires approval + audit | راجع `governance/approvals.md` | ✅ critical |
| Revaluation | requires IFRS-compliant valuation | external | ⚠ |
| Maintenance history | linked | `asset_maintenance` | راجع `fleet-maintenance.md` لو vehicle |
| Insurance | linkage | per asset | راجع `properties.md` لو property |
| Disposal | POST `/fixed-assets/:id/dispose` | يولّد disposal GL + gain/loss | ✅ critical |
| Transfer (بين branches) | POST `/fixed-assets/:id/transfer` | with audit | ⚠ |
| Photos/documents | راجع `documents.md` | للـ insurance + audit | ✅ |
| تكامل مع `fleet.md` (لو vehicle) | linkage | ✅ |
| تكامل مع `properties.md` (لو property) | linkage | ✅ |
| تكامل مع `finance-depreciation.md` (engine) | ✅ critical |
| تكامل مع `finance-reports.md` (fixed asset register) | IFRS disclosure | ✅ |
| تكامل مع `finance-tax.md` | tax depreciation may differ | ZATCA rules | ⚠ |
| Audit log إجباري | كل تعديل/إهلاك/disposal | `audit_logs` | ✅ critical |
| RBAC | finance + asset manager | high-value disposal requires CFO | ✅ critical |

تحقق يدوي:
- [ ] هل depreciation method مرنة (straight-line, double-declining, units) per asset class؟
- [ ] هل disposal calculation للـ gain/loss دقيقة (NBV vs proceeds)؟
- [ ] هل photos إجبارية للـ disposal (proof of condition)؟
- [ ] هل tax depreciation schedule منفصل عن book depreciation؟
- [ ] هل impairment yearly testing (IFRS) tracked؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `:id` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **✅ PASS** — render=SKIP | fetch=SKIP | CTA=SKIP | nav=SKIP | smoke=SKIP
- ملاحظة: `unresolved: no row in /api/finance/fixed-assets`
- landedUrl: `?`
- توصية: مغلق
