# نموذج مركز المهام والقرار — TASK_AND_DECISION_CENTER_MODEL

> المرحلة 2 — **Ghaith Operating Foundation** (#1418) · 2026-05-29 · فرع `claude/ghaith-foundation-audit-wdIUf`
> **المبدأ:** مركز مهام واحد ومركز قرار واحد لكل غيث — لا نظام مهام/اعتماد منفصل لكل مسار.
> **يُبنى على:** `CORE_SERVICES_INVENTORY.md` (Tasks #1، Decisions #2) + `routes/actionCenter.ts`, `routes/tasks.ts`, `routes/approvalActions.ts`, `routes/obligations.ts`.

---

## 1. المراكز الثلاثة الموحّدة

| المركز | الجدول | الواجهة | الغرض |
|---|---|---|---|
| مركز المهام | `tasks` (+ `linkedEntityType/Id`) | `/tasks`, `/action-center`, `shared/linked-tasks` | "ما الذي عليّ فعله؟" — مهام مرتبطة بأي كيان |
| مركز القرار | `approval_actions` (+ `approval_chains`) | `/action-center`, `finance/approvals-inbox` | "ما الذي عليّ اعتماده؟" — اعتمادات عبر المسارات |
| مركز الالتزامات | `obligations` | `/obligations` | "ما المستحق بموعد؟" — تجديد/استئناف/تحصيل |

كلها تظهر مجمّعة في **مركز التحكم** (`/action-center`) المفلتر بنطاق المستخدم.

---

## 2. نموذج المهمة

- **مرتبطة بأي كيان** عبر `linkedEntityType + linkedEntityId` — لا جدول مهام لكل مسار.
- **مُسندة** لموظف (`assignedTo`) ضمن نطاق.
- **لها حالة وأولوية وموعد** — تظهر في `/tasks` و`/action-center` و`/calendar` (اتحاد).
- **تُنشأ** يدويًا أو تلقائيًا من حدث (مثل: جلسة قضية → مهمة تحضير — حاليًا جزئي).

## 3. نموذج القرار (الاعتماد)

- **يُسجَّل في `approval_actions`** (entityType+entityId+action+actionBy) — مركز واحد.
- **يمرّ بسلسلة** `approval_chains` (بسيط/متعدد المراحل/توقيع) عند الحاجة.
- **محكوم بـ:** نطاق + حد مالي (`rbac_approval_limits`) + فصل مهام (`rbac_sod_rules`).
- **يُسجَّل بالصفة:** الدور الذي تم به القرار (RBAC-001 — يجب إصلاحه).

---

## 4. قواعد المركز الموحّد

1. **ممنوع مركز مهام/اعتماد منفصل لكل مسار** — أي مسار يحتاج مهمة/اعتماد يستخدم المركز عبر `entityType`.
2. **القرار للقائد عبر المركز:** الخادم يطلب القرار، المالك يقرر، المركز يسجّل.
3. **الاعتماد المتعدد المستويات** يُمثَّل بسلسلة لا بكود لكل مسار (`APPROVAL_POLICY_EVOLUTION` مرحلة 6).
4. **التصعيد عبر SLA الموحّد** عند تجاوز الموعد (`SLA_ESCALATION_MODEL` مرحلة 6).

---

## 5. الفجوات والقرارات

- **`budget_approval_requests`** تخصّص مالي للميزانية — **ليس نظامًا موازيًا**؛ يبقى كطبقة تخصص فوق المركز.
- **ربط الجلسة/الحدث بمهمة تلقائية** جزئي (رحلة 7) — يُكمَل في التنفيذ ليصبح كل حدث يستحق متابعة منشئًا لمهمة.
- **تعميم SLA/التصعيد** من تذاكر الدعم إلى الاعتمادات العامة (`escalateSla(entityType, entityId)`).
- **عقود هذه المراكز** تُكتب في المرحلة 5: `TASK_SERVICE_CONTRACT`, `DECISION_SERVICE_CONTRACT`.
</content>
