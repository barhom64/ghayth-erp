# /hr/expiring-documents — `artifacts/ghayth-erp/src/pages/hr/expiring-documents.tsx`

## 1. الميتاداتا
- المسار: `/hr/expiring-documents`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/expiring-documents.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:160`
- المجموعة: `hr`
- الكومبوننت: `ExpiringDocuments`
- subKey: `employees` | minRoleLevel: —
- الكيان المستنبط: `expiring-documents`
- سطور الملف: 174
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

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
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `expiring-documents` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/expiring-documents`
- لقطة: `audit/screenshots/hr_expiring_documents.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
