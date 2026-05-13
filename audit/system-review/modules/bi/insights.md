# /insights — `artifacts/ghayth-erp/src/pages/insights.tsx`

## 1. الميتاداتا
- المسار: `/insights`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/insights.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:120`
- المجموعة: `bi`
- الكومبوننت: `Insights`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `insights`
- سطور الملف: 510
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L490: "(بلا تسمية)"

### القراءات (GET)
- GET `/intelligence/insights-summary`
- GET `/intelligence/recommendations`



## 3. الحركات ذات الصلة (Cross-Module Transactions)

Insights — AI-powered insights + recommendations + anomaly detection.

| النوع | المثال |
|------|--------|
| Anomaly detection | sudden drop in sales / spike in expenses |
| Predictive | likely churn customers, cash shortage in 30 days |
| Pattern recognition | seasonal trends, repeated complaints |
| Recommendations | best time to send promotions, optimal inventory levels |
| Benchmarks | comparison vs industry standards (إن متاح) |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| تجميع insights من المصادر | `intelligence.ts` GET `/intelligence/insights` | aggregations + ML | ✅ |
| Subscribe (للموظف) | per-user preferences | `user_insight_subscriptions` | ⚠ |
| Action على insight (dismiss/snooze/escalate) | POST `/insights/:id/action` | ⚠ |
| Linked to events (auto-generated) | event listeners | راجع `lib/eventListeners.ts` | ✅ |
| Severity (info/warning/critical) | priority sorting | ✅ |
| RBAC على insights المالية | CFO/MD only | ✅ |
| Export | للـ review meetings | ✅ |
| Audit log | core | لـ tracking acted-upon vs dismissed | ⚠ |
| تأثير على exec dashboard | راجع `misc/exec-dashboard.md` | ✅ |

تحقق يدوي:
- [ ] هل ML predictions موضّحة (explainable AI)?
- [ ] هل insight متكرر بدون action يطلق escalation للمدير؟
- [ ] هل false-positive rate مرصود لتحسين النموذج؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `insights` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/insights`
- لقطة: `audit/screenshots/insights.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
