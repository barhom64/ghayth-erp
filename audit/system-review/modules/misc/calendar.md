# /calendar — `artifacts/ghayth-erp/src/pages/calendar.tsx`

## 1. الميتاداتا
- المسار: `/calendar`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/calendar.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:75`
- المجموعة: `misc`
- الكومبوننت: `CalendarPage`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `calendar`
- سطور الملف: 310
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L108: "(بلا تسمية)"
- L116: "(بلا تسمية)"
- L262: "(بلا تسمية)" → `onPrev`
- L265: "اليوم" → `onToday`
- L266: "(بلا تسمية)" → `onNext`

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/misc.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `calendar` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **TBD** — راجع `audit/runtime-audit-results.json` (`/calendar`)
- توصية: **TBD**
- المشاكل: 0 مدخل آلي. أضِفها إلى `audit/system-review/findings/FINDINGS.csv`.
