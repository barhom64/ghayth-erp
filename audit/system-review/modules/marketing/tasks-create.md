# /tasks/create — `artifacts/ghayth-erp/src/pages/marketing.tsx`

## 1. الميتاداتا
- المسار: `/tasks/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/marketing.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:115`
- المجموعة: `marketing`
- الكومبوننت: `Marketing`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 286
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L183: "(بلا تسمية)" → `() => setPreviewCampaign(c)`
- L222: "حملة جديدة"

### القراءات (GET)
- GET `/marketing/funnel`
- GET `/marketing/stats`
- GET `/marketing/campaigns`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/marketing.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `create` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=SKIP | CTA=PASS | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/tasks/create; write POST /api/intelligence/activity → 200`
- لقطة: `audit/screenshots/tasks_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
