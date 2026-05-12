# /hr/recruitment/jobs/:id — `artifacts/ghayth-erp/src/pages/hr/application-list.tsx`

## 1. الميتاداتا
- المسار: `/hr/recruitment/jobs/:id`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/application-list.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:121`
- المجموعة: `hr`
- الكومبوننت: `ApplicationList`
- subKey: `recruitment` | minRoleLevel: —
- الكيان المستنبط: `:id`
- سطور الملف: 154
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L121: "إضافة متقدم"

### القراءات (GET)
- GET `/hr/recruitment/applications`



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
- ⚠ L32 _(inline-data-array)_: `const kpis = [`

## 6. النتيجة (Verdict)
- Runtime audit: **✅ PASS** — render=SKIP | fetch=SKIP | CTA=SKIP | nav=SKIP | smoke=SKIP
- ملاحظة: `unresolved: /api/hr/recruitment → 401`
- landedUrl: `?`
- توصية: مغلق
