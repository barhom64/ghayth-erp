# /admin/users — `artifacts/ghayth-erp/src/pages/admin/users.tsx`

## 1. الميتاداتا
- المسار: `/admin/users`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/admin/users.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/adminRoutes.tsx:22`
- المجموعة: `admin`
- الكومبوننت: `AdminUsers`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `users`
- سطور الملف: 548
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L160: "تعديل" → `() => toggleActive(r)`
- L163: "تعديل" → `() => startEditUser(r)`
- L166: "إعادة تعيين كلمة المرور" → `() => { setResetUserId(r.id); setResetPassword(""); setCreatedUser(null); setSho`
- L169: "حذف المستخدم" → `() => { setDeleteConfirmId(r.id); setEditUser(null); setResetUserId(null); setSh`
- L277: "(بلا تسمية)" → `() => { setShowForm(!showForm); setCreatedUser(null); setEditUser(null); setDele`
- L306: "(بلا تسمية)" → `() => setShowForm(false)`
- L351: "(بلا تسمية)" → `() => { setCreatedUser(null); setShowForm(false);`
- L371: "(بلا تسمية)" → `() => setEditUser(null)`
- L403: "(بلا تسمية)" → `() => deleteUser(deleteConfirmId)`
- L404: "(بلا تسمية)" → `() => setDeleteConfirmId(null)`
- L423: "تأكيد" → `resetUserPassword` 🔒
- L424: "(بلا تسمية)" → `() => { setResetUserId(null); setResetPassword("");`

### القراءات (GET)
- GET `/admin/users`
- GET `/employees?limit=200`
- GET `/admin/predefined-roles`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/admin.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `users` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/admin/users`
- لقطة: `audit/screenshots/admin_users.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
