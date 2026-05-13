# /admin/system-registry — `artifacts/ghayth-erp/src/pages/admin-system-registry.tsx`

## 1. الميتاداتا
- المسار: `/admin/system-registry`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/admin-system-registry.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/adminRoutes.tsx:36`
- المجموعة: `admin`
- الكومبوننت: `AdminSystemRegistry`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `system-registry`
- سطور الملف: 689
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L174: "(بلا تسمية)" → `() => refetchReg()`

### القراءات (GET)
- GET `/admin/system-registry`
- GET `/admin/system-registry/entities`
- GET `/admin/system-registry/actions`
- GET `/admin/system-registry/missing`
- GET `/admin/system-registry/coverage`
- GET `/admin/system-registry/notifications`
- GET `/admin/system-registry/reports`
- GET `/admin/system-registry/print-templates`



## 3. الحركات ذات الصلة (Cross-Module Transactions)

System Registry — سجل النظام الموحّد للموارد والـ catalogs.

| Sub-registry | الوصف | المرجع |
|--------------|------|--------|
| Module registry | كل الـ modules النشطة | `docs/MODULES.md` |
| Feature catalog | RBAC features × actions | `lib/rbac/featureCatalog` |
| Event catalog | كل الأحداث | `lib/eventCatalog.ts` (16 entry) |
| Workflow templates | predefined workflows | `workflow_templates` |
| Document templates | للقوالب | راجع `documents-templates.md` |
| Approval chains | القوالب | `approval_chain_templates` |
| Notification templates | rendered messages | `notification_templates` |
| Cron jobs | scheduled tasks | `cron_jobs` (راجع `admin-monitoring.md`) |
| API endpoints | route inventory | `audit-routes.mjs` |
| Database tables | الـ schema | `lib/db/src/schema/index.ts` |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| Listing all | GET `/admin/system-registry` | aggregation | ✅ |
| Health check per registry | per registry rule | ✅ |
| Drift detection | راجع `audit-schema-drift.mjs` | ✅ |
| Refresh registry (re-scan) | POST `/admin/system-registry/refresh` | ⚠ تحقق |
| تأثير على RBAC matrix | راجع `admin-rbac-matrix.md` | ✅ |
| تأثير على event monitor | راجع `admin-event-monitor.md` | ✅ |
| Audit log | إجباري لكل تعديل | ✅ |
| Versioning | snapshot per change | `system_registry_versions` | ⚠ |

تحقق يدوي:
- [ ] هل drift بين registered vs runtime يطلق تنبيه؟
- [ ] هل registry معروض مع `audit/system-review` ميتاداتا (تكامل)؟
- [ ] هل rollback لـ registry version قديم ممكن؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `system-registry` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/admin/system-registry`
- لقطة: `audit/screenshots/admin_system_registry.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
