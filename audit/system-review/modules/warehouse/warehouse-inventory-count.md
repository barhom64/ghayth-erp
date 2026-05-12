# /warehouse/inventory-count — `artifacts/ghayth-erp/src/pages/warehouse/inventory-count.tsx`

## 1. الميتاداتا
- المسار: `/warehouse/inventory-count`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/warehouse/inventory-count.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:107`
- المجموعة: `warehouse`
- الكومبوننت: `InventoryCount`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `inventory-count`
- سطور الملف: 459
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L207: "(بلا تسمية)"
- L216: "(بلا تسمية)"
- L311: "(بلا تسمية)"
- L359: "(بلا تسمية)" → `() => setShowForm(!showForm)`
- L388: "(بلا تسمية)" → `() => setShowForm(false)`

### القراءات (GET)
- GET `/warehouse/inventory-counts`
- GET `/warehouse/products?limit=500`



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
