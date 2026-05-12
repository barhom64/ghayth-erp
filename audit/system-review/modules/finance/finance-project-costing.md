# /finance/project-costing — `artifacts/ghayth-erp/src/pages/finance/project-costing.tsx`

## 1. الميتاداتا
- المسار: `/finance/project-costing`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/finance/project-costing.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:137`
- المجموعة: `finance`
- الكومبوننت: `ProjectCosting`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `project-costing`
- سطور الملف: 217
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L91: "(بلا تسمية)" → `() => setShowAddCost(true)` 🔒
- L185: "(بلا تسمية)" → `() => setShowAddCost(false)`

### القراءات (GET)
- GET `/finance/projects${scopeSuffix}`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/finance.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `project-costing` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **TBD** — راجع `audit/runtime-audit-results.json` (`/finance/project-costing`)
- توصية: **TBD**
- المشاكل: 0 مدخل آلي. أضِفها إلى `audit/system-review/findings/FINDINGS.csv`.
