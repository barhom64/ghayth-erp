# /admin/event-monitor — `artifacts/ghayth-erp/src/pages/admin-event-monitor.tsx`

## 1. الميتاداتا
- المسار: `/admin/event-monitor`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/admin-event-monitor.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/adminRoutes.tsx:31`
- المجموعة: `admin`
- الكومبوننت: `AdminEventMonitor`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `event-monitor`
- سطور الملف: 149
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L49: "(بلا تسمية)" → `() => refetch()`

### القراءات (GET)
- GET `/admin/governance/event-catalog`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
Event Monitor — راصد الأحداث المركزي. كل حدث business يمر عبر `eventBus` ويُسجل هنا.

| الفئة | الأحداث | المصدر |
|------|---------|--------|
| Finance | invoice.created/paid, journal.posted, period.closed, fx.revalued, ... | finance/* |
| HR | employee.hired, leave.approved, payroll.run, violation.created | hr/* |
| Fleet | trip.completed, maintenance.due, license.expiring | fleet/* |
| Property | contract.signed, payment.received, maintenance.requested | properties/* |
| Workflow | approval.required, escalated, returned, completed | governance/workflows |
| RBAC | permission.changed, role.assigned | rbac-v2 |
| System | health.degraded, queue.backlogged, retry.exhausted | core |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| عرض stream الأحداث | GET `/admin/events?limit=100` | `event_logs` ORDER BY desc | ✅ |
| Filter per domain/severity/dateRange | client filters + server-side WHERE | ✅ |
| Drill-down للحدث (payload) | GET `/admin/events/:id` | `event_logs.payload` JSON | ✅ |
| Re-publish (للأحداث الفاشلة) | POST `/admin/events/:id/replay` | useful للتطبيق الـ DLQ | ⚠ تحقق |
| تصدير CSV (للـ audit/compliance) | `export.ts` | ✅ |
| Auto-archive (events > 1 year) | cron | يُحرّك لـ cold storage | ⚠ |
| تنبيهات للـ admin | event=`event_volume_anomaly` | `notifications` | ⚠ |
| تكامل ELK/Splunk | اختياري | ⚠ |

تحقق يدوي:
- [ ] هل event payload يحوي PII حساس — هل يُخفى/يُشفّر؟
- [ ] هل re-publish event غير-idempotent يطلق تحذيراً؟
- [ ] هل dead-letter queue (`event_dlq`) مرصودة + إشعار بالفشل؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `event-monitor` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/admin/event-monitor`
- لقطة: `audit/screenshots/admin_event_monitor.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
