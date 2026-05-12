# /projects/risks — `artifacts/ghayth-erp/src/pages/tasks.tsx`

## 1. الميتاداتا
- المسار: `/projects/risks`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/tasks.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:93`
- المجموعة: `operations`
- الكومبوننت: `Tasks`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `risks`
- سطور الملف: 422
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L186: "(بلا تسمية)"
- L196: "(بلا تسمية)"
- L207: "(بلا تسمية)"
- L218: "نسخ"
- L222: "(بلا تسمية)"
- L231: "(بلا تسمية)"
- L241: "(بلا تسمية)"
- L263: "مهمة جديدة"
- L389: "(بلا تسمية)" → `saveEdit` 🔒
- L393: "إلغاء" → `cancelEdit`

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
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `risks` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
- ⚠ L24 _(inline-data-array)_: `const statusOptions = [`

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/projects/risks`
- لقطة: `audit/screenshots/projects_risks.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
