# /admin/roles — `artifacts/ghayth-erp/src/pages/admin/roles.tsx`

## 1. الميتاداتا
- المسار: `/admin/roles`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/admin/roles.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/adminRoutes.tsx:23`
- المجموعة: `admin`
- الكومبوننت: `AdminRoles`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `roles`
- سطور الملف: 412
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L264: "(بلا تسمية)" → `saveModules` 🔒
- L265: "(بلا تسمية)" → `() => setEditingRole(null)`
- L268: "(بلا تسمية)" → `() => startEdit(r)`

### القراءات (GET)
- GET `/admin/predefined-roles`
- GET `/settings/role-modules`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/admin.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `roles` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/admin/roles`
- لقطة: `audit/screenshots/admin_roles.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
