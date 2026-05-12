# /finance/fiscal-periods — `artifacts/ghayth-erp/src/pages/finance/fiscal-periods.tsx`

## 1. الميتاداتا
- المسار: `/finance/fiscal-periods`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/finance/fiscal-periods.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:117`
- المجموعة: `finance`
- الكومبوننت: `FiscalPeriods`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `fiscal-periods`
- سطور الملف: 164
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/finance.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `fiscal-periods` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/finance/fiscal-periods`
- لقطة: `audit/screenshots/finance_fiscal_periods.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
