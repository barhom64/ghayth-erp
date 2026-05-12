# /umrah/import — `artifacts/ghayth-erp/src/pages/umrah/import-wizard.tsx`

## 1. الميتاداتا
- المسار: `/umrah/import`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/umrah/import-wizard.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/umrahRoutes.tsx:76`
- المجموعة: `operations`
- الكومبوننت: `UmrahImportWizard`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `import`
- سطور الملف: 491
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L257: "تغيير الملف" → `clearFile`
- L398: "(بلا تسمية)" → `() => setStep(1)`
- L425: "عرض تفاصيل الدفعة"
- L433: "(بلا تسمية)"
- L477: "(بلا تسمية)" → `() => { setLinkingSubAgent(null); setLinkClientId("");` 🔒

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
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `import` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/umrah/import`
- لقطة: `audit/screenshots/umrah_import.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
