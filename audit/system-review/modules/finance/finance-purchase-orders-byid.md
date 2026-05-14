# /finance/purchase-orders/:id — `artifacts/ghayth-erp/src/pages/finance/purchase-order-detail.tsx`

## 1. الميتاداتا
- المسار: `/finance/purchase-orders/:id`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/finance/purchase-order-detail.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:104`
- المجموعة: `finance`
- الكومبوننت: `PurchaseOrderDetail`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `:id`
- سطور الملف: 262
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L29: "العودة لطلبات الشراء"
- L121: "نسخ"

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

تفاصيل أمر شراء واحد — full lifecycle view.

| الحالة | الوصف |
|--------|------|
| Draft | قيد الإعداد |
| Submitted | للـ approval |
| Approved | جاهز للـ supplier |
| Sent | أُرسل للمورد |
| Acknowledged | المورد أقرّ |
| Partially received | استلام جزئي | راجع `warehouse-receiving.md` |
| Received | كامل |
| Invoiced | فاتورة من المورد | راجع `finance-vendor-bills.md` |
| Closed | كل شيء completed |
| Cancelled | بـ reason |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| View PO details | GET `/finance/purchase-orders/:id` | `purchase_orders` + lines | ✅ |
| Approval workflow | راجع `governance/approvals.md` | multi-level per amount | ✅ |
| Approve | POST `/purchase-orders/:id/approve` | lifecycle | ✅ |
| Reject | with reason | ✅ |
| Send to supplier | POST `/purchase-orders/:id/send` | email/PDF | ✅ |
| Print | راجع `print-templates` | ✅ |
| Receive (partial/full) | راجع `warehouse-receiving.md` | يولّد inventory + GL | ✅ critical |
| Match invoice (3-way match: PO + GRN + Invoice) | راجع `finance-vendor-bills.md` | ✅ critical |
| Cancel | requires approval | with reason + audit | ✅ |
| Amend | requires re-approval | with version history | ✅ |
| Encumbrance (budget commitment) | حجز من budget | راجع `finance-budget.md` | ⚠ |
| Vendor blacklist check | راجع `warehouse-suppliers.md` | يمنع إلى blacklisted | ✅ critical |
| تكامل مع `warehouse-receiving.md` | على receive | ✅ |
| تكامل مع `finance-vendor-bills.md` | على invoice match | ✅ |
| تكامل مع `finance-payments.md` | على دفع | ✅ |
| تكامل مع `finance-budget-byid.md` | encumbrance + actual | ✅ |
| تكامل مع `governance/approvals.md` | per-amount thresholds | ✅ |
| Audit log إجباري | كل خطوة | `audit_logs` | ✅ critical |
| RBAC | procurement + manager + finance | per stage | ✅ |
| WHT calculation | لو services | راجع `finance-tax.md` | ⚠ |

تحقق يدوي:
- [ ] هل 3-way match صارم (PO = GRN = Invoice) قبل posting الـ bill؟
- [ ] هل blacklisted supplier يُحجب في الـ list أو فقط warn؟
- [ ] هل partial receipt يحدّث الحالة بدقة + GL لكل receipt جزئي؟
- [ ] هل encumbrance يحرر تلقائياً بعد الـ invoice match؟
- [ ] هل cancel بعد receive يولّد reverse GL؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `:id` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **✅ PASS** — render=SKIP | fetch=SKIP | CTA=SKIP | nav=SKIP | smoke=SKIP
- ملاحظة: `unresolved: no row in /api/finance/purchase-orders`
- landedUrl: `?`
- توصية: مغلق
