# /admin/gl-reconciliation — `artifacts/ghayth-erp/src/pages/admin-gl-reconciliation.tsx`

## 1. الميتاداتا
- المسار: `/admin/gl-reconciliation`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/admin-gl-reconciliation.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/adminRoutes.tsx:35`
- المجموعة: `admin`
- الكومبوننت: `AdminGlReconciliation`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `gl-reconciliation`
- سطور الملف: 107
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L45: "(بلا تسمية)" → `() => refetch()`

### القراءات (GET)
- GET `/admin/governance/gl-reconciliation`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/admin.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `gl-reconciliation` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **TBD** — راجع `audit/runtime-audit-results.json` (`/admin/gl-reconciliation`)
- توصية: **TBD**
- المشاكل: 0 مدخل آلي. أضِفها إلى `audit/system-review/findings/FINDINGS.csv`.
