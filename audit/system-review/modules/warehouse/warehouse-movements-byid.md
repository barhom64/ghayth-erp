# /warehouse/movements/:id — `artifacts/ghayth-erp/src/pages/create/warehouse/suppliers-create.tsx`

## 1. الميتاداتا
- المسار: `/warehouse/movements/:id`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/warehouse/suppliers-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:101`
- المجموعة: `warehouse`
- الكومبوننت: `WarehouseSuppliersCreate`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `:id`
- سطور الملف: 83
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(call)_ | `/warehouse/suppliers` | POST | 🔴 لم يُعثر على endpoint مطابق |||||||

### تفاصيل الأزرار المرئية
- L47: "مسح المسودة" → `clearDraft`
- L76: "(بلا تسمية)" → `() => setLocation("/warehouse")` 🔒
- L77: "(بلا تسمية)" → `handleSubmit` 🔒

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/warehouse.md` (إن وُجد) وعدّد:
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
- Runtime audit: **✅ PASS** — render=SKIP | fetch=SKIP | CTA=SKIP | nav=SKIP | smoke=SKIP
- ملاحظة: `unresolved: /api/warehouse/movements → 401`
- landedUrl: `?`
- توصية: مغلق
