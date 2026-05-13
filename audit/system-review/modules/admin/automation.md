# /automation — `artifacts/ghayth-erp/src/pages/automation.tsx`

## 1. الميتاداتا
- المسار: `/automation`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/automation.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:121`
- المجموعة: `admin`
- الكومبوننت: `Automation`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `automation`
- سطور الملف: 294
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/automation/notification-stats`
- GET `/automation/proactive-rules`
- GET `/automation/automation-stats`



## 3. الحركات ذات الصلة (Cross-Module Transactions)

محرّك الأتمتة — قواعد proactive لتشغيل أحداث تلقائية حسب triggers.

| نوع القاعدة | المثال |
|------------|--------|
| Time-based (cron) | "كل يوم 23:00 → run daily-close" |
| Event-based | "عند فاتورة > 10000 → notify CFO" |
| Threshold-based | "إذا cash < X → alert finance manager" |
| Condition-based | "if invoice overdue 30+ days → escalate to collection" |
| Lifecycle-based | "عند PO approved → auto-send to supplier" |
| Compliance-based | "if attendance gap > X → flag HR" |
| Maintenance-based | "if vehicle km > service threshold → schedule" |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| List rules | GET `/automation/proactive-rules` | `automation_rules` | ✅ |
| Stats | GET `/automation/automation-stats` | run count + success rate | ✅ |
| Create rule | POST `/automation/rules` | with conditions + actions | ✅ |
| Update | PATCH | ✅ |
| Enable/Disable | toggle | `isActive` | ✅ |
| Test (dry-run) | POST `/automation/rules/:id/test` | لا يطبّق فعلياً | ⚠ |
| Manual trigger | POST `/automation/rules/:id/trigger` | force run | ⚠ |
| Execution log | GET `/automation/executions` | `automation_executions` | ✅ |
| Failed executions retry | manual or auto-retry | ⚠ |
| Conditions DSL validator | server-side | لمنع invalid rules | ✅ critical |
| Action types: notification | راجع `notifications.md` | ✅ |
| Action types: webhook | راجع `comms-notification-engine.md` | ✅ |
| Action types: create entity | POST to other endpoint | ⚠ |
| Action types: assign task | راجع `tasks.md` | ✅ |
| Action types: send email/SMS | راجع `notifications.md` | ✅ |
| Rate limit (per rule per minute) | لمنع spam | ✅ critical |
| تكامل مع `admin-event-monitor.md` (event source) | ✅ |
| تكامل مع `eventCatalog.ts` (للـ event-based rules) | ✅ |
| تكامل مع `admin-monitoring.md` (cron jobs) | راجع `cron_jobs` | ✅ |
| Audit log إجباري | كل تنفيذ | `audit_logs` + `automation_executions` | ✅ critical |
| RBAC | admin فقط للـ create/update | ✅ critical |

تحقق يدوي:
- [ ] هل rule loop / cycle detection شغّال (لمنع infinite loops)؟
- [ ] هل dry-run يحاكي بدون أي side effect؟
- [ ] هل rate limit per rule per user per minute صحيح؟
- [ ] هل failed executions تطلق alert للـ admin؟
- [ ] هل تعديل rule في الإنتاج له staging period (preview قبل enable)؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `automation` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/automation`
- لقطة: `audit/screenshots/automation.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
