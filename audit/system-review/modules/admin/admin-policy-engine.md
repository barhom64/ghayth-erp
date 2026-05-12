# /admin/policy-engine — `artifacts/ghayth-erp/src/pages/admin-violations-report.tsx`

## 1. الميتاداتا
- المسار: `/admin/policy-engine`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/admin-violations-report.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/adminRoutes.tsx:29`
- المجموعة: `admin`
- الكومبوننت: `AdminViolationsReport`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `policy-engine`
- سطور الملف: 346
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L158: "(بلا تسمية)"

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/admin.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `policy-engine` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
- ⚠ L172 _(inline-data-array)_: `const summaryCards = [`

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/admin/policy-engine`
- لقطة: `audit/screenshots/admin_policy_engine.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
