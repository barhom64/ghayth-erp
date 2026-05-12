# /hr/performance/create — `artifacts/ghayth-erp/src/pages/create/hr/performance-create.tsx`

## 1. الميتاداتا
- المسار: `/hr/performance/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/hr/performance-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:107`
- المجموعة: `hr`
- الكومبوننت: `PerformanceCreate`
- subKey: `performance` | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 254
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(write)_ | `/hr/performance` | POST | ✅ | ✅ | — | — | ✅ | ✅ | — |

### تفاصيل الأزرار المرئية
- L142: "مسح المسودة" → `clearDraft`
- L246: "(بلا تسمية)" → `() => setLocation("/hr/performance")` 🔒
- L247: "(بلا تسمية)" → `handleSubmit` 🔒

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/hr.md` (إن وُجد) وعدّد:
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
- Runtime audit: **TBD** — راجع `audit/runtime-audit-results.json` (`/hr/performance/create`)
- توصية: **TBD**
- المشاكل: 0 مدخل آلي. أضِفها إلى `audit/system-review/findings/FINDINGS.csv`.
