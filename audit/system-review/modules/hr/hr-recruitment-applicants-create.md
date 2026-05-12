# /hr/recruitment/applicants/create — `artifacts/ghayth-erp/src/pages/hr/recruitment.tsx`

## 1. الميتاداتا
- المسار: `/hr/recruitment/applicants/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/recruitment.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:118`
- المجموعة: `hr`
- الكومبوننت: `Recruitment`
- subKey: `recruitment` | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 295
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L171: "وظيفة جديدة"
- L174: "إضافة متقدم"

### القراءات (GET)
- GET `/hr/recruitment/postings`
- GET `/hr/recruitment/applications`
- GET `/hr/recruitment/stats`



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
- ⚠ L40 _(inline-data-array)_: `const kpis = [`

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=SKIP | CTA=PASS | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/recruitment/applicants/create; write POST /api/intelligence/activity → 200`
- لقطة: `audit/screenshots/hr_recruitment_applicants_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
