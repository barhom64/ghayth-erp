# /fleet/preventive-plans — `artifacts/ghayth-erp/src/pages/fleet/preventive-plans.tsx`

## 1. الميتاداتا
- المسار: `/fleet/preventive-plans`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/fleet/preventive-plans.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/fleetRoutes.tsx:51`
- المجموعة: `fleet`
- الكومبوننت: `PreventivePlans`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `preventive-plans`
- سطور الملف: 288
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L215: "(بلا تسمية)" → `() => setShowForm(false)`

### القراءات (GET)
- GET `/fleet/vehicles?limit=200`



## 3. الحركات ذات الصلة (Cross-Module Transactions)

خطط الصيانة الوقائية — schedules per vehicle class.

| المعيار | المثال |
|---------|--------|
| Time-based | كل 6 أشهر oil change |
| Mileage-based | كل 10,000 km |
| Combined | أيهما أسبق |
| Manufacturer recommended | per OEM | مرتبط بضمان |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| List preventive plans | GET `/fleet/preventive-plans` | `vehicle_maintenance_plans` | ✅ |
| Create plan template | POST | per vehicle class/model | ✅ |
| Assign plan to vehicles | bulk | ✅ |
| Auto-generate work orders (upcoming) | cron | راجع `fleet-maintenance.md` | ✅ critical |
| Calculate due date | from last service + interval | per vehicle | ✅ |
| Calculate due km | from current odometer | per vehicle | ✅ |
| Trigger (whichever first: km or date) | ✅ critical |
| Reminder before due (7/3/1 day) | cron | راجع `notifications.md` | ✅ |
| Reminder before due km (500/100 km) | based on usage rate | ⚠ |
| Block dispatch if overdue beyond grace | guard | optional | ⚠ |
| Track compliance rate per vehicle | KPI | راجع `bi-kpis.md` | ✅ |
| Estimate parts inventory needed | bulk plan | راجع `warehouse-movements.md` | ⚠ |
| Cost forecasting per plan | budget input | راجع `finance-budget.md` | ⚠ |
| تكامل مع `fleet-maintenance.md` (execution) | ✅ critical |
| تكامل مع `warehouse.md` (parts pre-allocation) | ⚠ |
| تكامل مع `finance-budget.md` (annual maintenance budget) | ✅ |
| تكامل مع `bi-kpis.md` (preventive vs reactive ratio) | ✅ |
| Audit log إجباري | كل تعديل/تنفيذ | `audit_logs` | ✅ |
| RBAC | fleet manager + workshop | ✅ |

تحقق يدوي:
- [ ] هل auto-generation للـ work orders تشتغل بدقة قبل due (لا miss)?
- [ ] هل compliance rate مرئية في dashboard للـ exec?
- [ ] هل دائماً يأخذ "whichever first" (km or date)?
- [ ] هل block dispatch لو overdue يعمل كـ guard للسلامة?
- [ ] هل cost forecasting يساعد annual budget planning?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `preventive-plans` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/fleet/preventive-plans`
- لقطة: `audit/screenshots/fleet_preventive_plans.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
