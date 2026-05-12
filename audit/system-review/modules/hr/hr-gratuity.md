# /hr/gratuity — `artifacts/ghayth-erp/src/pages/hr/development-plans.tsx`

## 1. الميتاداتا
- المسار: `/hr/gratuity`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/development-plans.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:158`
- المجموعة: `hr`
- الكومبوننت: `DevelopmentPlans`
- subKey: `performance` | minRoleLevel: —
- الكيان المستنبط: `gratuity`
- سطور الملف: 2
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/hr.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `gratuity` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/gratuity`
- لقطة: `audit/screenshots/hr_gratuity.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
