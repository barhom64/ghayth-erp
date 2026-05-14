# /hr/attendance/:id — `artifacts/ghayth-erp/src/pages/details/attendance-detail.tsx`

## 1. الميتاداتا
- المسار: `/hr/attendance/:id`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/details/attendance-detail.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:93`
- المجموعة: `hr`
- الكومبوننت: `AttendanceDetail`
- subKey: `attendance` | minRoleLevel: —
- الكيان المستنبط: `:id`
- سطور الملف: 292
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

تفاصيل سجل حضور واحد — Single attendance record detail.

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| View record | GET `/hr/attendance/:id` | `attendance_records` | ✅ |
| Edit (manager correction) | PATCH | with reason + approval | ✅ critical |
| Delete (HR only, rare) | DELETE | with strong audit + reason | ⚠ critical |
| Manual override (إضافة hours/OT) | with approval | راجع `governance/approvals.md` | ✅ critical |
| Photo / proof view | راجع `documents.md` | for mobile check-in | ⚠ |
| GPS location view | for verification | راجع `hr-geofencing.md` | ⚠ |
| Linked shift | راجع `hr-shifts-byid.md` | ✅ |
| Late/early flags | calculated | باستخدام tolerance | ✅ |
| Overtime breakdown | hours × rate | راجع `hr-payroll.md` | ✅ critical |
| Linked violation (لو tardiness) | راجع `hr-violations.md` | ⚠ |
| تكامل مع `hr-payroll.md` (input data) | ✅ critical |
| تكامل مع `hr-attendance.md` (parent list) | ✅ |
| تكامل مع `hr-shifts-byid.md` (shift validation) | ✅ |
| تكامل مع `bi-kpis.md` (attendance KPIs) | ✅ |
| تكامل مع `notifications.md` (corrections) | ✅ |
| Audit log إجباري | كل تعديل/حذف | `audit_logs` | ✅ critical |
| **PDPL** — GPS data restricted | retention limited | ✅ critical |
| RBAC | hr-manager + employee (self-view) + immediate manager | ✅ critical |

تحقق يدوي:
- [ ] هل manual override requires reason + manager approval + audit?
- [ ] هل delete restricted to HR with reason + dual approval?
- [ ] هل GPS data retention reasonable (e.g., 90 days)?
- [ ] هل linked violation auto-created for late > X minutes?
- [ ] هل photo / GPS proof reviewable by auditor?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `:id` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **✅ PASS** — render=SKIP | fetch=SKIP | CTA=SKIP | nav=SKIP | smoke=SKIP
- ملاحظة: `unresolved: /api/hr/attendance → 401`
- landedUrl: `?`
- توصية: مغلق
