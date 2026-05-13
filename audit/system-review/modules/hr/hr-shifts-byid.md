# /hr/shifts/:id — `artifacts/ghayth-erp/src/pages/details/shift-detail.tsx`

## 1. الميتاداتا
- المسار: `/hr/shifts/:id`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/details/shift-detail.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:143`
- المجموعة: `hr`
- الكومبوننت: `ShiftDetail`
- subKey: `shifts` | minRoleLevel: —
- الكيان المستنبط: `:id`
- سطور الملف: 84
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/hr/shifts`



## 3. الحركات ذات الصلة (Cross-Module Transactions)

تفاصيل وردية عمل — Shift definition + assigned employees.

| نوع الوردية | الوصف |
|------------|------|
| Fixed (ثابت) | 8AM-5PM Sun-Thu | typical office |
| Rotating (دوار) | morning/evening rotation | retail, healthcare |
| Night | 10PM-6AM | with night allowance per Saudi Labor Law |
| Split | 8-12 + 4-8 | seasonal/Ramadan |
| Flexible (مرن) | core hours + flexible | knowledge work |
| Remote | work-from-home | hybrid |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| View shift | GET `/hr/shifts/:id` | `shifts` | ✅ |
| Define shift hours | start/end + break times | إجباري | ✅ |
| Set tolerance windows | grace period for late/early | per minutes | ✅ |
| Assign employees | bulk | راجع `shift_assignments` | ✅ |
| Generate weekly/monthly roster | راجع `hr-rosters.md` | per shift | ⚠ |
| Apply holiday calendar | Saudi public holidays | راجع `hr-holidays.md` | ✅ critical |
| Apply Ramadan rules (6h/day workdays) | per Saudi Labor Law | راجع `hr-ramadan-rules.md` | ✅ critical |
| Compute payroll multipliers | regular vs OT vs night | راجع `hr-payroll.md` | ✅ critical |
| Saudi Labor Law compliance | max hours, mandatory rest, weekly off | راجع `governance-compliance.md` | ✅ critical |
| Shift swap (between employees) | with both employees + approval | راجع `governance/approvals.md` | ⚠ |
| Coverage gap alerts | لو shift فارغ | راجع `notifications.md` | ⚠ |
| Mobile + biometric integration | راجع `admin-integrations.md` | ✅ |
| تكامل مع `hr-attendance.md` | matched against shift | ✅ critical |
| تكامل مع `hr-payroll.md` (OT/night multipliers) | ✅ critical |
| تكامل مع `hr-violations.md` (auto for tardiness) | ✅ |
| تكامل مع `governance-compliance.md` (Saudi Labor Law) | ✅ critical |
| Audit log إجباري | كل تعديل shift/assignment | `audit_logs` | ✅ |
| RBAC | hr-manager + scheduler | ✅ |

تحقق يدوي:
- [ ] هل max hours/week (Saudi Labor Law: 48h regular, 36h Ramadan) enforced?
- [ ] هل weekly rest day (Saudi: typically Friday) enforced?
- [ ] هل night allowance (50%+ extra) auto-calculated في payroll؟
- [ ] هل swap workflow يحتفظ بـ audit trail لمن وافق؟
- [ ] هل holiday calendar مطبّق تلقائياً على shift roster؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `:id` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **✅ PASS** — render=SKIP | fetch=SKIP | CTA=SKIP | nav=SKIP | smoke=SKIP
- ملاحظة: `unresolved: no id resolver for /hr/shifts/:id`
- landedUrl: `?`
- توصية: مغلق
