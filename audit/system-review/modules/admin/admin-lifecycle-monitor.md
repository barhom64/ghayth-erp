# /admin/lifecycle-monitor — `artifacts/ghayth-erp/src/pages/admin-event-monitor.tsx`

## 1. الميتاداتا
- المسار: `/admin/lifecycle-monitor`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/admin-event-monitor.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/adminRoutes.tsx:33`
- المجموعة: `admin`
- الكومبوننت: `AdminEventMonitor`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `lifecycle-monitor`
- سطور الملف: 149
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L49: "(بلا تسمية)" → `() => refetch()`

### القراءات (GET)
- GET `/admin/governance/event-catalog`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/admin.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `lifecycle-monitor` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/admin/lifecycle-monitor`
- لقطة: `audit/screenshots/admin_lifecycle_monitor.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
