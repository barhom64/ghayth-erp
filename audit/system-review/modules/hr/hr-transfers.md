# /hr/transfers — `artifacts/ghayth-erp/src/pages/hr/evaluation-360-detail.tsx`

## 1. الميتاداتا
- المسار: `/hr/transfers`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/evaluation-360-detail.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:154`
- المجموعة: `hr`
- الكومبوننت: `Evaluation360Detail`
- subKey: `performance` | minRoleLevel: —
- الكيان المستنبط: `transfers`
- سطور الملف: 481
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L156: "إضافة تقييم مدير/زميل"
- L159: "تقييم عكسي سري"
- L343: "إضافة تقييم"
- L417: "إرسال تقييم عكسي سري"

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
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `transfers` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
- ⚠ L146 _(inline-data-array)_: `const tabs = [`

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/transfers`
- لقطة: `audit/screenshots/hr_transfers.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
