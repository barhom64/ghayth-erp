# /finance/cash-flow-forecast — `artifacts/ghayth-erp/src/pages/finance/cash-flow-forecast.tsx`

## 1. الميتاداتا
- المسار: `/finance/cash-flow-forecast`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/finance/cash-flow-forecast.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:136`
- المجموعة: `finance`
- الكومبوننت: `CashFlowForecast`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `cash-flow-forecast`
- سطور الملف: 159
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/finance/cash-flow-forecast${scopeSuffix}`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/finance.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `cash-flow-forecast` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/finance/cash-flow-forecast`
- لقطة: `audit/screenshots/finance_cash_flow_forecast.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
