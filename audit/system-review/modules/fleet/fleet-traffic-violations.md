# /fleet/traffic-violations — `artifacts/ghayth-erp/src/pages/fleet/reports.tsx`

## 1. الميتاداتا
- المسار: `/fleet/traffic-violations`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/fleet/reports.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/fleetRoutes.tsx:52`
- المجموعة: `fleet`
- الكومبوننت: `FleetReports`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `traffic-violations`
- سطور الملف: 81
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/fleet/stats`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/fleet.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `traffic-violations` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
- ⚠ L15 _(inline-data-array)_: `const statCards = [`

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/fleet/traffic-violations`
- لقطة: `audit/screenshots/fleet_traffic_violations.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
