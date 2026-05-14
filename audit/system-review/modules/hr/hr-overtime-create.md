# /hr/overtime/create — `artifacts/ghayth-erp/src/pages/create/hr/overtime-create.tsx`

## 1. الميتاداتا
- المسار: `/hr/overtime/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/hr/overtime-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:126`
- المجموعة: `hr`
- الكومبوننت: `OvertimeCreate`
- subKey: `attendance` | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 247
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(write)_ | `/hr/overtime` | POST | ✅ | ✅ | — | — | ✅ | ✅ | — |

### تفاصيل الأزرار المرئية
- L129: "مسح المسودة" → `clearDraft`
- L235: "(بلا تسمية)" 🔒
- L239: "(بلا تسمية)" → `() => setLocation("/hr/overtime")`

### القراءات (GET)
- GET `/employees?limit=500`



## 3. الحركات ذات الصلة (Cross-Module Transactions)

إنشاء طلب عمل إضافي (Overtime) — Overtime request per Saudi Labor Law.

| Saudi Labor Law | المعدل |
|----------------|--------|
| Regular OT (after 8h regular work) | 1.5× hourly rate |
| Friday/Weekend OT | 2× hourly rate |
| Public holiday OT | 2× hourly rate |
| Night shift OT | additional 50% |
| Ramadan special hours | 1.5× of 6h base |
| Max OT per year | per regulation (typically 720 hours) |

| الحقل | المتطلب |
|------|--------|
| Employee | FK | إجباري |
| Date | إجباري |
| Hours requested | إجباري |
| Reason | إجباري — operational justification |
| Pre-approved or post-fact? | flag |
| Cost center / project | for allocation |
| Manager (approver) | FK |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| Create OT request | POST `/hr/overtime` | `overtime_requests` (status=pending) | ✅ |
| Validate against Saudi Labor Law (max hours/year) | server-side | ✅ critical |
| Validate budget (لو threshold) | راجع `finance-budget.md` | ⚠ |
| Approval workflow (manager + HR) | راجع `governance/approvals.md` | ✅ critical |
| Calculate OT pay | rate × hours × multiplier | راجع `hr-payroll-salary-components.md` | ✅ critical |
| Add to next payroll | راجع `hr-payroll.md` | ✅ critical |
| GL entry — OT expense | Dr Salary Expense / Cr OT Payable | ✅ critical |
| Charge to project (لو applicable) | راجع `projects.md` | ⚠ |
| Notification chain | event=`overtime_pending/approved/rejected` | راجع `notifications.md` | ✅ |
| Track YTD OT per employee (compliance) | aggregate | ✅ critical |
| Cancel OT (before approval) | by requester | ✅ |
| تكامل مع `hr-attendance.md` (actual hours validation) | ✅ |
| تكامل مع `hr-payroll.md` (input) | ✅ critical |
| تكامل مع `finance-budget.md` (cost approval) | ✅ |
| تكامل مع `projects.md` (project cost allocation) | ⚠ |
| تكامل مع `governance-compliance.md` (Saudi Labor Law) | ✅ critical |
| Audit log إجباري | `audit_logs` | ✅ critical |
| RBAC | employee self-create + manager approve | ✅ |

تحقق يدوي:
- [ ] هل multipliers accurate per Saudi Labor Law (1.5× regular, 2× holidays)?
- [ ] هل max OT per year enforced (e.g., 720 hours)?
- [ ] هل actual OT validated against attendance (لا padding)?
- [ ] هل approval workflow distinguishes pre-approved vs post-fact?
- [ ] هل YTD OT compliance reportable for governance?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `create` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=SKIP | CTA=PASS | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/overtime/create; write POST /api/intelligence/activity → 200`
- لقطة: `audit/screenshots/hr_overtime_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
