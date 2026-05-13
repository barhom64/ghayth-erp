# /obligations — `artifacts/ghayth-erp/src/pages/obligations.tsx`

## 1. الميتاداتا
- المسار: `/obligations`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/obligations.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:74`
- المجموعة: `operations`
- الكومبوننت: `Obligations`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `obligations`
- سطور الملف: 229
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/obligations/summary`



## 3. الحركات ذات الصلة (Cross-Module Transactions)

الالتزامات (Obligations) — Unified obligation tracking. تجمع الالتزامات من كل الأطراف (company, employees, clients, suppliers).

| نوع الالتزام | المثال | المرجع |
|------------|--------|--------|
| Financial — payable | bill to pay | راجع `finance-ap-aging.md` |
| Financial — receivable | invoice unpaid | راجع `finance-ar-aging.md` |
| Contractual — milestone | project deliverable | راجع `projects-tasks.md` |
| Contractual — renewal | contract expiring | راجع `legal-contracts-byid.md` |
| Regulatory — filing | GOSI, WPS, ZATCA returns | راجع `governance-compliance.md` |
| Regulatory — payment | fines, taxes | راجع `finance-tax.md` |
| HR — gratuity provision | employees | راجع `hr-gratuity.md` |
| Legal — court order | judgment to pay | راجع `legal-judgments-byid.md` |
| Custody | employee custodies | راجع `finance-custodies.md` |
| Inventory commitment | open POs | راجع `finance-purchase-orders-byid.md` |
| Loan repayment | bank loans | راجع `finance-loans.md` |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| Aggregated dashboard | GET `/obligations` | aggregation views | ✅ |
| Filter by type + party + due window | UI filter | ✅ |
| Total obligations summary | per party | ✅ critical |
| Aging buckets | 0-30/31-60/61-90/90+ | per type | ✅ |
| Drill-down to source entity | navigate | ✅ |
| Upcoming due (next 7/30 days) | reminder | راجع `notifications.md` | ✅ critical |
| Critical overdue alerts | event=`obligation_overdue_critical` | راجع `notifications.md` | ✅ critical |
| Generate provisions (IFRS) | راجع `finance-provisions.md` | per probability | ✅ critical |
| Cash flow forecast input | راجع `cash-flow-forecast.md` | ✅ critical |
| Export to CSV/Excel | راجع `bi-reports.md` | ✅ |
| تكامل مع `finance-ar-aging.md` + `finance-ap-aging.md` | ✅ critical |
| تكامل مع `governance-compliance.md` (regulatory) | ✅ critical |
| تكامل مع `legal.md` (court orders) | ✅ |
| تكامل مع `cash-flow-forecast.md` | ✅ critical |
| تكامل مع `bi-kpis.md` (current ratio, quick ratio) | ✅ |
| Audit log on view + alert send | `audit_logs` | ✅ |
| RBAC | CFO + finance + relevant managers (scope per type) | ✅ critical |

تحقق يدوي:
- [ ] هل aggregation covers ALL obligation types (لا missed any)?
- [ ] هل critical overdue alerts escalate لـ CEO/CFO حسب القيمة + الوقت?
- [ ] هل provisions calculation matches IFRS (probability × amount)?
- [ ] هل cash flow forecast accurate based on aggregated obligations?
- [ ] هل drill-down navigation works للـ underlying record?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `obligations` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/obligations`
- لقطة: `audit/screenshots/obligations.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
