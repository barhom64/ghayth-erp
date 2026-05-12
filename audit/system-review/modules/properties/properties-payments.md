# /properties/payments — `artifacts/ghayth-erp/src/pages/create/properties/payment-register.tsx`

## 1. الميتاداتا
- المسار: `/properties/payments`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/properties/payment-register.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/propertyRoutes.tsx:51`
- المجموعة: `properties`
- الكومبوننت: `PaymentRegister`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `payments`
- سطور الملف: 131
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L84: "مسح المسودة" → `clearDraft`
- L123: "(بلا تسمية)" → `() => setLocation("/properties/payments")` 🔒
- L124: "(بلا تسمية)" → `handleSave` 🔒

### القراءات (GET)
- GET `/properties/payments`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/properties.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `payments` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/properties/payments`
- لقطة: `audit/screenshots/properties_payments.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
