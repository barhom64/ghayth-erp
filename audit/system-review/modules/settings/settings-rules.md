# /settings/rules — `artifacts/ghayth-erp/src/pages/settings-rules.tsx`

## 1. الميتاداتا
- المسار: `/settings/rules`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/settings-rules.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/settingsRoutes.tsx:12`
- المجموعة: `settings`
- الكومبوننت: `SettingsRules`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `rules`
- سطور الملف: 476
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L166: "(بلا تسمية)" → `() => setExpanded(!expanded)`

### القراءات (GET)
_لا قراءات._



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
