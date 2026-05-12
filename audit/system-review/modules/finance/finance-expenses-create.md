# /finance/expenses/create — `artifacts/ghayth-erp/src/pages/finance/invoice-detail.tsx`

## 1. الميتاداتا
- المسار: `/finance/expenses/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/finance/invoice-detail.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:94`
- المجموعة: `finance`
- الكومبوننت: `InvoiceDetail`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 648
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L192: "نسخ"
- L198: "(بلا تسمية)" → `() => setShowPayment(!showPayment)`
- L311: "(بلا تسمية)" → `handleZatcaSubmit` 🔒
- L355: "(بلا تسمية)" → `() => setShowPayment(false)` 🔒
- L358: "(بلا تسمية)" → `() => setShowPayment(false)`

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
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `create` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=SKIP | CTA=PASS | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/finance/expenses/create; write POST /api/intelligence/activity → 200`
- لقطة: `audit/screenshots/finance_expenses_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
