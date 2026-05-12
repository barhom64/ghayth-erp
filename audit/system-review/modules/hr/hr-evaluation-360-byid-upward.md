# /hr/evaluation-360/:id/upward — `artifacts/ghayth-erp/src/pages/hr/evaluation-360.tsx`

## 1. الميتاداتا
- المسار: `/hr/evaluation-360/:id/upward`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/evaluation-360.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:151`
- المجموعة: `hr`
- الكومبوننت: `Evaluation360`
- subKey: `performance` | minRoleLevel: —
- الكيان المستنبط: `upward`
- سطور الملف: 179
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L145: "بدء دورة تقييم"

### القراءات (GET)
- GET `/hr/evaluation-cycles`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/hr.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `upward` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
- ⚠ L62 _(inline-data-array)_: `const kpis = [`

## 6. النتيجة (Verdict)
- Runtime audit: **✅ PASS** — render=SKIP | fetch=SKIP | CTA=SKIP | nav=SKIP | smoke=SKIP
- ملاحظة: `unresolved: /api/hr/evaluation-360 → 401`
- landedUrl: `?`
- توصية: مغلق
