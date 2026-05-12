# /fleet/:id — `artifacts/ghayth-erp/src/pages/fleet/tco.tsx`

## 1. الميتاداتا
- المسار: `/fleet/:id`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/fleet/tco.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/fleetRoutes.tsx:56`
- المجموعة: `fleet`
- الكومبوننت: `TCO`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `:id`
- سطور الملف: 168
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/fleet/vehicles?limit=200`



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
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=SKIP
- ملاحظة: `landed=/dashboard expected=/fleet/7`
- لقطة: `audit/screenshots/fleet_id.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
