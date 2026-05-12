# /properties/inspections — `artifacts/ghayth-erp/src/pages/properties-maintenance.tsx`

## 1. الميتاداتا
- المسار: `/properties/inspections`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/properties-maintenance.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/propertyRoutes.tsx:56`
- المجموعة: `properties`
- الكومبوننت: `PropertiesMaintenance`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `inspections`
- سطور الملف: 111
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L63: "طلب صيانة جديد"

### القراءات (GET)
- GET `/properties/maintenance-requests`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/properties.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `inspections` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/properties/inspections`
- لقطة: `audit/screenshots/properties_inspections.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
