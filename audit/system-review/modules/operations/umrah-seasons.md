# /umrah/seasons — `artifacts/ghayth-erp/src/pages/umrah/seasons.tsx`

## 1. الميتاداتا
- المسار: `/umrah/seasons`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/umrah/seasons.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/umrahRoutes.tsx:44`
- المجموعة: `operations`
- الكومبوننت: `UmrahSeasons`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `seasons`
- سطور الملف: 93
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L54: "(بلا تسمية)" → `(e) => { e.stopPropagation(); closeSeason(r.id);`
- L65: "(بلا تسمية)" → `() => setShowForm(!showForm)`
- L82: "حفظ" → `() => setShowForm(false)` 🔒
- L83: "حفظ" → `save` 🔒

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
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `seasons` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **TBD** — راجع `audit/runtime-audit-results.json` (`/umrah/seasons`)
- توصية: **TBD**
- المشاكل: 0 مدخل آلي. أضِفها إلى `audit/system-review/findings/FINDINGS.csv`.
