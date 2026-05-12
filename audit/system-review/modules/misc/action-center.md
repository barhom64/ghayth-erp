# /action-center — `artifacts/ghayth-erp/src/pages/action-center.tsx`

## 1. الميتاداتا
- المسار: `/action-center`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/action-center.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:73`
- المجموعة: `misc`
- الكومبوننت: `ActionCenter`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `action-center`
- سطور الملف: 699
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L360: "مساحتي"
- L415: "(بلا تسمية)"
- L520: "عرض الكل في الصفحة المخصصة"
- L595: "عرض الكل"
- L643: "عرض الكل"

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
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `action-center` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/action-center`
- لقطة: `audit/screenshots/action_center.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
