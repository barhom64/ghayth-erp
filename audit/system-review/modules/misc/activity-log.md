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
- ⚠ L273 _(inline-data-array)_: `const alertCards = [`

## 6. النتيجة (Verdict)
- Runtime audit: **TBD** — راجع `audit/runtime-audit-results.json` (`/activity-log`)
- توصية: **TBD**
- المشاكل: 1 مدخل آلي. أضِفها إلى `audit/system-review/findings/FINDINGS.csv`.
