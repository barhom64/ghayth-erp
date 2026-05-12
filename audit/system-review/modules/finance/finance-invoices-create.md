# /finance/invoices/create — `artifacts/ghayth-erp/src/pages/create/finance/journal-create.tsx`

## 1. الميتاداتا
- المسار: `/finance/invoices/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/finance/journal-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:91`
- المجموعة: `finance`
- الكومبوننت: `JournalCreate`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 193
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(call)_ | `/finance/journal` | POST | 🔴 لم يُعثر على endpoint مطابق |||||||

### تفاصيل الأزرار المرئية
- L107: "مسح المسودة" → `clearDraft`
- L120: "إضافة بند" → `addLine`
- L139: "(بلا تسمية)" → `() => removeLine(idx)` 🔒
- L185: "(بلا تسمية)" → `() => setLocation("/finance/journal")` 🔒
- L186: "(بلا تسمية)" → `handleSubmit` 🔒

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
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `create` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=SKIP | CTA=PASS | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/finance/invoices/create; write POST /api/intelligence/activity → 200`
- لقطة: `audit/screenshots/finance_invoices_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
