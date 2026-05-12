# /finance/treasury — `artifacts/ghayth-erp/src/pages/finance/treasury.tsx`

## 1. الميتاداتا
- المسار: `/finance/treasury`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/finance/treasury.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:146`
- المجموعة: `finance`
- الكومبوننت: `Treasury`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `treasury`
- سطور الملف: 319
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L74: "دفتر الأستاذ"
- L168: "(بلا تسمية)"
- L173: "(بلا تسمية)"
- L252: "(بلا تسمية)" → `() => setActiveTab("accounts")`
- L259: "(بلا تسمية)" → `() => setActiveTab("movements")`
- L266: "(بلا تسمية)" → `() => setActiveTab("daily")`

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/finance.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `treasury` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **TBD** — راجع `audit/runtime-audit-results.json` (`/finance/treasury`)
- توصية: **TBD**
- المشاكل: 0 مدخل آلي. أضِفها إلى `audit/system-review/findings/FINDINGS.csv`.
