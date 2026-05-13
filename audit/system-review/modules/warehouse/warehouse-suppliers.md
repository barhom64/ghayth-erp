# /warehouse/suppliers — `artifacts/ghayth-erp/src/pages/warehouse.tsx`

## 1. الميتاداتا
- المسار: `/warehouse/suppliers`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/warehouse.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:106`
- المجموعة: `warehouse`
- الكومبوننت: `Warehouse`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `suppliers`
- سطور الملف: 388
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

الموردون — central vendor master للـ procurement + AP.

| العمل | API | DB | الحالة |
|------|-----|-----|--------|
| List suppliers | GET `/warehouse/suppliers` | `suppliers` | ✅ |
| إنشاء supplier | راجع `warehouse-suppliers-create.md` | ✅ |
| تحديث بيانات تجارية | PATCH | `commercialReg`, `vatNumber` | ✅ |
| تحقق من VAT number (ZATCA lookup) | external API | راجع `admin-integrations.md` | ⚠ تحقق |
| Bank info (للـ payment) | encrypted | `supplier_bank_accounts` | ✅ |
| Credit terms (NET 30/60) | terms | `paymentTermsDays` | ✅ |
| رصيد AP (للـ supplier) | aggregate | `gl_entries` WHERE account=AP-supplier | راجع `finance-ap-aging.md` |
| Outstanding POs | aggregate | `purchase_orders` WHERE status=open | راجع `procurement.md` |
| Invoices received | linkage | `vendor_invoices` | راجع `finance-vendor-bills.md` |
| Payment history | linkage | `payments` WHERE party=supplier | راجع `finance-payments.md` |
| Performance rating | manual or auto | `supplier_ratings` (on-time, quality, price) | ⚠ |
| Blacklist | flag | `isBlacklisted` — يمنع POs جديدة | ✅ critical |
| Contract attachments | documents | راجع `documents.md` | ✅ |
| Audit log | كل تعديل | `audit_logs` | ✅ |
| PDPL — لو فرد | retention rules | ⚠ |
| Soft delete | guard إذا فيه حركات | ✅ |

تحقق يدوي:
- [ ] هل blacklist supplier يمنع كل POs الجديدة مع warning واضح؟
- [ ] هل VAT lookup مع ZATCA يحدث live أم cached؟
- [ ] هل bank info مشفّر at-rest؟

## 4. النمذجة
- الجدول: `suppliers` (export: `suppliers`, 12 عمود)
- tenant col: ✅ | createdBy: — | createdAt: ✅ | updatedAt: — | softDelete: ✅ | lifecycle col: —
- FKs: companies.id

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/warehouse/suppliers`
- لقطة: `audit/screenshots/warehouse_suppliers.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
