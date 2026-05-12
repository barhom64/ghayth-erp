# /finance/journal — `artifacts/ghayth-erp/src/pages/create/finance/vouchers-create.tsx`

## 1. الميتاداتا
- المسار: `/finance/journal`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/finance/vouchers-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:88`
- المجموعة: `finance`
- الكومبوننت: `VouchersCreate`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `journal`
- سطور الملف: 475
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(call)_ | `/finance/vouchers` | POST | 🔴 لم يُعثر على endpoint مطابق |||||||

### تفاصيل الأزرار المرئية
- L204: "مسح المسودة" → `clearDraft`
- L467: "(بلا تسمية)" → `() => setLocation("/finance/vouchers")` 🔒
- L468: "(بلا تسمية)" → `handleSubmit` 🔒

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
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `journal` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
- ⚠ L44 _(inline-data-array)_: `const PAYMENT_METHODS = [`

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/finance/journal`
- لقطة: `audit/screenshots/finance_journal.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
