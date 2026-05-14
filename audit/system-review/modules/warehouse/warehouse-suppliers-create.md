# /warehouse/suppliers/create — `artifacts/ghayth-erp/src/pages/create/warehouse/suppliers-create.tsx`

## 1. الميتاداتا
- المسار: `/warehouse/suppliers/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/warehouse/suppliers-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:99`
- المجموعة: `warehouse`
- الكومبوننت: `WarehouseSuppliersCreate`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 83
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(write)_ | `/warehouse/suppliers` | POST | ✅ | ✅ | — | — | ✅ | ✅ | — |

### تفاصيل الأزرار المرئية
- L47: "مسح المسودة" → `clearDraft`
- L76: "(بلا تسمية)" → `() => setLocation("/warehouse")` 🔒
- L77: "(بلا تسمية)" → `handleSubmit` 🔒

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

إنشاء مورد جديد — Onboard new supplier.

| الحقل | المتطلب |
|------|--------|
| Name (legal) | إجباري |
| Commercial Reg (CR) | للـ business | إجباري |
| VAT Number | per ZATCA | for B2B invoicing |
| Type | individual/company/govt | enum |
| Country | enum (KSA priority) |
| Contact (phone, email, address) | إجباري |
| Bank info | encrypted | for payment |
| Credit terms | NET 30/60/COD | enum |
| Default GL account | per supplier | راجع `finance-accounts.md` |
| Tax behavior | per ZATCA | راجع `finance-tax.md` |
| WHT applicable? | flag | per service type |
| Categories supplied | linked | راجع `warehouse-categories.md` |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| Create supplier | POST `/warehouse/suppliers` | `suppliers` | ✅ |
| Validate unique CR/VAT | server-side | ✅ critical |
| ZATCA VAT lookup (verify number) | external API | راجع `admin-integrations.md` | ⚠ |
| Encrypt bank info | at-rest | ✅ critical |
| Approval workflow (لو significant) | راجع `governance/approvals.md` | ⚠ |
| Generate AP sub-ledger account | راجع `finance-accounts.md` | auto | ✅ |
| تكامل مع `crm/clients.md` (لو also a client) | linkage | ⚠ |
| تكامل مع `finance-accounts.md` (AP sub-ledger) | ✅ critical |
| تكامل مع `finance-tax.md` (WHT applicability) | ✅ |
| Notification | event=`supplier_created` | راجع `notifications.md` | ✅ |
| Audit log إجباري | `audit_logs` | ✅ critical |
| **PDPL** — لو individual supplier | retention rules | ⚠ |
| RBAC | procurement + finance | ✅ |

تحقق يدوي:
- [ ] هل VAT lookup mandatory للـ B2B Saudi suppliers?
- [ ] هل bank info encryption at-rest (column-level)?
- [ ] هل WHT auto-flag accurate per service category?
- [ ] هل duplicate detection by CR/VAT/name fuzzy match?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `create` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=SKIP | CTA=PASS | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/warehouse/suppliers/create; write POST /api/intelligence/activity → 200`
- لقطة: `audit/screenshots/warehouse_suppliers_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
