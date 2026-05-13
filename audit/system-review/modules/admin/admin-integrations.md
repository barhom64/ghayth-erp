# /admin/integrations — `artifacts/ghayth-erp/src/pages/admin-integrations.tsx`

## 1. الميتاداتا
- المسار: `/admin/integrations`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/admin-integrations.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/adminRoutes.tsx:25`
- المجموعة: `admin`
- الكومبوننت: `AdminIntegrations`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `integrations`
- سطور الملف: 311
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L126: "(بلا تسمية)" → `() => setShowForm(false)`

### القراءات (GET)
- GET `/admin/integrations`
- GET `/admin/integration-logs`



## 3. الحركات ذات الصلة (Cross-Module Transactions)

التكاملات الخارجية (External Integrations) — إدارة API keys + endpoints.

| التكامل | الوحدة | الحالة |
|---------|--------|--------|
| ZATCA Phase 2 | finance-zatca | ✅ موجود |
| GOSI | hr/gov-integrations | ⚠ |
| Mudad (WPS portal) | hr | ✅ موجود في `lib/saudi-compliance/mudad` |
| WPS (banks) | hr | ✅ `lib/saudi-compliance/wps` |
| Ejar (المرَكَز العقاري) | properties | ⚠ اختياري |
| Najz (المحاكم) | legal | ⚠ يدوي حالياً |
| Twilio / STC SMS | communications | ⚠ |
| Meta WhatsApp Cloud | communications | ⚠ |
| SendGrid/SMTP email | communications | ⚠ |
| STC Pay / mada | finance/payments | ⚠ بوابات دفع |
| Web push (VAPID) | communications | ⚠ |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| إعداد integration جديد | admin | POST `/admin/integrations` | `integrations` | ✅ |
| API keys + secrets | admin | encrypted storage (`__configured__` sentinel) | ✅ راجع `settings-communication-channels` |
| Test connection | admin | POST `/admin/integrations/:id/test` | ⚠ تحقق |
| Enable/disable | admin | PATCH `/admin/integrations/:id` | `integrations.enabled` | ✅ |
| Logs (per integration) | admin | `integration_logs` | لـ debugging | ✅ |
| Rate limit per integration | rate-limit | per provider quota | ⚠ |
| Webhook receivers | admin | `webhook_endpoints` (incoming) | ⚠ تحقق |
| إشعار عند failure metric breach | comms | event=`integration_error_rate_high` | `notifications` | ✅ critical |
| Audit log إجباري | كل تعديل في key/secret | `audit_logs` | ✅ critical |
| Rotation of secrets | راجع `docs/SECRETS_ROTATION.md` | scheduled | ✅ |

تحقق يدوي:
- [ ] هل secrets في DB مشفّرة فعلاً (vs plain text)?
- [ ] هل cycle rotation للـ secrets كل 90 يوم تلقائي؟
- [ ] هل integration معطّل يخفي إعداداته من users غير admin؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `integrations` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/admin/integrations`
- لقطة: `audit/screenshots/admin_integrations.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
