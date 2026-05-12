# /properties/owners/:id/edit — `artifacts/ghayth-erp/src/pages/create/properties/owners-edit.tsx`

## 1. الميتاداتا
- المسار: `/properties/owners/:id/edit`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/properties/owners-edit.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/propertyRoutes.tsx:42`
- المجموعة: `properties`
- الكومبوننت: `OwnersEdit`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `edit`
- سطور الملف: 193
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L116: "(بلا تسمية)" → `() => setLocation("/properties/owners")`

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
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `edit` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
- ⚠ L168 _(dummy-iban)_: `<FormTextField name="iban" label="رقم الآيبان" placeholder="SA0000000000000000000000" />`

## 6. النتيجة (Verdict)
- Runtime audit: **✅ PASS** — render=SKIP | fetch=SKIP | CTA=SKIP | nav=SKIP | smoke=SKIP
- ملاحظة: `unresolved: /api/properties/owners → 401`
- landedUrl: `?`
- توصية: مغلق
