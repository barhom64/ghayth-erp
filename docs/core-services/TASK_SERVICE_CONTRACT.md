# عقد خدمة المهام — TASK_SERVICE_CONTRACT

> المرحلة 5 — **Ghaith Operating Foundation** (#1418) · 2026-05-29 · فرع `claude/ghaith-foundation-audit-wdIUf`
> **يُبنى على:** `CORE_SERVICES_INVENTORY.md` (#1) — خدمة موجودة ومركزية. هذا عقدها، لا بناء جديد.

| البند | القيمة |
|---|---|
| **المسؤولية** | إدارة المهام المرتبطة بأي كيان: إنشاء/إسناد/حالة/موعد. "ما الذي عليّ فعله؟" |
| **الملف/الجدول** | `routes/tasks.ts`، `routes/actionCenter.ts`، جدول `tasks` (+ `linkedEntityType/linkedEntityId`) |
| **الواجهة الأمامية** | `shared/linked-tasks.tsx`، `/tasks`, `/action-center` |
| **المدخلات** | `{ title, linkedEntityType, linkedEntityId, assignedTo, priority, scheduledDate }` |
| **المخرجات/الأثر** | مهمة بحالة + تظهر في مركز التحكم والتقويم + حدث `task.*` |
| **النطاق** | مفلتر بنطاق المستخدم (self/branch/company) |
| **الأحداث** | `task.created`, `task.assigned`, `task.completed` |

**القاعدة:** خدمة واحدة لكل المسارات عبر `entityType+entityId` — **ممنوع** نظام مهام لكل مسار. الخدمة **تخدم** المسار (تنشئ/تتابع مهمة) ولا **تقرر** بدله.

**القرار:** تُستخدم كما هي. **يُطوَّر:** ربط الحدث بمهمة تلقائية (رحلة 7 الجزئية — مثل جلسة قضية → مهمة تحضير).
</content>
