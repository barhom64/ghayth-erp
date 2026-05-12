# /properties/owners/:id/edit — `artifacts/ghayth-erp/src/pages/create/properties/owners-edit.tsx`

## 1. الميتاداتا
- المسار: `/properties/owners/:id/edit`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/properties/owners-edit.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/propertyRoutes.tsx:42`
- المجموعة: `properties`
- الكومبوننت: `OwnersEdit`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `edit`
- سطور الملف: 158
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L150: "(بلا تسمية)" → `() => setLocation("/properties/owners")` 🔒
- L151: "(بلا تسمية)" → `handleSave` 🔒

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
- ⚠ L121 _(dummy-iban)_: `<TextField label="رقم الآيبان" dir="ltr" value={form.iban} onChange={v => setForm({ ...form, iban: v })} placeholder="SA`

## 6. النتيجة (Verdict)
- Runtime audit: **TBD** — راجع `audit/runtime-audit-results.json` (`/properties/owners/:id/edit`)
- توصية: **TBD**
- المشاكل: 1 مدخل آلي. أضِفها إلى `audit/system-review/findings/FINDINGS.csv`.
