# /finance/ledger/:code — `artifacts/ghayth-erp/src/pages/finance/salary-advances.tsx`

## 1. الميتاداتا
- المسار: `/finance/ledger/:code`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/finance/salary-advances.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:120`
- المجموعة: `finance`
- الكومبوننت: `SalaryAdvances`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `:code`
- سطور الملف: 285
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L141: "(بلا تسمية)" → `() => setShowForm((v) => !v)`
- L255: "إلغاء" → `onDone`

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
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `:code` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **✅ PASS** — render=SKIP | fetch=SKIP | CTA=SKIP | nav=SKIP | smoke=SKIP
- ملاحظة: `unresolved: no id resolver for /finance/ledger/:code`
- landedUrl: `?`
- توصية: مغلق
