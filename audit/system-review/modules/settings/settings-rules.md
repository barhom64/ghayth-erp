# /settings/rules — `artifacts/ghayth-erp/src/pages/settings.tsx`

## 1. الميتاداتا
- المسار: `/settings/rules`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/settings.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/settingsRoutes.tsx:12`
- المجموعة: `settings`
- الكومبوننت: `Settings`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `rules`
- سطور الملف: 352
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L106: "(بلا تسمية)" → `handleSave` 🔒
- L186: "(بلا تسمية)" → `() => { if (showForm) resetForm(); else setShowForm(true);`
- L193: "(بلا تسمية)" → `handleSave` 🔒
- L205: "تعديل" → `() => handleEdit(item)` 🔒
- L206: "حذف" → `() => setDeletingItem({ id: item.id, label: (fields[0] && item[fields[0].name]) ` 🔒

### القراءات (GET)
- GET `/settings/resolved`
- GET `/settings/audit-log`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/settings.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `rules` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/settings/rules`
- لقطة: `audit/screenshots/settings_rules.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
