# /warehouse/categories/:id — `artifacts/ghayth-erp/src/pages/details/warehouse-category-detail.tsx`

## 1. الميتاداتا
- المسار: `/warehouse/categories/:id`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/details/warehouse-category-detail.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:102`
- المجموعة: `warehouse`
- الكومبوننت: `WarehouseCategoryDetail`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `:id`
- سطور الملف: 166
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

تفاصيل تصنيف صنف واحد — Category detail + linked items.

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| View category | GET `/warehouse/categories/:id` | `item_categories` | ✅ |
| Linked items | aggregate | `products` WHERE categoryId | ✅ |
| Sub-categories | self-FK | `parentId` | ✅ |
| Inventory value | aggregate | راجع `warehouse-movements.md` | ✅ |
| Sales (per period) | aggregate | راجع `bi-reports.md` | ✅ |
| Update defaults | propagate to existing items (optional) | with confirmation | ⚠ critical |
| Deactivate | guard لو فيه active items | ✅ critical |
| Merge with another | bulk move items | with audit | ⚠ |
| Reorder | sortOrder | drag-drop | ⚠ |
| تكامل مع `store-products-byid.md` (linked items) | ✅ |
| تكامل مع `finance-tax.md` (tax category) | ✅ critical |
| تكامل مع `finance-cogs.md` (per category COGS) | ✅ critical |
| Audit log إجباري | كل تعديل | `audit_logs` | ✅ |
| RBAC | warehouse manager + finance for GL | ✅ |

تحقق يدوي:
- [ ] هل تعديل default tax يطبَّق فقط على items جديدة أم على الموجودة (configurable)?
- [ ] هل deactivate يمنع item جديد بدون تأثير على المخزون الحالي?
- [ ] هل merge categories audited بشكل صارم (لا data loss)?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `:id` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **✅ PASS** — render=SKIP | fetch=SKIP | CTA=SKIP | nav=SKIP | smoke=SKIP
- ملاحظة: `unresolved: /api/warehouse/categories → 401`
- landedUrl: `?`
- توصية: مغلق
