# جرد الخدمات المشتركة — CORE_SERVICES_INVENTORY

> **النوع:** جرد ثابت + قرارات — المرحلة 1 من **Ghaith Operating Foundation** (Issue #1418).
> **التاريخ:** 2026-05-29 · **الفرع:** `claude/ghaith-foundation-audit-wdIUf`
> **القاعدة الحاسمة:** لا خدمة مشتركة تُبنى أكثر من مرة. ممنوع نظام مهام/إشعارات/مرفقات/اعتماد منفصل لكل مسار. هذا الجرد يثبت أين النظام منضبط وأين يوجد تكرار يجب دمجه.
> **مصادر يُبنى عليها (لا تُكرَّر):** `SERVICES_INDEX.md` · `docs/architecture/numbering-center.md` · `docs/architecture/communications-unification.md` · `docs/architecture/print-platform.md`.

---

## 0. الخلاصة التنفيذية

غيث يطبّق **انضباطًا معماريًا عاليًا** على الخدمات العابرة: **13 من 14** خدمة مركزية يعاد استخدامها عبر نمط `entityType + entityId` (لا نسخ لكل مسار). **الاستثناء الوحيد: المرفقات/الوثائق** — توجد جدولان خاصان بمسارين (`umrah_attachments`, `employee_documents`) يتوازيان مع الخدمة المشتركة `documents` ويجب دمجهما.

> **القرار الأعلى:** كل عمل قادم يستهلك هذه الخدمات بعقدها الموحّد (تُكتب عقودها في المرحلة 5). ممنوع بناء بديل.

---

## 1. جدول الانضباط (الخدمات الـ14)

| # | الخدمة | الملف(ات) الأساسية | الجدول المركزي | مشترك؟ | القرار |
|---|---|---|---|---|---|
| 1 | المهام Tasks | `routes/tasks.ts`، `shared/linked-tasks.tsx` | `tasks` (+ `linkedEntityType/Id`) | ✅ نعم | **يُستخدم** — لا نظام مهام لكل مسار |
| 2 | الاعتماد/القرار Decisions | `routes/approvalActions.ts`، `routes/governance.ts`، `lib/businessHelpers.requestApproval` | `approval_actions` (+ `approval_chains`) | ✅ نعم (نواة عامة) | **يُستخدم** — `budget_approval_requests` تخصّص مالي لا نظام موازٍ |
| 3 | الإشعارات Notifications | `lib/notificationEngine.ts`، `lib/notificationService.ts`، `routes/notifications.ts` | `notifications` | ✅ نعم | **يُستخدم** — محرّك واحد |
| 4 | الوثائق/المرفقات Documents | `routes/documents.ts`، `shared/entity-documents.tsx` | `documents` + `document_entity_links` | ⚠️ **مختلط** | **يُدمَج** — `umrah_attachments`+`employee_documents` (DOC-VIOLATION) |
| 5 | المراسلات Correspondence | `routes/correspondence.ts`، `lib/messageSender.ts`، `routes/inbox.ts` | `message_log` (+ `outbound_queue`) | ✅ نعم | **يُستخدم** — المسارات القديمة قيد الإنهاء (`communications-unification.md`) |
| 6 | التدقيق Audit | `routes/auditLogs.ts`، `lib/businessHelpers.createAuditLog` | `audit_logs` | ✅ نعم | **يُستخدم ويُطوَّر** — إضافة الدور النشط (RBAC-001) |
| 7 | التعليقات Comments | `routes/entityMeta.ts`، `shared/entity-comments.tsx` | `entity_comments` (+ `entityType/Id`) | ✅ نعم | **يُستخدم** |
| 8 | الطباعة/التصدير Print/Export | `routes/print.ts`، `routes/export.ts`، `lib/print/` | (قوالب حسب entityType) | ✅ نعم | **يُستخدم** (`print-platform.md`) |
| 9 | التقارير/BI Reporting | `routes/bi.ts`، `lib/kpiEngine.ts`، `routes/moduleDashboards.ts` | `bi_dashboards/kpis/reports` | ✅ نعم | **يُستخدم** — لا صوامع تقارير |
| 10 | التقويم Calendar | `routes/calendar.ts` | (استعلام اتحاد متعدد المصادر) | ✅ نعم | **يُستخدم** — قد يُطوَّر بجدول أحداث صريح لاحقًا |
| 11 | SLA/التصعيد Escalation | `lib/supportSlaEscalation.ts`، `routes/support.ts` | `support_tickets` (حاليًا) | ✅ نعم (قابل للتعميم) | **يُطوَّر** — تعميمه على الاعتمادات العامة (`entityType,entityId`) |
| 12 | سياق الذكاء AI | `lib/aiEngine.ts`، `lib/aiGovernance.ts`، `routes/intelligence.ts`، `routes/admin-ai-governance.ts` | `ai_usage_logs`، `ai_governance_policies` | ✅ نعم | **يُستخدم** — حوكمة + حصص موحّدة |
| 13 | الترقيم Numbering | `lib/numberingService.issueNumber`، `routes/numbering.ts` | `numbering_schemes/counters/assignments` | ✅ نعم **(مقفول)** | **يُستخدم** — مقفول بـ lint (`numbering-center.md`) |
| 14 | الأحداث Event Bus | `lib/eventBus.ts`، `lib/eventCatalog.ts`، `lib/eventListeners.ts` | `event_outbox`، `event_dlq` | ✅ نعم | **يُستخدم** — نمط outbox معاملاتي |

> **ملاحظة دقة:** ادعاءات "تم الشحن/مرحلة كذا" في تقرير الاستكشاف تُعامَل كمؤشرات تحتاج تحقّقًا تشغيليًا (مرحلة 7) قبل اعتمادها نهائيًا؛ هذا الجرد يثبت **الوجود والمركزية** لا اكتمال كل ميزة.

---

## 2. التكرار المرصود — يجب دمجه

### DOC-VIOLATION — مرفقات لكل مسار تتوازى مع الخدمة المشتركة

| التكرار | الموقع | المشكلة | القرار |
|---|---|---|---|
| `umrah_attachments` | `migrations/154_umrah_attachments.sql` + endpoints في `umrah-entities.ts` | مسار مرفقات ثانٍ لمجموعات العمرة (FK مباشر لـ `umrah_groups`) خارج `document_entity_links` | **يُدمَج** في `documents` بـ `entityType='umrah_group'` (ترحيل + إهلاك بعد فترة) |
| `employee_documents` | `migrations/083_*` + endpoints في `hr.ts` | جدول خاص بوثائق الموظف المتتبّعة الانتهاء (إقامة/رخصة) خارج الخدمة المشتركة | **يُدمَج** في `documents` + جدول `document_metadata` (انتهاء/امتثال) |

> هذان **أثرٌ تاريخي** (بُنيا قبل نضج النمط الموحّد) لا انتهاك تصميمي حالي؛ لا يمنعان استخدام الخدمة المشتركة لكنهما يضيفان جدولين زائدين. **الدمج منخفض المخاطر، عالي النظافة** — يُجدوَل في مرحلة التنفيذ مع توثيق السبب.

### تكرار آخر مرصود (من جرد سابق — يُحال لا يُكرَّر)
- **كتالوجا RBAC** (rbacCatalog مسطّح ↔ featureCatalog شجري) — FND-010، انظر `RBAC_EXISTING_ASSETS_AUDIT.md` (RBAC-003).
- **قراءات `process.env` متناثرة** vs `config.ts` — FND-003 (`docs/audit/inventory/foundation.md`).

---

## 3. آليات فرض الانضباط القائمة (يُحافَظ عليها)

| الآلية | الموقع | الغرض |
|---|---|---|
| قفل الترقيم | `scripts/src/lint-patterns.mjs` | يمنع `nextval/generateRef/Math.random` على المستندات الرسمية |
| سجل كتالوج الأحداث | `lib/eventCatalog.ts` | يرفض الأحداث غير المسجّلة عند الإطلاق |
| مكوّنات أمامية مشتركة | `shared/entity-documents`, `entity-comments`, `linked-tasks`, `approval-timeline`, `print-button`, `export-buttons` | تمنع تكرار مكوّنات لكل مسار |
| موزّعات موحّدة | `messageSender.sendMessage`, `createAuditLog`, `issueNumber`, `notificationEngine` | نقطة دخول واحدة لكل خدمة |

**قرار:** هذه الآليات **تُستخدم وتُقوّى** — أي عقد خدمة في المرحلة 5 يستند إليها. ممنوع تجاوزها.

---

## 4. القرارات (استخدام / تطوير / دمج / إخفاء / حذف)

- **يُستخدم بعقده الموحّد:** المهام، الاعتماد، الإشعارات، المراسلات، التدقيق، التعليقات، الطباعة/التصدير، BI، التقويم، AI، الترقيم، الأحداث.
- **يُطوَّر:** التدقيق (الدور النشط RBAC-001)؛ SLA/التصعيد (تعميمه من تذاكر الدعم إلى الاعتمادات العامة).
- **يُدمَج:** `umrah_attachments` + `employee_documents` ← `documents` (DOC-VIOLATION)؛ المراسلات القديمة ← `message_log`.
- **يُبنى:** لا خدمة مشتركة جديدة مطلوبة — كلها موجودة.
- **لا حذف الآن:** الدمج يسبق الحذف، وبتوثيق السبب.

---

## 5. المرحلة التالية (5 — عقود الخدمات)

تُكتب عقود واضحة لكل خدمة (مدخلات/مخرجات/أحداث/نطاق): `TASK_SERVICE_CONTRACT` · `DECISION_SERVICE_CONTRACT` · `NOTIFICATION_SERVICE_CONTRACT` · `DOCUMENT_SERVICE_CONTRACT` · `CORRESPONDENCE_SERVICE_CONTRACT` · `AUDIT_SERVICE_CONTRACT` · `COMMENT_SERVICE_CONTRACT` · `PRINT_EXPORT_SERVICE_CONTRACT` · `REPORTING_SERVICE_CONTRACT` · `CALENDAR_SERVICE_CONTRACT` · `SLA_ESCALATION_SERVICE_CONTRACT` · `AI_CONTEXT_SERVICE_CONTRACT` — كلها فوق الأصول المجرودة هنا، **بعقد يخدم المسارات دون أن يقرر بدلها**.
</content>
