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

إدارة الأدوار (Roles Management). 14 دور predefined + custom roles.

| Predefined Role | Level | الصلاحيات |
|----------------|-------|------------|
| superadmin | 100 | كل شيء |
| admin | 90 | إدارة النظام + RBAC |
| md (Managing Director) | 80 | strategic + exec dashboard |
| cfo | 70 | financial + governance |
| coo | 70 | operations |
| hr_director | 60 | HR + payroll |
| finance_manager | 50 | finance operations |
| department_manager | 40 | team + branch view |
| branch_manager | 40 | branch-scoped |
| sales_rep | 30 | crm portfolio |
| accountant | 30 | data entry + reports |
| operator | 20 | data entry only |
| employee | 10 | self-service |
| guest | 0 | read-only public |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| إنشاء custom role | rbac-v2 | POST `/rbac/v2/roles` | `predefined_roles` (isCustom=true) | ✅ |
| تخصيص صلاحيات | POST `/rbac/v2/role-permissions` | راجع `admin-rbac-matrix.md` | ✅ |
| إسناد دور لمستخدم | POST `/rbac/v2/user-roles` | `user_roles` | ✅ |
| تعديل default permissions لدور predefined | rbac-v2 | يحتاج موافقة 2-of-N admin | ⚠ critical |
| حذف custom role | rbac-v2 | guard: لا users active | `predefined_roles.deletedAt` | ✅ |
| تأثير real-time | invalidate userRoleCache | ✅ |
| تأثير على sidebar | راجع PR #480, #481 | hides + maskFields | ✅ |
| Snapshot history | `role_snapshots` للـ rollback | ✅ |
| إشعار للمستخدم بتغيير دوره | comms | event=`role_assigned\|removed` | `notifications` | ⚠ |
| Audit log + emit event | core | إجباري | `audit_logs`, `event_logs` | ✅ critical |

تحقق يدوي:
- [ ] هل تغيير صلاحية لـ superadmin يتطلب 2-of-N approval؟
- [ ] هل سحب دور admin من نفسي ممكن (suicide protection)?
- [ ] هل التغييرات على custom role تطبق على كل users المخصصين له فوراً؟

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
