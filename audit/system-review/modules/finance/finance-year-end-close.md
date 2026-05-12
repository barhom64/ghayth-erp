# /finance/year-end-close — `artifacts/ghayth-erp/src/pages/finance/year-end-close.tsx`

## 1. الميتاداتا
- المسار: `/finance/year-end-close`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/finance/year-end-close.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:145`
- المجموعة: `finance`
- الكومبوننت: `YearEndClose`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `year-end-close`
- سطور الملف: 289
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L137: "(بلا تسمية)" → `() => previewMut.mutate({ retainedEarningsAccountCode, force` 🔒

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
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `year-end-close` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/finance/year-end-close`
- لقطة: `audit/screenshots/finance_year_end_close.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
