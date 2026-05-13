# /warehouse — `artifacts/ghayth-erp/src/pages/warehouse.tsx`

## 1. الميتاداتا
- المسار: `/warehouse`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/warehouse.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:95`
- المجموعة: `warehouse`
- الكومبوننت: `Warehouse`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `warehouse`
- سطور الملف: 388
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

قائمة المستودعات والمخازن — مدخل الوحدة الأساسي.

| العمل | API | DB | الحالة |
|------|-----|-----|--------|
| List warehouses (per branch/tenant) | GET `/warehouse` | `warehouses` | ✅ |
| إنشاء مستودع | راجع `warehouse-create.md` | ✅ |
| تفعيل/تعطيل | PATCH `/warehouse/:id/status` | `warehouses.isActive` | ⚠ تحقق |
| ربط بالـ branch | FK | `warehouses.branchId` | ✅ |
| Default warehouse per branch | flag | `is_default` | ✅ |
| Inventory snapshot per warehouse | aggregations | `inventory_layers` | ✅ |
| Movement history | راجع `warehouse-movements.md` | ✅ |
| Inventory count | راجع `warehouse-inventory-count.md` | ✅ |
| Transfer بين warehouses | راجع `warehouse-transfers.md` | داخلي ولا يولّد GL إلا بفروقات تكلفة | ✅ |
| تكامل مع `finance/cogs` | عند بيع/صرف | راجع `finance-cogs.md` | ✅ |
| تكامل مع `store/sales` | حجز/خصم المخزون | راجع `store-sales.md` | ✅ |
| تكامل مع `procurement` | استلام PO | راجع `warehouse-receiving.md` | ✅ |
| Audit log | إجباري لكل تعديل | `audit_logs` | ✅ |
| Soft delete إذا فيه حركات | guard | لا يحذف إذا كان عليه stock | ✅ critical |
| RBAC | warehouse manager + above | `subKey=warehouse` | ✅ |

تحقق يدوي:
- [ ] هل deactivate warehouse يمنع الحركات الجديدة فقط أم يحجب القراءة أيضاً؟
- [ ] هل default warehouse per branch مفعّل بشكل تلقائي عند إنشاء branch جديد؟
- [ ] هل cross-branch transfers تحتاج موافقة؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `warehouse` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/warehouse`
- لقطة: `audit/screenshots/warehouse.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
