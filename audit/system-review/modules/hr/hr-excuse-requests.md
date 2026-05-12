# /hr/excuse-requests — `artifacts/ghayth-erp/src/pages/hr/excuse-requests.tsx`

## 1. الميتاداتا
- المسار: `/hr/excuse-requests`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/excuse-requests.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:165`
- المجموعة: `hr`
- الكومبوننت: `ExcuseRequests`
- subKey: `attendance` | minRoleLevel: —
- الكيان المستنبط: `excuse-requests`
- سطور الملف: 197
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L140: "طلب استئذان"

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/hr.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `excuse-requests` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
- ⚠ L44 _(inline-data-array)_: `const kpis = [`

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/excuse-requests`
- لقطة: `audit/screenshots/hr_excuse_requests.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
