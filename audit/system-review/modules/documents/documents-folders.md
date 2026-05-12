# /documents/folders — `artifacts/ghayth-erp/src/pages/documents-page.tsx`

## 1. الميتاداتا
- المسار: `/documents/folders`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/documents-page.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/documentsRoutes.tsx:15`
- المجموعة: `documents`
- الكومبوننت: `DocumentsPage`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `folders`
- سطور الملف: 429
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L201: "(بلا تسمية)" → `() => handleDownload(d.id, d.fileName)`
- L206: "الإصدارات"
- L221: "(بلا تسمية)" → `() => handleStatusChange(d.id, "draft")`
- L280: "(بلا تسمية)" → `() => setShowForm(false)`
- L305: "(بلا تسمية)" → `() => setShowForm(true)`
- L358: "(بلا تسمية)" → `() => setShowForm(false)`

### القراءات (GET)
- GET `/documents/folders`
- GET `/documents/templates`
- GET `/documents/stats`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/documents.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `folders` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/documents/folders`
- لقطة: `audit/screenshots/documents_folders.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
