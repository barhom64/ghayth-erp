# /properties/owners — `artifacts/ghayth-erp/src/pages/properties-owners.tsx`

## 1. الميتاداتا
- المسار: `/properties/owners`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/properties-owners.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/propertyRoutes.tsx:44`
- المجموعة: `properties`
- الكومبوننت: `PropertiesOwners`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `owners`
- سطور الملف: 181
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L101: "تعديل"
- L105: "(بلا تسمية)" → `() => setDeletingOwner({ id: o.id, name: o.name || "—"`
- L122: "إضافة مالك"

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
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `owners` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/properties/owners`
- لقطة: `audit/screenshots/properties_owners.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
