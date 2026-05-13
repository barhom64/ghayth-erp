# /warehouse/categories/create — `artifacts/ghayth-erp/src/pages/create/warehouse/categories-create.tsx`

## 1. الميتاداتا
- المسار: `/warehouse/categories/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/warehouse/categories-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:98`
- المجموعة: `warehouse`
- الكومبوننت: `WarehouseCategoriesCreate`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 60
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(write)_ | `/warehouse/categories` | POST | ✅ | ✅ | — | — | ✅ | ✅ | — |

### تفاصيل الأزرار المرئية
- L44: "مسح المسودة" → `clearDraft`
- L53: "(بلا تسمية)" → `() => setLocation("/warehouse")` 🔒
- L54: "(بلا تسمية)" → `handleSubmit` 🔒

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

إنشاء تصنيف صنف جديد — New item category.

| الحقل | المتطلب |
|------|--------|
| Name (ar/en) | إجباري — unique per tenant |
| Code | إجباري |
| Parent | للـ tree | optional |
| Default tax (VAT category) | راجع `finance-tax.md` |
| Default UoM | unit of measure |
| Default GL accounts | inventory, COGS, revenue | راجع `finance-accounts.md` ✅ critical |
| Description | optional |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| Create category | POST `/warehouse/categories` | `item_categories` | ✅ |
| Validate unique name+code | ✅ critical |
| Validate parent type matches | ✅ |
| Set defaults (tax, UoM, GL) | inheritance for items | ✅ critical |
| تكامل مع `warehouse-categories.md` (list/tree) | ✅ |
| تكامل مع `store-products-byid.md` (inherit defaults) | ✅ |
| تكامل مع `finance-accounts.md` (GL inheritance) | ✅ critical |
| Audit log إجباري | `audit_logs` | ✅ |
| RBAC | warehouse manager + finance for GL | ✅ |

تحقق يدوي:
- [ ] هل defaults inherited بدقة عند إنشاء item جديد?
- [ ] هل parent type validation صارم؟
- [ ] هل tax category mapping consistent مع ZATCA rules?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `create` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=SKIP | CTA=PASS | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/warehouse/categories/create; write POST /api/intelligence/activity → 200`
- لقطة: `audit/screenshots/warehouse_categories_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
