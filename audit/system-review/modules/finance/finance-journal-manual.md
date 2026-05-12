# /finance/journal-manual — `artifacts/ghayth-erp/src/pages/finance/journal-manual.tsx`

## 1. الميتاداتا
- المسار: `/finance/journal-manual`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/finance/journal-manual.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:130`
- المجموعة: `finance`
- الكومبوننت: `JournalManual`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `journal-manual`
- سطور الملف: 342
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L215: "(بلا تسمية)"
- L298: "(بلا تسمية)" 🔒

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
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `journal-manual` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/finance/journal-manual`
- لقطة: `audit/screenshots/finance_journal_manual.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
