# /umrah/penalties — `artifacts/ghayth-erp/src/pages/umrah/penalties.tsx`

## 1. الميتاداتا
- المسار: `/umrah/penalties`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/umrah/penalties.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/umrahRoutes.tsx:46`
- المجموعة: `operations`
- الكومبوننت: `UmrahPenalties`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `penalties`
- سطور الملف: 142
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L78: "(بلا تسمية)" → `(e) => handleWaive(e, p.id)`
- L89: "تشغيل محرك الغرامات" → `runPenaltyEngine`

### القراءات (GET)
- GET `/umrah/penalties`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/operations.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `penalties` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
- ⚠ L54 _(inline-data-array)_: `const kpiCards = [`

## 6. النتيجة (Verdict)
- Runtime audit: **TBD** — راجع `audit/runtime-audit-results.json` (`/umrah/penalties`)
- توصية: **TBD**
- المشاكل: 1 مدخل آلي. أضِفها إلى `audit/system-review/findings/FINDINGS.csv`.
