# /admin/rbac-matrix — `artifacts/ghayth-erp/src/pages/admin-rbac-matrix.tsx`

## 1. الميتاداتا
- المسار: `/admin/rbac-matrix`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/admin-rbac-matrix.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/adminRoutes.tsx:34`
- المجموعة: `admin`
- الكومبوننت: `AdminRbacMatrix`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `rbac-matrix`
- سطور الملف: 187
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L58: "(بلا تسمية)" → `() => refetch()`

### القراءات (GET)
- GET `/admin/governance/rbac-matrix`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
مصفوفة RBAC v2 — التحكم بصلاحيات النظام. المرجع: `docs/RBAC_V2.md`, `docs/RBAC_USAGE_GUIDE.md`.

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| عرض المصفوفة (features × roles) | rbac-v2 | GET `/rbac/v2/matrix` | aggregate من `role_permissions` | ✅ |
| تعديل صلاحية (toggle feature × role) | rbac-v2 | PATCH `/rbac/v2/permissions` | `role_permissions` | ✅ |
| إنشاء دور جديد (custom role) | rbac-v2 | POST `/rbac/v2/roles` | `predefined_roles` (مع `isCustom=true`) | ✅ |
| إسناد دور لمستخدم | rbac-v2 | POST `/rbac/v2/user-roles` | `user_roles` | ✅ |
| **تأثير فوري** على الـ session | auth | invalidate cache `userRoleCache` | `sessions` تبقى لكن authorize() يُعاد حسابه | ✅ |
| Audit log + emit event | core | `createAuditLog` + `emitEvent('rbac.permission.changed')` | `audit_logs`, `event_logs` | ✅ critical |
| تأثير على governance | governance | audit findings قد تقترح تشديد RBAC | `rbac_change_proposals` | ⚠ يدوي |
| Approval workflow (للتغييرات الحساسة) | governance/workflows | تغيير admin: 90 يحتاج موافقة | `approval_chains` | ⚠ تحقق |
| Snapshot history | rbac-v2 | كل تغيير ينشئ snapshot | `rbac_snapshots` (للـ rollback) | ✅ |
| إشعار للمستخدم بتغيير صلاحياته | comms | event=`role_assigned\|permission_changed` | `notifications` | ⚠ |
| PDPL: log access changes | core | إجباري | `audit_logs` يحفظ before/after | ✅ |

تحقق يدوي:
- [ ] هل دور admin:100 (superadmin) محصّن — لا يمكن تخفيضه بدون موافقة 2-of-N؟
- [ ] هل صلاحية "view financial" تشمل تلقائياً "view own"؟ (hierarchy)
- [ ] هل تغيير دور موظف منقول لقسم آخر يُحدّث تلقائياً عبر `employee_assignments` change?
- [ ] هل feature toggles معطّلة (system-wide) تظهر للمستخدم بحاله "غير متاح" أم تختفي؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `rbac-matrix` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/admin/rbac-matrix`
- لقطة: `audit/screenshots/admin_rbac_matrix.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
