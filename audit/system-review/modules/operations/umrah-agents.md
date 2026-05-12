# /umrah/agents — `artifacts/ghayth-erp/src/pages/umrah/agents.tsx`

## 1. الميتاداتا
- المسار: `/umrah/agents`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/umrah/agents.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/umrahRoutes.tsx:42`
- المجموعة: `operations`
- الكومبوننت: `UmrahAgents`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `agents`
- سطور الملف: 237
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L121: "(بلا تسمية)" → `() => openEdit(a)`
- L122: "(بلا تسمية)" → `() => setDeleteId(a.id)`
- L133: "إضافة وكيل" → `openCreate`
- L214: "إلغاء" → `closeDialog` 🔒
- L215: "(بلا تسمية)" → `handleSubmit` 🔒
- L227: "(بلا تسمية)" → `() => setDeleteId(null)` 🔒
- L228: "(بلا تسمية)" → `() => deleteMut.mutate({` 🔒

### القراءات (GET)
- GET `/umrah/agents`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/operations.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `agents` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
- ⚠ L104 _(inline-data-array)_: `const kpiCards = [`

## 6. النتيجة (Verdict)
- Runtime audit: **TBD** — راجع `audit/runtime-audit-results.json` (`/umrah/agents`)
- توصية: **TBD**
- المشاكل: 1 مدخل آلي. أضِفها إلى `audit/system-review/findings/FINDINGS.csv`.
