# /hr/shifts — `artifacts/ghayth-erp/src/pages/hr/shifts.tsx`

## 1. الميتاداتا
- المسار: `/hr/shifts`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/shifts.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:140`
- المجموعة: `hr`
- الكومبوننت: `Shifts`
- subKey: `shifts` | minRoleLevel: —
- الكيان المستنبط: `shifts`
- سطور الملف: 193
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/hr/shifts`
- GET `/hr/shift-assignments`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
ورديات العمل. المرجع: `docs/blueprints/hr-attendance.md` §"Shifts".

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| إنشاء وردية (template) | hr | `hr.ts` POST `/shifts` | `hr_shifts` | ✅ |
| تعريف أيام العمل + الساعات + استراحات | hr | `shifts.daysOfWeek`, `startTime`, `endTime`, `breakMinutes` | ✅ |
| إسناد للموظف | hr | `employee_assignments.shiftId` → `hr_shifts` | ✅ |
| تأثير على Check-in (تحديد late threshold) | hr/attendance | يقرأ shift عند checkIn → يحسب `lateMinutes` | ✅ |
| تأثير على overtime detection | hr/overtime | overtime = checkOut > shift.endTime | ✅ |
| تأثير على الإجازات (working days) | hr/leaves | حساب أيام الإجازة يستثني `daysOfWeek` غير العمل | ✅ |
| دوريات (rotating shifts) | hr | `shift_rotations` per assignment | ⚠ تحقق |
| تكامل مع `public_holidays` | hr/calendar | عطل رسمية تُستثنى تلقائياً | `public_holidays` | ✅ |
| سير موافقة (لتغيير الوردية) | governance | إن مفعّل | `approval_chains` | ⚠ |
| إشعار عند التغيير | comms | event=`shift_changed` | `notifications` | ⚠ |
| Audit log | core | `auditMiddleware` (`/hr/shifts` لو مضاف) | `audit_logs` | ⚠ |

تحقق يدوي:
- [ ] هل تغيير الوردية يطبق فوراً أم في اليوم التالي؟
- [ ] هل الموظف مع وردية ليلية يُعامل العطل الرسمية بشكل مختلف (overtime ×2)؟
- [ ] هل overlap بين shifts ممكن (موظف بوردية رئيسية + وردية إضافية)؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `shifts` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/shifts`
- لقطة: `audit/screenshots/hr_shifts.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
