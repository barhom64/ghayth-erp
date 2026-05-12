# /umrah/invoices — `artifacts/ghayth-erp/src/pages/umrah/invoices.tsx`

## 1. الميتاداتا
- المسار: `/umrah/invoices`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/umrah/invoices.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/umrahRoutes.tsx:57`
- المجموعة: `operations`
- الكومبوننت: `UmrahInvoices`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `invoices`
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
- الجدول: `invoices` (export: `invoices`, 12 عمود)
- tenant col: ✅ | createdBy: — | createdAt: ✅ | updatedAt: — | softDelete: ✅ | lifecycle col: ✅
- FKs: companies.id, clients.id

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/umrah/invoices`
- لقطة: `audit/screenshots/umrah_invoices.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
