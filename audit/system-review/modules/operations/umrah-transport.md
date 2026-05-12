# /umrah/transport — `artifacts/ghayth-erp/src/pages/umrah/transport.tsx`

## 1. الميتاداتا
- المسار: `/umrah/transport`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/umrah/transport.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/umrahRoutes.tsx:57`
- المجموعة: `operations`
- الكومبوننت: `UmrahTransport`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `transport`
- سطور الملف: 113
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L97: "حفظ" → `() => { setShowForm(false); setForm({` 🔒
- L98: "حفظ" → `save` 🔒

### القراءات (GET)
- GET `/umrah/transport`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/operations.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `transport` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/umrah/transport`
- لقطة: `audit/screenshots/umrah_transport.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
