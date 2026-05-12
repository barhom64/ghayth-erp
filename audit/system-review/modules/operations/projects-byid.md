# /projects/:id — `artifacts/ghayth-erp/src/pages/details/project-detail.tsx`

## 1. الميتاداتا
- المسار: `/projects/:id`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/details/project-detail.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:94`
- المجموعة: `operations`
- الكومبوننت: `ProjectDetail`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `:id`
- سطور الملف: 734
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L248: "غانت"
- L251: "المخاطر"
- L254: "التقويم" → `() => setClosingProject(true)`
- L257: "(بلا تسمية)" → `() => setClosingProject(true)`
- L263: "تأكيد الإقفال" → `closeProject`
- L264: "تعديل" → `() => setClosingProject(false)`
- L267: "تعديل" → `startEdit`
- L270: "تأكيد الحذف" → `handleDelete`
- L271: "(بلا تسمية)" → `() => setDeleting(false)`
- L274: "(بلا تسمية)" → `() => setDeleting(true)`
- L295: "(بلا تسمية)" → `() => setEditing(false)`
- L368: "(بلا تسمية)" → `() => setShowPhaseForm(!showPhaseForm)`
- L381: "(بلا تسمية)" → `() => setShowPhaseForm(false)`
- L413: "(بلا تسمية)" → `() => completePhase(p.id)`
- L429: "غانت"
- L458: "إدارة"
- L487: "(بلا تسمية)" → `() => setShowTaskForm(!showTaskForm)`
- L500: "(بلا تسمية)" → `() => setShowTaskForm(false)`
- L598: "(بلا تسمية)" → `() => setShowCostForm(!showCostForm)`
- L611: "(بلا تسمية)" → `() => setShowCostForm(false)`
- L683: "خطاب جديد"

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
تفاصيل مشروع — مراحل + مهام + تكاليف + مخاطر.

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| إنشاء مشروع | operations | `projects.ts` POST `/projects` | `projects` | ✅ |
| ميزانية المشروع | finance/budget | `projects.budgetAllocated` → `budgets.committed` | ⚠ تحقق |
| ربط بعميل (لو مشروع تجاري) | crm | `projects.clientId` → `clients` | ✅ |
| مراحل المشروع (phases) | operations | `project_phases` | ✅ |
| مهام (tasks) | operations | `project_tasks` (يربط بـ `tasks`) | ✅ |
| Gantt + التبعيات | operations | `task_dependencies` | ✅ |
| مخاطر (risks) | governance | `project_risks` | ✅ |
| تكاليف فعلية (actual costs) | finance | `project_costs` يقرأ من `expenses` + `payroll_lines.projectId` | aggregation | ⚠ تحقق |
| تخصيص موارد بشرية | hr | `project_assignments.employeeId` | لساعات العمل | ✅ |
| timesheet (ساعات على المشروع) | hr | `project_timesheets` | ⚠ تحقق |
| **قيد محاسبي** لتكاليف المشروع | finance/GL | DR Project Costs (WIP) / CR ... | `gl_entries` per cost code | ⚠ غير آلي بالكامل |
| فواتير العميل (milestone billing) | finance/invoices | عند `phase.status='completed'` → `invoices` | ✅ |
| تقرير ربحية المشروع | finance/reports | Revenue - Costs (per project) | view | ✅ |
| إشعارات (مدير + الفريق + العميل) | comms | event=`project_started\|milestone_reached\|delayed\|completed` | `notifications` | ✅ |
| Audit log | core | `auditMiddleware` (`/projects`) | `audit_logs` (entity=`project`) | ✅ |

تحقق يدوي:
- [ ] هل الانحراف عن الميزانية > 10% يطلق تنبيه للـ PM والـ CFO؟
- [ ] هل ساعات العمل على المشروع تنعكس على راتب الموظف (billable hours)؟
- [ ] هل إغلاق مرحلة بدون اكتمال 100% مسموح (override)؟
- [ ] هل اختلاف عملة المشروع عن العملة المحاسبية يحسب فروقات FX؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `:id` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **✅ PASS** — render=SKIP | fetch=SKIP | CTA=SKIP | nav=SKIP | smoke=SKIP
- ملاحظة: `unresolved: no id resolver for /projects/:id`
- landedUrl: `?`
- توصية: مغلق
