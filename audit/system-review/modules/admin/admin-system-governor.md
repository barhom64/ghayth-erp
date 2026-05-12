# /admin/system-governor — `artifacts/ghayth-erp/src/pages/admin-system-governor.tsx`

## 1. الميتاداتا
- المسار: `/admin/system-governor`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/admin-system-governor.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/adminRoutes.tsx:28`
- المجموعة: `admin`
- الكومبوننت: `AdminSystemGovernor`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `system-governor`
- سطور الملف: 105
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L25: "(بلا تسمية)" → `() => refetch()`

### القراءات (GET)
- GET `/admin/governance/system-guards`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/admin.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `system-governor` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/admin/system-governor`
- لقطة: `audit/screenshots/admin_system_governor.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
