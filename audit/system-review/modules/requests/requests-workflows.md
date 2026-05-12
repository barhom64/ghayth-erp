# /requests/workflows — `artifacts/ghayth-erp/src/pages/requests-page.tsx`

## 1. الميتاداتا
- المسار: `/requests/workflows`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/requests-page.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/requestsRoutes.tsx:13`
- المجموعة: `requests`
- الكومبوننت: `RequestsPage`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `workflows`
- سطور الملف: 708
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L135: "(بلا تسمية)"
- L479: "(بلا تسمية)" → `() => { setFilterStatus(""); setFilterType(""); setFilterDateFrom(""); setFilter`
- L498: "(بلا تسمية)" → `() => setShowForm(false)`
- L573: "(بلا تسمية)" → `() => setShowForm(false)`
- L633: "(بلا تسمية)" → `() => setShowForm(false)`

### القراءات (GET)
- GET `/requests/catalog`
- GET `/requests`
- GET `/requests/types`
- GET `/requests/workflows`
- GET `/requests/stats`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/requests.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `workflows` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
- ⚠ L96 _(inline-data-array)_: `const CONVERT_OPTIONS = [`

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/requests/workflows`
- لقطة: `audit/screenshots/requests_workflows.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
