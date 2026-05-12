# /bi/operations — `artifacts/ghayth-erp/src/pages/bi-operations.tsx`

## 1. الميتاداتا
- المسار: `/bi/operations`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/bi-operations.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/biRoutes.tsx:18`
- المجموعة: `bi`
- الكومبوننت: `BiOperations`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `operations`
- سطور الملف: 519
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L89: "(بلا تسمية)" → `() => exportChart(chartRef.current, "sla-delays.png")`
- L470: "(بلا تسمية)" → `() => window.print()`
- L492: "(بلا تسمية)" → `() => { setFrom(""); setTo(""); setDepartmentId("");`

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
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `operations` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **TBD** — راجع `audit/runtime-audit-results.json` (`/bi/operations`)
- توصية: **TBD**
- المشاكل: 0 مدخل آلي. أضِفها إلى `audit/system-review/findings/FINDINGS.csv`.
