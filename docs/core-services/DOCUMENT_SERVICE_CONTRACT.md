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

**تحقّق مخطط محدّث (يصحّح DOC-VIOLATION في الجرد):** فحص المخططات والمستهلكين الفعليين غيّر التصنيف:

| الجدول | الحقيقة بعد التحقق | القرار المصحّح |
|---|---|---|
| `employee_documents` (083) | **ليس** مرفقات مكرّرة — جدول **امتثال/انتهاء domain** (`documentType/documentNumber/issueDate/expiryDate/issuingAuthority/reminderDays/status`) يستهلكه **8 ملفات** (`cronScheduler` تذكيرات الانتهاء، `bi`, `calendar`, `dashboard`, `operationsCenter`, `mySpace`, `hr`, `employees`) | **يُبقى كما هو** — دمجه يكسر تتبّع انتهاء الوثائق والامتثال. التصنيف السابق كان **سوء تصنيف** من وكيل الجرد |
| `umrah_attachments` (154) | متعدد الأشكال فعلًا (`entityType`+`entityId`، **لا FK لـ umrah_groups**)؛ يستهلكه ملف واحد (`umrah-entities.ts`، 3 نقاط + تحقّق ملكية + enum نوع) | **مرشّح توحيد حقيقي ومحتوى** — لكنه نظام **يعمل**، فالتوحيد **تحسين نظافة** لا إصلاح؛ يغيّر شكل الاستجابة ويتطلب **تحقق UI تشغيلي** |

**خطة توحيد `umrah_attachments` (دون كسر — تحتاج تحقق staging قبل الدمج):**
1. إضافة أنواع كيانات العمرة إلى `ALLOWED_ENTITY_TYPES` في `documents.ts`.
2. مهاجرة backfill idempotent: نسخ `umrah_attachments` → `documents` (`type`→`category`, `title`, `notes`→`description`, `storageKey`) + `document_entity_links` (`entityType`,`entityId`). **بلا حذف الجدول القديم** (عكوس).
3. إعادة توجيه نقاط `/umrah/attachments` الثلاث داخليًا لتقرأ/تكتب `documents`+`document_entity_links`، **مع الحفاظ على شكل الاستجابة** (تعيين `category`→`type`) حتى لا تتغيّر الواجهة.
4. تحقق UI: تبويب مرفقات العمرة (`umrah-attachments-panel.tsx`) يعرض/يرفع/يحذف بشكل صحيح — **خطوة تشغيلية إلزامية قبل الدمج**.
5. بعد فترة إهلاك وتأكّد: إسقاط `umrah_attachments` (مهاجرة منفصلة، `@policy:destructive`).

**القرار:** الخدمة الموحّدة تُستخدم. `employee_documents` يُبقى (تصحيح). توحيد `umrah_attachments` **مخطّط دقيقًا أعلاه** ويُنفَّذ كـ PR يُتحقَّق منه في staging قبل الدمج — لا يُنفَّذ "أعمى" لأنه يمسّ ميزة تعمل.
</content>
