# /fleet/alerts — `artifacts/ghayth-erp/src/pages/create/fleet/insurance-create.tsx`

## 1. الميتاداتا
- المسار: `/fleet/alerts`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/fleet/insurance-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/fleetRoutes.tsx:48`
- المجموعة: `fleet`
- الكومبوننت: `InsuranceCreate`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `alerts`
- سطور الملف: 118
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(call)_ | `/fleet/insurance` | POST | 🔴 لم يُعثر على endpoint مطابق |||||||

### تفاصيل الأزرار المرئية
- L72: "مسح المسودة" → `clearDraft`
- L110: "(بلا تسمية)" → `() => setLocation("/fleet/insurance")` 🔒
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
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `alerts` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/fleet/alerts`
- لقطة: `audit/screenshots/fleet_alerts.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
