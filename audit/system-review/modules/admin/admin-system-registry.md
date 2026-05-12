# /admin/system-registry — `artifacts/ghayth-erp/src/pages/admin-system-registry.tsx`

## 1. الميتاداتا
- المسار: `/admin/system-registry`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/admin-system-registry.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/adminRoutes.tsx:36`
- المجموعة: `admin`
- الكومبوننت: `AdminSystemRegistry`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `system-registry`
- سطور الملف: 689
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L174: "(بلا تسمية)" → `() => refetchReg()`

### القراءات (GET)
- GET `/admin/system-registry`
- GET `/admin/system-registry/entities`
- GET `/admin/system-registry/actions`
- GET `/admin/system-registry/missing`
- GET `/admin/system-registry/coverage`
- GET `/admin/system-registry/notifications`
- GET `/admin/system-registry/reports`
- GET `/admin/system-registry/print-templates`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/admin.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `system-registry` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **TBD** — راجع `audit/runtime-audit-results.json` (`/admin/system-registry`)
- توصية: **TBD**
- المشاكل: 0 مدخل آلي. أضِفها إلى `audit/system-review/findings/FINDINGS.csv`.
