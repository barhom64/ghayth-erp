# /umrah/daily-runsheet — `artifacts/ghayth-erp/src/pages/umrah/daily-runsheet.tsx`

## 1. الميتاداتا
- المسار: `/umrah/daily-runsheet`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/umrah/daily-runsheet.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/umrahRoutes.tsx:71`
- المجموعة: `operations`
- الكومبوننت: `UmrahDailyRunsheet`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `daily-runsheet`
- سطور الملف: 176
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L134: "(بلا تسمية)" → `() => refetch()`
- L137: "تصدير PDF" → `handleExport`

### القراءات (GET)
_لا قراءات._

### استدعاءات fetch خام (تحتاج مراجعة يدوية)
- `/api/umrah/reports/daily-runsheet/pdf?date=${date}`

## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/operations.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `daily-runsheet` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **N/A** — لم يُشغّل بعد لهذا المسار.
- توصية: **TBD**
