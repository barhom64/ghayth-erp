# /umrah/sub-agents — `artifacts/ghayth-erp/src/pages/umrah/sub-agents.tsx`

## 1. الميتاداتا
- المسار: `/umrah/sub-agents`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/umrah/sub-agents.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/umrahRoutes.tsx:66`
- المجموعة: `operations`
- الكومبوننت: `UmrahSubAgents`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `sub-agents`
- سطور الملف: 387
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L334: "(بلا تسمية)" → `() => setEditing(null)` 🔒
- L370: "(بلا تسمية)" → `() => setLinking(null)` 🔒

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/operations.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `sub-agents` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/umrah/sub-agents`
- لقطة: `audit/screenshots/umrah_sub_agents.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
