# /finance/fixed-assets/batch-depreciate — `artifacts/ghayth-erp/src/pages/create/finance/batch-depreciate.tsx`

## 1. الميتاداتا
- المسار: `/finance/fixed-assets/batch-depreciate`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/finance/batch-depreciate.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:126`
- المجموعة: `finance`
- الكومبوننت: `BatchDepreciate`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `batch-depreciate`
- سطور الملف: 76
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(write)_ | `/finance/fixed-assets/depreciate-all` | POST | — | — | — | — | ✅ | ✅ | ✅ |

### تفاصيل الأزرار المرئية
- L48: "مسح المسودة" → `clearDraft`
- L62: "(بلا تسمية)" → `handleBatchDepreciate` 🔒

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/finance.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `batch-depreciate` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **TBD** — راجع `audit/runtime-audit-results.json` (`/finance/fixed-assets/batch-depreciate`)
- توصية: **TBD**
- المشاكل: 0 مدخل آلي. أضِفها إلى `audit/system-review/findings/FINDINGS.csv`.
