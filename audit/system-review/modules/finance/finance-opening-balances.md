# /finance/opening-balances — `artifacts/ghayth-erp/src/pages/finance/opening-balances.tsx`

## 1. الميتاداتا
- المسار: `/finance/opening-balances`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/finance/opening-balances.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:140`
- المجموعة: `finance`
- الكومبوننت: `OpeningBalances`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `opening-balances`
- سطور الملف: 146
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L99: "قيد أرصدة افتتاحية جديد"

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
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `opening-balances` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/finance/opening-balances`
- لقطة: `audit/screenshots/finance_opening_balances.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
