# /properties/deposits — `artifacts/ghayth-erp/src/pages/properties/deposits.tsx`

## 1. الميتاداتا
- المسار: `/properties/deposits`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/properties/deposits.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/propertyRoutes.tsx:57`
- المجموعة: `properties`
- الكومبوننت: `PropertyDeposits`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `deposits`
- سطور الملف: 293
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L141: "(بلا تسمية)" → `() => setShowForm(false)`
- L173: "(بلا تسمية)" → `() => setStatusFilter(v)`
- L267: "إلغاء" → `props.onClose`

### القراءات (GET)
- GET `/properties/contracts?status=active&limit=200`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/properties.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `deposits` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/properties/deposits`
- لقطة: `audit/screenshots/properties_deposits.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
