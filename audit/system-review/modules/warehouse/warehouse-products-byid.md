# /warehouse/products/:id — `artifacts/ghayth-erp/src/pages/details/warehouse-product-detail.tsx`

## 1. الميتاداتا
- المسار: `/warehouse/products/:id`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/details/warehouse-product-detail.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:100`
- المجموعة: `warehouse`
- الكومبوننت: `WarehouseProductDetail`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `:id`
- سطور الملف: 297
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

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
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `:id` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **✅ PASS** — render=SKIP | fetch=SKIP | CTA=SKIP | nav=SKIP | smoke=SKIP
- ملاحظة: `unresolved: /api/warehouse/products → 401`
- landedUrl: `?`
- توصية: مغلق
