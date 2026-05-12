# /hr/onboarding-review — `artifacts/ghayth-erp/src/pages/hr/onboarding-review.tsx`

## 1. الميتاداتا
- المسار: `/hr/onboarding-review`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/onboarding-review.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:146`
- المجموعة: `hr`
- الكومبوننت: `OnboardingReview`
- subKey: `employees` | minRoleLevel: —
- الكيان المستنبط: `onboarding-review`
- سطور الملف: 178
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/employees?limit=200`
- GET `/hr/onboarding-steps`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/hr.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `onboarding-review` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/onboarding-review`
- لقطة: `audit/screenshots/hr_onboarding_review.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
