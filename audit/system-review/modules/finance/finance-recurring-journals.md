# /finance/recurring-journals — `artifacts/ghayth-erp/src/pages/finance/recurring-journals.tsx`

## 1. الميتاداتا
- المسار: `/finance/recurring-journals`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/finance/recurring-journals.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:142`
- المجموعة: `finance`
- الكومبوننت: `RecurringJournals`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `recurring-journals`
- سطور الملف: 268
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L158: "تنفيذ الآن"
- L167: "(بلا تسمية)"
- L176: "حذف"
- L198: "(بلا تسمية)"

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
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `recurring-journals` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/finance/recurring-journals`
- لقطة: `audit/screenshots/finance_recurring_journals.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
