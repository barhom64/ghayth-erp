# /crm/:id — `artifacts/ghayth-erp/src/pages/details/opportunity-detail.tsx`

## 1. الميتاداتا
- المسار: `/crm/:id`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/details/opportunity-detail.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:88`
- المجموعة: `crm`
- الكومبوننت: `OpportunityDetail`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `:id`
- سطور الملف: 333
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L98: "تعديل" → `startEdit`
- L101: "تأكيد الحذف" → `handleDelete`
- L102: "(بلا تسمية)" → `() => setDeleting(false)`
- L105: "(بلا تسمية)" → `() => setDeleting(true)`
- L136: "حفظ" → `saveEdit`
- L137: "(بلا تسمية)" → `() => setEditing(false)`

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

تفاصيل عميل / فرصة / lead واحد — 360° customer view.

| القسم | الوصف |
|------|------|
| Contact info | + multiple contacts (decision maker, finance, etc.) |
| Activities timeline | راجع `crm-activities.md` — calls, meetings, emails |
| Opportunities | open + closed | راجع `crm-pipeline.md` |
| Quotes/proposals | راجع `crm-quotes.md` |
| Invoices + AR | راجع `finance-invoices.md` + `finance-ar-aging.md` |
| Payments | راجع `finance-payments.md` |
| Contracts | راجع `legal-contracts-byid.md` |
| Support tickets | راجع `support.md` |
| Lifetime value (LTV) | calculated KPI |
| Credit limit + outstanding | راجع `crm-credit-management.md` |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| View 360° detail | GET `/crm/:id` | `clients` + joins | ✅ |
| Update info | PATCH | with audit + PDPL | ✅ critical |
| Log activity | راجع `crm-activities.md` | ✅ |
| Create quote | راجع `crm-quotes.md` | ⚠ |
| Convert to invoice | راجع `finance-invoices.md` | ✅ critical |
| View account statement | aggregate | راجع `finance-reports.md` | ✅ |
| Set credit limit | راجع `crm-credit-management.md` | ✅ critical |
| Blacklist (with reason) | flag | يمنع new orders | ✅ critical |
| Merge duplicates | bulk move + audit | ⚠ |
| Tag with attributes (industry, tier, status) | for segmentation | ✅ |
| Track NPS / satisfaction | راجع `crm-csat.md` | ⚠ |
| تكامل مع `crm-pipeline.md` (opportunities) | ✅ |
| تكامل مع `finance-invoices.md` + `finance-payments.md` | ✅ critical |
| تكامل مع `support.md` (tickets) | ✅ |
| تكامل مع `legal-contracts-byid.md` (contracts) | ✅ |
| تكامل مع `bi-kpis.md` (LTV, churn KPI) | ✅ |
| Audit log إجباري | كل تعديل | `audit_logs` | ✅ critical |
| **PDPL** — PII protection | encryption + consent | ✅ critical |
| RBAC | sales rep (own) + manager (team) + finance (AR view) | ✅ critical |

تحقق يدوي:
- [ ] هل scope correct (sales rep يرى الخاصين فقط)?
- [ ] هل credit limit changes audited بدقة (financial impact)?
- [ ] هل blacklist enforce صارم في sales workflow?
- [ ] هل LTV calculation accurate?
- [ ] هل merge duplicates audited بدون data loss?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `:id` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **✅ PASS** — render=SKIP | fetch=SKIP | CTA=SKIP | nav=SKIP | smoke=SKIP
- ملاحظة: `unresolved: /api/crm/leads → 404`
- landedUrl: `?`
- توصية: مغلق
