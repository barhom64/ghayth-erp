# /my-attendance — `artifacts/ghayth-erp/src/pages/my-attendance.tsx`

## 1. الميتاداتا
- المسار: `/my-attendance`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/my-attendance.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:67`
- المجموعة: `misc`
- الكومبوننت: `MyAttendance`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `my-attendance`
- سطور الملف: 144
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

حضوري (Self-service) — Employee's attendance view + self check-in.

| العرض | الوصف |
|------|------|
| Today's status | check-in/out times | live |
| Current month summary | days worked, late, absent | aggregate |
| Calendar view | per day status | monthly |
| Hours worked | regular + overtime |
| Late count | tardiness this month |
| Absence count | unauthorized absences |
| Upcoming shifts | scheduled | راجع `hr-shifts-byid.md` |
| Tolerance window | grace period info |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| View my attendance | GET `/my-space/attendance` | per employee | ✅ |
| Mobile check-in | POST `/my-space/attendance/check-in` | with GPS | راجع `hr-attendance-create.md` | ⚠ critical |
| Mobile check-out | POST `/my-space/attendance/check-out` | with GPS | ✅ critical |
| Validate geofence | per shift location | راجع `hr-geofencing.md` | ✅ critical |
| Submit correction request | POST `/my-space/attendance/correction` | راجع `hr-attendance.md` (manager approval) | ⚠ |
| View shift schedule | GET `/my-space/shifts` | راجع `hr-shifts-byid.md` | ✅ |
| Swap request (لو applicable) | with colleague | راجع `hr-shifts-byid.md` | ⚠ |
| Notification of shift changes | event=`shift_updated` | راجع `notifications.md` | ✅ |
| Notification of late warning | event=`late_warning` | راجع `notifications.md` | ⚠ |
| تكامل مع `hr-attendance.md` (master) | ✅ critical |
| تكامل مع `hr-shifts-byid.md` (schedule source) | ✅ |
| تكامل مع `hr-payroll.md` (OT calculation feed) | ✅ critical |
| تكامل مع `hr-leaves.md` (لو on leave) | لا check-in | ✅ |
| تكامل مع `notifications.md` (shift reminders) | ✅ |
| Audit log on access | للأمان | `access_logs` | ✅ |
| **PDPL** — own data only + GPS data masked | ✅ critical |
| RBAC | self only | ✅ critical |

تحقق يدوي:
- [ ] هل mobile check-in respects geofence (لا check-in from home)?
- [ ] هل GPS data encrypted + retention limited?
- [ ] هل correction requests require manager + audit?
- [ ] هل shift swap workflow tracks both parties' consent?
- [ ] هل offline check-in supported (sync when online)?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `my-attendance` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/my-attendance`
- لقطة: `audit/screenshots/my_attendance.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
