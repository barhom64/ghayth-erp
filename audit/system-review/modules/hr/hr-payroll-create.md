# /hr/payroll/create — `artifacts/ghayth-erp/src/pages/hr/approval-chains.tsx`

## 1. الميتاداتا
- المسار: `/hr/payroll/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/approval-chains.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:103`
- المجموعة: `hr`
- الكومبوننت: `ApprovalChains`
- subKey: `leaves` | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 134
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/hr/approval-chains`



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
- ⚠ L30 _(inline-data-array)_: `const kpis = [`

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=SKIP | CTA=PASS | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/payroll/create; write POST /api/intelligence/activity → 200`
- لقطة: `audit/screenshots/hr_payroll_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
