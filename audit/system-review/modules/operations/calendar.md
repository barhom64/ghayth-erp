# /calendar — `artifacts/ghayth-erp/src/pages/action-center.tsx`

## 1. الميتاداتا
- المسار: `/calendar`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/action-center.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:75`
- المجموعة: `operations`
- الكومبوننت: `ActionCenter`
- subKey: — | minRoleLevel: 60
- الكيان المستنبط: `calendar`
- سطور الملف: 693
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L359: "مساحتي"
- L414: "(بلا تسمية)"
- L454: "(بلا تسمية)"
- L463: "(بلا تسمية)"
- L472: "(بلا تسمية)"
- L484: "(بلا تسمية)"
- L493: "(بلا تسمية)"
- L514: "عرض الكل في الصفحة المخصصة"
- L589: "عرض الكل"
- L637: "عرض الكل"

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
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `calendar` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/calendar`
- لقطة: `audit/screenshots/calendar.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
