# /my-documents — `artifacts/ghayth-erp/src/pages/my-documents.tsx`

## 1. الميتاداتا
- المسار: `/my-documents`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/my-documents.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:70`
- المجموعة: `misc`
- الكومبوننت: `MyDocuments`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `my-documents`
- سطور الملف: 90
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L61: "(بلا تسمية)"
- L69: "(بلا تسمية)"

### القراءات (GET)
- GET `/my-space/documents`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/misc.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `my-documents` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/my-documents`
- لقطة: `audit/screenshots/my_documents.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
