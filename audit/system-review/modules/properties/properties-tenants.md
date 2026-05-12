# /properties/tenants — `artifacts/ghayth-erp/src/pages/create/properties/tenants-create.tsx`

## 1. الميتاداتا
- المسار: `/properties/tenants`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/properties/tenants-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/propertyRoutes.tsx:40`
- المجموعة: `properties`
- الكومبوننت: `TenantsCreate`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `tenants`
- سطور الملف: 220
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(call)_ | `/properties/tenants` | POST | 🔴 لم يُعثر على endpoint مطابق |||||||

### تفاصيل الأزرار المرئية
- L87: "مسح المسودة" → `clearDraft`
- L212: "(بلا تسمية)" → `handleSubmit` 🔒

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
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `tenants` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
- ⚠ L109 _(dummy-name)_: `<TextField label="البريد الإلكتروني" type="email" dir="ltr" value={form.email} onChange={v => set("email", v)} placehold`

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/properties/tenants`
- لقطة: `audit/screenshots/properties_tenants.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
