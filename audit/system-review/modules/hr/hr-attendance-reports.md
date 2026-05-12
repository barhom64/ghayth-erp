# /hr/attendance/reports — `artifacts/ghayth-erp/src/pages/hr/attendance-reports.tsx`

## 1. الميتاداتا
- المسار: `/hr/attendance/reports`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/attendance-reports.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:94`
- المجموعة: `hr`
- الكومبوننت: `AttendanceReports`
- subKey: `attendance` | minRoleLevel: —
- الكيان المستنبط: `reports`
- سطور الملف: 118
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/hr.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `reports` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/attendance/reports`
- لقطة: `audit/screenshots/hr_attendance_reports.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
