# /support/create — `artifacts/ghayth-erp/src/pages/create/support-create.tsx`

## 1. الميتاداتا
- المسار: `/support/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/support-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:108`
- المجموعة: `support`
- الكومبوننت: `SupportCreate`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 136
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(write)_ | `/support/tickets` | POST | ✅ | ✅ | — | — | ✅ | ✅ | — |

### تفاصيل الأزرار المرئية
- L59: "مسح المسودة" → `clearDraft`
- L129: "(بلا تسمية)" → `() => setLocation("/support")` 🔒
- L130: "(بلا تسمية)" → `handleSubmit` 🔒

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

إنشاء تذكرة دعم — Support ticket (internal أو client-facing).

| نوع التذكرة | المثال |
|------------|--------|
| Technical | IT issue | internal |
| Customer service | client complaint | external |
| Billing | invoice query | external |
| Feature request | enhancement | internal/external |
| Bug report | system issue | internal |
| HR | employee query | internal |

| الحقل | المتطلب |
|------|--------|
| Subject | إجباري |
| Description | rich text + attachments |
| Category | enum |
| Priority | low/normal/high/urgent/critical | with SLA |
| Reporter | client أو employee | FK |
| Assignee | initial routing | optional |
| Linked entity | optional (order, invoice, asset, etc.) | polymorphic |
| Channel | web/email/phone/whatsapp | enum |
| Attachments | screenshots, files | راجع `documents.md` |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| Create ticket | POST `/support` | `support_tickets` (status=open) | ✅ |
| Auto-assign (based on rules) | routing engine | راجع `comms-notification-engine.md` for routing | ⚠ |
| Calculate SLA deadline | per priority | راجع `support-sla.md` | ✅ critical |
| Send acknowledgment to reporter | event=`ticket_created` | راجع `notifications.md` | ✅ |
| Add to assignee's queue | راجع `my-space/tasks.md` | ✅ |
| Linked to client (لو external) | راجع `crm/clients.md` | ✅ |
| Linked to KB article (auto-suggest) | راجع `support-kb.md` | ⚠ |
| Reply (راجع `support-replies.md`) | thread | ✅ |
| Status transitions: open → in-progress → waiting → resolved → closed | lifecycle | راجع `lifecycle/support.ts` | ✅ |
| Escalation (لو SLA breach) | event=`ticket_sla_breach` | راجع `notifications.md` | ✅ critical |
| Reassign | with reason + audit | ✅ |
| Merge duplicate tickets | with audit | ⚠ |
| Customer satisfaction survey (post-resolve) | راجع `crm-csat.md` | ⚠ |
| Convert to bug/feature (لو dev) | راجع `projects.md` | ⚠ |
| تكامل مع `crm/clients.md` (history) | ✅ |
| تكامل مع `documents.md` (attachments) | ✅ |
| تكامل مع `notifications.md` (multi-channel updates) | ✅ |
| تكامل مع `bi-kpis.md` (CSAT, MTTR, ticket volume) | ✅ |
| Audit log إجباري | كل خطوة | `audit_logs` | ✅ |
| **PDPL** — مراسلات حساسة محصورة | per ticket confidentiality | ✅ |
| RBAC | support staff + manager | external client يرى الخاص به فقط | ✅ critical |

تحقق يدوي:
- [ ] هل SLA deadlines accurate per priority + business hours؟
- [ ] هل auto-routing يأخذ assignee availability/load بعين الاعتبار؟
- [ ] هل client يستطيع رؤية تذاكر غير his?
- [ ] هل CSAT survey timing مناسب (بعد resolve مباشرة أم بعد X أيام)?
- [ ] هل ticket escalation chain واضحة قبل breaching SLA?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `create` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=SKIP | CTA=PASS | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/support/create; write POST /api/intelligence/activity → 200`
- لقطة: `audit/screenshots/support_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
