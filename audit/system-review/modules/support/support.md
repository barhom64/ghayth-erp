# /support — `artifacts/ghayth-erp/src/pages/support.tsx`

## 1. الميتاداتا
- المسار: `/support`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/support.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:112`
- المجموعة: `support`
- الكومبوننت: `Support`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `support`
- سطور الملف: 463
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L107: "(بلا تسمية)" → `() => setPreviewItem(t)`
- L316: "(بلا تسمية)" → `() => setShowNew(false)`

### القراءات (GET)
- GET `/support/stats`
- GET `/support/kb`
- GET `/support/csat`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/support.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `support` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/support`
- لقطة: `audit/screenshots/support.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
