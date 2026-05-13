# /correspondence/create — `artifacts/ghayth-erp/src/pages/create/comms/correspondence-create.tsx`

## 1. الميتاداتا
- المسار: `/correspondence/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/comms/correspondence-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/commsRoutes.tsx:15`
- المجموعة: `communications`
- الكومبوننت: `CorrespondenceCreate`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 208
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L82: "(بلا تسمية)"
- L197: "(بلا تسمية)" → `() => setLocation("/correspondence")` 🔒
- L200: "(بلا تسمية)" → `handleSubmit` 🔒

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

إنشاء مراسلة جديدة (صادرة/واردة) — توثيق رسمي.

| الحقل | المتطلب |
|------|---------|
| Reference number | auto-gen — متسلسل `OUT-2026-00001` / `IN-2026-00001` | counters table |
| Direction | enum `incoming\|outgoing\|internal` | إجباري |
| Sender / Receiver | external party or internal | with party type |
| Subject | RTL/LTR aware | إجباري |
| Body / Content | rich text أو attachment | optional |
| Attachments | documents | راجع `documents.md` |
| Priority | low/normal/high/urgent | للـ SLA |
| Linked entity | optional: contract, ticket, project | polymorphic |
| Confidentiality | public/internal/confidential/secret | للـ RBAC |
| Required action | enum (none/review/approve/reply) | للـ workflow |
| Due date | optional | للـ reminders |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| إنشاء | POST `/correspondence` | `correspondences` | ✅ |
| Auto-number generation | counters | per tenant per year per direction | ✅ critical |
| Attach documents | bulk | `correspondence_attachments` | ✅ |
| Link to entity | polymorphic FK | `entityType`, `entityId` | ⚠ تحقق |
| Routing (assignee) | initial | `assignedTo` | ✅ |
| Workflow start (إذا approval) | راجع `governance/workflows.md` | ⚠ |
| Notification للمستلم | event=`correspondence_received` | راجع `notifications.md` | ✅ |
| تكامل مع `legal.md` (لو قانوني) | flag | ✅ |
| تكامل مع `documents-archive.md` (retention) | حسب نوع المراسلة | ✅ |
| Audit log إجباري | كل إنشاء | `audit_logs` | ✅ |
| RBAC | حسب الـ confidentiality | راجع `admin-rbac-matrix.md` | ✅ critical |

تحقق يدوي:
- [ ] هل reference number يضمن uniqueness حتى تحت concurrent writes؟
- [ ] هل confidentiality=secret يقيد المشاهدة على من؟ (owner + المستلم + admin؟)
- [ ] هل due date يطلق reminder تلقائي قبل X أيام؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `create` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=SKIP | CTA=PASS | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/correspondence/create; write POST /api/intelligence/activity → 200`
- لقطة: `audit/screenshots/correspondence_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
