# /finance/vendors/create — `artifacts/ghayth-erp/src/pages/details/budget-detail.tsx`

## 1. الميتاداتا
- المسار: `/finance/vendors/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/details/budget-detail.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:100`
- المجموعة: `finance`
- الكومبوننت: `BudgetDetail`
- subKey: `vendors` | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 329
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/finance/budget`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/finance.md` (إن وُجد) وعدّد:
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
- ملاحظة: `landed=/dashboard expected=/finance/vendors/create; write POST /api/intelligence/activity → 200`
- لقطة: `audit/screenshots/finance_vendors_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
