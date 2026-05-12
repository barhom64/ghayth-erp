# /umrah/packages — `artifacts/ghayth-erp/src/pages/umrah/packages.tsx`

## 1. الميتاداتا
- المسار: `/umrah/packages`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/umrah/packages.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/umrahRoutes.tsx:50`
- المجموعة: `operations`
- الكومبوننت: `UmrahPackages`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `packages`
- سطور الملف: 243
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L144: "(بلا تسمية)" → `() => openEdit(r)`
- L145: "(بلا تسمية)" → `() => setDeleteId(r.id)`
- L159: "إضافة باقة" → `openCreate`
- L220: "إلغاء" → `closeDialog` 🔒
- L221: "(بلا تسمية)" → `handleSubmit` 🔒
- L233: "(بلا تسمية)" → `() => setDeleteId(null)` 🔒
- L234: "(بلا تسمية)" → `() => deleteMut.mutate({` 🔒

### القراءات (GET)
- GET `/umrah/packages`
- GET `/umrah/seasons`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/operations.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `packages` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/umrah/packages`
- لقطة: `audit/screenshots/umrah_packages.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
