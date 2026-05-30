# عقد خدمة SLA والتصعيد — SLA_ESCALATION_SERVICE_CONTRACT

> المرحلة 5 — **Ghaith Operating Foundation** (#1418) · 2026-05-29 · فرع `claude/ghaith-foundation-audit-wdIUf`
> **يُبنى على:** `CORE_SERVICES_INVENTORY.md` (#11) + `SLA_ESCALATION_MODEL` (مرحلة 6).

| البند | القيمة |
|---|---|
| **المسؤولية** | حساب مواعيد SLA، كشف التجاوز، التصعيد والإبلاغ |
| **الملف/الجدول** | `lib/supportSlaEscalation.ts`، `routes/support.ts`، `lib/cronScheduler.ts` (فحص ساعي)، حاليًا `support_tickets` |
| **المدخلات** | `(companyId, entityType, entityId?)` — تُعمَّم من التذاكر فقط |
| **المخرجات/الأثر** | تحديث `slaDeadline/slaBreached/escalationLevel` + إشعار تصعيد + تدقيق |
| **النطاق** | الكيانات ذات المواعيد |

**القاعدة:** محرّك تصعيد واحد قابل لإعادة الاستخدام — **ممنوع** SLA لكل مسار. الخدمة **تنبّه/تصعّد** ولا تقرر بدل المالك.

**القرار:** يُستخدم. **يُطوَّر (#1413/مرحلة 6):** تعميم `escalateSla(entityType, entityId)` على الاعتمادات العامة (مثل: طلب اعتماد معلّق > X يوم يتصعّد للمستوى الأعلى) — انظر `SLA_ESCALATION_MODEL`.
</content>
