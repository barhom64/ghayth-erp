# /properties/contracts/:id — `artifacts/ghayth-erp/src/pages/create/properties/contracts-create.tsx`

## 1. الميتاداتا
- المسار: `/properties/contracts/:id`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/properties/contracts-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/propertyRoutes.tsx:47`
- المجموعة: `properties`
- الكومبوننت: `ContractsCreate`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `:id`
- سطور الملف: 542
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(call)_ | `/properties/contracts` | POST | 🔴 لم يُعثر على endpoint مطابق |||||||

### تفاصيل الأزرار المرئية
- L224: "مسح المسودة" → `clearDraft`
- L533: "(بلا تسمية)" → `() => setLocation("/properties/contracts")` 🔒
- L534: "(بلا تسمية)" → `handleSubmit` 🔒

### القراءات (GET)
- GET `/properties/tenants`
- GET `/properties/owners`



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
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **✅ PASS** — render=SKIP | fetch=SKIP | CTA=SKIP | nav=SKIP | smoke=SKIP
- ملاحظة: `unresolved: /api/properties/contracts → 401`
- landedUrl: `?`
- توصية: مغلق
