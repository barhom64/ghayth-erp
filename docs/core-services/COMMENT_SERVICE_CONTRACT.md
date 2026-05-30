# عقد خدمة التعليقات — COMMENT_SERVICE_CONTRACT

> المرحلة 5 — **Ghaith Operating Foundation** (#1418) · 2026-05-29 · فرع `claude/ghaith-foundation-audit-wdIUf`
> **يُبنى على:** `CORE_SERVICES_INVENTORY.md` (#7).

| البند | القيمة |
|---|---|
| **المسؤولية** | تعليقات المستخدمين على أي كيان |
| **الملف/الجدول** | `routes/entityMeta.ts`، جدول `entity_comments` (+ `entityType/entityId`) |
| **الواجهة الأمامية** | `shared/entity-comments.tsx` (مكوّن واحد لكل السياقات) |
| **الواجهة (API)** | `GET/POST /entity-meta/comments/{entityType}/{entityId}`, `DELETE /entity-meta/comments/:id` |
| **المخرجات/الأثر** | تعليق مرتبط + يظهر في تبويب التعليقات (في السياق) |
| **النطاق** | حسب صلاحية المستخدم على الكيان |

**القاعدة:** جدول واحد + مكوّن واحد عبر `entityType+entityId` — **ممنوع** تعليقات لكل مسار. الخدمة **تخدم** السياق ولا تقرر.

**القرار:** تُستخدم كما هي — لا تطوير مطلوب.
</content>
