# /tasks/create — `artifacts/ghayth-erp/src/pages/create/tasks-create.tsx`

## 1. الميتاداتا
- المسار: `/tasks/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/tasks-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:115`
- المجموعة: `operations`
- الكومبوننت: `TasksCreate`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 203
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(write)_ | `/tasks` | POST | ✅ | ✅ | — | — | ✅ | ✅ | — |

### تفاصيل الأزرار المرئية
- L116: "مسح المسودة" → `clearDraft`
- L195: "(بلا تسمية)" → `() => setLocation("/tasks")` 🔒
- L196: "(بلا تسمية)" → `handleSubmit` 🔒

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

إنشاء مهمة جديدة (ad-hoc task) — manual task creation.

| الحقل | المتطلب |
|------|--------|
| Title | إجباري |
| Description | optional |
| Assignee | from employees | إجباري |
| Due date | optional |
| Priority | low/normal/high/urgent | enum |
| Category | personal/team/project/other | enum |
| Linked entity (optional) | polymorphic (client, project, etc.) |
| Attachments | راجع `documents.md` |
| Reminder schedule | optional |
| Recurring? | flag for recurring tasks |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| Create task | POST `/tasks` | `tasks` (status=open) | ✅ |
| Validate assignee active | راجع `employees.md` | ✅ |
| Validate due date (لو مطلوب) | reasonable future | ⚠ |
| Notify assignee | event=`task_created_for_you` | راجع `notifications.md` | ✅ |
| Add to assignee's task list | راجع `tasks.md` | ✅ |
| Generate calendar event (لو scheduled time) | راجع `calendar.md` | ⚠ |
| Recurring task — schedule | راجع `automation.md` | for daily/weekly/monthly | ⚠ |
| Linked notification to source entity | optional | ⚠ |
| Mention/tag others | for collaboration | راجع `comments.md` | ⚠ |
| Schedule reminders | per due date | راجع `notifications.md` | ✅ |
| تكامل مع `tasks.md` (assignee view) | ✅ |
| تكامل مع `my-space/dashboard.md` (creator + assignee) | ✅ |
| تكامل مع `calendar.md` | for scheduled | ✅ |
| تكامل مع `bi-kpis.md` (task volume per assignee) | ⚠ |
| Audit log إجباري | كل create + assignment change | `audit_logs` | ✅ |
| RBAC | anyone can create + assign to colleague (with constraints) | ⚠ |

تحقق يدوي:
- [ ] هل manager can create tasks for team members; user only for self/team؟
- [ ] هل recurring task creation prevents duplicate runs?
- [ ] هل assignee can decline + return للـ creator؟
- [ ] هل completion + comments tracked في audit؟
- [ ] هل calendar integration valid (correct timezone)?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `create` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=SKIP | CTA=PASS | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/tasks/create; write POST /api/intelligence/activity → 200`
- لقطة: `audit/screenshots/tasks_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
