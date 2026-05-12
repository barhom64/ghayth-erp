# /documents/archive — `artifacts/ghayth-erp/src/pages/documents/archive.tsx`

## 1. الميتاداتا
- المسار: `/documents/archive`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/documents/archive.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/documentsRoutes.tsx:17`
- المجموعة: `documents`
- الكومبوننت: `DocumentsArchive`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `archive`
- سطور الملف: 85
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/documents`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/documents.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `archive` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/documents/archive`
- لقطة: `audit/screenshots/documents_archive.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
