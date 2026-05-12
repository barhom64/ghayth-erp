# /bi/admin-reports — `artifacts/ghayth-erp/src/pages/bi-admin-reports.tsx`

## 1. الميتاداتا
- المسار: `/bi/admin-reports`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/bi-admin-reports.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/biRoutes.tsx:19`
- المجموعة: `bi`
- الكومبوننت: `BiAdminReports`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `admin-reports`
- سطور الملف: 374
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L355: "(بلا تسمية)" → `() => window.print()`

### القراءات (GET)
- GET `/bi/admin-reports/weekly`
- GET `/bi/admin-reports/monthly`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/bi.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `admin-reports` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **TBD** — راجع `audit/runtime-audit-results.json` (`/bi/admin-reports`)
- توصية: **TBD**
- المشاكل: 0 مدخل آلي. أضِفها إلى `audit/system-review/findings/FINDINGS.csv`.
