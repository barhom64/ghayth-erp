# /umrah/violations — `artifacts/ghayth-erp/src/pages/umrah/violations.tsx`

## 1. الميتاداتا
- المسار: `/umrah/violations`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/umrah/violations.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/umrahRoutes.tsx:62`
- المجموعة: `operations`
- الكومبوننت: `UmrahViolations`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `violations`
- سطور الملف: 519
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L254: "(بلا تسمية)"
- L259: "(بلا تسمية)" → `() => openEdit(v)`
- L263: "(بلا تسمية)" → `() => setDeleteId(v.id)`
- L280: "مخالفة جديدة" → `openCreate`
- L493: "(بلا تسمية)" → `() => setEditing(null)` 🔒
- L494: "(بلا تسمية)" → `handleSave` 🔒
- L509: "(بلا تسمية)" → `() => setDeleteId(null)` 🔒
- L510: "(بلا تسمية)" → `() => deleteMut.mutate({` 🔒

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
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `violations` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **TBD** — راجع `audit/runtime-audit-results.json` (`/umrah/violations`)
- توصية: **TBD**
- المشاكل: 0 مدخل آلي. أضِفها إلى `audit/system-review/findings/FINDINGS.csv`.
