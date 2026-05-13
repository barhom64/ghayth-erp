# /fleet/fuel/create — `artifacts/ghayth-erp/src/pages/create/fleet/fuel-create.tsx`

## 1. الميتاداتا
- المسار: `/fleet/fuel/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/fleet/fuel-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/fleetRoutes.tsx:43`
- المجموعة: `fleet`
- الكومبوننت: `FuelCreate`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 102
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(write)_ | `/fleet/fuel-logs` | POST | ✅ | ✅ | — | — | ✅ | ✅ | — |

### تفاصيل الأزرار المرئية
- L64: "مسح المسودة" → `clearDraft`
- L94: "(بلا تسمية)" → `() => setLocation("/fleet/fuel")` 🔒
- L95: "(بلا تسمية)" → `handleSubmit` 🔒

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

تسجيل تعبئة وقود — fuel log entry.

| الحقل | المتطلب |
|------|--------|
| Vehicle | FK | إجباري |
| Driver | FK | إجباري |
| Date | timestamp | إجباري |
| Odometer reading | km | إجباري + تحقق increasing |
| Liters | quantity | إجباري |
| Price per liter | currency | إجباري |
| Total amount | calculated or manual | إجباري |
| Station | name + location | optional |
| Receipt photo | proof | إجباري لـ > X SAR |
| Payment method | cash/card/account | enum |
| Fuel card (لو موجود) | linked | راجع `fleet-fuel-cards.md` |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| Record fuel | POST `/fleet/fuel` | `fuel_logs` | ✅ |
| Validate odometer | server-side | new reading > previous | ✅ critical |
| Validate consumption sanity | flag if too low/high | manager review | ⚠ |
| Validate driver assigned to vehicle | per `fleet-drivers.md` | ✅ |
| Auto-calculate consumption (km/L) | from prev fuel record | KPI | ✅ |
| Detect anomalies (sudden drop in efficiency) | event=`fuel_anomaly` | راجع `notifications.md` | ⚠ |
| GL entry — fuel expense | Dr Fuel Expense / Cr Cash/AP | راجع `finance-expenses.md` | ✅ critical |
| Allocate to project (لو vehicle مشغل على project) | راجع `projects.md` | ⚠ |
| Allocate to department | per `cost_centers` | ✅ |
| Charge to client (لو rental vehicle) | invoicing | راجع `finance-invoices.md` | ⚠ |
| Fuel card reconciliation | matching | راجع `fleet-fuel-cards.md` | ⚠ |
| Photo storage | راجع `documents.md` | ✅ |
| تكامل مع `finance-expenses.md` | direct expense | ✅ critical |
| تكامل مع `bi-kpis.md` (km/L, cost/km) | ✅ |
| تكامل مع `fleet-byid.md` (history) | ✅ |
| Audit log إجباري | كل entry | `audit_logs` | ✅ |
| RBAC | driver self-report + fleet manager review | ⚠ |

تحقق يدوي:
- [ ] هل odometer reading mandatory + validated (لا decrease)?
- [ ] هل consumption anomaly detection شغّال (لكشف fraud)?
- [ ] هل receipt photo mandatory لمنع false claims?
- [ ] هل fuel card transactions reconciled monthly مع بنك الـ statement?
- [ ] هل allocation للـ project/department تلقائي حسب trip log?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `create` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=SKIP | CTA=PASS | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/fleet/fuel/create; write POST /api/intelligence/activity → 200`
- لقطة: `audit/screenshots/fleet_fuel_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
