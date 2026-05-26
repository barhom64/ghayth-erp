# Finance Line-Level Accounting Allocation Blueprint

> الموقع: `docs/blueprints/finance-allocation.md`
>
> الحالة: **مُنفَّذ — Phase 0/P0 + معظم P1 شغّال في الإنتاج**.
> آخر تحديث: 2026-05-25.

## ملخص تنفيذي

سعادة المحامي إبراهيم طلب أن يتحول النظام المالي من **Document-Level Posting**
(قيد واحد على رأس المستند بحسابات افتراضية) إلى **Line-Level Accounting
Allocation + Dimensional Journal Posting** — كل بند مالي يعرف حسابه ومركز
تكلفته وكيانه التشغيلي، وكل القيود الناتجة تحمل نفس الأبعاد بحيث تقارير
الربحية حسب المركبة/العقار/المشروع/العمرة تكون دقيقة من المصدر.

هذا الـ Blueprint يوثّق:
1. **المعمارية النهائية** — ما هي الجداول والـ services والـ routes.
2. **خريطة الـ codebase الفعلية** — أين يعيش كل جزء.
3. **سير العمل المتوقع** — من إنشاء البند حتى الـ JE.
4. **الحالة الراهنة** — ما اكتمل، ما متبقي.

---

## 1. المعمارية النهائية

### 1.1 الطبقات

```
┌─────────────────────────────────────────────────────────────┐
│ UI (React/wouter)                                            │
│ • LineAllocationPanel — Reusable per-line allocation form    │
│ • Invoice / PO / Journal-Manual create forms                 │
│ • /finance/allocation-rules — rules registry                 │
│ • /finance/allocation-results — audit trail                  │
└──────────────────────────┬──────────────────────────────────┘
                           │  POST /finance/{document}
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ Route Handler (Express + zod)                                │
│ • Validate dimensional fields per line                       │
│ • Persist to {invoice_lines | purchase_*_items | ...}        │
│ • Carry dimensions into the engine call's `lines[]`          │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ accountingAllocation.ts (resolver service)                   │
│ • Read accounting_allocation_rules ordered by priority       │
│ • For each line: resolve account + cost center + dimensions  │
│ • Validate completeness — block approval if required link    │
│   missing                                                     │
│ • Write accounting_allocation_results (audit trail)          │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ financialEngine.postJournalEntry (lib/engines/)              │
│ • Accept JournalEntryLine[] with full dimensional set        │
│ • Group by (accountCode + dimensions) for clean rollup       │
│ • INSERT INTO journal_lines with dimensions                  │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ journal_lines (PostgreSQL)                                   │
│ • The single source of truth for analytical reports          │
│ • Per-row: accountCode + costCenterId + vehicleId            │
│            + propertyId + projectId + contractId + ...       │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 الجداول

| الجدول | الـ migration | الغرض |
|--------|---------------|-------|
| `invoice_lines` (+18 حقل أبعاد) | 200 | بنود الفاتورة تحمل التوجيه |
| `purchase_request_items`, `purchase_order_items`, `goods_receipt_items` (+ `lineTreatment`) | 202 | بنود الشراء تحمل التوجيه + lineTreatment |
| `accounting_allocation_rules` | 203 | قواعد التوجيه التلقائي |
| `accounting_allocation_results` | 203 | audit trail لكل قرار توجيه |
| `journal_lines` (الأبعاد كانت موجودة سابقاً) | 201 + 207 | الأبعاد على القيد |
| `cost_centers` (type + relatedEntityType + relatedEntityId) | 091 | مراكز التكلفة المرتبطة بكيانات |
| `accounting_mappings` | (موجود سابقاً) | mapping عام على مستوى العملية (fallback) |
| `chart_of_accounts` | (موجود سابقاً) | دليل الحسابات الموحد |

### 1.3 المكونات الرئيسية

| المكوّن | الملف | الوظيفة |
|---------|-------|---------|
| `accountingAllocation` | `artifacts/api-server/src/lib/accountingAllocation.ts` | resolver + buildAllocationPayload + validateCompleteness |
| `financialEngine.postJournalEntry` | `artifacts/api-server/src/lib/engines/financialEngine.ts` | المحرك الموحد لكل قيد |
| `JournalEntryLine` interface | `artifacts/api-server/src/lib/businessHelpers.ts:426` | يحمل كل الأبعاد |
| `LineAllocationPanel` | `artifacts/ghayth-erp/src/components/shared/line-allocation-panel.tsx` | UI per-line dimensional editor |

---

## 2. خريطة الـ codebase الفعلية

### 2.1 Backend — Routes

| المسار | الحالة | ملاحظات |
|--------|--------|---------|
| `POST /finance/invoices` | ✅ يحفظ الأبعاد | `createInvoiceSchema.lines` يقبل 18 حقل |
| `POST /finance/invoices/:id/approve` | ✅ يبني JE per-account-and-dim | per-line grouping |
| `POST /finance/invoices/:id/preview-posting` | ✅ يكشف الـ blockers + warnings | gate قبل approve |
| `POST /finance/purchase-requests` | ✅ يحفظ الأبعاد + lineTreatment | |
| `POST /finance/purchase-orders` | ✅ يحفظ الأبعاد + lineTreatment | |
| GRN posting (داخل route الـ goods-receipt) | ✅ يستخدم lineTreatment للتوجيه | |
| `POST /finance/journal-manual` | ✅ يقبل الأبعاد (#1092) | الـ schema تم توسيعه |
| `GET /finance/allocation-rules` (CRUD) | ✅ | priority + filter by docType/isActive |
| `GET /finance/allocation-results` | ✅ | filter by source/status/rule |

### 2.2 Frontend — UI

| الصفحة | الحالة | الـ PR |
|--------|--------|--------|
| `/finance/invoices/create` (per-line allocation) | ✅ | #1090 |
| `/finance/purchase-orders/create` (lineTreatment + allocation) | ✅ | #1090 |
| `/finance/journal-manual/create` (per-line allocation) | ✅ | #1092 |
| `/finance/allocation-rules` (registry list) | ✅ | #1094 |
| `/finance/allocation-results` (audit trail) | ✅ | #1095 |
| `/finance/profitability/vehicle/:id` (uses journal_lines.dim) | ✅ | #1074 |
| `/finance/profitability/property/:id` | ✅ | #1074 |
| `/finance/profitability/project/:id` | ✅ | #1074 |
| `/finance/profitability/umrah-agent/:id` | ✅ | #1074 |
| `/finance/reports/unmapped-lines` (gap report) | ✅ | #1078 |
| `/finance/reports/gl-integrity-gaps` (pre-close audit) | ✅ | #1061 |

### 2.3 المكوّن المشترك

`LineAllocationPanel`:
- مغلق افتراضياً مع badge للحالة (موجَّه/غير موجَّه/تعديل يدوي)
- التوسعة تكشف: AccountSelect / CostCenterSelect / activityType / VehicleSelect /
  propertyId / unitId / ProjectSelect / contractId / assetId
- زر "تأكيد كتعديل يدوي" + textarea للسبب
- `buildAllocationPayload()` يحوّل state إلى backend payload

---

## 3. سير العمل المتوقع

### 3.1 فاتورة "نقل رمل + إيجار قلاب + تأشيرة عمرة" — قبل وبعد

#### قبل
```
DR  1200 — AR                                        20 700.00
CR  4000 — Revenue (إجمالي)                         18 000.00
CR  2300 — VAT Payable                               2 700.00
```
تقارير الربحية تظهر صفر للمركبة ولوكيل العمرة، لأن الأبعاد فُقدت.

#### بعد
```
DR  1200 — AR                                        20 700.00
CR  4100 — إيرادات نقل           [cc=Vehicle 27]    10 000.00  ← بند نقل رمل
CR  4200 — إيرادات تأجير معدات   [cc=Vehicle 41]     5 000.00  ← بند تأجير قلاب
CR  4300 — إيرادات تأشيرات عمرة  [umrahAgentId=8]    3 000.00  ← بند تأشيرة
CR  2300 — VAT Payable                               2 700.00
```
كل بند له حسابه ومركز تكلفته ودوره في تقرير الربحية.

### 3.2 GRN لأمر شراء متنوع المعالجة

```
DR  1300 — Inventory          [productId=N1]         5 000  ← lineTreatment=inventory
DR  5170 — Vehicle Cost       [vehicleId=27]         1 200  ← lineTreatment=vehicle_cost
DR  5180 — Project Cost       [projectId=42]         3 800  ← lineTreatment=project_cost
DR  5190 — Property Maintenance [propertyId=15]      2 100  ← lineTreatment=property_maintenance
DR  1500 — Fixed Asset        [assetId=99]           8 000  ← lineTreatment=fixed_asset
DR  1450 — Supplier Prepayment                       1 000  ← lineTreatment=prepayment
CR  2100 — AP                                       21 100
```

### 3.3 audit trail لكل قرار توجيه

عند كل approve / GRN / save:
1. Resolver يقرأ القواعد بترتيب الـ priority
2. أول قاعدة تطابق الـ documentType + lineType + activityType + entityType تطبَّق
3. النتيجة تحفظ في `accounting_allocation_results`:
   - sourceTable + sourceLineId
   - ruleId (أو null للافتراضي)
   - resolvedAccountCode + costCenterId + dimensions
   - resolutionStatus (`resolved` / `manual_override` / `partial` / `unmapped`)
   - warnings
   - resolvedBy + resolvedAt
   - manualOverrideReason (لو متوفر)

عند الـ override اليدوي:
1. المستخدم يفتح `LineAllocationPanel`
2. يكتب accountCode / costCenter / dimensions يدوياً
3. يضغط "تأكيد كتعديل يدوي" → يطلب سبباً
4. الحفظ ينتج resolutionStatus='manual_override' في الـ results

---

## 4. الحالة الراهنة (P0/P1 — مكتمل، P2 — جزئي)

### ✅ مكتمل (P0)

- [x] dimensional fields على invoice_lines, purchase_order_items, goods_receipt_items, journal_lines
- [x] backend يحفظ + يستخدم الأبعاد في approve/GRN/manual
- [x] LineAllocationPanel على invoice + PO + journal manual
- [x] preview-posting endpoint + UI (CogsPreviewCard)
- [x] accountingAllocation service (resolver)
- [x] accounting_allocation_rules + results جداول + CRUD
- [x] UI registry + audit trail explorer
- [x] تقارير ربحية لكل entity type تقرأ من journal_lines

### ⚠️ جزئي / مفصل (P1)

- [x] lineTreatment على PO (9 خيارات)
- [ ] expense form لا يحتوي LineAllocationPanel (الـ expense single-tx بدون بنود)
- [ ] رسالة "Approval gate" إذا allocationStatus='unmapped' — backend يدعم، UI يستحسن إضافة blocker إضافي

### 📋 متبقي (P2 — follow-up)

- [ ] **Form للـ allocation rules** (الـ schema 15+ حقل، يحتاج multi-step wizard)
- [ ] **Product/Service catalog UI** — backend موجود (migration 203)، UI form ناقص
- [ ] **Auto-provisioning approval workflow** — `autoCreateMissing=true` لكن لا يوجد approval gate من المدير المالي
- [ ] **تقرير "التعديلات اليدوية"** — جدول لكل override مع actor/reason/before-after
- [ ] **اختبارات integration** — اختبار end-to-end لتدفق فاتورة 3-بنود-3-حسابات

---

## 5. المراجع التاريخية للحملة

| PR | العنوان | الـ scope |
|----|---------|-----------|
| #1090 | Per-line allocation UI invoice + PO | P0 + P1 |
| #1092 | Journal manual dimensions | P0 finale |
| #1094 | Allocation rules registry list | P2 (read-only) |
| #1095 | Allocation results audit-trail explorer | P2 (read-only) |
| #1074 | Profitability per vehicle/property/project/umrah-agent | P2 (reports) |
| #1078 | Unmapped lines pre-close report | governance |
| #1061 | GL integrity gaps pre-close report | governance |

---

## 6. نقاط التماس مع باقي الـ Blueprints

- [`finance-invoices.md`](./finance-invoices.md) — تفاصيل الـ AR / approve / credit-memo / debit-memo
- [`finance-zatca.md`](./finance-zatca.md) — VAT + WHT + ZATCA filing flow

---

## 7. تعريف الـ "Done" النهائي (للقياس)

النظام مكتمل عندما:

1. ✅ كل invoice_line يستطيع يحمل (account, cc, dimensions)
2. ✅ كل purchase_*_item يستطيع يحمل (account, cc, dimensions, lineTreatment)
3. ✅ journal_lines تحفظ الأبعاد عبر كل المصادر
4. ✅ approve invoice متعدد البنود لا يرحل كل شيء على revenue واحد
5. ✅ GRN متنوع المعالجة لا يرحل كل شيء على inventory_receipt
6. ✅ posting preview يكشف الـ blockers قبل approve
7. ✅ التوجيه الناقص يمنع الاعتماد (`allocationStatus='unmapped'` rule)
8. ✅ تقارير ربحية entity-type تقرأ مباشرة من journal_lines
9. ✅ لا يوجد محرك قيود مكرر
10. ✅ لا يوجد دليل حسابات مكرر
11. ✅ الـ override اليدوي يتطلب سبباً ويُسجَّل في الـ audit trail
12. ⚠️ Form لإنشاء/تعديل allocation_rules — **متبقي** (read-only registry موجود)

---

> سعادة المحامي إبراهيم: 11 من 12 من معايير الـ "Done" مكتملة. المتبقي
> الـ rule authoring form (الـ wizard متعدد الخطوات) — والسبب أن الـ schema
> فيها 15 حقلاً يتفرع منها conditionsJson و dimensionStrategyJson كـ JSON
> ditto، فبنينا أولاً الـ registry للـ read، وفي رؤيتنا أنه يستحق PR خاص
> به بمكوّن JSON editor لإدارة القواعد المعقدة.
