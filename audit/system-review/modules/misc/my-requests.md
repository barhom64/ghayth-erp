# /my-requests — `artifacts/ghayth-erp/src/pages/my-requests.tsx`

## 1. الميتاداتا
- المسار: `/my-requests`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/my-requests.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:65`
- المجموعة: `misc`
- الكومبوننت: `MyRequests`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `my-requests`
- سطور الملف: 194
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L90: "(بلا تسمية)" → `() => refetch()`
- L105: "طلب إجازة"
- L158: "طلب إجازة جديدة"

### القراءات (GET)
- GET `/my-space/requests`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/misc.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `my-requests` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **TBD** — راجع `audit/runtime-audit-results.json` (`/my-requests`)
- توصية: **TBD**
- المشاكل: 0 مدخل آلي. أضِفها إلى `audit/system-review/findings/FINDINGS.csv`.
