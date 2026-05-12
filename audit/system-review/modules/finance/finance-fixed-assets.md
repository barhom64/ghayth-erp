# /finance/fixed-assets — `artifacts/ghayth-erp/src/pages/finance/bank-reconciliation.tsx`

## 1. الميتاداتا
- المسار: `/finance/fixed-assets`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/finance/bank-reconciliation.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:125`
- المجموعة: `finance`
- الكومبوننت: `BankReconciliation`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `fixed-assets`
- سطور الملف: 287
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(call)_ | `/finance/bank-reconciliation/import` | POST | 🔴 لم يُعثر على endpoint مطابق |||||||
| _(call)_ | `/finance/bank-reconciliation/auto-match` | POST | 🔴 لم يُعثر على endpoint مطابق |||||||

### تفاصيل الأزرار المرئية
- L150: "(بلا تسمية)" → `() => fileRef.current?.click()` 🔒
- L210: "(بلا تسمية)" → `handleAutoMatch` 🔒
- L243: "(بلا تسمية)"

### القراءات (GET)
- GET `/finance/accounts?type=asset&search=11`
- GET `/finance/bank-reconciliation`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/finance.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `fixed-assets` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/finance/fixed-assets`
- لقطة: `audit/screenshots/finance_fixed_assets.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
