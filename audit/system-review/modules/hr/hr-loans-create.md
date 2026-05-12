# /hr/loans/create — `artifacts/ghayth-erp/src/pages/hr/job-detail.tsx`

## 1. الميتاداتا
- المسار: `/hr/loans/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/job-detail.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:123`
- المجموعة: `hr`
- الكومبوننت: `JobDetail`
- subKey: `recruitment` | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 246
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L134: "(بلا تسمية)"
- L160: "(بلا تسمية)"

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
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `create` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=SKIP | CTA=PASS | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/loans/create; write POST /api/intelligence/activity → 200`
- لقطة: `audit/screenshots/hr_loans_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
