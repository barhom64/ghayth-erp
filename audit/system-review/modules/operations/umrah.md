# /umrah — `artifacts/ghayth-erp/src/pages/umrah/dashboard.tsx`

## 1. الميتاداتا
- المسار: `/umrah`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/umrah/dashboard.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/umrahRoutes.tsx:38`
- المجموعة: `operations`
- الكومبوننت: `UmrahDashboard`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `umrah`
- سطور الملف: 170
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L58: "تحديث الحالات" → `runDaily`
- L59: "تشغيل الغرامات" → `runPenalties`

### القراءات (GET)
- GET `/umrah/seasons`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/operations.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `umrah` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **TBD** — راجع `audit/runtime-audit-results.json` (`/umrah`)
- توصية: **TBD**
- المشاكل: 0 مدخل آلي. أضِفها إلى `audit/system-review/findings/FINDINGS.csv`.
