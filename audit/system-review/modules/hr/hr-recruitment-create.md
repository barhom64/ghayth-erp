# /hr/recruitment/create — `artifacts/ghayth-erp/src/pages/hr/organization-structure.tsx`

## 1. الميتاداتا
- المسار: `/hr/recruitment/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/organization-structure.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:117`
- المجموعة: `hr`
- الكومبوننت: `OrganizationStructure`
- subKey: `organization` | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 84
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/settings/departments`
- GET `/employees?limit=200`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/hr.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `create` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
- ⚠ L23 _(inline-data-array)_: `const kpis = [`

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=SKIP | CTA=PASS | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/recruitment/create; write POST /api/intelligence/activity → 200`
- لقطة: `audit/screenshots/hr_recruitment_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
