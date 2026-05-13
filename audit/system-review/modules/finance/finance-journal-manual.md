# /finance/journal-manual — `artifacts/ghayth-erp/src/pages/finance/journal-manual.tsx`

## 1. الميتاداتا
- المسار: `/finance/journal-manual`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/finance/journal-manual.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:130`
- المجموعة: `finance`
- الكومبوننت: `JournalManual`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `journal-manual`
- سطور الملف: 355
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L224: "(بلا تسمية)"

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

قيد محاسبي يدوي — تسجيل قيود غير متولّدة آلياً.

| الحقل | المتطلب |
|------|--------|
| Posting date | إجباري — يجب أن يكون في فترة مفتوحة |
| Description | إجباري لكل قيد |
| Reference | optional (invoice, payment, etc.) |
| Lines (Dr/Cr) | min 2 lines، Dr total = Cr total | balanced |
| Account | per line | from chart of accounts |
| Tax (لو لازم) | راجع `finance-tax.md` |
| Cost center | optional | للـ allocation |
| Project | optional | راجع `projects.md` |
| Attachments | supporting documents | راجع `documents.md` |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| Create draft | POST `/finance/journal-manual` | `gl_entries` status=draft | ✅ |
| Validate balance | server-side | Dr = Cr exact match | ✅ critical |
| Validate period | open period check | راجع `finance-period-close.md` | ✅ critical |
| Validate account active | per line | لا يسمح بحسابات معطّلة | ✅ |
| Submit for approval | لو > threshold | راجع `governance/approvals.md` | ✅ |
| Approve | POST `/finance/journal-manual/:id/approve` | lifecycle | ✅ |
| Post (commit to GL) | POST `/finance/journal-manual/:id/post` | يحدّث balances | ✅ critical |
| Reverse | POST `/finance/journal-manual/:id/reverse` | يولّد قيد عكسي | راجع `governance/approvals.md` ✅ |
| Recurring journals | راجع `finance-recurring-journals.md` | ✅ |
| Print | راجع `print-templates` | ✅ |
| تكامل مع `finance-trial-balance.md` | post → reflected immediately | ✅ |
| تكامل مع `finance-financial-statements.md` | بعد الترحيل | ✅ |
| Audit log إجباري | كل create/edit/post/reverse | `audit_logs` | ✅ critical |
| Immutable after posted | guard | إلا via reverse | ✅ critical |
| RBAC | accountant + finance manager | high-value requires manager | ✅ |

تحقق يدوي:
- [ ] هل validate Dr=Cr صارم (لا فرق حتى لو 0.001)؟
- [ ] هل posting إلى فترة مقفلة ممنوع تماماً؟
- [ ] هل reverse يحافظ على الأصلي + ينشئ عكسي بـ reference clear؟
- [ ] هل أكثر من approval level لـ high-value journals؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `journal-manual` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/finance/journal-manual`
- لقطة: `audit/screenshots/finance_journal_manual.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
