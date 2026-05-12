# /properties/inspections — `artifacts/ghayth-erp/src/pages/properties/inspections.tsx`

## 1. الميتاداتا
- المسار: `/properties/inspections`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/properties/inspections.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/propertyRoutes.tsx:56`
- المجموعة: `properties`
- الكومبوننت: `PropertyInspections`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `inspections`
- سطور الملف: 311
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L126: "(بلا تسمية)" → `() => setShowForm(!showForm)`
- L148: "(بلا تسمية)" → `() => setShowForm(false)`
- L187: "(بلا تسمية)" → `() => setStatusFilter(s)`
- L222: "(بلا تسمية)" → `() => setCompletingId(insp.id)`
- L288: "إلغاء" → `props.onClose`

### القراءات (GET)
- GET `/properties/units?limit=200`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/properties.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `inspections` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/properties/inspections`
- لقطة: `audit/screenshots/properties_inspections.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
