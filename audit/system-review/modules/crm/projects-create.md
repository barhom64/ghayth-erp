# /projects/create — `artifacts/ghayth-erp/src/pages/details/opportunity-detail.tsx`

## 1. الميتاداتا
- المسار: `/projects/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/details/opportunity-detail.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:90`
- المجموعة: `crm`
- الكومبوننت: `OpportunityDetail`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 333
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L98: "تعديل" → `startEdit`
- L101: "تأكيد الحذف" → `handleDelete`
- L102: "(بلا تسمية)" → `() => setDeleting(false)`
- L105: "(بلا تسمية)" → `() => setDeleting(true)`
- L136: "حفظ" → `saveEdit`
- L137: "(بلا تسمية)" → `() => setEditing(false)`

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/crm.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `create` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=SKIP | CTA=PASS | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/projects/create; write POST /api/intelligence/activity → 200`
- لقطة: `audit/screenshots/projects_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
