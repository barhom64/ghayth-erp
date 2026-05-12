# /admin/policy-engine — `artifacts/ghayth-erp/src/pages/admin-policy-engine.tsx`

## 1. الميتاداتا
- المسار: `/admin/policy-engine`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/admin-policy-engine.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/adminRoutes.tsx:29`
- المجموعة: `admin`
- الكومبوننت: `AdminPolicyEngine`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `policy-engine`
- سطور الملف: 200
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L71: "(بلا تسمية)" → `() => refetchAudit()`

### القراءات (GET)
- GET `/admin/governance/policy-audit`
- GET `/admin/governance/role-strategies`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/admin.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `policy-engine` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **TBD** — راجع `audit/runtime-audit-results.json` (`/admin/policy-engine`)
- توصية: **TBD**
- المشاكل: 0 مدخل آلي. أضِفها إلى `audit/system-review/findings/FINDINGS.csv`.
