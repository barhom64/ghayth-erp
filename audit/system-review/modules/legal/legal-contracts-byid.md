# /legal/contracts/:id — `artifacts/ghayth-erp/src/pages/create/legal-create.tsx`

## 1. الميتاداتا
- المسار: `/legal/contracts/:id`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/legal-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/legalRoutes.tsx:18`
- المجموعة: `legal`
- الكومبوننت: `LegalCreate`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `:id`
- سطور الملف: 199
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(call)_ | `/legal/contracts` | POST | 🔴 لم يُعثر على endpoint مطابق |||||||

### تفاصيل الأزرار المرئية
- L104: "مسح المسودة" → `clearDraft`
- L191: "(بلا تسمية)" → `() => setLocation("/legal")` 🔒
- L192: "(بلا تسمية)" 🔒

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/legal.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `:id` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **✅ PASS** — render=SKIP | fetch=SKIP | CTA=SKIP | nav=SKIP | smoke=SKIP
- ملاحظة: `unresolved: /api/legal/contracts → 401`
- landedUrl: `?`
- توصية: مغلق
