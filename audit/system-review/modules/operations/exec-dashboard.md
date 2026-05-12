# /exec-dashboard — `artifacts/ghayth-erp/src/pages/obligations.tsx`

## 1. الميتاداتا
- المسار: `/exec-dashboard`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/obligations.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:76`
- المجموعة: `operations`
- الكومبوننت: `Obligations`
- subKey: — | minRoleLevel: 60
- الكيان المستنبط: `exec-dashboard`
- سطور الملف: 226
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L119: "(بلا تسمية)" → `handleScan` 🔒
- L198: "(بلا تسمية)"
- L206: "(بلا تسمية)"

### القراءات (GET)
- GET `/obligations/summary`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/operations.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `exec-dashboard` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/exec-dashboard`
- لقطة: `audit/screenshots/exec_dashboard.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
