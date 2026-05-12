# /hr/overtime — `artifacts/ghayth-erp/src/pages/create/hr/loans-create.tsx`

## 1. الميتاداتا
- المسار: `/hr/overtime`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/hr/loans-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:125`
- المجموعة: `hr`
- الكومبوننت: `LoansCreate`
- subKey: `payroll` | minRoleLevel: —
- الكيان المستنبط: `overtime`
- سطور الملف: 236
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(call)_ | `/hr/loans` | POST | 🔴 لم يُعثر على endpoint مطابق |||||||

### تفاصيل الأزرار المرئية
- L113: "مسح المسودة" → `clearDraft`
- L224: "(بلا تسمية)" 🔒
- L228: "(بلا تسمية)" → `() => setLocation("/hr/loans")`

### القراءات (GET)
- GET `/employees?limit=500`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/hr.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `overtime` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/overtime`
- لقطة: `audit/screenshots/hr_overtime.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
