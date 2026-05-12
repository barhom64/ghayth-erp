# /notifications — `artifacts/ghayth-erp/src/pages/notifications.tsx`

## 1. الميتاداتا
- المسار: `/notifications`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/notifications.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:118`
- المجموعة: `misc`
- الكومبوننت: `Notifications`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `notifications`
- سطور الملف: 128
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L108: "(بلا تسمية)"

### القراءات (GET)
- GET `/notifications`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/misc.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `notifications` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/notifications`
- لقطة: `audit/screenshots/notifications.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
