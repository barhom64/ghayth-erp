# /legal/cases/create — `artifacts/ghayth-erp/src/pages/legal/correspondence.tsx`

## 1. الميتاداتا
- المسار: `/legal/cases/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/legal/correspondence.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/legalRoutes.tsx:25`
- المجموعة: `legal`
- الكومبوننت: `LegalCorrespondence`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 55
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/legal/cases`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/legal.md` (إن وُجد) وعدّد:
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
- ملاحظة: `landed=/dashboard expected=/legal/cases/create; write POST /api/intelligence/activity → 200`
- لقطة: `audit/screenshots/legal_cases_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
