# /properties/buildings/create — `artifacts/ghayth-erp/src/pages/properties-dashboard.tsx`

## 1. الميتاداتا
- المسار: `/properties/buildings/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/properties-dashboard.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/propertyRoutes.tsx:35`
- المجموعة: `properties`
- الكومبوننت: `PropertiesDashboard`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 382
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L159: "مبنى جديد"
- L164: "وحدة جديدة"
- L239: "عرض العقود"
- L255: "عرض الكل"
- L270: "طلب صيانة جديد"
- L315: "(بلا تسمية)"
- L333: "عرض الكل"

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
- ملاحظة: `landed=/dashboard expected=/properties/buildings/create; write POST /api/intelligence/activity → 200`
- لقطة: `audit/screenshots/properties_buildings_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
