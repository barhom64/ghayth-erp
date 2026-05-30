# عقد خدمة الطباعة والتصدير — PRINT_EXPORT_SERVICE_CONTRACT

> المرحلة 5 — **Ghaith Operating Foundation** (#1418) · 2026-05-29 · فرع `claude/ghaith-foundation-audit-wdIUf`
> **يُبنى على:** `CORE_SERVICES_INVENTORY.md` (#8) + `docs/architecture/print-platform.md`.

| البند | القيمة |
|---|---|
| **المسؤولية** | طباعة المستندات الرسمية وتصدير البيانات من محرّك واحد حسب `entityType` |
| **الملف/الجدول** | `routes/print.ts`، `routes/export.ts`، `lib/print/` (قوالب) |
| **الواجهة الأمامية** | `shared/print-button.tsx`، `export-buttons.tsx`، `entity-print` |
| **المدخلات** | `{ entityType, entityId/filters, format: A4/thermal/label/Excel/CSV }` |
| **المخرجات/الأثر** | مستند مطبوع/مُصدَّر + (رقم رسمي عبر `numbering`) + ترجمة عربية للقيم |
| **النطاق** | حسب صلاحية المستخدم (action: print/export) |

**القاعدة:** محرّك واحد بقوالب حسب `entityType` — **ممنوع** نظام طباعة لكل مسار. الأرقام الرسمية عبر `numbering` المقفول. القيم الإنجليزية في القاعدة تُترجَم للعربية عند الطباعة (commit `27974a9`).

**القرار:** تُستخدم كما هي.
</content>
