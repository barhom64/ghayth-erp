# نموذج SLA والتصعيد — SLA_ESCALATION_MODEL

> المرحلة 6 — **Ghaith Operating Foundation** (#1418) · 2026-05-29 · فرع `claude/ghaith-foundation-audit-wdIUf`
> **المبدأ:** تصعيد موحّد عند تجاوز المواعيد عبر كل المسارات — لا منطق تصعيد لكل مسار.
> **يُبنى على:** `SLA_ESCALATION_SERVICE_CONTRACT` + `lib/supportSlaEscalation.ts`.

---

## 1. الوضع الحالي

`supportSlaEscalation.ts` يحسب موعد SLA للتذاكر، يكشف التجاوز (فحص ساعي عبر cron)، يصعّد ويُبلّغ. مقيّد بـ `support_tickets`.

## 2. التعميم المقترح

```
escalateSla(companyId, entityType, entityId?)   ← تعميم التوقيع
   ينطبق على: تذاكر الدعم، طلبات الاعتماد، الالتزامات، طلبات HR
   sla_policy (entityType, priority, deadline_hours, escalation_levels[])
   عند التجاوز: رفع escalationLevel + إشعار المستوى الأعلى + تدقيق
```

## 3. أمثلة عبر المسارات

| الكيان | SLA | التصعيد |
|---|---|---|
| تذكرة دعم | حسب الأولوية | للمشرف ثم المدير |
| طلب اعتماد معلّق | > X يوم | للمعتمد الأعلى (`APPROVAL_POLICY_EVOLUTION`) |
| التزام تحصيل متأخّر | تاريخ الاستحقاق | لمسؤول التحصيل ثم المدير |
| وثيقة موظف منتهية | قبل الانتهاء بـ Y يوم | لمسؤول الموظفين |

## 4. القواعد

1. **محرّك واحد** قابل لإعادة الاستخدام عبر `entityType` — لا SLA لكل مسار.
2. **سياسة معرّفة لا مُرمَّزة** — `sla_policy` قابلة للتهيئة.
3. **كل تصعيد يُدقَّق ويُبلَّغ** عبر الخدمات المشتركة.

## 5. القرار

- **يُعمَّم `escalateSla`** من التذاكر إلى الاعتمادات/الالتزامات — مسار تطور يربط بـ `APPROVAL_POLICY_EVOLUTION` و`DECISION_SERVICE_CONTRACT`.
</content>
