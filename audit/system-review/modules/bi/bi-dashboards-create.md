# /bi/dashboards/create — `artifacts/ghayth-erp/src/pages/create/bi/dashboards-create.tsx`

## 1. الميتاداتا
- المسار: `/bi/dashboards/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/bi/dashboards-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/biRoutes.tsx:13`
- المجموعة: `bi`
- الكومبوننت: `DashboardsCreate`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 70
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L43: "مسح المسودة" → `clearDraft`
- L63: "(بلا تسمية)" → `() => setLocation("/bi/dashboards")` 🔒
- L64: "(بلا تسمية)" → `handleSubmit` 🔒

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/bi.md` (إن وُجد) وعدّد:
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
- ملاحظة: `landed=/dashboard expected=/bi/dashboards/create; write POST /api/intelligence/activity → 200; consoleErr=2`
- لقطة: `audit/screenshots/bi_dashboards_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
