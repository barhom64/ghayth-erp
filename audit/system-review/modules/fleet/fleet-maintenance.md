# /fleet/maintenance — `artifacts/ghayth-erp/src/pages/create/fleet/trips-create.tsx`

## 1. الميتاداتا
- المسار: `/fleet/maintenance`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/fleet/trips-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/fleetRoutes.tsx:39`
- المجموعة: `fleet`
- الكومبوننت: `TripsCreate`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `maintenance`
- سطور الملف: 118
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(call)_ | `/fleet/trips` | POST | 🔴 لم يُعثر على endpoint مطابق |||||||

### تفاصيل الأزرار المرئية
- L71: "مسح المسودة" → `clearDraft`
- L110: "(بلا تسمية)" → `() => setLocation("/fleet/trips")` 🔒
- L111: "(بلا تسمية)" → `handleSubmit` 🔒

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
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `maintenance` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/fleet/maintenance`
- لقطة: `audit/screenshots/fleet_maintenance.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
