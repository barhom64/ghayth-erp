# /finance/bank-reconciliation — `artifacts/ghayth-erp/src/pages/finance/bank-reconciliation.tsx`

## 1. الميتاداتا
- المسار: `/finance/bank-reconciliation`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/finance/bank-reconciliation.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:123`
- المجموعة: `finance`
- الكومبوننت: `BankReconciliation`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `bank-reconciliation`
- سطور الملف: 288
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(write)_ | `/finance/bank-reconciliation/import` | POST | ✅ | ✅ | — | — | ✅ | ✅ | ✅ |
| _(write)_ | `/finance/bank-reconciliation/auto-match` | POST | ✅ | ✅ | — | — | ✅ | ✅ | — |

### تفاصيل الأزرار المرئية
- L244: "(بلا تسمية)"

### القراءات (GET)
- GET `/finance/accounts?type=asset&search=11`
- GET `/finance/bank-reconciliation`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
التسوية البنكية. المرجع: `docs/blueprints/finance-invoices.md` §"Bank reconciliation".

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| استيراد كشف بنكي | finance | `finance-algorithms.ts` POST `/bank-reconciliation/import` (CSV) | `bank_statements` (status='unmatched') | ✅ يُصدر `finance.bank_reconciliation.imported` |
| مطابقة تلقائية (auto) | finance | POST `/bank-reconciliation/auto-match` يقارن amount±tolerance + date window | `bank_statements.matchStatus='matched'`, `bank_statements.journalLineId` | ✅ يُصدر `finance.bank_reconciliation.matched` |
| مطابقة يدوية | finance | POST `/bank-reconciliation/manual-match` | نفس الجدول | ✅ |
| تقرير الفروقات | finance/reports | aggregation `unmatched_count`, `discrepancy` | view | ✅ |
| قيد محاسبي عن الفروقات (إن وُجدت) | finance/GL | يدوي عبر `/finance/journal/create` | `gl_entries` | ⚠ غير آلي |
| Audit / Event log | core | `emitEvent` يدخل event_logs | `event_logs` (action=`finance.bank_reconciliation.*`) | ✅ مضافة في هذا الـ PR |
| تكامل bank API (open banking) | gov-integrations | اختياري | `bank_api_pulls` | ⚠ غير افتراضي |

تحقق يدوي:
- [ ] هل auto-match يدعم matching على mutiple-criteria (amount + ref number + date) أم amount فقط؟
- [ ] هل سطر مطابق يمكن "فك ربطه" (unmatch) لتصحيح الخطأ؟
- [ ] هل التسوية الشهرية تقفل وتقدم closing balance رسمي؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `bank-reconciliation` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/finance/bank-reconciliation`
- لقطة: `audit/screenshots/finance_bank_reconciliation.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
