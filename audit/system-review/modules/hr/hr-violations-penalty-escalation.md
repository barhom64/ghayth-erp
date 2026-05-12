# /hr/violations/penalty-escalation — `artifacts/ghayth-erp/src/pages/hr/penalty-escalation.tsx`

## 1. الميتاداتا
- المسار: `/hr/violations/penalty-escalation`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/penalty-escalation.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:134`
- المجموعة: `hr`
- الكومبوننت: `PenaltyEscalation`
- subKey: `violations` | minRoleLevel: —
- الكيان المستنبط: `penalty-escalation`
- سطور الملف: 102
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/hr/violations`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/hr.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `penalty-escalation` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/violations/penalty-escalation`
- لقطة: `audit/screenshots/hr_violations_penalty_escalation.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
