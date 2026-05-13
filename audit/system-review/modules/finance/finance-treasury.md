# /finance/treasury — `artifacts/ghayth-erp/src/pages/finance/treasury.tsx`

## 1. الميتاداتا
- المسار: `/finance/treasury`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/finance/treasury.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:146`
- المجموعة: `finance`
- الكومبوننت: `Treasury`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `treasury`
- سطور الملف: 319
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L74: "دفتر الأستاذ"
- L168: "(بلا تسمية)"
- L173: "(بلا تسمية)"
- L252: "(بلا تسمية)" → `() => setActiveTab("accounts")`
- L259: "(بلا تسمية)" → `() => setActiveTab("movements")`
- L266: "(بلا تسمية)" → `() => setActiveTab("daily")`

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

الخزينة (Treasury) — إدارة السيولة + الحسابات البنكية + الـ FX + الـ investments.

| المكوّن | الوصف |
|---------|------|
| Cash accounts | per branch + main | راجع `finance-cash-register.md` |
| Bank accounts | per company per currency | راجع `finance-bank-accounts.md` |
| Pending receipts | invoices unpaid | راجع `finance-ar-aging.md` |
| Pending payments | bills due | راجع `finance-ap-aging.md` |
| Cash flow forecast | predicted | راجع `cash-flow-forecast.md` |
| Bank reconciliation | راجع `finance-bank-reconciliation.md` |
| FX exposure | foreign currency positions | per currency |
| Inter-account transfers | between cash/bank | with audit |
| Cash position dashboard | real-time aggregate | ✅ |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| Treasury dashboard | GET `/finance/treasury` | aggregations | ✅ |
| Cash position (real-time) | sum balances across accounts | per currency | ✅ |
| Inter-account transfer | POST `/finance/treasury/transfer` | dual GL entries | ✅ critical |
| FX conversion | POST `/finance/treasury/fx` | with rate from CB | ⚠ تحقق |
| Investment management (لو موجود) | securities, deposits | `investments` | ⚠ |
| Cash forecast | aggregate من invoices + bills + recurring | راجع `cash-flow-forecast.md` | ✅ |
| Liquidity alerts | event=`liquidity_low` | تحت threshold | راجع `notifications.md` ✅ critical |
| Bank statement upload | راجع `finance-bank-reconciliation.md` | ✅ |
| Auto-match transactions | راجع `bank-reconciliation.md` | ✅ |
| Withdrawal/Deposit | per account | راجع `finance-cash-register.md` | ✅ |
| تكامل مع `finance-payments.md` (outflow) | ✅ |
| تكامل مع `finance-receipts.md` (inflow) | ✅ |
| تكامل مع `finance-budget.md` (cash planning) | ✅ |
| FX rate source (Saudi Central Bank API) | external | راجع `admin-integrations.md` | ⚠ |
| Audit log إجباري | كل transfer/FX/withdrawal | `audit_logs` | ✅ critical |
| Dual approval للـ high-value transfers | راجع `governance/approvals.md` | ✅ critical |
| RBAC | treasurer + CFO | high-value requires CFO | ✅ critical |

تحقق يدوي:
- [ ] هل cash position يأخذ pending (un-cleared) transactions بحسبان؟
- [ ] هل FX rate من مصدر موثوق + cached daily?
- [ ] هل liquidity alert يصل قبل نفاد الكاش بـ X أيام?
- [ ] هل dual approval mandatory لكل transfer > Y SAR?
- [ ] هل audit يحفظ كل rate + reference + reason للـ FX conversion?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `treasury` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/finance/treasury`
- لقطة: `audit/screenshots/finance_treasury.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
