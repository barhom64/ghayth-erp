# /properties/buildings — `artifacts/ghayth-erp/src/pages/properties-buildings.tsx`

## 1. الميتاداتا
- المسار: `/properties/buildings`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/properties-buildings.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/propertyRoutes.tsx:37`
- المجموعة: `properties`
- الكومبوننت: `PropertiesBuildings`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `buildings`
- سطور الملف: 233
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L178: "عرض"
- L184: "(بلا تسمية)"

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
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `buildings` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/properties/buildings`
- لقطة: `audit/screenshots/properties_buildings.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
