# /hr/organization/structure — `artifacts/ghayth-erp/src/pages/hr/organization-structure.tsx`

## 1. الميتاداتا
- المسار: `/hr/organization/structure`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/organization-structure.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:115`
- المجموعة: `hr`
- الكومبوننت: `OrganizationStructure`
- subKey: `organization` | minRoleLevel: —
- الكيان المستنبط: `structure`
- سطور الملف: 84
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/settings/departments`
- GET `/employees?limit=200`



## 3. الحركات ذات الصلة (Cross-Module Transactions)

الهيكل التنظيمي — Org chart visualization + management.

| العرض | الوصف |
|------|------|
| Hierarchical tree | departments → positions → employees |
| Position-based | open positions + filled |
| Reporting lines | who reports to whom |
| Span of control | direct reports per manager |
| Vacant positions | for recruitment |
| Span of control alerts | لو > 10 direct reports |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| View org chart | GET `/hr/organization-structure` | aggregations from `employees` + `departments` | ✅ |
| Export as PDF/image | راجع `print-templates` | ✅ |
| Update reporting line (manager change) | راجع `hr-transfers.md` | ✅ critical |
| Define position | راجع `hr-positions.md` | ✅ |
| Assign employee to position | راجع `employees.md` | ✅ critical |
| Mark position vacant | for recruitment | راجع `hr-recruitment.md` | ⚠ |
| Restructure (bulk) | with full audit | راجع `settings-departments.md` | ✅ critical |
| Manager hierarchy validation | no cycles | ✅ critical |
| Span of control monitor | alert if exceeded | راجع `notifications.md` | ⚠ |
| Saudization compliance check | per dept | راجع `governance-compliance.md` | ✅ critical |
| Linked roles + permissions | راجع `admin-roles.md` | ✅ |
| تكامل مع `employees.md` (members) | ✅ |
| تكامل مع `settings-departments.md` (departments) | ✅ |
| تكامل مع `governance/approvals.md` (approval routing based on hierarchy) | ✅ critical |
| تكامل مع `governance-compliance.md` (Saudization) | ✅ critical |
| تكامل مع `bi-kpis.md` (headcount + span KPIs) | ✅ |
| Audit log إجباري | كل تعديل | `audit_logs` | ✅ critical |
| RBAC | hr-manager + admin for restructure | ✅ critical |

تحقق يدوي:
- [ ] هل manager cycle detection prevents A→B→C→A?
- [ ] هل approval chains auto-update عند reporting line change?
- [ ] هل Saudization quota per department visible?
- [ ] هل vacant positions integrate مع recruitment?
- [ ] هل bulk restructure dry-run available?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `structure` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/organization/structure`
- لقطة: `audit/screenshots/hr_organization_structure.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
