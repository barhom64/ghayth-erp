# /clients — `artifacts/ghayth-erp/src/pages/clients.tsx`

## 1. الميتاداتا
- المسار: `/clients`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/clients.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:80`
- المجموعة: `crm`
- الكومبوننت: `Clients`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `clients`
- سطور الملف: 234
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L126: "(بلا تسمية)" → `() => setPreviewItem(client)`

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/crm.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
- الجدول: `clients` (export: `clients`, 10 عمود)
- tenant col: ✅ | createdBy: — | createdAt: ✅ | updatedAt: — | softDelete: ✅ | lifecycle col: ✅
- FKs: companies.id

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/clients`
- لقطة: `audit/screenshots/clients.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
