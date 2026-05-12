# /properties/maintenance/create — `artifacts/ghayth-erp/src/pages/details/property-payment-detail.tsx`

## 1. الميتاداتا
- المسار: `/properties/maintenance/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/details/property-payment-detail.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/propertyRoutes.tsx:52`
- المجموعة: `properties`
- الكومبوننت: `PropertyPaymentDetail`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 396
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/properties.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `create` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=SKIP | CTA=PASS | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/properties/maintenance/create; write POST /api/intelligence/activity → 200`
- لقطة: `audit/screenshots/properties_maintenance_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
