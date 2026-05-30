# عقد خدمة القرار (الاعتماد) — DECISION_SERVICE_CONTRACT

> المرحلة 5 — **Ghaith Operating Foundation** (#1418) · 2026-05-29 · فرع `claude/ghaith-foundation-audit-wdIUf`
> **يُبنى على:** `CORE_SERVICES_INVENTORY.md` (#2) + `DECISION_OWNERSHIP_MATRIX` + `TASK_AND_DECISION_CENTER_MODEL`.

| البند | القيمة |
|---|---|
| **المسؤولية** | تسجيل وتنفيذ قرارات الاعتماد/الرفض/الإلغاء عبر كل المسارات من مركز واحد |
| **الملف/الجدول** | `routes/approvalActions.ts`، `routes/governance.ts`، `lib/businessHelpers.requestApproval`، جداول `approval_actions` (+ `approval_chains`/`_steps`) |
| **الواجهة الأمامية** | `/action-center`, `finance/approvals-inbox`, `shared/approval-timeline` |
| **المدخلات** | `{ entityType, entityId, action: approve/reject/cancel, reason? }` |
| **المخرجات/الأثر** | تغيير حالة الكيان + سجل في `approval_actions` + تدقيق (بالصفة) + حدث + (أثر GL إن لزم) |
| **النطاق + الحد** | نطاق المعتمد + `rbac_approval_limits` (حد المبلغ + اعتماد ثنائي) |
| **فصل المهام** | `rbac_sod_rules` يمنع self-approval حيث وُجدت قاعدة |
| **الأحداث** | `{entity}.submitted/approved/rejected` |

**القاعدة:** مركز قرار واحد — **ممنوع** اعتماد منفصل لكل مسار. `budget_approval_requests` طبقة تخصص فوق المركز لا نظام موازٍ. الخدمة **تسجّل** القرار؛ **المالك** (الدور المخوّل) هو من **يقرر**.

**القرار:** تُستخدم. **يُطوَّر:** سلاسل متعددة المستويات + تصعيد عبر SLA (مرحلة 6) + تسجيل الصفة (RBAC-001).
</content>
