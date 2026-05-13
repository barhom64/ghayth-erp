# /admin/users — `artifacts/ghayth-erp/src/pages/admin/users.tsx`

## 1. الميتاداتا
- المسار: `/admin/users`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/admin/users.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/adminRoutes.tsx:22`
- المجموعة: `admin`
- الكومبوننت: `AdminUsers`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `users`
- سطور الملف: 549
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L164: "تعديل" → `() => startEditUser(r)`
- L167: "إعادة تعيين كلمة المرور" → `() => { setResetUserId(r.id); setResetPassword(""); setCreatedUser(null); setSho`
- L278: "(بلا تسمية)" → `() => { setShowForm(!showForm); setCreatedUser(null); setEditUser(null); setDele`
- L307: "(بلا تسمية)" → `() => setShowForm(false)`
- L352: "(بلا تسمية)" → `() => { setCreatedUser(null); setShowForm(false);`
- L372: "(بلا تسمية)" → `() => setEditUser(null)`
- L405: "(بلا تسمية)" → `() => setDeleteConfirmId(null)`
- L424: "تأكيد" → `resetUserPassword` 🔒
- L425: "(بلا تسمية)" → `() => { setResetUserId(null); setResetPassword("");`

### القراءات (GET)
- GET `/admin/users`
- GET `/employees?limit=200`
- GET `/admin/predefined-roles`



## 3. الحركات ذات الصلة (Cross-Module Transactions)

إدارة المستخدمين (Users) — حسابات الدخول. تختلف عن `employees`:
- **user**: حساب نظام (login credentials)
- **employee**: ملف موظف (HR data)
- الربط: `users.employeeId → employees.id` (optional)

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| إنشاء مستخدم | `admin.ts` POST `/admin/users` | `users` | ✅ |
| ربط بـ employee | optional | `users.employeeId` | للـ self-service | ✅ |
| إسناد role | راجع `admin-roles.md` | `user_roles` | ✅ |
| Reset password | POST `/admin/users/:id/reset-password` | email + temporary token | ✅ |
| Enable/disable 2FA | auth | `users.tfaSecret` | ⚠ تحقق |
| Force logout (revoke sessions) | POST `/admin/users/:id/logout` | invalidate `sessions` | ✅ |
| Lock/unlock | brute-force protection | `users.lockedAt` | راجع `admin-violations-report.md` | ✅ |
| Soft delete | `users.deletedAt` | لا حذف فعلي | للـ audit trail | ✅ |
| Transfer ownership (entities) | للـ user المحذوف | منع orphan entities | ⚠ يدوي |
| إشعار welcome + reset | comms | event=`user_created\|password_reset` | `notifications` + email | ✅ |
| Audit log إجباري | كل تعديل | `audit_logs` | ✅ critical |
| PDPL exports (data subject access) | راجع `documents-archive.md` | per user request | ⚠ |
| تأثير على HR (لو موظف) | hr/employees | تعديل user info يحدث sync لـ employee | ⚠ تحقق |

تحقق يدوي:
- [ ] هل user بدون employeeId له صلاحيات أقل (مثلاً external contractor)؟
- [ ] هل تغيير role من employee → admin يطلق تنبيه + 2FA verification؟
- [ ] هل deleted users يبقون في audit_logs بشكل دائم؟

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
