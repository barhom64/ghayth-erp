# /warehouse/inventory-count — `artifacts/ghayth-erp/src/pages/warehouse.tsx`

## 1. الميتاداتا
- المسار: `/warehouse/inventory-count`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/warehouse.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:107`
- المجموعة: `warehouse`
- الكومبوننت: `Warehouse`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `inventory-count`
- سطور الملف: 387
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L30: "حركة جديدة"
- L36: "منتج جديد"
- L153: "إضافة منتج"
- L238: "إضافة حركة"
- L298: "تصنيف جديد"
- L365: "إضافة مورد"

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/warehouse.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `inventory-count` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/warehouse/inventory-count`
- لقطة: `audit/screenshots/warehouse_inventory_count.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
