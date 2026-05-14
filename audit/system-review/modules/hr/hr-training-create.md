# /hr/training/create — `artifacts/ghayth-erp/src/pages/create/hr/training-create.tsx`

## 1. الميتاداتا
- المسار: `/hr/training/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/hr/training-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:111`
- المجموعة: `hr`
- الكومبوننت: `TrainingCreate`
- subKey: `training` | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 206
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(write)_ | `/hr/training/programs` | POST | ✅ | ✅ | — | — | ✅ | ✅ | — |

### تفاصيل الأزرار المرئية
- L100: "مسح المسودة" → `clearDraft`
- L198: "(بلا تسمية)" → `() => setLocation("/hr/training")` 🔒
- L199: "(بلا تسمية)" → `handleSubmit` 🔒

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

إنشاء دورة تدريبية جديدة — Training program creation.

| الحقل | المتطلب |
|------|--------|
| Title | إجباري |
| Category | enum (technical/soft/safety/compliance/onboarding) |
| Provider | internal/external | راجع `warehouse-suppliers.md` لو external |
| Trainer | FK | for internal | راجع `employees.md` |
| Duration | hours/days | إجباري |
| Capacity | max enrollment | إجباري |
| Cost per participant | budget input | راجع `finance-budget.md` |
| Schedule | dates + times |
| Location | venue/online |
| HRDF-eligible? | flag for reimbursement | راجع `admin-integrations.md` |
| Mandatory? | flag for compliance |
| Pre-requisites | linked trainings |
| Assessment? | flag for post-evaluation |
| Certification issued? | flag |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| Create program | POST `/hr/training` | `training_programs` | ✅ |
| Budget approval (لو > threshold) | راجع `governance/approvals.md` | ✅ |
| Schedule rooms/resources | راجع `calendar.md` | ⚠ |
| Send invites to target audience | راجع `notifications.md` | ✅ |
| HRDF pre-approval (لو applicable) | external | راجع `admin-integrations.md` | ⚠ |
| Linked materials/agenda | راجع `documents.md` | ✅ |
| Mandatory enrollment (per role) | bulk | راجع `automation.md` | ⚠ |
| تكامل مع `hr-training-byid.md` (detail) | ✅ |
| تكامل مع `finance-budget.md` (cost approval) | ✅ critical |
| تكامل مع `governance-compliance.md` (mandatory training tracking) | ✅ |
| Audit log إجباري | `audit_logs` | ✅ |
| RBAC | hr-manager + L&D specialist | ✅ |

تحقق يدوي:
- [ ] هل HRDF integration submits eligibility before training starts?
- [ ] هل mandatory training auto-enrolls target audience based on role?
- [ ] هل cost approval enforced for budget tracking?
- [ ] هل capacity limit enforced (no over-enrollment)?
- [ ] هل assessment results recorded for certification?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `create` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=SKIP | CTA=PASS | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/training/create; write POST /api/intelligence/activity → 200`
- لقطة: `audit/screenshots/hr_training_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
