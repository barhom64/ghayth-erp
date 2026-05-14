# /projects/tasks — `artifacts/ghayth-erp/src/pages/tasks.tsx`

## 1. الميتاداتا
- المسار: `/projects/tasks`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/tasks.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:91`
- المجموعة: `operations`
- الكومبوننت: `Tasks`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `tasks`
- سطور الملف: 423
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L187: "(بلا تسمية)"
- L197: "(بلا تسمية)"
- L208: "(بلا تسمية)"
- L219: "نسخ"
- L223: "(بلا تسمية)"
- L232: "(بلا تسمية)"
- L242: "(بلا تسمية)"
- L390: "(بلا تسمية)" → `saveEdit` 🔒
- L394: "إلغاء" → `cancelEdit`

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

مهام المشروع (WBS) — Work Breakdown Structure.

| الحقل | الوصف |
|------|------|
| Task | اسم المهمة |
| Parent task | لـ hierarchy | self-FK |
| Assignee | from team | راجع `employees.md` |
| Start/End date | scheduled |
| Duration | hours/days |
| Dependencies | predecessor tasks | FS/SS/FF/SF |
| Estimated effort | hours |
| Actual effort | hours from timesheets |
| Status | todo/in-progress/blocked/done | lifecycle |
| Priority | low/normal/high/critical |
| % complete | 0-100 |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| List tasks (Kanban/Gantt) | GET `/projects/:id/tasks` | `project_tasks` | ✅ |
| Create task | POST | with optional parent | ✅ |
| Update task | PATCH | status, dates, assignee | ✅ |
| Add dependency | between tasks | with cycle detection | ✅ critical |
| Drag-drop reorder | sortOrder | ⚠ |
| Bulk update | bulk PATCH | للـ team leader | ⚠ |
| Time log entry | POST `/projects/:id/tasks/:tid/time` | راجع `projects-time-tracking.md` | ⚠ |
| Comments / discussion | per task | راجع `documents.md` | ⚠ |
| Attachments | per task | راجع `documents.md` | ✅ |
| Block warning (لو dependency not met) | guard | ⚠ |
| Notification on assignee change | event=`task_assigned` | راجع `notifications.md` | ✅ |
| Notification on due date approach | event=`task_due_soon` | ✅ |
| Update project % completion (rollup) | aggregate | ✅ |
| Generate Gantt chart | راجع `projects-gantt.md` | ✅ |
| تكامل مع `projects.md` (parent) | ✅ |
| تكامل مع `hr-payroll.md` (لو time-tracked for billing) | ✅ |
| تكامل مع `bi-kpis.md` (on-time delivery KPI) | ✅ |
| تكامل مع `tasks.md` (my-tasks view) | ✅ |
| Audit log إجباري | كل تعديل status | `audit_logs` | ✅ |
| RBAC | project manager + assignee | ✅ |

تحقق يدوي:
- [ ] هل dependency cycle detection شغّال (لمنع infinite loops)؟
- [ ] هل % completion rolls up to parent task + project بدقة؟
- [ ] هل time logs validated (لا overlap, lazy entry)؟
- [ ] هل blocking task يطلق alert للـ project manager؟
- [ ] هل critical path calculation مرئي للـ team؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `tasks` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/projects/tasks`
- لقطة: `audit/screenshots/projects_tasks.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
