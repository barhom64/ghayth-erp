# /umrah/packages — `artifacts/ghayth-erp/src/pages/umrah/invoices.tsx`

## 1. الميتاداتا
- المسار: `/umrah/packages`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/umrah/invoices.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/umrahRoutes.tsx:50`
- المجموعة: `operations`
- الكومبوننت: `UmrahInvoices`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `packages`
- سطور الملف: 146
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L100: "إنشاء فاتورة" → `generate` 🔒

### القراءات (GET)
- GET `/umrah/agent-invoices`
- GET `/umrah/agents`
- GET `/umrah/seasons`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/operations.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `packages` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
- ⚠ L52 _(inline-data-array)_: `const kpiCards = [`

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/umrah/packages`
- لقطة: `audit/screenshots/umrah_packages.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
