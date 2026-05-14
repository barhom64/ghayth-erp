# /umrah/commission-plans — `artifacts/ghayth-erp/src/pages/umrah/commission-plans.tsx`

## 1. الميتاداتا
- المسار: `/umrah/commission-plans`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/umrah/commission-plans.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/umrahRoutes.tsx:70`
- المجموعة: `operations`
- الكومبوننت: `UmrahCommissionPlans`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `commission-plans`
- سطور الملف: 327
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L145: "(بلا تسمية)"
- L305: "(بلا تسمية)" → `() => setConfirmAction(null)`

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

خطط العمولة للوكلاء — Commission plans for agents/sub-agents.

| نوع الخطة | الوصف |
|----------|------|
| Fixed per pilgrim | SAR amount per pilgrim | flat rate |
| Percentage of package | % of revenue per pilgrim |
| Tiered (per count) | escalating rates | volume incentive |
| Tiered (per revenue) | escalating rates | revenue incentive |
| Bonus on target | extra لو reaches X pilgrims | annual |
| Recoverable advance | advance against future commission | offset |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| List plans | GET `/umrah/commission-plans` | `umrah_commission_plans` | ✅ |
| Create plan | POST | راجع `umrah-commission-plans-new.md` | ✅ |
| Edit plan | راجع `umrah-commission-plans-byid-edit.md` | ✅ |
| Assign to agent | linkage | راجع `umrah-agents.md` | ✅ |
| Validity period (start/end) | per plan | ✅ |
| Calculation logic | per pilgrim per group | server-side | ✅ critical |
| Approval workflow | finance | راجع `governance/approvals.md` | ✅ critical |
| Generate commission entries | per group completion | راجع `umrah-groups.md` | ✅ critical |
| GL entry — commission expense | Dr Commission Expense / Cr Agent Payable | راجع `finance-expenses.md` | ✅ critical |
| Pay commission | راجع `finance-payments.md` | with WHT lو applicable | ✅ critical |
| WHT (withholding tax) | لو applicable | راجع `finance-tax.md` | ⚠ |
| Recoverable advance handling | balance tracking | راجع `finance-receivables.md` | ⚠ |
| Bonus calculation | year-end | راجع `automation.md` | ⚠ |
| Clawback (لو cancellation) | عكس commission | راجع `finance-payments.md` | ✅ critical |
| تكامل مع `umrah-agents.md` (assignment) | ✅ |
| تكامل مع `umrah-groups.md` (trigger calculation) | ✅ critical |
| تكامل مع `finance-tax.md` (WHT) | ✅ |
| تكامل مع `governance-compliance.md` (regulator if reportable) | ⚠ |
| Audit log إجباري | كل create/edit/calculate | `audit_logs` | ✅ critical |
| RBAC | finance + umrah-manager | ✅ critical |

تحقق يدوي:
- [ ] هل calculation logic correct لكل plan type (tiered specifically)?
- [ ] هل WHT calculated + remitted to ZATCA per regulation?
- [ ] هل cancellation clawback صارم (no commission paid لو pilgrim cancelled)?
- [ ] هل approval requires CFO أو above لـ high-value plans?
- [ ] هل audit يحفظ formula version (لو changed mid-period)?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `commission-plans` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/umrah/commission-plans`
- لقطة: `audit/screenshots/umrah_commission_plans.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
