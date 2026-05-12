# /hr/loans — `artifacts/ghayth-erp/src/pages/hr/recruitment-advanced.tsx`

## 1. الميتاداتا
- المسار: `/hr/loans`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/recruitment-advanced.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:122`
- المجموعة: `hr`
- الكومبوننت: `RecruitmentAdvanced`
- subKey: `recruitment` | minRoleLevel: —
- الكيان المستنبط: `loans`
- سطور الملف: 85
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/hr/recruitment/stats`
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
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `loans` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
- ⚠ L32 _(inline-data-array)_: `const kpis = [`

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/loans`
- لقطة: `audit/screenshots/hr_loans.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
