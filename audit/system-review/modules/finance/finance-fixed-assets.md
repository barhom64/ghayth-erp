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
الأصول الثابتة + الإهلاك. المرجع: `docs/blueprints/finance-invoices.md` §"Fixed Assets".

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| إضافة أصل + قيد رأسمالي | finance/GL | `finance-algorithms.ts` POST `/fixed-assets` → DR Asset / CR Cash/AP | `fixed_assets`, `gl_entries` | ✅ |
| إهلاك دفعي شهري (batch) | finance/GL | POST `/fixed-assets/depreciate-all` (cron) → DR Dep Expense / CR Acc Depreciation | `depreciation_schedules`, `gl_entries` | ✅ موجود |
| ربط بمركبة (fleet) | fleet/vehicles | `vehicles.assetId` → `fixed_assets.id` | ربط ثنائي الاتجاه | ⚠ تحقق |
| ربط بعقار (properties) | properties | `property_units.assetId` | ⚠ |
| تخلّص من أصل (disposal) | finance/GL | POST `/fixed-assets/:id/dispose` → DR Acc Dep + Cash / CR Asset + Gain/Loss | `gl_entries`, `fixed_assets.status='disposed'` | ⚠ تحقق |
| إعادة تقييم (revaluation) | finance/GL | DR/CR Asset & Revaluation Surplus | `revaluation_entries` | ⚠ غير قياسي |
| تقرير الأصول (asset register) | finance/reports | aggregation | view | ✅ |
| Audit log | core | `auditMiddleware` | `audit_logs` (entity=`fixed_assets`) | ⚠ missing-audit في FINDINGS لـ `depreciate-all` |

تحقق يدوي:
- [ ] هل cron الإهلاك الشهري يولّد قيدًا واحدًا batch أم قيد لكل أصل؟
- [ ] هل تغيير العمر الإنتاجي يعيد حساب الجدول من تاريخ التعديل أم من البداية؟
- [ ] هل توجد سجلات tracking للأصول (لقطات/QR)؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `fixed-assets` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/finance/fixed-assets`
- لقطة: `audit/screenshots/finance_fixed_assets.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
