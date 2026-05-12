# /projects/tasks — `artifacts/ghayth-erp/src/pages/tasks.tsx`

## 1. الميتاداتا
- المسار: `/projects/tasks`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/tasks.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:91`
- المجموعة: `operations`
- الكومبوننت: `Tasks`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `tasks`
- سطور الملف: 423
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L187: "(بلا تسمية)"
- L197: "(بلا تسمية)"
- L208: "(بلا تسمية)"
- L219: "نسخ"
- L223: "(بلا تسمية)"
- L232: "(بلا تسمية)"
- L242: "(بلا تسمية)"
- L390: "(بلا تسمية)" → `saveEdit` 🔒
- L394: "إلغاء" → `cancelEdit`

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
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `tasks` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
- ⚠ L25 _(inline-data-array)_: `const statusOptions = [`

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/projects/tasks`
- لقطة: `audit/screenshots/projects_tasks.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
