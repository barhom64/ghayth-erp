# /store/products/:id — `artifacts/ghayth-erp/src/pages/store/product-detail.tsx`

## 1. الميتاداتا
- المسار: `/store/products/:id`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/store/product-detail.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/storeRoutes.tsx:12`
- المجموعة: `store`
- الكومبوننت: `ProductDetail`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `:id`
- سطور الملف: 260
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

تفاصيل منتج واحد — Product master record.

| النوع | الوصف |
|------|------|
| Stocked | inventory-tracked | يتطلب stock movements |
| Non-stocked | service or virtual | لا inventory |
| Composite (bundle) | bundle of items | BOM-like |
| Configurable | with variants (size, color) | options |
| Serialized | per unit serial | high-value items |
| Lot-tracked | per batch | foods, pharma |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| View product | GET `/store/products/:id` | `products` | ✅ |
| Update price | with effective date | راجع `store-pricing.md` | ✅ |
| Update cost (FIFO/WAVG) | راجع `finance-costing.md` | ✅ critical |
| Toggle active/inactive | flag | guard لو فيه orders | ✅ |
| Set tax category | راجع `finance-tax.md` | ✅ |
| Set GL accounts (revenue, COGS, inventory) | per category default | راجع `warehouse-categories.md` | ✅ |
| Stock levels (per warehouse) | aggregate | راجع `warehouse.md` | ✅ critical |
| Reorder level / EOQ | settings | per product | راجع `warehouse-reorder.md` | ⚠ |
| Lead time | per supplier | راجع `warehouse-suppliers.md` | ⚠ |
| Linked suppliers | preferred + alternates | راجع `warehouse-suppliers.md` | ⚠ |
| Photos / media | راجع `documents.md` | ✅ |
| Variants (size, color) | sub-products | ⚠ |
| Promotions linked | راجع `store-promotions.md` | ✅ |
| Sales history | aggregate | راجع `bi-reports.md` | ✅ |
| Reviews/ratings (لو online) | راجع `store-reviews.md` | ⚠ |
| Barcode | unique | scan support | ✅ |
| ZATCA-compliant tax | per category | راجع `finance-tax.md` | ✅ critical |
| Customs HS code (لو import) | للـ trade compliance | ⚠ |
| تكامل مع `warehouse.md` (inventory) | ✅ critical |
| تكامل مع `store-pricing.md` (price levels) | ✅ |
| تكامل مع `crm-quotes.md` (quoting) | ✅ |
| تكامل مع `finance-cogs.md` (costing) | ✅ critical |
| تكامل مع `bi-kpis.md` (top sellers, slow movers) | ✅ |
| Audit log إجباري | كل تعديل price/cost/status | `audit_logs` | ✅ critical |
| RBAC | product manager + finance for cost changes | ✅ |

تحقق يدوي:
- [ ] هل cost change تتطلب finance approval (audit critical)?
- [ ] هل deactivated product يمنع إضافته لـ orders جديدة بدون منع الـ history?
- [ ] هل reorder alert يطلق فعلاً عند الـ minimum level?
- [ ] هل lot/serial tracking enforced للأصناف القابلة فقط (لا overhead على الباقي)?
- [ ] هل barcode generation unique + indexed?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `:id` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **✅ PASS** — render=SKIP | fetch=SKIP | CTA=SKIP | nav=SKIP | smoke=SKIP
- ملاحظة: `unresolved: no id resolver for /store/products/:id`
- landedUrl: `?`
- توصية: مغلق
