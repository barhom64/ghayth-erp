# /finance/purchase-orders/create — `artifacts/ghayth-erp/src/pages/create/finance/purchase-orders-create.tsx`

## 1. الميتاداتا
- المسار: `/finance/purchase-orders/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/finance/purchase-orders-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:103`
- المجموعة: `finance`
- الكومبوننت: `PurchaseOrdersCreate`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 207
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(write)_ | `/finance/purchase-requests` | POST | — | ✅ | ✅ | — | ✅ | ✅ | — |

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
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `create` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **TBD** — راجع `audit/runtime-audit-results.json` (`/finance/purchase-orders/create`)
- توصية: **TBD**
- المشاكل: 0 مدخل آلي. أضِفها إلى `audit/system-review/findings/FINDINGS.csv`.
