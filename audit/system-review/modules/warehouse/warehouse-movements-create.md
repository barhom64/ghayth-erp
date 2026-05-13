# /warehouse/movements/create — `artifacts/ghayth-erp/src/pages/create/warehouse/movements-create.tsx`

## 1. الميتاداتا
- المسار: `/warehouse/movements/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/warehouse/movements-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:97`
- المجموعة: `warehouse`
- الكومبوننت: `WarehouseMovementsCreate`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 113
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(write)_ | `/warehouse/movements` | POST | ✅ | ✅ | — | — | ✅ | ✅ | ✅ |

### تفاصيل الأزرار المرئية
- L61: "مسح المسودة" → `clearDraft`
- L105: "(بلا تسمية)" → `() => setLocation("/warehouse")` 🔒
- L106: "(بلا تسمية)" → `handleSubmit` 🔒

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

إنشاء حركة مخزنية يدوية — typically للـ adjustments أو manual transfers.

| الحقل | المتطلب |
|------|---------|
| Movement type | enum (receive/issue/transfer/adjust+/adjust-/return/scrap) | إجباري |
| Source warehouse | للـ issue/transfer | FK |
| Target warehouse | للـ receive/transfer | FK |
| Reason | for adjustments + scrap | إجباري للـ adjust- و scrap |
| Reference doc | optional (PO, SO, etc.) | polymorphic FK |
| Lines (items + qty + cost) | bulk | إجباري ≥ 1 |
| Lot/Serial | per line | إجباري للـ items القابلة |
| Posting date | للـ GL | إجباري — تحقق من period status |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| Create draft movement | POST `/warehouse/movements` | `inventory_movements` (status=draft) | ✅ |
| Add lines | bulk in same request | `inventory_movement_lines` | ✅ |
| Pre-validate (qty ≥ available) | server-side | لمنع negative inventory | ✅ critical |
| Pre-validate (period open) | لـ GL | راجع `finance-period-close.md` | ✅ critical |
| Submit for approval | لو فيه threshold | راجع `governance/approvals.md` | ⚠ |
| Post (commit) | POST `/movements/:id/post` | يولّد GL + يحدّث inventory_layers | ✅ critical |
| Cancel draft | DELETE | only if status=draft | ✅ |
| Print | راجع `print-templates` | ✅ |
| تكامل مع `finance-cogs.md` | عند post | إجباري | ✅ critical |
| تكامل مع `inventory-layers` (FIFO/WAVG) | حساب التكلفة | راجع `finance-costing.md` | ✅ |
| تكامل مع `posting-queue` | إذا async | راجع `finance-gl-posting-queue.md` | ✅ |
| Audit log إجباري | كل إنشاء/تعديل/post | `audit_logs` | ✅ |
| Notification on large variance | event=`movement_high_variance` | راجع `notifications.md` | ✅ |
| RBAC | warehouse staff + above; scrap requires manager | ✅ |

تحقق يدوي:
- [ ] هل manual adjustment+ يتطلب reason + approval دائماً أم فقط فوق threshold؟
- [ ] هل posting إلى period مقفل ممنوع تماماً؟
- [ ] هل lot expiry يتم validate عند issue (FIFO/FEFO)؟
- [ ] هل draft movements تنتهي صلاحيتها (auto-cancel بعد X أيام)؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `create` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=SKIP | CTA=PASS | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/warehouse/movements/create; write POST /api/intelligence/activity → 200`
- لقطة: `audit/screenshots/warehouse_movements_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
