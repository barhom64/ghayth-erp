# عقد خدمة الوثائق (المرفقات) — DOCUMENT_SERVICE_CONTRACT

> المرحلة 5 — **Ghaith Operating Foundation** (#1418) · 2026-05-29 · فرع `claude/ghaith-foundation-audit-wdIUf`
> **يُبنى على:** `CORE_SERVICES_INVENTORY.md` (#4 — تكرار مرصود DOC-VIOLATION).

| البند | القيمة |
|---|---|
| **المسؤولية** | تخزين وربط المستندات بأي كيان + إصدارات + مجلدات |
| **الملف/الجدول** | `routes/documents.ts`، جداول `documents` + `document_entity_links` + `document_versions` + `document_folders` |
| **الواجهة الأمامية** | `shared/entity-documents.tsx`، `attachment-preview`, `file-drop-zone` |
| **المدخلات** | `{ entityType, entityId, file, category }` |
| **المخرجات/الأثر** | مستند مرتبط + يظهر في تبويب المرفقات (في السياق) + تدقيق |
| **النطاق** | حسب صلاحية المستخدم على الكيان المالك |

**القاعدة:** خدمة واحدة عبر `document_entity_links` — **ممنوع** مرفقات لكل مسار.

**التكرار المرصود (DOC-VIOLATION):**
- `umrah_attachments` (FK لـ `umrah_groups`) → **يُدمَج** في `documents` بـ `entityType='umrah_group'`.
- `employee_documents` (انتهاء إقامة/رخصة) → **يُدمَج** في `documents` + جدول `document_metadata` (انتهاء/امتثال).

**القرار:** تُستخدم الخدمة الموحّدة؛ **يُدمَج** الجدولان الخاصان (ترحيل + إهلاك بعد فترة، **بتوثيق السبب**). الدمج منخفض المخاطر عالي النظافة — يُجدوَل في التنفيذ.
</content>
