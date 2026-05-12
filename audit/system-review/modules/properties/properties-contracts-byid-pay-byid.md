# /properties/contracts/:contractId/pay/:installmentId — `artifacts/ghayth-erp/src/pages/create/properties/payment-record.tsx`

## 1. الميتاداتا
- المسار: `/properties/contracts/:contractId/pay/:installmentId`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/properties/payment-record.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/propertyRoutes.tsx:46`
- المجموعة: `properties`
- الكومبوننت: `PaymentRecord`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `:installmentId`
- سطور الملف: 120
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L81: "مسح المسودة" → `clearDraft`
- L112: "(بلا تسمية)" → `() => setLocation("/properties/contracts")` 🔒
- L113: "(بلا تسمية)" → `handleSave` 🔒

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
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `:installmentId` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **TBD** — راجع `audit/runtime-audit-results.json` (`/properties/contracts/:contractId/pay/:installmentId`)
- توصية: **TBD**
- المشاكل: 0 مدخل آلي. أضِفها إلى `audit/system-review/findings/FINDINGS.csv`.
