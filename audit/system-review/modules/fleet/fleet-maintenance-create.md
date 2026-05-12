# /fleet/maintenance/create — `artifacts/ghayth-erp/src/pages/fleet/trip-detail.tsx`

## 1. الميتاداتا
- المسار: `/fleet/maintenance/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/fleet/trip-detail.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/fleetRoutes.tsx:40`
- المجموعة: `fleet`
- الكومبوننت: `TripDetail`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 298
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L218: "(بلا تسمية)" → `handleComplete` 🔒
- L227: "(بلا تسمية)" → `handleCancel`

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
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `create` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=SKIP | CTA=PASS | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/fleet/maintenance/create; write POST /api/intelligence/activity → 200`
- لقطة: `audit/screenshots/fleet_maintenance_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
