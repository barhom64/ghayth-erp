# /projects — `artifacts/ghayth-erp/src/pages/projects.tsx`

## 1. الميتاداتا
- المسار: `/projects`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/projects.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:89`
- المجموعة: `operations`
- الكومبوننت: `Projects`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `projects`
- سطور الملف: 400
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L206: "مخطط غانت"
- L207: "إدارة المخاطر"
- L208: "تكاليف المشاريع"
- L209: "المهام"
- L277: "(بلا تسمية)"

### القراءات (GET)
- GET `/projects/stats/overview`



## 3. الحركات ذات الصلة (Cross-Module Transactions)

المشاريع — Project Management.

| نوع المشروع | الأمثلة |
|------------|--------|
| Construction | بناء |
| IT/Software | تطوير |
| Consulting | استشاري |
| Maintenance | صيانة |
| Marketing campaign | تسويقي |
| Event | فعالية |
| Research | بحثي |
| Internal initiative | داخلي |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| List projects | GET `/projects` | `projects` | ✅ |
| Create project | with budget + timeline + team | راجع `governance/approvals.md` للـ budget | ✅ |
| Define tasks/milestones | راجع `projects-tasks.md` | WBS | ✅ |
| Assign team members | from employees | راجع `employees.md` | ✅ |
| Track budget vs actual | راجع `finance-budget.md` | per project | ✅ critical |
| Track time/effort | timesheets | راجع `projects-time-tracking.md` | ⚠ |
| Allocate expenses | per project | راجع `finance-expenses.md` | ✅ |
| Allocate revenue (لو contract) | per milestone | راجع `finance-invoices.md` | ✅ |
| Risk tracking | راجع `projects-risks.md` | ✅ |
| Status: planning → active → on-hold → completed → closed | lifecycle | ✅ |
| Gantt chart / Kanban view | UI | ✅ |
| Issue tracking | per project | راجع `support.md` | ⚠ |
| Documents per project | راجع `documents.md` | ✅ |
| Approvals (change requests) | راجع `governance/approvals.md` | ✅ |
| Revenue recognition (% completion or milestone) | per IFRS 15 | راجع `finance-revenue-recognition.md` | ✅ critical |
| WIP (Work in progress) GL | accrued | راجع `finance-wip.md` | ⚠ |
| Project profitability | revenue - cost | KPI | راجع `bi-kpis.md` | ✅ |
| Close project (financial + operational) | مع final settlement | راجع `governance/approvals.md` | ✅ critical |
| تكامل مع `hr-payroll.md` (للـ project-allocated labor) | ✅ |
| تكامل مع `finance-budget.md` (per project budget) | ✅ critical |
| تكامل مع `finance-invoices.md` (revenue per milestone) | ✅ critical |
| تكامل مع `crm-opportunities.md` (won opportunity → project) | ✅ |
| تكامل مع `bi-kpis.md` (schedule + budget variance KPIs) | ✅ |
| Audit log إجباري | كل status/budget change | `audit_logs` | ✅ critical |
| RBAC | project manager + scope per project | ✅ |

تحقق يدوي:
- [ ] هل revenue recognition follows IFRS 15 بدقة (% completion or milestone)?
- [ ] هل budget overrun يطلق approval workflow?
- [ ] هل time tracking from employees يحسب على الـ project cost?
- [ ] هل project closure mandatory steps واضحة (final invoice, archive, lessons learned)?
- [ ] هل WIP/accrued revenue حساب صحيح في المالية؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `projects` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/projects`
- لقطة: `audit/screenshots/projects.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
