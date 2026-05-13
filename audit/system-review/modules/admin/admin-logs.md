# /admin/logs — `artifacts/ghayth-erp/src/pages/admin/logs.tsx`

## 1. الميتاداتا
- المسار: `/admin/logs`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/admin/logs.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/adminRoutes.tsx:24`
- المجموعة: `admin`
- الكومبوننت: `AdminLogs`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `logs`
- سطور الملف: 273
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L176: "(بلا تسمية)" → `() => refetch()`

### القراءات (GET)
- GET `/audit-logs/entities`



## 3. الحركات ذات الصلة (Cross-Module Transactions)

Admin Logs — مركزي للسجلات (audit + events + activity).

| النوع | المصدر | الوصف |
|------|--------|------|
| Audit logs | `audit_logs` | كل تغيير DB (via `auditMiddleware`) |
| Event logs | `event_logs` | business events |
| Activity logs | `activity_log` | clicks + navigation |
| HTTP access logs | `pino-http` | كل request |
| Error logs | `pino-http` | exceptions + 5xx |
| Auth failures | `auth_failures` | brute force protection |
| Posting failures | راجع `admin-posting-failures.md` | finance |
| CRON logs | `cron_logs` | scheduled task results |
| Integration logs | `integration_logs` | راجع `admin-integrations.md` |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| Unified search | `auditLogs.ts` GET `/admin/logs` | aggregations + filters | ✅ |
| Drill-down per entry | full payload | ✅ |
| Export CSV (for forensics) | `export.ts` | ✅ |
| Retention policy | older than X year → cold storage | ⚠ |
| PDPL: data subject access | filter per user | ⚠ |
| Anomaly detection | راجع `admin-violations-report.md` | ✅ |
| إشعار للـ admin عند spike | event=`log_anomaly` | ⚠ |
| Append-only enforced | لا UPDATE/DELETE على audit_logs | guard | ✅ critical |

تحقق يدوي:
- [ ] هل audit_logs append-only فعلاً (DB-level constraint)?
- [ ] هل البحث عن logs قديمة (>90 يوم) يفعّل cold storage retrieval؟
- [ ] هل PII في logs محصور بـ RBAC level 90+?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `logs` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/admin/logs`
- لقطة: `audit/screenshots/admin_logs.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
