# /fleet/insurance/:id — `artifacts/ghayth-erp/src/pages/fleet/insurance.tsx`

## 1. الميتاداتا
- المسار: `/fleet/insurance/:id`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/fleet/insurance.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/fleetRoutes.tsx:47`
- المجموعة: `fleet`
- الكومبوننت: `Insurance`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `:id`
- سطور الملف: 89
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L43: "إضافة تأمين"

### القراءات (GET)
- GET `/fleet/insurance`



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
- Runtime audit: **✅ PASS** — render=SKIP | fetch=SKIP | CTA=SKIP | nav=SKIP | smoke=SKIP
- ملاحظة: `unresolved: /api/fleet/insurance → 401`
- landedUrl: `?`
- توصية: مغلق
