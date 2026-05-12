# /properties/guide — `artifacts/ghayth-erp/src/pages/properties/occupancy-report.tsx`

## 1. الميتاداتا
- المسار: `/properties/guide`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/properties/occupancy-report.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/propertyRoutes.tsx:60`
- المجموعة: `properties`
- الكومبوننت: `OccupancyReport`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `guide`
- سطور الملف: 184
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/properties/occupancy-report`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/properties.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `guide` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
- ⚠ L30 _(inline-data-array)_: `const pieData = [`

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/properties/guide`
- لقطة: `audit/screenshots/properties_guide.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
