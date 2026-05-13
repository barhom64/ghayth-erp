# /projects/create — `artifacts/ghayth-erp/src/pages/create/projects-create.tsx`

## 1. الميتاداتا
- المسار: `/projects/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/projects-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:90`
- المجموعة: `operations`
- الكومبوننت: `ProjectsCreate`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 146
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(write)_ | `/projects` | POST | ✅ | ✅ | — | — | ✅ | ✅ | ✅ |

### تفاصيل الأزرار المرئية
- L70: "مسح المسودة" → `clearDraft`
- L139: "(بلا تسمية)" → `() => setLocation("/projects")` 🔒
- L140: "(بلا تسمية)" → `handleSubmit` 🔒

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

إنشاء مشروع جديد — initialize project with budget + team + timeline.

| الحقل | المتطلب |
|------|--------|
| Name (ar/en) | i18n | إجباري |
| Type | construction/IT/consulting/etc. | enum |
| Client (لو external) | راجع `crm/clients.md` | optional |
| Linked opportunity (لو من CRM) | راجع `crm-pipeline.md` | optional |
| Start date / Target end | timeline | إجباري |
| Initial budget | with approval | راجع `governance/approvals.md` ✅ critical |
| Project manager | from employees | راجع `employees.md` | ✅ |
| Initial team | members + roles | optional |
| Cost center | for allocation | راجع `finance-cost-centers.md` | ✅ |
| Revenue type | fixed/T&M/milestone | per contract |
| Currency | per project | optional (multi-currency) |
| Description / scope | إجباري |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| Create project | POST `/projects` | `projects` (status=planning) | ✅ |
| Budget approval workflow | per amount | راجع `governance/approvals.md` | ✅ critical |
| Create initial budget lines | per category | راجع `finance-budget.md` | ✅ |
| Generate WBS template | optional | راجع `projects-tasks.md` | ⚠ |
| Assign team | bulk | راجع `projects-team.md` | ✅ |
| Link to opportunity (auto-convert from Won) | راجع `crm-pipeline.md` | ✅ |
| Create initial contract (if external) | راجع `legal-contracts-byid.md` | ✅ |
| Schedule kickoff meeting | راجع `calendar.md` | ⚠ |
| Notify team + client | event=`project_created` | راجع `notifications.md` | ✅ |
| Initial document folder | راجع `documents.md` | for project files | ✅ |
| Initial GL entries (لو deposit received) | راجع `finance-receipts.md` | ⚠ |
| Reserve resources (لو applicable) | راجع `warehouse-stock-reservations.md` | ⚠ |
| تكامل مع `crm-pipeline.md` (lead source tracking) | ✅ |
| تكامل مع `finance-budget.md` (per project) | ✅ critical |
| تكامل مع `governance/approvals.md` (budget approval) | ✅ critical |
| Audit log إجباري | كل خطوة | `audit_logs` | ✅ critical |
| RBAC | project manager + finance for budget | ✅ |

تحقق يدوي:
- [ ] هل budget threshold approval صارم (لا workaround)؟
- [ ] هل تحويل opportunity → project تلقائي مع كل البيانات المرتبطة؟
- [ ] هل client linkage mandatory للـ external projects؟
- [ ] هل cost center allocation enforced للـ proper financial reporting؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `create` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=SKIP | CTA=PASS | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/projects/create; write POST /api/intelligence/activity → 200`
- لقطة: `audit/screenshots/projects_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
