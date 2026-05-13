# /fleet/traffic-violations/:id — `artifacts/ghayth-erp/src/pages/details/traffic-violation-detail.tsx`

## 1. الميتاداتا
- المسار: `/fleet/traffic-violations/:id`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/details/traffic-violation-detail.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/fleetRoutes.tsx:53`
- المجموعة: `fleet`
- الكومبوننت: `TrafficViolationDetail`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `:id`
- سطور الملف: 213
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

تفاصيل مخالفة مرورية — Saudi traffic violation handling.

| نوع المخالفة | المرجع | الجزاء |
|-------------|--------|--------|
| Speeding | Saudi MoI | fine + points |
| Red light | MoI | fine + points |
| Illegal parking | MoI | fine |
| Tinted windows | MoI | fine |
| No seatbelt | MoI | fine |
| Mobile use | MoI | fine + points |
| Reckless driving | MoI | major fine + license action |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| View violation | GET `/fleet/traffic-violations/:id` | `traffic_violations` | ✅ |
| Link to driver | who was driving | per `vehicle_trips` | ✅ critical |
| Link to vehicle | FK | ✅ |
| Fine amount | from Saudi MoI | ✅ |
| Status | enum (open/paid/disputed/cleared) | lifecycle | ✅ |
| Dispute (employee claim not them) | with evidence | راجع `legal-cases.md` لو escalates | ⚠ |
| Pay fine | راجع `finance-expenses.md` | with GL | ✅ critical |
| Driver responsibility | حسب company policy | full/partial/company | enum |
| Salary deduction (if driver liable) | راجع `hr-payroll.md` + `hr-violations.md` | ✅ critical |
| Company pays (لو liable) | راجع `finance-expenses.md` | ✅ |
| Reimburse from insurance (لو applicable) | راجع `fleet-insurance.md` | ⚠ |
| Points tracking per driver | aggregate | راجع `fleet-drivers-byid.md` | ✅ critical |
| Driver suspension trigger | لو points > threshold | راجع `fleet-drivers.md` | ✅ critical |
| تكامل مع Saudi MoI (Absher integration) | external sync | راجع `admin-integrations.md` | ⚠ |
| تكامل مع Najz (لو dispute legal) | راجع `legal.md` | ⚠ |
| تكامل مع `hr-violations.md` (employee discipline) | ✅ |
| تكامل مع `hr-payroll.md` (deduction) | ✅ critical |
| تكامل مع `finance-expenses.md` (company-paid) | ✅ |
| Audit log إجباري | كل خطوة | `audit_logs` | ✅ critical |
| RBAC | fleet manager + finance + hr لو deduction | ✅ |

تحقق يدوي:
- [ ] هل MoI sync يستلم violations تلقائياً (no manual entry)?
- [ ] هل driver liability matrix واضح (per violation type)?
- [ ] هل dispute process له deadline (15 يوم typically)?
- [ ] هل points accumulation triggers automatic actions (suspension, training)?
- [ ] هل audit يحفظ من قال إن السائق المسؤول؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `:id` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **✅ PASS** — render=SKIP | fetch=SKIP | CTA=SKIP | nav=SKIP | smoke=SKIP
- ملاحظة: `unresolved: /api/fleet/traffic-violations → 401`
- landedUrl: `?`
- توصية: مغلق
