# /finance/inventory-costing — `artifacts/ghayth-erp/src/pages/finance/inventory-costing.tsx`

## 1. الميتاداتا
- المسار: `/finance/inventory-costing`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/finance/inventory-costing.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:128`
- المجموعة: `finance`
- الكومبوننت: `InventoryCosting`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `inventory-costing`
- سطور الملف: 238
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(write)_ | `/finance/rounding-account/setup` | POST | ✅ | ✅ | — | — | ✅ | ✅ | — |

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/finance/inventory-costing`
- GET `/finance/rounding-account`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/finance.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `inventory-costing` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/finance/inventory-costing`
- لقطة: `audit/screenshots/finance_inventory_costing.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
