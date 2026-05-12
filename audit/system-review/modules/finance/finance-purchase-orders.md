# /finance/purchase-orders — `artifacts/ghayth-erp/src/pages/create/finance/vendors-create.tsx`

## 1. الميتاداتا
- المسار: `/finance/purchase-orders`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/finance/vendors-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:102`
- المجموعة: `finance`
- الكومبوننت: `VendorsCreate`
- subKey: `vendors` | minRoleLevel: —
- الكيان المستنبط: `purchase-orders`
- سطور الملف: 93
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(call)_ | `/finance/vendors` | POST | 🔴 لم يُعثر على endpoint مطابق |||||||

### تفاصيل الأزرار المرئية
- L53: "مسح المسودة" → `clearDraft`
- L85: "(بلا تسمية)" → `() => setLocation("/finance/vendors")` 🔒
- L86: "(بلا تسمية)" → `handleSubmit` 🔒

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
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `purchase-orders` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/finance/purchase-orders`
- لقطة: `audit/screenshots/finance_purchase_orders.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
