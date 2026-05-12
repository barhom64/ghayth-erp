# /hr/violations — `artifacts/ghayth-erp/src/pages/hr/violations.tsx`

## 1. الميتاداتا
- المسار: `/hr/violations`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/violations.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:131`
- المجموعة: `hr`
- الكومبوننت: `Violations`
- subKey: `violations` | minRoleLevel: —
- الكيان المستنبط: `violations`
- سطور الملف: 502
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L134: "تشغيل الرصد"
- L139: "تسجيل مخالفة"
- L231: "عرض الكل"
- L473: "فتح صفحة الرصد التلقائي"
- L493: "فتح لائحة الانضباط"

### القراءات (GET)
- GET `/hr/discipline/stats`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/hr.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `violations` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
- ⚠ L182 _(inline-data-array)_: `const byStage = [`

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/violations`
- لقطة: `audit/screenshots/hr_violations.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
