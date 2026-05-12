# /projects — `artifacts/ghayth-erp/src/pages/projects.tsx`

## 1. الميتاداتا
- المسار: `/projects`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/projects.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:89`
- المجموعة: `operations`
- الكومبوننت: `Projects`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `projects`
- سطور الملف: 400
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L206: "مخطط غانت"
- L207: "إدارة المخاطر"
- L208: "تكاليف المشاريع"
- L209: "المهام"
- L277: "(بلا تسمية)"

### القراءات (GET)
- GET `/projects/stats/overview`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/operations.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `projects` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/projects`
- لقطة: `audit/screenshots/projects.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
