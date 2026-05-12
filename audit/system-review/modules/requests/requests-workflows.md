# /requests/workflows — `artifacts/ghayth-erp/src/pages/requests-page.tsx`

## 1. الميتاداتا
- المسار: `/requests/workflows`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/requests-page.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/requestsRoutes.tsx:13`
- المجموعة: `requests`
- الكومبوننت: `RequestsPage`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `workflows`
- سطور الملف: 707
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L134: "(بلا تسمية)"
- L428: "(بلا تسمية)" → `() => setShowForm(!showForm)`
- L478: "(بلا تسمية)" → `() => { setFilterStatus(""); setFilterType(""); setFilterDateFrom(""); setFilter`
- L497: "(بلا تسمية)" → `() => setShowForm(false)`
- L563: "(بلا تسمية)" → `() => setShowForm(!showForm)`
- L572: "(بلا تسمية)" → `() => setShowForm(false)`
- L623: "(بلا تسمية)" → `() => setShowForm(!showForm)`
- L632: "(بلا تسمية)" → `() => setShowForm(false)`

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
- ⚠ L95 _(inline-data-array)_: `const CONVERT_OPTIONS = [`

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/requests/workflows`
- لقطة: `audit/screenshots/requests_workflows.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
