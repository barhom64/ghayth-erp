# /warehouse/movements — `artifacts/ghayth-erp/src/pages/details/warehouse-category-detail.tsx`

## 1. الميتاداتا
- المسار: `/warehouse/movements`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/details/warehouse-category-detail.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:104`
- المجموعة: `warehouse`
- الكومبوننت: `WarehouseCategoryDetail`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `movements`
- سطور الملف: 166
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
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `movements` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/warehouse/movements`
- لقطة: `audit/screenshots/warehouse_movements.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
