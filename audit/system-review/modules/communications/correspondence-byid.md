# /correspondence/:id — `artifacts/ghayth-erp/src/pages/comms/correspondence.tsx`

## 1. الميتاداتا
- المسار: `/correspondence/:id`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/comms/correspondence.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/commsRoutes.tsx:16`
- المجموعة: `communications`
- الكومبوننت: `Correspondence`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `:id`
- سطور الملف: 228
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L162: "(بلا تسمية)"
- L192: "مراسلة جديدة"

### القراءات (GET)
- GET `/correspondence/stats/summary`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/communications.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `:id` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **✅ PASS** — render=SKIP | fetch=SKIP | CTA=SKIP | nav=SKIP | smoke=SKIP
- ملاحظة: `unresolved: no row in /api/correspondence`
- landedUrl: `?`
- توصية: مغلق
