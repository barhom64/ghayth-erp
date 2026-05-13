# /warehouse/categories — `artifacts/ghayth-erp/src/pages/warehouse.tsx`

## 1. الميتاداتا
- المسار: `/warehouse/categories`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/warehouse.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:105`
- المجموعة: `warehouse`
- الكومبوننت: `Warehouse`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `categories`
- سطور الملف: 388
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

تصنيف الأصناف — تسلسل هرمي (parent/child) لتنظيم catalog.

| العمل | API | DB | الحالة |
|------|-----|-----|--------|
| List categories (tree) | GET `/warehouse/categories` | `item_categories` | ✅ |
| إنشاء category | راجع `warehouse-categories-create.md` | ✅ |
| تعديل/إعادة تسمية | PATCH `/warehouse/categories/:id` | ✅ |
| ربط بـ parent | FK | `parentId` (self-ref) | ✅ |
| حذف category | guard | لا يحذف إذا فيه items | ✅ critical |
| ربط بـ GL account default | for inventory class | `defaultAccountId` | ⚠ تحقق |
| Default tax (per category) | للأصناف الموروثة | راجع `finance-tax.md` | ⚠ |
| Default unit-of-measure | المرجع | `defaultUomId` | ✅ |
| تكامل مع `finance-cogs.md` | per category COGS account | ✅ |
| Audit log | كل تعديل | `audit_logs` | ✅ |
| Reorder/drag-drop | sort key | `sortOrder` | ⚠ تحقق |
| Bulk move items | بين categories | راجع `warehouse-items.md` | ⚠ |

تحقق يدوي:
- [ ] هل تغيير parent يعيد حساب inventory totals بشكل عرضي؟
- [ ] هل default tax يطبَّق فقط على الأصناف الجديدة أم على الموجودة أيضاً؟
- [ ] هل الـ tree عمقه محدود (للأداء)؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `categories` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/warehouse/categories`
- لقطة: `audit/screenshots/warehouse_categories.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
