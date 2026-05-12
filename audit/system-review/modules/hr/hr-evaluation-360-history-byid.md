# /hr/evaluation-360/history/:employeeId — `artifacts/ghayth-erp/src/pages/hr/evaluation-360-history.tsx`

## 1. الميتاداتا
- المسار: `/hr/evaluation-360/history/:employeeId`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/evaluation-360-history.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:148`
- المجموعة: `hr`
- الكومبوننت: `Evaluation360History`
- subKey: `performance` | minRoleLevel: —
- الكيان المستنبط: `:employeeId`
- سطور الملف: 116
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L50: "عودة"
- L104: "عرض"

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
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `:employeeId` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **✅ PASS** — render=SKIP | fetch=SKIP | CTA=SKIP | nav=SKIP | smoke=SKIP
- ملاحظة: `unresolved: /api/hr/evaluation-360 → 401`
- landedUrl: `?`
- توصية: مغلق
