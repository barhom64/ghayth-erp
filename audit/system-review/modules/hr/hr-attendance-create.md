# /hr/attendance/create — `artifacts/ghayth-erp/src/pages/create/hr/attendance-create.tsx`

## 1. الميتاداتا
- المسار: `/hr/attendance/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/hr/attendance-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:92`
- المجموعة: `hr`
- الكومبوننت: `AttendanceCreate`
- subKey: `attendance` | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 180
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(write)_ | `/hr/check-in` | POST | ✅ | — | — | — | ✅ | ✅ | — |
| _(write)_ | `/hr/check-out` | POST | ✅ | — | — | — | ✅ | ✅ | ✅ |

### تفاصيل الأزرار المرئية
- L101: "مسح المسودة" → `clearDraft`
- L141: "(بلا تسمية)" → `handleGetLocation` 🔒
- L172: "(بلا تسمية)" → `() => setLocation("/hr/attendance")` 🔒
- L173: "(بلا تسمية)" → `handleSubmit` 🔒

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

تسجيل حضور — Check-in / Check-out. Manual entry by HR للحالات الاستثنائية.

| طريقة التسجيل | الوصف |
|--------------|------|
| Biometric (fingerprint) | bioFinger | most accurate |
| Face recognition | webcam/camera | hands-free |
| RFID card | tap | quick |
| Mobile app + GPS | self check-in | with geofencing |
| Manual (HR entry) | exception cases | requires reason + audit |
| QR code scan | site-specific | for visiting workers |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| Create attendance record | POST `/hr/attendance` | `attendance_records` | ✅ |
| Validate employee active | ✅ |
| Validate within shift window | لو fixed shift | راجع `hr-shifts-byid.md` | ⚠ |
| Validate location (geofence) | لو mobile check-in | راجع `hr-geofencing.md` | ⚠ critical |
| Calculate hours worked | check-out - check-in - breaks | ✅ |
| Late arrival flag | based on shift start | يولّد violation محتمل | راجع `hr-violations.md` | ⚠ |
| Early departure flag | similar | ⚠ |
| Overtime calculation | beyond shift hours | راجع `hr-payroll.md` | ✅ critical |
| Manual entry requires reason | for HR-created records | ✅ critical |
| Approval workflow (manual entries) | manager | راجع `governance/approvals.md` | ✅ |
| Update monthly summary | per employee | راجع `hr-attendance-reports.md` | ✅ |
| Notification (لو late > X minutes) | event=`attendance_late` | راجع `notifications.md` | ⚠ |
| Photo capture (mobile) | for verification | راجع `documents.md` | ⚠ |
| تكامل مع `hr-shifts.md` | shift assignment | ✅ |
| تكامل مع `hr-leaves.md` | لو on leave | لا تسجيل | راجع `hr-leaves.md` | ✅ |
| تكامل مع `hr-payroll.md` | input لـ salary calculation | ✅ critical |
| تكامل مع `hr-violations.md` (auto-generation) | للـ tardiness | ⚠ |
| تكامل مع `bi-kpis.md` (attendance KPI) | ✅ |
| Audit log إجباري | كل manual create/edit | `audit_logs` | ✅ critical |
| RBAC | self-check-in for employee + hr-manager for manual | ✅ |

تحقق يدوي:
- [ ] هل manual entries require strong justification + audit logged?
- [ ] هل geofencing prevent fraudulent check-ins from outside the office?
- [ ] هل overtime calculation respect shift rules بدقة?
- [ ] هل auto-violation for late > X minutes شغّال + notifies manager?
- [ ] هل multiple check-ins same day handled properly (no duplicates)?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `create` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=SKIP | CTA=PASS | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/attendance/create; write POST /api/intelligence/activity → 200`
- لقطة: `audit/screenshots/hr_attendance_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
