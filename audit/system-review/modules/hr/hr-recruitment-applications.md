# /hr/recruitment/applications — `artifacts/ghayth-erp/src/pages/hr/application-list.tsx`

## 1. الميتاداتا
- المسار: `/hr/recruitment/applications`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/application-list.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:119`
- المجموعة: `hr`
- الكومبوننت: `ApplicationList`
- subKey: `recruitment` | minRoleLevel: —
- الكيان المستنبط: `applications`
- سطور الملف: 155
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

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
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `applications` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/recruitment/applications`
- لقطة: `audit/screenshots/hr_recruitment_applications.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
