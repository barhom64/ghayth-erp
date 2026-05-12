# /hr/training/advanced — `artifacts/ghayth-erp/src/pages/hr/training-advanced.tsx`

## 1. الميتاداتا
- المسار: `/hr/training/advanced`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/training-advanced.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:112`
- المجموعة: `hr`
- الكومبوننت: `TrainingAdvanced`
- subKey: `training` | minRoleLevel: —
- الكيان المستنبط: `advanced`
- سطور الملف: 86
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/hr/training/stats`
- GET `/hr/training/programs`
- GET `/hr/training/enrollments`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/hr.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `advanced` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/training/advanced`
- لقطة: `audit/screenshots/hr_training_advanced.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
