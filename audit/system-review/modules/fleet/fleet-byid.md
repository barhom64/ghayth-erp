# /fleet/:id — `artifacts/ghayth-erp/src/pages/details/vehicle-detail.tsx`

## 1. الميتاداتا
- المسار: `/fleet/:id`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/details/vehicle-detail.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/fleetRoutes.tsx:56`
- المجموعة: `fleet`
- الكومبوننت: `VehicleDetail`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `:id`
- سطور الملف: 826
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L159: "تغيير الحالة"
- L163: "تعديل" → `startEdit`
- L166: "تأكيد الحذف" → `handleDelete`
- L167: "(بلا تسمية)" → `() => setDeleting(false)`
- L170: "(بلا تسمية)" → `() => setDeleting(true)`
- L248: "حفظ" → `saveEdit`
- L249: "(بلا تسمية)" → `() => setEditing(false)`

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/fleet.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `:id` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **TBD** — راجع `audit/runtime-audit-results.json` (`/fleet/:id`)
- توصية: **TBD**
- المشاكل: 0 مدخل آلي. أضِفها إلى `audit/system-review/findings/FINDINGS.csv`.
