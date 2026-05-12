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
| _(write)_ | `/finance/fixed-assets/depreciate-all` | POST | ✅ | ✅ | — | — | ✅ | ✅ | ✅ |

### تفاصيل الأزرار المرئية
- L48: "مسح المسودة" → `clearDraft`
- L62: "(بلا تسمية)" → `handleBatchDepreciate` 🔒

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
إهلاك دفعي لأصول ثابتة. عملية شهرية cron-driven.

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| اختيار الأصول المؤهلة | finance/fixed-assets | `fixed_assets.status='active' AND remaining_useful_life > 0 AND no record for period` | aggregation | ✅ |
| حساب الإهلاك لكل أصل | finance/fixed-assets | straight-line: `cost / useful_life_months` | scalar في الـ handler | ✅ |
| **قيد محاسبي** | finance/GL | DR Depreciation Expense / CR Accumulated Depreciation (واحد per أصل، داخل `withTransaction`) | `gl_entries`, `gl_lines` | ✅ موجود |
| تحديث `accumulatedDepreciation` و `currentBookValue` | finance/fixed-assets | UPDATE داخل الـ transaction | `fixed_assets.accumulatedDepreciation`, `currentBookValue` | ✅ |
| تسجيل سطر في schedule | finance/fixed-assets | INSERT لـ `depreciation_schedules` (status='posted') | `depreciation_schedules` | ✅ |
| Event log (audit trail) | core | `emitEvent('finance.fixed_assets.batch_depreciated')` | `event_logs` (مع `period`, `assetsCount`, `totalDepreciation`) | ✅ مُضاف الآن |
| إشعار لـ Finance Manager | comms | event=`finance.fixed_assets.batch_depreciated` consumed | `notifications` (مستقبلي) | ⚠ غير متفعّل |
| تكامل مع التقارير المالية | finance/reports | يظهر في income statement كمصروف، balance sheet كتراكم | views | ✅ |

تحقق يدوي:
- [ ] هل cron يُشغّل تلقائياً في يوم محدد من الشهر؟ ما يحصل لو فاتت أكثر من فترة (catch-up)؟
- [ ] هل أصل تجاوز عمره الافتراضي يبقى عند book_value=0 ولا يولّد قيد؟
- [ ] هل إعادة تشغيل البطاقة لنفس الفترة محصّن ضد الازدواجية (idempotency)؟
- [ ] هل توجد حالة "روجع للمراجعة" قبل ترحيل القيود — أم تُرحّل مباشرة؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `batch-depreciate` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/finance/fixed-assets/batch-depreciate`
- لقطة: `audit/screenshots/finance_fixed_assets_batch_depreciate.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
