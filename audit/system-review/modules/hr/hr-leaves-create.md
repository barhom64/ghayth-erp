# /hr/leaves/create — `artifacts/ghayth-erp/src/pages/create/hr/leaves-create.tsx`

## 1. الميتاداتا
- المسار: `/hr/leaves/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/hr/leaves-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:98`
- المجموعة: `hr`
- الكومبوننت: `LeavesCreate`
- subKey: `leaves` | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 222
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(write)_ | `/hr/leave-requests` | POST | ✅ | — | — | — | ✅ | ✅ | — |

### تفاصيل الأزرار المرئية
- L112: "مسح المسودة" → `clearDraft`
- L214: "(بلا تسمية)" → `() => setLocation("/hr/leaves")` 🔒
- L215: "(بلا تسمية)" → `handleSubmit` 🔒

### القراءات (GET)
- GET `/hr/leave-types`
- GET `/hr/leave-balance`



## 3. الحركات ذات الصلة (Cross-Module Transactions)

إنشاء طلب إجازة (HR side) — Manager/HR-created leave request.

| السيناريو | الوصف |
|----------|------|
| HR creates for employee | for emergency or admin reason |
| Manager creates for team member | rare — typically employee self-requests |
| Bulk leave (force shutdown) | e.g., Eid holiday for all |
| Retrospective leave | post-event documentation | with audit critical |
| Maternity (formal HR process) | full HR involvement |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| Create leave request (HR-side) | POST `/hr/leaves` | `leave_requests` (status=pending) | ✅ |
| Override balance check (لو emergency) | with reason + audit | ✅ critical |
| Auto-approve (لو HR creates) | bypass workflow | with audit | ⚠ critical |
| Bulk approve (e.g., Eid) | bulk POST | راجع `governance/approvals.md` | ⚠ |
| Update attendance immediately | راجع `hr-attendance.md` | ✅ critical |
| Deduct from balance | راجع `hr-leave-balances.md` | ✅ critical |
| Generate official letter (لو requested) | راجع `print-templates` | ✅ |
| Payroll impact | راجع `hr-payroll.md` | paid vs unpaid | ✅ critical |
| GOSI implications (maternity, etc.) | external | راجع `admin-integrations.md` | ✅ critical |
| تكامل مع `hr-leaves.md` (list) | ✅ |
| تكامل مع `my-leave-request.md` (employee self-service) | ✅ |
| تكامل مع `hr-attendance.md` (auto-flag days) | ✅ critical |
| تكامل مع `hr-payroll.md` (paid/unpaid impact) | ✅ critical |
| تكامل مع `governance-compliance.md` (Saudi Labor Law) | ✅ critical |
| Audit log إجباري — extra detailed for HR-created | `audit_logs` | ✅ critical |
| RBAC | hr-manager + manager for own team only | ✅ critical |

تحقق يدوي:
- [ ] هل override balance check requires CFO/CEO override + audit?
- [ ] هل HR-created leaves notify the employee?
- [ ] هل bulk leaves cascade attendance + payroll correctly?
- [ ] هل retrospective leaves audited بصرامة (rare exception)?
- [ ] هل Saudi Labor Law entitlements respected per type?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `create` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=SKIP | CTA=PASS | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/leaves/create; write POST /api/intelligence/activity → 200; consoleErr=2`
- لقطة: `audit/screenshots/hr_leaves_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
