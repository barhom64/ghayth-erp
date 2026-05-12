# /fleet/vehicles/create — `artifacts/ghayth-erp/src/pages/create/fleet/vehicles-create.tsx`

## 1. الميتاداتا
- المسار: `/fleet/vehicles/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/fleet/vehicles-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/fleetRoutes.tsx:32`
- المجموعة: `fleet`
- الكومبوننت: `VehiclesCreate`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 159
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(write)_ | `/fleet/vehicles` | POST | ✅ | ✅ | — | — | ✅ | ✅ | — |

### تفاصيل الأزرار المرئية
- L75: "مسح المسودة" → `clearDraft`
- L152: "(بلا تسمية)" → `() => setLocation("/fleet")` 🔒
- L153: "(بلا تسمية)" → `handleSubmit` 🔒

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/fleet.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `create` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=SKIP | CTA=PASS | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/fleet/vehicles/create; write POST /api/intelligence/activity → 200`
- لقطة: `audit/screenshots/fleet_vehicles_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
