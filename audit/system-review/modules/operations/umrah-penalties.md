# /umrah/penalties — `artifacts/ghayth-erp/src/pages/umrah/penalties.tsx`

## 1. الميتاداتا
- المسار: `/umrah/penalties`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/umrah/penalties.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/umrahRoutes.tsx:56`
- المجموعة: `operations`
- الكومبوننت: `UmrahPenalties`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `penalties`
- سطور الملف: 243
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L109: "(بلا تسمية)" → `(e) => handleWaive(e, p.id)`
- L146: "(بلا تسمية)" → `() => setBulkOpen(true)`

### القراءات (GET)
- GET `/umrah/penalties`



## 3. الحركات ذات الصلة (Cross-Module Transactions)

غرامات/جزاءات العمرة — Penalties imposed (by company or by Saudi authorities).

| نوع الغرامة | المصدر |
|------------|--------|
| Cancellation penalty | per company policy | charged to pilgrim/agent |
| No-show penalty | for missed departure | charged to pilgrim/agent |
| Late arrival fine (regulator) | from Saudi MoHaj | charged to company |
| Visa overstay (pilgrim) | from MoFA | charged to pilgrim/agent |
| Operational violation | from MoHaj | charged to company |
| Quality complaint settlement | by company | refund or compensation |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| List penalties | GET `/umrah/penalties` | `umrah_penalties` | ✅ |
| Create penalty | POST | linked to pilgrim/group/agent | ✅ |
| Amount + reason | إجباري | with audit | ✅ |
| Approval workflow | manager + finance | راجع `governance/approvals.md` | ✅ critical |
| Recipient (pilgrim/agent/company) | enum | determines who pays | ✅ critical |
| Status: pending → confirmed → paid → disputed → cancelled | lifecycle | ✅ |
| Dispute process | with evidence | راجع `legal.md` لو escalates | ⚠ |
| Apply to invoice (لو pilgrim/agent) | راجع `finance-invoices.md` | with GL | ✅ critical |
| Pay (لو regulator) | راجع `finance-payments.md` | with WHT لو applicable | ✅ critical |
| GL entry — penalty income (لو charged to others) | Cr Other Income | ✅ critical |
| GL entry — penalty expense (لو charged to us) | Dr Penalties Expense | ✅ critical |
| Notification | per pilgrim/agent | راجع `notifications.md` | ✅ |
| تكامل مع `umrah-pilgrims-byid.md` (pilgrim record) | ✅ |
| تكامل مع `umrah-agents.md` (agent ledger) | ✅ |
| تكامل مع `umrah-groups.md` (group impact) | ✅ |
| تكامل مع `finance-invoices.md` (billing) | ✅ critical |
| تكامل مع Saudi MoHaj (regulator) | external | راجع `admin-integrations.md` | ✅ critical |
| تكامل مع `governance-compliance.md` (regulatory) | ✅ |
| Audit log إجباري | كل خطوة | `audit_logs` | ✅ critical |
| RBAC | umrah-manager + finance + legal لو dispute | ✅ |

تحقق يدوي:
- [ ] هل penalty matrix consistent per cancellation timing (e.g., 30/15/7 day buckets)?
- [ ] هل regulator penalties auto-sync من Saudi MoHaj?
- [ ] هل dispute window واضح + audited?
- [ ] هل GL entry direction correct (income vs expense) per recipient?
- [ ] هل recurring violators flagged للـ blacklist consideration?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `penalties` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/umrah/penalties`
- لقطة: `audit/screenshots/umrah_penalties.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
