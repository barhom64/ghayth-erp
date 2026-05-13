# /store/orders/create — `artifacts/ghayth-erp/src/pages/create/store/orders-create.tsx`

## 1. الميتاداتا
- المسار: `/store/orders/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/store/orders-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/storeRoutes.tsx:14`
- المجموعة: `store`
- الكومبوننت: `OrdersCreate`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 194
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L106: "مسح المسودة" → `clearDraft`
- L144: "+ إضافة عنصر" → `addItem`
- L174: "(بلا تسمية)" → `() => removeItem(idx)`
- L188: "(بلا تسمية)" → `() => setLocation("/store")` 🔒
- L189: "(بلا تسمية)" → `handleSubmit` 🔒

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

إنشاء طلب بيع — POS أو online sales order.

| القناة | الوصف |
|------|------|
| In-store POS | counter sale | immediate payment |
| Online order | website/app | delivery/pickup |
| Phone order | call center | delivery |
| Sales rep order | B2B sales | with credit terms |

| الحقل | المتطلب |
|------|--------|
| Client | FK | راجع `crm/clients.md` — optional للـ walk-in cash |
| Branch / Warehouse | scope | إجباري |
| Order date | إجباري |
| Items + qty + price | min 1 line | إجباري |
| Discount (per line or total) | with reason if > X% | with approval ⚠ |
| Tax (VAT 15%) | per ZATCA | auto-calculated |
| Payment method | cash/card/credit/wallet | enum |
| Delivery address (لو online) | from client or new |
| Shipping fee | optional |
| Promo code | راجع `store-promotions.md` |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| Create draft order | POST `/store/orders` | `sales_orders` | ✅ |
| Validate stock available | per item | راجع `warehouse-movements.md` | ✅ critical |
| Reserve stock | hold for X minutes | راجع `warehouse-stock-reservations.md` | ✅ |
| Calculate total + VAT | server-side | ZATCA rules | ✅ critical |
| Calculate WHT (لو applicable) | راجع `finance-tax.md` | ⚠ |
| Apply discount (with approval لو > %) | راجع `governance/approvals.md` | ✅ |
| Apply promo code | validation | راجع `store-promotions.md` | ✅ |
| Credit check (لو credit sale) | راجع `crm/clients.md` (credit limit) | ✅ critical |
| Submit order | POST `/store/orders/:id/submit` | lifecycle draft → submitted | ✅ |
| Payment processing (لو immediate) | راجع `finance-receipts.md` | ✅ critical |
| Generate ZATCA-compliant invoice | with QR + UUID + signing | راجع `finance-zatca.md` | ✅ critical |
| Deduct inventory | راجع `warehouse-movements.md` | ✅ critical |
| GL entry — sale | Dr Cash/AR / Cr Revenue + Cr VAT Output | راجع `finance-cogs.md` | ✅ critical |
| GL entry — COGS | Dr COGS / Cr Inventory | راجع `finance-cogs.md` | ✅ critical |
| Reduce customer credit available | راجع `crm/clients.md` | ✅ |
| Print receipt | راجع `print-templates` | ✅ |
| Schedule delivery (لو online) | راجع `store-deliveries.md` | ⚠ |
| Notify customer (confirmation) | راجع `notifications.md` | ✅ |
| تكامل مع ZATCA | mandatory | راجع `admin-integrations.md` | ✅ critical |
| تكامل مع `warehouse-movements.md` | stock deduction | ✅ critical |
| تكامل مع `finance-cogs.md` | revenue + COGS | ✅ critical |
| تكامل مع `crm/clients.md` (purchase history) | ✅ |
| تكامل مع `crm-pipeline.md` (لو opportunity converted) | ✅ |
| Audit log إجباري | كل خطوة | `audit_logs` | ✅ critical |
| RBAC | sales staff + manager للـ discounts | ✅ |

تحقق يدوي:
- [ ] هل ZATCA QR/UUID/signing automatic + valid لكل invoice?
- [ ] هل stock reservation timeout يعيد المخزون لو ما تم الـ pay?
- [ ] هل discount > X% blocked بدون approval?
- [ ] هل credit limit check حقيقاً صارم (لا override بدون audit)?
- [ ] هل GL entries dual-track (sale + COGS) صحيحة دائماً؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `create` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=SKIP | CTA=PASS | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/store/orders/create; write POST /api/intelligence/activity → 200`
- لقطة: `audit/screenshots/store_orders_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
