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
| _(write)_ | `/finance/purchase-requests` | POST | ✅ | ✅ | ✅ | — | ✅ | ✅ | — |

### تفاصيل الأزرار المرئية
- L113: "مسح المسودة" → `clearDraft`
- L172: "+ إضافة بند" → `() => removeItem(idx)` 🔒
- L175: "+ إضافة بند" → `addItem`
- L199: "(بلا تسمية)" → `() => setLocation("/finance/purchase-orders")` 🔒
- L200: "(بلا تسمية)" → `handleSubmit` 🔒

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
طلب شراء / أمر شراء. المرجع: `docs/blueprints/finance-invoices.md` §"Purchase".

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| إنشاء طلب شراء (PR) | finance/purchase | `finance-purchase.ts` POST `/purchase-requests` | `purchase_requests`, `purchase_request_lines` | ✅ |
| سير موافقة (PR > حد) | governance/workflows | `business_rules.pr_approval_threshold` | `approval_chains` | ✅ |
| تحويل PR → PO عند الاعتماد | finance/purchase | POST `/purchase-orders/from-request/:id` | `purchase_orders`, `purchase_order_lines` | ✅ |
| التزام مالي (commitment) عند PO | finance | `commitments` يُحدّث | `commitments`, `budgets.committed` | ⚠ تحقق |
| إشعار للمورد (إن مفعّل) | comms | event=`po_sent` | `notifications` | ⚠ |
| استلام البضاعة (GRN) | warehouse | `finance.grn.received` event → `warehouse_movements` | `goods_receipt_notes`, `warehouse_movements` | ✅ |
| قيد محاسبي عند GRN | finance/GL | DR Inventory / CR AP-Accrued | `gl_entries`, `gl_lines` | ✅ |
| فاتورة الشراء → عكس accrual | finance/invoices | `expenses` تربط بـ PO | `gl_entries` (DR AP-Accrued / CR AP) | ✅ |
| Audit log | core | `auditMiddleware` (`/finance/purchase-requests`, `/finance/purchase-orders`) | `audit_logs` | ✅ |

تحقق يدوي:
- [ ] هل PO يقفل تلقائياً عند استلام كامل الكميات؟
- [ ] هل التغيير في كمية PO بعد الاعتماد يطلب موافقة ثانية؟
- [ ] هل المورد في `vendors` مربوط بـ chart of accounts (AP sub-ledger)؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `create` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=SKIP | CTA=PASS | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/finance/purchase-orders/create; write POST /api/intelligence/activity → 200`
- لقطة: `audit/screenshots/finance_purchase_orders_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
