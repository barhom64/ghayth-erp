# /module-dashboards — `artifacts/ghayth-erp/src/pages/automation.tsx`

## 1. الميتاداتا
- المسار: `/module-dashboards`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/automation.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:123`
- المجموعة: `admin`
- الكومبوننت: `Automation`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `module-dashboards`
- سطور الملف: 293
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L112: "(بلا تسمية)" → `() => handleTrigger(j.id)`

### القراءات (GET)
- GET `/automation/notification-stats`
- GET `/automation/proactive-rules`
- GET `/automation/automation-stats`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/admin.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `module-dashboards` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/module-dashboards`
- لقطة: `audit/screenshots/module_dashboards.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
