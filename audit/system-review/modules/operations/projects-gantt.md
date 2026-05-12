# /projects/gantt — `artifacts/ghayth-erp/src/pages/projects/gantt.tsx`

## 1. الميتاداتا
- المسار: `/projects/gantt`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/projects/gantt.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:92`
- المجموعة: `operations`
- الكومبوننت: `ProjectGantt`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `gantt`
- سطور الملف: 182
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/projects?limit=100`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/operations.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `gantt` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/projects/gantt`
- لقطة: `audit/screenshots/projects_gantt.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
