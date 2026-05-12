# /reports/scheduled — `artifacts/ghayth-erp/src/pages/reports/scheduled-reports.tsx`

## 1. الميتاداتا
- المسار: `/reports/scheduled`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/reports/scheduled-reports.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:124`
- المجموعة: `bi`
- الكومبوننت: `ScheduledReports`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `scheduled`
- سطور الملف: 289
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L103: "(بلا تسمية)" → `() => setShowForm(!showForm)`
- L124: "(بلا تسمية)" → `() => setShowForm(false)`
- L263: "(بلا تسمية)" → `handleDelete` 🔒

### القراءات (GET)
- GET `/scheduled-reports`
- GET `/scheduled-reports/history`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/bi.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `scheduled` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/reports/scheduled`
- لقطة: `audit/screenshots/reports_scheduled.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
