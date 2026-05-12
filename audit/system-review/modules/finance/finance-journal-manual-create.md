# /finance/journal-manual/create — `artifacts/ghayth-erp/src/pages/create/finance/journal-manual-create.tsx`

## 1. الميتاداتا
- المسار: `/finance/journal-manual/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/finance/journal-manual-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:131`
- المجموعة: `finance`
- الكومبوننت: `JournalManualCreate`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 195
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L94: "مسح المسودة" → `clearDraft`
- L177: "+ إضافة سطر" → `addLine`
- L185: "(بلا تسمية)" → `() => navigate("/finance/journal-manual")` 🔒
- L186: "(بلا تسمية)" 🔒

### القراءات (GET)
- GET `/finance/chart-of-accounts${scopeSuffix}`



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
- ملاحظة: `landed=/dashboard expected=/finance/journal-manual/create; write POST /api/intelligence/activity → 200`
- لقطة: `audit/screenshots/finance_journal_manual_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
