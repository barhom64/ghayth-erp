# /settings/departments — `artifacts/ghayth-erp/src/pages/settings.tsx`

## 1. الميتاداتا
- المسار: `/settings/departments`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/settings.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/settingsRoutes.tsx:9`
- المجموعة: `settings`
- الكومبوننت: `Settings`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `departments`
- سطور الملف: 402
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L243: "(بلا تسمية)" → `handleSave` 🔒
- L255: "تعديل" → `() => handleEdit(item)` 🔒
- L256: "حذف" → `() => setDeletingItem({ id: item.id, label: (fields[0] && item[fields[0].name]) ` 🔒

### القراءات (GET)
- GET `/settings/resolved`
- GET `/settings/audit-log`



## 3. الحركات ذات الصلة (Cross-Module Transactions)

إعدادات الأقسام (Departments) — Hierarchical organizational structure.

| الحقل | المتطلب |
|------|--------|
| Name (ar/en) | إجباري |
| Code | unique per company |
| Parent department | للـ tree | self-FK |
| Department head | FK to employees | إجباري |
| Branch | FK (لو applicable) | optional |
| Cost center | for finance allocation | راجع `finance-cost-centers.md` |
| Description |
| Headcount target | per period | optional |
| Budget allocation | annual | راجع `finance-budget.md` |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| List departments (tree) | GET `/settings/departments` | `departments` | ✅ |
| Create department | POST | with parent | ✅ |
| Update | PATCH | with audit | ✅ |
| Reorganize (change parent) | PATCH | with audit + cascade | ⚠ critical |
| Assign head | راجع `employees.md` | ✅ |
| Deactivate | guard if has active employees | ✅ critical |
| Merge departments | bulk move employees + budget | with audit | ⚠ critical |
| Transfer employees | راجع `hr-transfers.md` | ✅ |
| Allocate budget | راجع `finance-budget.md` | ✅ |
| Headcount tracking | aggregate | راجع `bi-kpis.md` | ✅ |
| تكامل مع `employees.md` (assignment) | ✅ |
| تكامل مع `finance-cost-centers.md` (allocation) | ✅ critical |
| تكامل مع `governance/approvals.md` (department-based routing) | ✅ |
| تكامل مع `hr-payroll.md` (per department salary aggregation) | ✅ |
| تكامل مع `bi-reports.md` (per department reporting) | ✅ |
| Audit log إجباري | كل تعديل/reorganization | `audit_logs` | ✅ critical |
| RBAC | hr-manager + finance for budget + admin for structure | ✅ critical |

تحقق يدوي:
- [ ] هل reorganization cascades correctly (employees, budgets, approval chains)?
- [ ] هل deactivation guards prevent loss of historical reporting?
- [ ] هل department merge audited بدقة (no employee left orphaned)?
- [ ] هل tree depth manageable (لا overly nested)?
- [ ] هل cost center mapping consistent with finance?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `departments` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/settings/departments`
- لقطة: `audit/screenshots/settings_departments.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
