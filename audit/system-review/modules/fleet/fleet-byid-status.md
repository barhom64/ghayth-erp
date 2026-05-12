# /fleet/:id/status — `artifacts/ghayth-erp/src/pages/create/fleet/vehicle-status-change.tsx`

## 1. الميتاداتا
- المسار: `/fleet/:id/status`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/fleet/vehicle-status-change.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/fleetRoutes.tsx:55`
- المجموعة: `fleet`
- الكومبوننت: `VehicleStatusChange`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `status`
- سطور الملف: 182
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L99: "مسح المسودة" → `clearDraft`
- L170: "(بلا تسمية)" → `() => setLocation(`/fleet/${id` 🔒
- L171: "(بلا تسمية)" → `applyStatusChange` 🔒

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
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `status` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/fleet/7/status`
- لقطة: `audit/screenshots/fleet_id_status.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
