# /finance/fixed-assets — `artifacts/ghayth-erp/src/pages/finance/fixed-assets.tsx`

## 1. الميتاداتا
- المسار: `/finance/fixed-assets`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/finance/fixed-assets.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:125`
- المجموعة: `finance`
- الكومبوننت: `FixedAssets`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `fixed-assets`
- سطور الملف: 251
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(write)_ | `/finance/fixed-assets/depreciate-all` | POST | — | — | — | — | ✅ | ✅ | ✅ |

### تفاصيل الأزرار المرئية
- L107: "إهلاك دفعي"
- L111: "(بلا تسمية)" → `() => setShowCreate(true)`
- L141: "(بلا تسمية)" → `() => { setSelectedAsset(a); setDepResult(null); setShowDepreciate(true);`
- L182: "(بلا تسمية)" → `() => setShowCreate(false)`
- L239: "(بلا تسمية)" → `() => { setShowDepreciate(false); setDepResult(null);` 🔒
- L240: "(بلا تسمية)" → `handleDepreciate` 🔒

### القراءات (GET)
- GET `/finance/fixed-assets`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/finance.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `fixed-assets` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **TBD** — راجع `audit/runtime-audit-results.json` (`/finance/fixed-assets`)
- توصية: **TBD**
- المشاكل: 0 مدخل آلي. أضِفها إلى `audit/system-review/findings/FINDINGS.csv`.
