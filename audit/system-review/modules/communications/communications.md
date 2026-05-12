# /communications — `artifacts/ghayth-erp/src/pages/communications.tsx`

## 1. الميتاداتا
- المسار: `/communications`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/communications.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/commsRoutes.tsx:11`
- المجموعة: `communications`
- الكومبوننت: `Communications`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `communications`
- سطور الملف: 650
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L237: "(بلا تسمية)" → `() => refetch()`
- L408: "(بلا تسمية)" → `() => setShow(!show)`

### القراءات (GET)
- GET `/communications/stats`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/communications.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `communications` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/communications`
- لقطة: `audit/screenshots/communications.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
