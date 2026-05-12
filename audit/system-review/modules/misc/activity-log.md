# /activity-log — `artifacts/ghayth-erp/src/pages/activity-log.tsx`

## 1. الميتاداتا
- المسار: `/activity-log`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/activity-log.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:122`
- المجموعة: `misc`
- الكومبوننت: `ActivityLog`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `activity-log`
- سطور الملف: 515
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L300: "(بلا تسمية)" → `() => refetch()`
- L366: "(بلا تسمية)"
- L398: "(بلا تسمية)" → `() => refetch()`
- L410: "مسح الفلاتر" → `clearFilters`
- L470: "(بلا تسمية)"
- L482: "عرض"
- L503: "(بلا تسمية)" → `() => setPage(p => p - 1)` 🔒
- L506: "(بلا تسمية)" → `() => setPage(p => p + 1)` 🔒

### القراءات (GET)
- GET `/employees?limit=200`
- GET `/activity-log/summary`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/misc.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `activity-log` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/activity-log`
- لقطة: `audit/screenshots/activity_log.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
