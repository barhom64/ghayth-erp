# /intelligence — `artifacts/ghayth-erp/src/pages/intelligence.tsx`

## 1. الميتاداتا
- المسار: `/intelligence`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/intelligence.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:119`
- المجموعة: `bi`
- الكومبوننت: `Intelligence`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `intelligence`
- سطور الملف: 127
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/intelligence/overview`
- GET `/intelligence/alerts`
- GET `/intelligence/daily-schedule`



## 3. الحركات ذات الصلة (Cross-Module Transactions)

Intelligence Hub — جلسة العمل اليومية للـ executives مع تنبيهات + جدول.

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| Daily alerts | GET `/intelligence/alerts` | aggregated من kpi breaches | راجع `bi-kpis.md` ✅ |
| Daily schedule | GET `/intelligence/daily-schedule` | meetings + tasks + deadlines | راجع `calendar.md` ✅ |
| Recent activity | last 24h من `audit_logs` | filtered per role | ✅ |
| Pending approvals (mine) | aggregate | راجع `governance/approvals.md` | ✅ |
| Posting failures (مرئية للـ COO) | filter | راجع `admin-posting-failures.md` | ✅ critical |
| Cash position summary | finance | راجع `cash-flow-forecast.md` | ✅ |
| Top opportunities | crm | راجع `crm-pipeline.md` | ✅ |
| Compliance status | governance | راجع `governance-compliance.md` | ✅ |
| Dismiss alert | PATCH `/intelligence/alerts/:id/dismiss` | with reason + audit | ⚠ |
| Snooze alert | PATCH `/intelligence/alerts/:id/snooze` | للـ 24h | ⚠ |
| Click-through to source | navigate | per alert source | ✅ |
| تكامل مع `notifications.md` (overlap) | intelligence يُجمّع، notifications يُسلّم | ✅ |
| تكامل مع `operations-center.md` (COO view) | مكمّل | ✅ |
| RBAC | exec/management level | level≥70 typical | ✅ |
| Audit log | كل dismiss/snooze | `audit_logs` | ✅ |

تحقق يدوي:
- [ ] هل dismiss alert يحفظ reason + يمنع تكرار التنبيه؟
- [ ] هل snooze ينتهي صحيحاً ويعيد الإظهار؟
- [ ] هل الـ schedule يأخذ timezone صاحب الحساب؟
- [ ] هل أي AI prediction (لو موجود) ينبني على بيانات tenant فقط (لا cross-tenant leak)؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `intelligence` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/intelligence`
- لقطة: `audit/screenshots/intelligence.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
