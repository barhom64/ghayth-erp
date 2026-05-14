# /properties/maintenance/:id — `artifacts/ghayth-erp/src/pages/details/property-maintenance-detail.tsx`

## 1. الميتاداتا
- المسار: `/properties/maintenance/:id`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/details/property-maintenance-detail.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/propertyRoutes.tsx:53`
- المجموعة: `properties`
- الكومبوننت: `PropertyMaintenanceDetail`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `:id`
- سطور الملف: 255
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

تفاصيل طلب صيانة عقاري — work order lifecycle.

| نوع الصيانة | المثال |
|------------|--------|
| Preventive (وقائية) | inspection, AC service | scheduled |
| Corrective (إصلاحية) | repair upon issue | reactive |
| Emergency | leak, electrical | urgent < 24h |
| Cosmetic | paint, deep clean | between tenants |
| Major renovation | major work | capital |

| الحالة | الوصف |
|-------|------|
| Reported | تم الإبلاغ |
| Approved | معتمد |
| Assigned | لـ contractor/internal |
| In progress | شغّال |
| Completed | منجز |
| Verified | تم التحقق |
| Closed | مقفل |
| Cancelled | ملغي |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| View work order | GET `/properties/maintenance/:id` | `property_maintenance` | ✅ |
| Approve (budget check) | راجع `governance/approvals.md` | per cost | ✅ |
| Assign to contractor/internal | with capacity check | راجع `warehouse-suppliers.md` | ✅ |
| Track materials used | from inventory | راجع `warehouse-movements.md` | ✅ critical |
| Track labor hours | per worker | for cost | ⚠ |
| Track contractor invoice | راجع `finance-vendor-bills.md` | ✅ |
| Photos before/after | mandatory for verification | راجع `documents.md` | ✅ |
| Verify completion (manager) | with sign-off | required | ✅ critical |
| Update status | lifecycle | ✅ |
| Charge tenant (لو his responsibility) | per contract clause | راجع `properties-contracts-byid.md` | ✅ |
| Charge landlord (لو his responsibility) | راجع `finance-expenses.md` | ✅ |
| GL entry — maintenance expense | Dr Maintenance Expense / Cr AP أو Cash | راجع `finance-expenses.md` | ✅ critical |
| GL entry — capital improvement | Dr Asset / Cr AP (لو major) | راجع `finance-fixed-assets-byid.md` | ✅ critical |
| Warranty tracking (لو applicable) | per work | reminders | ⚠ |
| تكامل مع `properties-byid.md` (history) | ✅ |
| تكامل مع `properties-contracts-byid.md` (cost allocation) | ✅ |
| تكامل مع `warehouse-movements.md` (materials issue) | ✅ |
| تكامل مع `finance-fixed-assets-byid.md` (لو capital) | ✅ critical |
| تكامل مع `notifications.md` (status updates) | tenant + manager | ✅ |
| Audit log إجباري | كل خطوة | `audit_logs` | ✅ |
| RBAC | property manager + finance لو > threshold | ✅ |

تحقق يدوي:
- [ ] هل cost allocation tenant vs landlord واضح حسب contract clause + auto-applied?
- [ ] هل photos before/after إجبارية فعلاً للـ verification؟
- [ ] هل materials issued from inventory + GL impact automatic?
- [ ] هل capital vs operational expense classification صحيح (لمنع mis-posting)?
- [ ] هل warranty على work يطلق reminder قبل انتهاء fixing free?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `:id` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **✅ PASS** — render=SKIP | fetch=SKIP | CTA=SKIP | nav=SKIP | smoke=SKIP
- ملاحظة: `unresolved: /api/properties/units → 401`
- landedUrl: `?`
- توصية: مغلق
