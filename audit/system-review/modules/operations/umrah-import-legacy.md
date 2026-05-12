# /umrah/import/legacy — `artifacts/ghayth-erp/src/pages/umrah/import.tsx`

## 1. الميتاداتا
- المسار: `/umrah/import/legacy`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/umrah/import.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/umrahRoutes.tsx:55`
- المجموعة: `operations`
- الكومبوننت: `UmrahImport`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `legacy`
- سطور الملف: 263
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L159: "تغيير الملف" → `clearFile`
- L227: "(بلا تسمية)" → `doImport` 🔒

### القراءات (GET)
- GET `/umrah/seasons`
- GET `/umrah/import-logs`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/operations.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `legacy` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **TBD** — راجع `audit/runtime-audit-results.json` (`/umrah/import/legacy`)
- توصية: **TBD**
- المشاكل: 0 مدخل آلي. أضِفها إلى `audit/system-review/findings/FINDINGS.csv`.
