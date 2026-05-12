# /finance/fixed-assets/batch-depreciate — `artifacts/ghayth-erp/src/pages/create/finance/bank-manual-match.tsx`

## 1. الميتاداتا
- المسار: `/finance/fixed-assets/batch-depreciate`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/finance/bank-manual-match.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:126`
- المجموعة: `finance`
- الكومبوننت: `BankManualMatch`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `batch-depreciate`
- سطور الملف: 191
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(call)_ | `/finance/bank-reconciliation/manual-match` | POST | 🔴 لم يُعثر على endpoint مطابق |||||||

### تفاصيل الأزرار المرئية
- L80: "مسح المسودة" → `clearDraft`
- L109: "بحث" → `searchJournalLines` 🔒
- L154: "(بلا تسمية)" → `() => handleManualMatch(jl.id)` 🔒
- L183: "(بلا تسمية)" → `() => setLocation("/finance/bank-reconciliation")`

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
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `batch-depreciate` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/finance/fixed-assets/batch-depreciate`
- لقطة: `audit/screenshots/finance_fixed_assets_batch_depreciate.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
