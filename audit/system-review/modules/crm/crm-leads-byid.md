# /crm/leads/:id — `artifacts/ghayth-erp/src/pages/crm.tsx`

## 1. الميتاداتا
- المسار: `/crm/leads/:id`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/crm.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:87`
- المجموعة: `crm`
- الكومبوننت: `CRM`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `:id`
- سطور الملف: 263
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L132: "(بلا تسمية)" → `() => setPreviewItem(o)`
- L180: "فرصة جديدة"

### القراءات (GET)
- GET `/crm/pipeline`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/crm.md` (إن وُجد) وعدّد:
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
- ملاحظة: `unresolved: /api/crm/leads → 404`
- landedUrl: `?`
- توصية: مغلق
