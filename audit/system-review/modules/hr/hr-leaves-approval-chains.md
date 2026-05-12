# /hr/leaves/approval-chains — `artifacts/ghayth-erp/src/pages/details/leave-detail.tsx`

## 1. الميتاداتا
- المسار: `/hr/leaves/approval-chains`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/details/leave-detail.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:101`
- المجموعة: `hr`
- الكومبوننت: `LeaveDetail`
- subKey: `leaves` | minRoleLevel: —
- الكيان المستنبط: `approval-chains`
- سطور الملف: 293
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
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `approval-chains` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/leaves/approval-chains`
- لقطة: `audit/screenshots/hr_leaves_approval_chains.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
