# /finance/reports — `artifacts/ghayth-erp/src/pages/finance/reports.tsx`

## 1. الميتاداتا
- المسار: `/finance/reports`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/finance/reports.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:105`
- المجموعة: `finance`
- الكومبوننت: `FinancialReports`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `reports`
- سطور الملف: 1172
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L202: "(بلا تسمية)" → `() => setViewMode("tree")`
- L203: "(بلا تسمية)" → `() => setViewMode("flat")`

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

التقارير المالية — IFRS-compliant. مركز التقارير الرسمية.

| التقرير | المرجع | معيار |
|---------|--------|------|
| Trial Balance | راجع `finance-trial-balance.md` | IFRS |
| Income Statement (P&L) | revenue - expenses | IFRS |
| Balance Sheet | Assets = Liabilities + Equity | IFRS |
| Cash Flow Statement | operating + investing + financing | IFRS |
| Statement of Changes in Equity | capital movements | IFRS |
| General Ledger | per account | detail |
| Sub-Ledgers | AR, AP, Inventory, Fixed Assets | per module |
| Aged Receivables | راجع `finance-ar-aging.md` | |
| Aged Payables | راجع `finance-ap-aging.md` | |
| Bank Reconciliation | راجع `finance-bank-reconciliation.md` | |
| VAT Return | راجع `finance-tax.md` | ZATCA |
| Withholding Tax Report | per supplier | ZATCA |
| Custodies Report | راجع `finance-custodies-report.md` | |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| List available reports | GET `/finance/reports` | catalog | ✅ |
| Generate (sync) | per report endpoint | ✅ |
| Generate (async للـ big) | job queue | راجع `bi-reports.md` | ⚠ |
| Period selector | mandatory | open + closed periods both | ✅ |
| Branch/cost-center filter | scope-aware | ✅ |
| Comparative (this vs last) | side-by-side | ✅ |
| Export PDF/Excel/CSV | راجع `print-templates` | ✅ |
| Schedule recurring | راجع `reports-scheduled.md` | ✅ |
| Email delivery to executives | راجع `notifications.md` | ✅ |
| Snapshot per period close | راجع `finance-period-close.md` | immutable archive | ✅ critical |
| Drill-down to source entries | navigate to `gl_entries` | ✅ |
| تكامل مع `bi-reports.md` (engine) | ✅ |
| تكامل مع `documents-archive.md` (retention 10y for IFRS) | ✅ critical |
| تكامل مع `governance-compliance.md` (regulatory) | ✅ |
| Audit log إجباري | كل generate + export + email | `audit_logs` | ✅ critical |
| RBAC | finance + above | accountant sees per scope | ✅ |
| **PDPL** — masking employees عند export خارجي | ⚠ |

تحقق يدوي:
- [ ] هل التقارير تستثني `gl_entries` غير المُرحَّلة (draft)؟
- [ ] هل comparative يأخذ same period last year vs YTD بشكل صحيح؟
- [ ] هل snapshot per period close immutable فعلاً؟
- [ ] هل drill-down للقيود المُلغاة (reversed) واضح؟
- [ ] هل الـ schedules تحترم timezones؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `reports` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/finance/reports`
- لقطة: `audit/screenshots/finance_reports.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
