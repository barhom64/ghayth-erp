# /hr/public-holidays — `artifacts/ghayth-erp/src/pages/hr/public-holidays.tsx`

## 1. الميتاداتا
- المسار: `/hr/public-holidays`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/public-holidays.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:153`
- المجموعة: `hr`
- الكومبوننت: `PublicHolidays`
- subKey: `leaves` | minRoleLevel: —
- الكيان المستنبط: `public-holidays`
- سطور الملف: 226
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L123: "(بلا تسمية)" → `() => { setShowForm(!showForm); setEditingId(null); setFormInitial(defaultHolida`
- L141: "(بلا تسمية)" → `() => { setShowForm(false); setEditingId(null);`

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
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `public-holidays` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/public-holidays`
- لقطة: `audit/screenshots/hr_public_holidays.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
