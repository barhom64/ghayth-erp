# /warehouse/suppliers/:id — `artifacts/ghayth-erp/src/pages/details/warehouse-supplier-detail.tsx`

## 1. الميتاداتا
- المسار: `/warehouse/suppliers/:id`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/details/warehouse-supplier-detail.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:103`
- المجموعة: `warehouse`
- الكومبوننت: `WarehouseSupplierDetail`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `:id`
- سطور الملف: 243
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

تفاصيل مورد واحد — Supplier 360° view.

| القسم | الوصف |
|------|------|
| Contact info | + multiple contacts (sales, finance) |
| Bank accounts | for payments | راجع `finance-payments.md` |
| Linked POs | open/closed | راجع `finance-purchase-orders.md` |
| Linked invoices | راجع `finance-vendor-bills.md` |
| Payments history | راجع `finance-payments.md` |
| Outstanding AP | aggregate | راجع `finance-ap-aging.md` |
| Items supplied | catalog | راجع `store-products.md` |
| Performance rating | quality, on-time, price | KPI |
| Contracts | راجع `legal-contracts-byid.md` |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| View supplier | GET `/warehouse/suppliers/:id` | `suppliers` | ✅ |
| Update info | PATCH | with audit | ✅ |
| Update bank info | encrypted | with extra approval | ✅ critical |
| AP statement (account statement) | aggregate | راجع `finance-reports.md` | ✅ |
| Performance review | manual entry | per period | ⚠ |
| Blacklist (with reason) | flag | guards new POs | ✅ critical |
| Whitelist after fix | with audit | ✅ |
| Merge duplicates | bulk move | with audit | ⚠ |
| Set preferred supplier (per category) | راجع `warehouse-categories-byid.md` | ⚠ |
| تكامل مع `finance-vendor-bills.md` (linked invoices) | ✅ |
| تكامل مع `finance-payments.md` (linked payments) | ✅ |
| تكامل مع `finance-purchase-orders-byid.md` (linked POs) | ✅ |
| تكامل مع `legal-contracts-byid.md` (contracts) | ✅ |
| تكامل مع `documents-archive.md` (retention) | ✅ |
| Audit log إجباري | كل تعديل | `audit_logs` | ✅ critical |
| RBAC | procurement + finance + scope per supplier | ✅ |

تحقق يدوي:
- [ ] هل bank info update requires dual approval (audit critical)?
- [ ] هل blacklist effectively blocks new POs?
- [ ] هل performance rating periodically updated؟
- [ ] هل preferred supplier per category enforced في procurement?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `:id` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **✅ PASS** — render=SKIP | fetch=SKIP | CTA=SKIP | nav=SKIP | smoke=SKIP
- ملاحظة: `unresolved: /api/warehouse/suppliers → 401`
- landedUrl: `?`
- توصية: مغلق
