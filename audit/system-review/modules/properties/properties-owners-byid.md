# /properties/owners/:id — `artifacts/ghayth-erp/src/pages/create/properties/owners-create.tsx`

## 1. الميتاداتا
- المسار: `/properties/owners/:id`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/properties/owners-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/propertyRoutes.tsx:43`
- المجموعة: `properties`
- الكومبوننت: `OwnersCreate`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `:id`
- سطور الملف: 125
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L58: "مسح المسودة" → `clearDraft`
- L117: "(بلا تسمية)" → `() => setLocation("/properties/owners")` 🔒
- L118: "(بلا تسمية)" → `handleSave` 🔒

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
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `:id` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
- ⚠ L88 _(dummy-iban)_: `<TextField label="رقم الآيبان" dir="ltr" value={form.iban} onChange={v => setForm({ ...form, iban: v })} placeholder="SA`

## 6. النتيجة (Verdict)
- Runtime audit: **✅ PASS** — render=SKIP | fetch=SKIP | CTA=SKIP | nav=SKIP | smoke=SKIP
- ملاحظة: `unresolved: /api/properties/owners → 401`
- landedUrl: `?`
- توصية: مغلق
