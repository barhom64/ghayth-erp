# /finance/reports — `artifacts/ghayth-erp/src/pages/create/finance/purchase-orders-create.tsx`

## 1. الميتاداتا
- المسار: `/finance/reports`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/finance/purchase-orders-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:105`
- المجموعة: `finance`
- الكومبوننت: `PurchaseOrdersCreate`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `reports`
- سطور الملف: 207
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(call)_ | `/finance/purchase-requests` | POST | 🔴 لم يُعثر على endpoint مطابق |||||||

### تفاصيل الأزرار المرئية
- L113: "مسح المسودة" → `clearDraft`
- L172: "+ إضافة بند" → `() => removeItem(idx)` 🔒
- L175: "+ إضافة بند" → `addItem`
- L199: "(بلا تسمية)" → `() => setLocation("/finance/purchase-orders")` 🔒
- L200: "(بلا تسمية)" → `handleSubmit` 🔒

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
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `reports` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/finance/reports`
- لقطة: `audit/screenshots/finance_reports.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
