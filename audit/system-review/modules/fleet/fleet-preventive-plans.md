# /fleet/preventive-plans — `artifacts/ghayth-erp/src/pages/fleet/preventive-plans.tsx`

## 1. الميتاداتا
- المسار: `/fleet/preventive-plans`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/fleet/preventive-plans.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/fleetRoutes.tsx:51`
- المجموعة: `fleet`
- الكومبوننت: `PreventivePlans`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `preventive-plans`
- سطور الملف: 287
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L189: "(بلا تسمية)" → `() => setShowForm(!showForm)`
- L214: "(بلا تسمية)" → `() => setShowForm(false)`

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
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `preventive-plans` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/fleet/preventive-plans`
- لقطة: `audit/screenshots/fleet_preventive_plans.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
