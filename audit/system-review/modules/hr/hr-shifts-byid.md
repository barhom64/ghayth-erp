# /hr/shifts/:id — `artifacts/ghayth-erp/src/pages/create/hr/shifts-create.tsx`

## 1. الميتاداتا
- المسار: `/hr/shifts/:id`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/hr/shifts-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:143`
- المجموعة: `hr`
- الكومبوننت: `ShiftsCreate`
- subKey: `shifts` | minRoleLevel: —
- الكيان المستنبط: `:id`
- سطور الملف: 215
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(call)_ | `/hr/shifts` | POST | 🔴 لم يُعثر على endpoint مطابق |||||||

### تفاصيل الأزرار المرئية
- L115: "مسح المسودة" → `clearDraft`
- L207: "(بلا تسمية)" → `() => setLocation("/hr/shifts")` 🔒
- L208: "(بلا تسمية)" → `handleSubmit` 🔒

### القراءات (GET)
- GET `/settings/branches`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/hr.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `:id` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
- ⚠ L23 _(inline-data-array)_: `const daysOfWeek = [`

## 6. النتيجة (Verdict)
- Runtime audit: **✅ PASS** — render=SKIP | fetch=SKIP | CTA=SKIP | nav=SKIP | smoke=SKIP
- ملاحظة: `unresolved: no id resolver for /hr/shifts/:id`
- landedUrl: `?`
- توصية: مغلق
