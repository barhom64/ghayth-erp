# /warehouse/create — `artifacts/ghayth-erp/src/pages/details/project-detail.tsx`

## 1. الميتاداتا
- المسار: `/warehouse/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/details/project-detail.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:96`
- المجموعة: `operations`
- الكومبوننت: `ProjectDetail`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 734
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L248: "غانت"
- L251: "المخاطر"
- L254: "التقويم" → `() => setClosingProject(true)`
- L257: "(بلا تسمية)" → `() => setClosingProject(true)`
- L263: "تأكيد الإقفال" → `closeProject`
- L264: "تعديل" → `() => setClosingProject(false)`
- L267: "تعديل" → `startEdit`
- L270: "تأكيد الحذف" → `handleDelete`
- L271: "(بلا تسمية)" → `() => setDeleting(false)`
- L274: "(بلا تسمية)" → `() => setDeleting(true)`
- L295: "(بلا تسمية)" → `() => setEditing(false)`
- L368: "(بلا تسمية)" → `() => setShowPhaseForm(!showPhaseForm)`
- L381: "(بلا تسمية)" → `() => setShowPhaseForm(false)`
- L413: "(بلا تسمية)" → `() => completePhase(p.id)`
- L429: "غانت"
- L458: "إدارة"
- L487: "(بلا تسمية)" → `() => setShowTaskForm(!showTaskForm)`
- L500: "(بلا تسمية)" → `() => setShowTaskForm(false)`
- L598: "(بلا تسمية)" → `() => setShowCostForm(!showCostForm)`
- L611: "(بلا تسمية)" → `() => setShowCostForm(false)`
- L683: "خطاب جديد"

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/operations.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `create` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
- ⚠ L74 _(inline-data-array)_: `const PROJECT_TABS = [`

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=SKIP | CTA=PASS | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/warehouse/create; write POST /api/intelligence/activity → 200`
- لقطة: `audit/screenshots/warehouse_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
