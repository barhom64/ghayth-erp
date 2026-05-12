# /governance/compliance — `artifacts/ghayth-erp/src/pages/create/governance/compliance-create.tsx`

## 1. الميتاداتا
- المسار: `/governance/compliance`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/governance/compliance-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/governanceRoutes.tsx:27`
- المجموعة: `governance`
- الكومبوننت: `ComplianceCreate`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `compliance`
- سطور الملف: 84
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L49: "مسح المسودة" → `clearDraft`
- L77: "(بلا تسمية)" → `() => setLocation("/governance/compliance")` 🔒
- L78: "(بلا تسمية)" → `handleSubmit` 🔒

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/governance.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `compliance` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/governance/compliance`
- لقطة: `audit/screenshots/governance_compliance.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
