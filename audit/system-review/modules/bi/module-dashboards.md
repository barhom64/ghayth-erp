# /module-dashboards — `artifacts/ghayth-erp/src/pages/module-dashboards.tsx`

## 1. الميتاداتا
- المسار: `/module-dashboards`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/module-dashboards.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:123`
- المجموعة: `bi`
- الكومبوننت: `ModuleDashboards`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `module-dashboards`
- سطور الملف: 698
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/module-dashboards/hr`
- GET `/module-dashboards/finance`
- GET `/module-dashboards/fleet`
- GET `/module-dashboards/legal`
- GET `/module-dashboards/properties`
- GET `/module-dashboards/projects`
- GET `/module-dashboards/crm`
- GET `/module-dashboards/store`
- GET `/module-dashboards/support`
- GET `/module-dashboards/tasks`
- GET `/module-dashboards/warehouse`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/bi.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `module-dashboards` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
- ⚠ L660 _(inline-data-array)_: `const tabConfig = [`

## 6. النتيجة (Verdict)
- Runtime audit: **TBD** — راجع `audit/runtime-audit-results.json` (`/module-dashboards`)
- توصية: **TBD**
- المشاكل: 1 مدخل آلي. أضِفها إلى `audit/system-review/findings/FINDINGS.csv`.
