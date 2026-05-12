# /umrah/pilgrims/create — `artifacts/ghayth-erp/src/pages/umrah/pilgrim-create.tsx`

## 1. الميتاداتا
- المسار: `/umrah/pilgrims/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/umrah/pilgrim-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/umrahRoutes.tsx:49`
- المجموعة: `operations`
- الكومبوننت: `PilgrimCreate`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 104
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L48: "(بلا تسمية)"
- L96: "إلغاء" → `save` 🔒

### القراءات (GET)
- GET `/umrah/seasons`
- GET `/umrah/agents`
- GET `/umrah/packages`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/operations.md` (إن وُجد) وعدّد:
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
- ملاحظة: `landed=/dashboard expected=/umrah/pilgrims/create; write POST /api/intelligence/activity → 200`
- لقطة: `audit/screenshots/umrah_pilgrims_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
