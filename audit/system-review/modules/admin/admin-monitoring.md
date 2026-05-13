# /admin/monitoring — `artifacts/ghayth-erp/src/pages/admin-monitoring.tsx`

## 1. الميتاداتا
- المسار: `/admin/monitoring`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/admin-monitoring.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/adminRoutes.tsx:26`
- المجموعة: `admin`
- الكومبوننت: `AdminMonitoring`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `monitoring`
- سطور الملف: 321
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L90: "(بلا تسمية)" → `() => refetch()`

### القراءات (GET)
- GET `/admin/system-health`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
System Monitoring — صحة النظام في الزمن الحقيقي.

| المؤشر | المصدر | عتبة التنبيه |
|--------|--------|--------------|
| DB connection pool | `pool.totalCount`, `idleCount` | < 5 idle = warning |
| Query latency p95 | `pino-http` logs aggregate | > 500ms = warning |
| Error rate (5xx) | `event_logs.severity='error'` | > 1% = critical |
| Queue depth (jobs) | `cron_jobs.pending` | > 50 = warning |
| Memory usage | container metrics | > 80% = warning |
| Disk usage | `db.size` + object storage | > 90% = critical |
| Event bus throughput | `event_logs` per minute | sudden drop = warning |
| Active sessions | `sessions.activeCount` | abnormal spike = audit |
| Failed logins | `auth_failures` per IP | > 10/hour = lock IP |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| Aggregate metrics | `admin.ts` GET `/admin/monitoring` | aggregations | ✅ |
| Real-time refresh | client polls every 30s | ✅ |
| تنبيهات للـ admin | event=`system_health_alert` | `notifications` | ✅ critical |
| Auto-throttle عند الضغط | rate-limit dynamic | ⚠ |
| Audit log | core | read-only لا تُسجَّل | ✅ |
| تكامل DataDog/Prometheus | اختياري | ⚠ |

تحقق يدوي:
- [ ] هل تنبيهات critical تطلق SMS/email فوري؟
- [ ] هل التاريخ محفوظ للـ baseline comparison؟
- [ ] هل المستخدمون يُلاحظون التدهور قبل الـ admin؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `monitoring` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/admin/monitoring`
- لقطة: `audit/screenshots/admin_monitoring.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
