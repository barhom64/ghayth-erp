# /admin/domain-registry — `artifacts/ghayth-erp/src/pages/admin-domain-registry.tsx`

## 1. الميتاداتا
- المسار: `/admin/domain-registry`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/admin-domain-registry.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/adminRoutes.tsx:30`
- المجموعة: `admin`
- الكومبوننت: `AdminDomainRegistry`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `domain-registry`
- سطور الملف: 157
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L25: "(بلا تسمية)" → `() => refetch()`

### القراءات (GET)
- GET `/admin/governance/domain-registry`



## 3. الحركات ذات الصلة (Cross-Module Transactions)

سجل النطاقات (Domain Registry) — All business domains / modules registered in the system.

| النطاق | المسؤول | المسارات | الجداول |
|--------|---------|---------|---------|
| Finance | CFO | `/finance/*` | gl_entries, journals, invoices, etc. |
| HR | HR Director | `/hr/*` | employees, attendance, contracts, etc. |
| Warehouse | Warehouse Manager | `/warehouse/*` | products, movements, suppliers |
| Fleet | Fleet Manager | `/fleet/*` | vehicles, drivers, maintenance |
| Properties | Property Manager | `/properties/*` | properties, contracts (Ejar) |
| Legal | Legal Counsel | `/legal/*` | cases, contracts, judgments |
| Store/POS | Sales Manager | `/store/*` | orders, products, customers |
| CRM | Sales Manager | `/crm/*` | clients, opportunities, activities |
| BI | Analytics Lead | `/bi/*` | dashboards, reports, KPIs |
| Operations | COO | `/projects/*`, `/umrah/*` | projects, tasks, umrah |
| Communications | Comms Manager | `/correspondence/*` | correspondence, templates |
| Support | Support Manager | `/support/*` | tickets, KB |
| Governance | Governance Officer | `/governance/*` | approvals, workflows, audits |
| Admin | Superadmin | `/admin/*` | users, roles, integrations |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| List domains | GET `/admin/domain-registry` | `domains` | ✅ |
| View domain details (routes + tables + dependencies) | drill-down | ✅ |
| Domain health check | per domain | راجع `admin-monitoring.md` | ✅ |
| Drift detection (registered vs runtime) | راجع `audit-domain-routes.mjs` | ✅ critical |
| Cross-domain dependency map | visualization | ⚠ |
| Update domain owner | with audit | ✅ |
| Update domain config | requires admin | ✅ critical |
| تكامل مع `admin-system-registry.md` (system-wide) | ✅ |
| تكامل مع `audit-domain-boundaries.mjs` (boundary violations) | راجع `scripts/src/` | ✅ critical |
| تكامل مع `audit-domain-routes.mjs` (route coverage) | ✅ |
| تكامل مع `governance.md` (per-domain governance rules) | ✅ |
| Audit log إجباري | `audit_logs` | ✅ critical |
| RBAC | admin + superadmin فقط | ✅ critical |

تحقق يدوي:
- [ ] هل drift detection alerts trigger immediately on misalignment?
- [ ] هل cross-domain dependencies visible للـ architects?
- [ ] هل owner accountable for domain health metrics?
- [ ] هل domain boundary violations blocked at code level (not just detected)?
- [ ] هل route coverage = 100% (no orphan routes)?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `domain-registry` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/admin/domain-registry`
- لقطة: `audit/screenshots/admin_domain_registry.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
