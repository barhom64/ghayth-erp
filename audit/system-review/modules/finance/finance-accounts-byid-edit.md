# /finance/accounts/:id/edit — `artifacts/ghayth-erp/src/pages/finance/accounts.tsx`

## 1. الميتاداتا
- المسار: `/finance/accounts/:id/edit`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/finance/accounts.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:83`
- المجموعة: `finance`
- الكومبوننت: `Accounts`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `edit`
- سطور الملف: 430
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L281: "طباعة" → `handlePrint`
- L285: "(بلا تسمية)" → `() => setViewMode("tree")`
- L293: "(بلا تسمية)" → `() => setViewMode("flat")`

### القراءات (GET)
- GET `/finance/accounts`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/finance.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `edit` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=SKIP | CTA=PASS | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/finance/accounts/2/edit; write POST /api/intelligence/activity → 200`
- لقطة: `audit/screenshots/finance_accounts_id_edit.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
