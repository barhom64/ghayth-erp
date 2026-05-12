# /governance/audits — `artifacts/ghayth-erp/src/pages/governance.tsx`

## 1. الميتاداتا
- المسار: `/governance/audits`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/governance.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/governanceRoutes.tsx:24`
- المجموعة: `governance`
- الكومبوننت: `Governance`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `audits`
- سطور الملف: 51
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/governance/stats`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/governance.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `audits` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/governance/audits`
- لقطة: `audit/screenshots/governance_audits.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
