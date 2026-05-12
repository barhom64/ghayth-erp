# /manager-board — `artifacts/ghayth-erp/src/pages/calendar.tsx`

## 1. الميتاداتا
- المسار: `/manager-board`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/calendar.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:77`
- المجموعة: `operations`
- الكومبوننت: `CalendarPage`
- subKey: — | minRoleLevel: 60
- الكيان المستنبط: `manager-board`
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
- [ ] **TBD** — راجع `docs/blueprints/operations.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `manager-board` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/manager-board`
- لقطة: `audit/screenshots/manager_board.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
