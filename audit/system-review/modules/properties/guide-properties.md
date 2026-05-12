# /guide/properties — `artifacts/ghayth-erp/src/pages/properties/deposits.tsx`

## 1. الميتاداتا
- المسار: `/guide/properties`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/properties/deposits.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/propertyRoutes.tsx:59`
- المجموعة: `properties`
- الكومبوننت: `PropertyDeposits`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `properties`
- سطور الملف: 292
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L109: "(بلا تسمية)" → `() => setShowForm(!showForm)`
- L140: "(بلا تسمية)" → `() => setShowForm(false)`
- L172: "(بلا تسمية)" → `() => setStatusFilter(v)`
- L202: "(بلا تسمية)" → `() => setRefundTarget({ id: d.id, originalAmount: Number(d.amount)`
- L266: "إلغاء" → `props.onClose`

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
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `properties` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/guide/properties`
- لقطة: `audit/screenshots/guide_properties.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
