# /properties/guide — `artifacts/ghayth-erp/src/pages/properties-guide.tsx`

## 1. الميتاداتا
- المسار: `/properties/guide`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/properties-guide.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/propertyRoutes.tsx:60`
- المجموعة: `properties`
- الكومبوننت: `PropertiesGuide`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `guide`
- سطور الملف: 1430
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L1273: "العودة للنظام"

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
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `guide` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
- ⚠ L429 _(dummy-phone)_: `{ name: "أحمد محمد السعيد", phone: "0551234567", id: "1234567890", contracts: "2 نشط", unit: "A-101", paid: "42,000 ر.س"`
- ⚠ L430 _(dummy-phone)_: `{ name: "سارة عبدالله الغامدي", phone: "0557654321", id: "0987654321", contracts: "1 نشط", unit: "B-201", paid: "96,000 `
- ⚠ L431 _(dummy-phone)_: `{ name: "خالد إبراهيم العمري", phone: "0501112233", id: "2345678901", contracts: "1 نشط", unit: "C-305", paid: "28,000 ر`
- ⚠ L475 _(dummy-phone)_: `{ name: "عبدالرحمن الحربي", type: "فرد", phone: "0501234567", buildings: 2, units: 20, contracts: 18 },`
- ⚠ L477 _(dummy-phone)_: `{ name: "فاطمة القحطاني", type: "فرد", phone: "0559876543", buildings: 1, units: 13, contracts: 13 },`

## 6. النتيجة (Verdict)
- Runtime audit: **TBD** — راجع `audit/runtime-audit-results.json` (`/properties/guide`)
- توصية: **TBD**
- المشاكل: 5 مدخل آلي. أضِفها إلى `audit/system-review/findings/FINDINGS.csv`.
