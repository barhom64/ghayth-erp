# /crm/activities — `artifacts/ghayth-erp/src/pages/crm/activities.tsx`

## 1. الميتاداتا
- المسار: `/crm/activities`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/crm/activities.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:86`
- المجموعة: `crm`
- الكومبوننت: `CrmActivities`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `activities`
- سطور الملف: 132
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/crm/opportunities`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/crm.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `activities` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
- ⚠ L40 _(inline-data-array)_: `const kpis = [`

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/crm/activities`
- لقطة: `audit/screenshots/crm_activities.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
