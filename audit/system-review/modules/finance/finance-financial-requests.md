# /finance/financial-requests — `artifacts/ghayth-erp/src/pages/finance/financial-requests.tsx`

## 1. الميتاداتا
- المسار: `/finance/financial-requests`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/finance/financial-requests.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:112`
- المجموعة: `finance`
- الكومبوننت: `FinancialRequests`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `financial-requests`
- سطور الملف: 132
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/finance/financial-requests`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/finance.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `financial-requests` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/finance/financial-requests`
- لقطة: `audit/screenshots/finance_financial_requests.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
