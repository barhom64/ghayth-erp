# /operations-center — `artifacts/ghayth-erp/src/pages/operations-center.tsx`

## 1. الميتاداتا
- المسار: `/operations-center`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/operations-center.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:78`
- المجموعة: `operations`
- الكومبوننت: `OperationsCenter`
- subKey: — | minRoleLevel: 40
- الكيان المستنبط: `operations-center`
- سطور الملف: 284
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L117: "الإقفال اليومي"
- L122: "(بلا تسمية)" → `() => { setRefreshKey(k => k + 1); refetch();`
- L174: "(بلا تسمية)"
- L245: "عرض الكل"

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
Operations Center — لوحة COO/مدير العمليات. تجمع real-time من كل العمليات النشطة.

| القسم | البيانات | المصدر |
|------|---------|--------|
| Today's deliveries | trips in progress + completed | fleet/trips |
| Today's check-ins | attendance count | hr/attendance |
| Pending approvals | requests + financial | requests + workflows |
| Open tickets (high priority) | support critical | support |
| Active projects | with deadlines this week | operations/projects |
| Property maintenance urgent | high severity | properties/maintenance |
| Umrah operations live | pilgrims arriving/departing | umrah |
| Daily close status | راجع `daily-close.md` | finance |
| Inventory alerts (out-of-stock) | min_qty exceeded | warehouse |
| Cash position end-of-day | running total | finance/cashflow |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| تجميع real-time | `operationsCenter.ts` GET `/` | aggregate from 10+ sources | ✅ |
| Refresh interval | client polls every 1 min | ✅ |
| Quick actions | navigate to source module | ✅ |
| Drill-down per category | filter + drill | ✅ |
| Daily summary at EOD | cron 23:59 → snapshot | `operations_daily_snapshots` | ⚠ |
| إشعارات للـ COO عند incidents | event=`operations_incident` | `notifications` | ✅ |
| RBAC: COO + operations managers only | role-based | ✅ |

تحقق يدوي:
- [ ] هل البيانات real-time أم cached؟ (لـ COO يجب live)
- [ ] هل EOD snapshot يستخدم في monthly review؟
- [ ] هل scope: company-wide أم per branch (للـ branch managers)؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `operations-center` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/operations-center`
- لقطة: `audit/screenshots/operations_center.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
