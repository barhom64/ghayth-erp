# /hr/excuse-requests/create — `artifacts/ghayth-erp/src/pages/create/hr/excuse-create.tsx`

## 1. الميتاداتا
- المسار: `/hr/excuse-requests/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/hr/excuse-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:166`
- المجموعة: `hr`
- الكومبوننت: `ExcuseCreate`
- subKey: `attendance` | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 131
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(write)_ | `/hr/excuse-requests` | POST | ✅ | ✅ | — | — | ✅ | ✅ | — |

### تفاصيل الأزرار المرئية
- L80: "مسح المسودة" → `clearDraft`
- L123: "(بلا تسمية)" → `() => setLocation("/hr/excuse-requests")` 🔒
- L124: "(بلا تسمية)" → `handleSubmit` 🔒

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

طلب استئذان — Excuse request (short-term absence).

| نوع الاستئذان | المدة | الراتب |
|--------------|-------|--------|
| Hourly (ساعي) | بضع ساعات | بدون خصم لو within policy |
| Half-day | نصف يوم | حسب policy |
| Full-day (non-leave) | يوم كامل | يخصم لو > monthly allowance |
| Medical visit (مراجعة طبية) | hours | with medical certificate |
| Personal emergency | hours | with approval |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| Create excuse request | POST `/hr/excuse-requests` | `excuse_requests` (status=pending) | ✅ |
| Validate within monthly allowance | per policy | راجع `hr-leave-balances.md` | ⚠ |
| Approval workflow | direct manager | راجع `governance/approvals.md` | ✅ |
| Approve | POST `/excuse-requests/:id/approve` | ✅ |
| Reject | with reason | ✅ |
| Update attendance record | راجع `hr-attendance.md` | flag the day | ✅ |
| Deduct from leave balance | لو policy applicable | راجع `hr-leave-balances.md` | ⚠ |
| Deduct from salary | لو exceeds free allowance | راجع `hr-payroll.md` + salary deduction | ✅ critical |
| Attach medical certificate (لو طبي) | راجع `documents.md` | ✅ |
| Notification chain | event=`excuse_request_pending/approved/rejected` | راجع `notifications.md` | ✅ |
| تكامل مع `hr-attendance.md` (reflected in monthly summary) | ✅ |
| تكامل مع `hr-leave-balances.md` (لو counted) | ⚠ |
| تكامل مع `hr-payroll.md` (لو deduction needed) | ✅ |
| تكامل مع `hr-violations.md` (لو frequent abuse) | ⚠ |
| Audit log إجباري | كل خطوة | `audit_logs` | ✅ |
| RBAC | employee self-create + manager approve | ✅ |

تحقق يدوي:
- [ ] هل monthly allowance per Saudi Labor Law respected (typically 16 hours/year)?
- [ ] هل medical certificate mandatory for medical excuse > X hours?
- [ ] هل manager approval enforced (no self-approval)?
- [ ] هل frequent abusers flagged (auto-detection)?
- [ ] هل integration with attendance بدقة (لا duplicate violations)?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `create` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=SKIP | CTA=PASS | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/excuse-requests/create; write POST /api/intelligence/activity → 200; consoleErr=2`
- لقطة: `audit/screenshots/hr_excuse_requests_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
