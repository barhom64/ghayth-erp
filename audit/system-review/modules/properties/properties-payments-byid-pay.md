# /properties/payments/:paymentId/pay — `artifacts/ghayth-erp/src/pages/properties/contract-detail.tsx`

## 1. الميتاداتا
- المسار: `/properties/payments/:paymentId/pay`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/properties/contract-detail.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/propertyRoutes.tsx:49`
- المجموعة: `properties`
- الكومبوننت: `ContractDetail`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `pay`
- سطور الملف: 326
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L236: "تجديد" → `handleRenew`
- L240: "إنهاء" → `handleTerminate`

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/properties.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `pay` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **✅ PASS** — render=SKIP | fetch=SKIP | CTA=SKIP | nav=SKIP | smoke=SKIP
- ملاحظة: `unresolved: /api/properties/units → 401`
- landedUrl: `?`
- توصية: مغلق
