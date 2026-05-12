# /umrah/agents — `artifacts/ghayth-erp/src/pages/umrah/agents.tsx`

## 1. الميتاداتا
- المسار: `/umrah/agents`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/umrah/agents.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/umrahRoutes.tsx:47`
- المجموعة: `operations`
- الكومبوننت: `UmrahAgents`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `agents`
- سطور الملف: 238
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L122: "(بلا تسمية)" → `() => openEdit(a)`
- L123: "(بلا تسمية)" → `() => setDeleteId(a.id)`
- L215: "إلغاء" → `closeDialog` 🔒
- L216: "(بلا تسمية)" → `handleSubmit` 🔒
- L228: "(بلا تسمية)" → `() => setDeleteId(null)` 🔒

### القراءات (GET)
- GET `/umrah/agents`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/operations.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `agents` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
- ⚠ L105 _(inline-data-array)_: `const kpiCards = [`

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/umrah/agents`
- لقطة: `audit/screenshots/umrah_agents.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
