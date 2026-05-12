# /tasks — `artifacts/ghayth-erp/src/pages/create/tasks-create.tsx`

## 1. الميتاداتا
- المسار: `/tasks`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/tasks-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:117`
- المجموعة: `operations`
- الكومبوننت: `TasksCreate`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `tasks`
- سطور الملف: 203
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(write)_ | `/:id/tasks` | POST | ✅ | ✅ | — | — | ✅ | ✅ | ✅ |

### تفاصيل الأزرار المرئية
- L116: "مسح المسودة" → `clearDraft`
- L195: "(بلا تسمية)" → `() => setLocation("/tasks")` 🔒
- L196: "(بلا تسمية)" → `handleSubmit` 🔒

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/operations.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `tasks` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/tasks`
- لقطة: `audit/screenshots/tasks.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
