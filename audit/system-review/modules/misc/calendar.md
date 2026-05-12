# /calendar — `artifacts/ghayth-erp/src/pages/calendar.tsx`

## 1. الميتاداتا
- المسار: `/calendar`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/calendar.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:75`
- المجموعة: `misc`
- الكومبوننت: `CalendarPage`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `calendar`
- سطور الملف: 310
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L108: "(بلا تسمية)"
- L116: "(بلا تسمية)"
- L262: "(بلا تسمية)" → `onPrev`
- L265: "اليوم" → `onToday`
- L266: "(بلا تسمية)" → `onNext`

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
التقويم الموحّد — يجمع كل الأحداث من كل الوحدات في واجهة واحدة.

| المصدر | الكيان | كيف يظهر في التقويم |
|---------|--------|----------------------|
| hr/leaves | `leave_requests` (approved) | فترة إجازة الموظف |
| hr/training | `training_programs.startDate/endDate` | فترة البرنامج التدريبي |
| hr/recruitment | `application_interviews.scheduledAt` | مقابلة |
| hr/performance | `performance_reviews.dueDate` | موعد مراجعة الأداء |
| legal/sessions | `court_sessions.date` | جلسة محكمة |
| properties/contracts | `property_contracts.endDate` | انتهاء عقد إيجار (alert قبل 60 يوم) |
| properties/maintenance | `maintenance_requests.scheduledAt` | موعد صيانة |
| fleet/maintenance | `fleet_maintenance.scheduledDate` | موعد صيانة مركبة |
| fleet/insurance | `vehicle_insurance.expiringDate` | انتهاء وثيقة تأمين |
| finance/fiscal-periods | `fiscal_periods.endDate` | إقفال فترة مالية |
| umrah | `umrah_seasons.startDate/endDate` | فترة موسم العمرة |
| projects | `project_phases.startDate/endDate` | مراحل المشروع |
| tasks | `tasks.dueDate` | مهمة |
| public_holidays | `public_holidays.date` | عطلة رسمية |
| events | `event_logs` (للأحداث الحرجة فقط) | flag في timeline |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| عرض calendar موحّد | `calendar.ts` GET `/calendar` | aggregate من 15+ مصدر | ✅ |
| فلترة per module/scope | client-side + server filters | scopeQueryString | ✅ |
| RBAC على الأحداث الحساسة | core | يخفي الحساس عن غير المخوّل | ✅ |
| تكامل مع Google Calendar / iCal | gov-integrations | اختياري export | ⚠ |

تحقق يدوي:
- [ ] هل scope (فرع/قسم) يطبق على كل الأحداث في الـ aggregate؟
- [ ] هل تعديل event في وحدة الأصل ينعكس على calendar فوراً (no caching stale)؟
- [ ] هل بيانات حساسة (مراجعة أداء، مقابلة سرية) محصورة على المعنيين؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `calendar` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/calendar`
- لقطة: `audit/screenshots/calendar.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
