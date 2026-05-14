# /requests/workflows — `artifacts/ghayth-erp/src/pages/requests-page.tsx`

## 1. الميتاداتا
- المسار: `/requests/workflows`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/requests-page.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/requestsRoutes.tsx:13`
- المجموعة: `requests`
- الكومبوننت: `RequestsPage`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `workflows`
- سطور الملف: 708
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L135: "(بلا تسمية)"
- L479: "(بلا تسمية)" → `() => { setFilterStatus(""); setFilterType(""); setFilterDateFrom(""); setFilter`
- L498: "(بلا تسمية)" → `() => setShowForm(false)`
- L573: "(بلا تسمية)" → `() => setShowForm(false)`
- L633: "(بلا تسمية)" → `() => setShowForm(false)`

### القراءات (GET)
- GET `/requests/catalog`
- GET `/requests`
- GET `/requests/types`
- GET `/requests/workflows`
- GET `/requests/stats`



## 3. الحركات ذات الصلة (Cross-Module Transactions)

سير عمل الطلبات — Workflow templates + routing rules + escalation.

| المكوّن | الوصف |
|---------|------|
| Workflow template | per request type | reusable definition |
| Steps | sequential or parallel | with approvers |
| Conditions | branching (e.g., cost > threshold) | rule-based |
| Escalation rules | لو لم يرد خلال X | auto-escalate |
| SLA per step | hours/days | راجع `support-sla.md` |
| Notification rules | per step | راجع `notifications.md` |
| Auto-actions on approval | e.g., create payment, create ticket | راجع `automation.md` |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| List workflows | GET `/requests/workflows` | `request_workflows` | ✅ |
| Create workflow template | POST | with steps + conditions | ✅ |
| Edit workflow | PATCH | with version | ✅ critical |
| Test workflow (dry-run) | POST `/workflows/:id/test` | لا side effects | ⚠ |
| Assign default per request type | راجع `requests-create.md` | ✅ critical |
| Execute (per request) | راجع `governance/approvals.md` | ✅ |
| Escalation triggers (cron) | راجع `automation.md` | for overdue | ✅ critical |
| Version history | snapshots | ✅ |
| Audit log on workflow change | إجباري | `audit_logs` | ✅ critical |
| تكامل مع `governance/approvals.md` (engine) | ✅ critical |
| تكامل مع `requests-create.md` (template lookup) | ✅ |
| تكامل مع `notifications.md` (per step) | ✅ |
| تكامل مع `automation.md` (auto-actions on approve) | ✅ |
| RBAC | admin + workflow-designer | ✅ critical |

تحقق يدوي:
- [ ] هل workflow changes versioned (rollback possible)?
- [ ] هل dry-run truly bypasses side effects?
- [ ] هل escalation chains avoid infinite loops?
- [ ] هل conditions DSL secure (no code injection)?
- [ ] هل approver substitution allowed in case of absence?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `workflows` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/requests/workflows`
- لقطة: `audit/screenshots/requests_workflows.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
