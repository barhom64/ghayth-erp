# عقد خدمة التدقيق — AUDIT_SERVICE_CONTRACT

> المرحلة 5 — **Ghaith Operating Foundation** (#1418) · 2026-05-29 · فرع `claude/ghaith-foundation-audit-wdIUf`
> **يُبنى على:** `CORE_SERVICES_INVENTORY.md` (#6) + `RBAC_AUDIT_CONTEXT_SPEC` (RBAC-001).

| البند | القيمة |
|---|---|
| **المسؤولية** | تسجيل كل حركة (من/ماذا/متى/الصفة/قبل/بعد/السبب) |
| **الملف/الجدول** | `routes/auditLogs.ts`، `lib/businessHelpers.createAuditLog`، `middlewares/auditMiddleware.ts`، جدول `audit_logs` |
| **الواجهة الأمامية** | `/admin/logs`, `/settings/audit-log`, `shared/entity-timeline` |
| **المدخلات** | `{ companyId, userId, action, entity, entityId, before, after, reason }` + **`active_role_key`** (مطلوب RBAC-001) |
| **المخرجات/الأثر** | سجل تدقيق + حدث `audit.{entity}.{action}` + خط زمني على الكيان |
| **النطاق** | للقراءة: `requireMinLevel(70)` |

**القاعدة:** سجل واحد + موزّع واحد (`createAuditLog`) — **ممنوع** تدقيق لكل مسار. كل تنفيذ يُسجَّل **بالصفة** (الدور).

**الفجوات/القرار:**
- **RBAC-001 (حرجة):** الدور النشط لا يُسجَّل → **يُطوَّر** (تمرير `selectedRoleKey` + عمود `active_role_key`).
- **FND-006:** `ENTITY_MAP` يغطّي 42 بادئة ويغفل legal/store/governance/automation/bi/marketing → **يُوسَّع** لاكتمال الأثر التلقائي.
</content>
