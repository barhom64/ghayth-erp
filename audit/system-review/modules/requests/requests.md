# /requests — `artifacts/ghayth-erp/src/pages/requests-page.tsx`

## 1. الميتاداتا
- المسار: `/requests`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/requests-page.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/requestsRoutes.tsx:9`
- المجموعة: `requests`
- الكومبوننت: `RequestsPage`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `requests`
- سطور الملف: 708
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L135: "(بلا تسمية)"
- L479: "(بلا تسمية)" → `() => { setFilterStatus(""); setFilterType(""); setFilterDateFrom(""); setFilter`
- L498: "(بلا تسمية)" → `() => setShowForm(false)`
- L573: "(بلا تسمية)" → `() => setShowForm(false)`
- L633: "(بلا تسمية)" → `() => setShowForm(false)`

### القراءات (GET)
- GET `/requests/catalog`
- GET `/requests`
- GET `/requests/types`
- GET `/requests/workflows`
- GET `/requests/stats`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
نظام الطلبات العام (request catalog) — مظلّة موحّدة لكل أنواع الطلبات.

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| تقديم طلب من المستخدم | requests | `requests.ts` POST `/requests` | `requests`, `request_payloads` | ✅ |
| التحقق من type → workflow_id المرتبط | governance/workflows | `request_types.workflowId` يحدّد سير الموافقة | `request_types`, `approval_chains` | ✅ |
| تنفيذ workflow (موافقة/رفض/تصعيد) | governance | `approvalActions.ts` POST `/approval-actions/...` | `approval_chain_steps`, `approval_actions_log` | ✅ |
| تأثير الكيان النهائي (leave/loan/expense...) | متغيّر | عند الاعتماد، يدخل في الجدول الهدف (مثلاً `expenses`) | يربط بـ `request.linkedEntityId` | ✅ |
| تتبّع SLA + escalation تلقائي | requests | cron يقرأ `requests.dueAt` + يطلق escalation | `notifications` | ✅ |
| إشعارات لكل خطوة | comms | event=`approval_required\|approved\|rejected\|escalated\|returned` | `notifications` (actionUrl=`/requests/:id`) | ✅ راجع `docs/action-url-registry.md` |
| تكامل مع my-space + manager-board | bi | aggregation طلباتي + طلبات تخصني | views | ✅ |
| Audit log | core | `auditMiddleware` (`/requests`) | `audit_logs` (entity=`request`) | ✅ |

تحقق يدوي:
- [ ] هل سحب الطلب (cancel) بعد بداية الـ workflow يلغي كل الخطوات؟
- [ ] هل عند تجاوز SLA يتغيّر الأولوية أو يقفز للمدير الأعلى تلقائياً؟
- [ ] هل تعديل الـ workflow definition بعد طلب open يؤثر على الطلب المفتوح أم لا؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `requests` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/requests`
- لقطة: `audit/screenshots/requests.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
