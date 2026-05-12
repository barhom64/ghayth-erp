# /finance/accounts/create — `artifacts/ghayth-erp/src/pages/finance/dashboard.tsx`

## 1. الميتاداتا
- المسار: `/finance/accounts/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/finance/dashboard.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:82`
- المجموعة: `finance`
- الكومبوننت: `Dashboard`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 514
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L266: "شجرة الحسابات"
- L269: "(بلا تسمية)"
- L336: "إدارة الفترات"
- L358: "عرض الكل"
- L403: "جميع الضمانات"

### القراءات (GET)
- GET `summary`



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
- ملاحظة: `landed=/dashboard expected=/finance/accounts/create; write POST /api/intelligence/activity → 200`
- لقطة: `audit/screenshots/finance_accounts_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
