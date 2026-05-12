# /action-center — `artifacts/ghayth-erp/src/pages/my-loans.tsx`

## 1. الميتاداتا
- المسار: `/action-center`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/my-loans.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:73`
- المجموعة: `operations`
- الكومبوننت: `MyLoans`
- subKey: — | minRoleLevel: 60
- الكيان المستنبط: `action-center`
- سطور الملف: 122
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L80: "طلب سلفة جديدة"

### القراءات (GET)
- GET `/hr/loans/my`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/operations.md` (إن وُجد) وعدّد:
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
