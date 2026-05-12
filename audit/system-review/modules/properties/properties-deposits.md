# /properties/deposits — `artifacts/ghayth-erp/src/pages/create/properties-create.tsx`

## 1. الميتاداتا
- المسار: `/properties/deposits`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/properties-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/propertyRoutes.tsx:57`
- المجموعة: `properties`
- الكومبوننت: `PropertiesCreate`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `deposits`
- سطور الملف: 298
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(call)_ | `/properties/units` | POST | 🔴 لم يُعثر على endpoint مطابق |||||||

### تفاصيل الأزرار المرئية
- L135: "مسح المسودة" → `clearDraft`
- L291: "(بلا تسمية)" → `() => setLocation("/properties")` 🔒
- L292: "(بلا تسمية)" 🔒

### القراءات (GET)
- GET `/properties/buildings`
- GET `/properties/owners`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/properties.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `deposits` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/properties/deposits`
- لقطة: `audit/screenshots/properties_deposits.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
