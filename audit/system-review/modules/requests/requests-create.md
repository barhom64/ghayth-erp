# /requests/create — `artifacts/ghayth-erp/src/pages/create/requests/items-create.tsx`

## 1. الميتاداتا
- المسار: `/requests/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/requests/items-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/requestsRoutes.tsx:10`
- المجموعة: `requests`
- الكومبوننت: `RequestsItemCreate`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 95
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L55: "مسح المسودة" → `clearDraft`
- L88: "(بلا تسمية)" → `() => setLocation("/requests")` 🔒
- L89: "(بلا تسمية)" → `handleSubmit` 🔒

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

إنشاء طلب جديد — Generic request creation (work request, IT, HR, finance, facilities, etc.).

| نوع الطلب | المثال |
|----------|--------|
| IT | new laptop, software access, password reset |
| HR | salary certificate, experience letter, ID renewal |
| Finance | advance payment, expense reimbursement, custody |
| Facilities | office maintenance, supplies |
| Travel | business trip booking |
| Procurement | new equipment request |
| Legal | contract review |
| Other | custom |

| الحقل | المتطلب |
|------|--------|
| Type | enum | إجباري |
| Subject | إجباري |
| Description | إجباري |
| Priority | low/normal/high/urgent | enum |
| Department (target) | who handles | enum |
| Attachments | راجع `documents.md` | optional |
| Due date | optional |
| Cost (لو applicable) | for budget check |
| Linked entity (optional) | polymorphic |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| Create request | POST `/requests` | `requests` (status=submitted) | ✅ |
| Auto-route based on type + department | راجع `requests-workflows.md` | ✅ critical |
| Calculate SLA per type | راجع `support-sla.md` | ✅ |
| Approval workflow (multi-level if cost) | راجع `governance/approvals.md` | ✅ |
| Validate budget (لو cost > X) | راجع `finance-budget.md` | ⚠ |
| Notify approver(s) | event=`request_submitted` | راجع `notifications.md` | ✅ |
| Track status: submitted → in-review → approved/rejected → in-progress → completed → closed | lifecycle | ✅ |
| Cancel request (by requester before approval) | ✅ |
| Append additional info | راجع `requests-comments.md` | ⚠ |
| Generate official letter (لو HR) | راجع `print-templates` | ⚠ |
| Disburse advance (لو financial) | راجع `finance-payments.md` | ✅ critical |
| تكامل مع `requests-workflows.md` (routing) | ✅ critical |
| تكامل مع `governance/approvals.md` (multi-level) | ✅ |
| تكامل مع `support.md` (لو tickets-like) | ⚠ |
| تكامل مع `documents.md` (attachments + generated letters) | ✅ |
| تكامل مع `bi-kpis.md` (request volume + SLA KPIs) | ✅ |
| Audit log إجباري | كل خطوة | `audit_logs` | ✅ |
| **PDPL** — لو contains PII | encrypt + restrict | ✅ |
| RBAC | requester self + approver + assigned handler | ✅ |

تحقق يدوي:
- [ ] هل auto-routing accurate per type + department?
- [ ] هل SLA tracked + escalates if breached?
- [ ] هل budget check enforced before approval (cost requests)?
- [ ] هل requester can withdraw before approval?
- [ ] هل status transitions audited (no skipping steps)?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `create` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=SKIP | CTA=PASS | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/requests/create; write POST /api/intelligence/activity → 200`
- لقطة: `audit/screenshots/requests_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
