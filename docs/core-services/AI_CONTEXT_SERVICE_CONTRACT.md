# عقد خدمة سياق الذكاء الاصطناعي — AI_CONTEXT_SERVICE_CONTRACT

> المرحلة 5 — **Ghaith Operating Foundation** (#1418) · 2026-05-29 · فرع `claude/ghaith-foundation-audit-wdIUf`
> **يُبنى على:** `CORE_SERVICES_INVENTORY.md` (#12) + `AI_ASSISTANT_GOVERNANCE` (مرحلة 6).

| البند | القيمة |
|---|---|
| **المسؤولية** | توجيه كل استدعاءات الذكاء الاصطناعي + حوكمة (حصص/تكلفة/صلاحية) + تدقيق |
| **الملف/الجدول** | `lib/aiEngine.ts`، `lib/aiGovernance.ts`، `lib/aiUsage.ts`، `routes/intelligence.ts`، `routes/admin-ai-governance.ts`، جداول `ai_usage_logs`، `ai_governance_policies`، `ai_usage_quotas` |
| **المدخلات** | `{ feature, prompt/context, userId }` — السياق مقيّد بصلاحيات المستخدم |
| **المخرجات/الأثر** | نتيجة AI + تسجيل استخدام (tokens/cost) + فرض الحصص |
| **النطاق** | حصص لكل مستخدم + سقف تكلفة لكل شركة + إتاحة الميزة لكل شركة |

**القاعدة:** محرّك AI واحد (`aiEngine.callAI`) — **ممنوع** تكامل AI خاص بمسار. الذكاء **مقيَّد بالصلاحيات** (لا يكشف ما لا يملك المستخدم رؤيته) ويُدقَّق.

**القرار:** يُستخدم. **يُتحقَّق (مرحلة 7):** أن كل استدعاء AI عبر `aiEngine` لا تكامل خاص خفي. الحوكمة في `AI_ASSISTANT_GOVERNANCE`.
</content>
