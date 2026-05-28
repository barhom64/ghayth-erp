# تكامل الأسطول مع CMSV6 / AI MDVR / Sensors

> المرجع: [Issue #1354](https://github.com/barhom64/ghayth-erp/issues/1354)
> فرع التطوير: `claude/fleet-telematics-cmsv6-SJgea`

## نظرة عامة

هذه المرحلة الأولى (Pilot) لتفعيل تكامل غيث مع منصة CMSV6 الخاصة بأجهزة
AI MDVR من مورّد Eastyle (موديل ES-M518AW-AI 8CH 1080P). الهدف هو
استقبال:

* GPS وآخر موقع وتاريخ حركي.
* أحداث الجهاز (online/offline، قسوة الفرملة، إخراج SD، …).
* تنبيهات الذكاء الصناعي للسلامة:
  * **ADAS** — اصطدام أمامي، خروج عن المسار، مسافة قصيرة، مشاة.
  * **DMS** — نعاس، تشتت، هاتف، تدخين.
  * **BSD** — النقطة العمياء.
* قراءات الحساسات التشغيلية لقلابات الإسفلت:
  * **Fuel level** / **Weight** / **Air pressure** / **PTO**
  * **Dump piston** / **Door** / **Engine RPM** / **Battery voltage**
  * **Odometer** / **Temperature** / حساسات مخصّصة.
* بث مباشر **عند الطلب فقط** عبر روابط RTSP / HLS.
* أدلة إعلامية (صور/فيديو) مرفقة بالتنبيهات.

## مبدأ التصميم — Leader Path

* **غيث = Leader Path**: كل قرار وتقرير وتدقيق يعيش داخل غيث.
* **CMSV6 = Service Provider**: مصدر يقرأ منه غيث ويُطَبِّعُ ما يصله.
* CMSV6 لا تكتب مباشرة في جداول الأسطول. كل مسار كتابة يمر عبر
  `routes/fleet-telematics.ts` تحت RBAC وتدقيق `audit_logs`.
* الموفِّر قابل للاستبدال — الواجهة `CMSV6Adapter` تنتظم خلف خمسة
  أنواع موحدة (`NormalizedPosition`, `NormalizedEvent`,
  `NormalizedAlert`, `NormalizedSensorReading`, `RemoteDevice`).
  استبدال الموفِّر = إضافة ملف Adapter جديد + سطر في
  `fleet_telematics_integrations.provider`.

## مكوّنات المنظومة

### 1) قاعدة البيانات — Migration 228

`artifacts/api-server/src/migrations/228_fleet_telematics.sql` ينشئ
عشرة جداول:

| الجدول | الوصف |
|---|---|
| `fleet_telematics_integrations` | إعدادات CMSV6 لكل شركة + حالة آخر مزامنة. |
| `fleet_telematics_devices` | سجل أجهزة MDVR/GPS وربطها بالمركبات. |
| `fleet_device_positions` | مواقع GPS الحيّة والتاريخية. |
| `fleet_device_events` | أحداث الجهاز (online/offline، harsh، …). |
| `fleet_sensor_readings` | قراءات الحساسات (وقود، وزن، PTO، …). |
| `fleet_video_channels` | كتالوج كاميرات الجهاز. |
| `fleet_video_sessions` | جلسات البث المباشر (Audit + RBAC). |
| `fleet_ai_alerts` | تنبيهات ADAS / DMS / BSD. |
| `fleet_media_evidence` | صور/فيديو أدلة مرفقة بالتنبيهات. |
| `fleet_device_sync_logs` | سجل كل عملية مزامنة مع CMSV6. |

كل الجداول التابعة للمستأجر تحمل `companyId` و`branchId`. الـ
idempotency محقّق بفهارس فريدة جزئية:

* `uq_fleet_device_events_dedup (deviceId, externalEventId)`
* `uq_fleet_ai_alerts_dedup (deviceId, externalAlertId)`
* `uq_fleet_sensor_readings_dedup (deviceId, externalReadingId)`

أي إعادة بث من CMSV6 لنفس `externalId` تُهمَل بفضل
`ON CONFLICT DO NOTHING`.

### 2) خدمة CMSV6 Adapter

`artifacts/api-server/src/lib/integrations/cmsv6Adapter.ts`

* `createCmsv6Adapter(cfg)` يعيد `CMSV6Adapter`.
* `__setCmsv6AdapterFactory(fn)` لاستبدال المصنع في الاختبارات.
* `validateCmsv6BaseUrl(url)` — حارس SSRF و loopback (يرفض RFC1918،
  169.254/16، localhost، DNS rebinding).
* الجلسة (`x-session-id`) مُخزَّنة داخل الـAdapter مع TTL افتراضي
  30 دقيقة وتجديد تلقائي.
* `normalizeWebhookEnvelope(raw)` دالة pure تستخدمها مسارات webhook
  لتحويل payload CMSV6 إلى صفوف غيث الموحّدة.

### 3) مسارات API

تُرَكَّب كلّها تحت `/api/fleet/telematics/*` مع `requireModule("fleet")`
و`fleetUserLimiter` و`requireGuards("financial")`.

| المسار | الصلاحية | الوصف |
|---|---|---|
| `GET /telematics/devices` | `fleet.telematics.devices:list` | قائمة أجهزة MDVR. |
| `POST /telematics/devices/link` | `fleet.telematics.devices:create` | ربط جهاز بمركبة. |
| `GET /telematics/integrations` | `fleet.telematics.configure:list` | قائمة التكاملات (مع إخفاء الأسرار). |
| `POST /telematics/integrations` | `fleet.telematics.configure:create` | إنشاء تكامل CMSV6 جديد. |
| `PATCH /telematics/integrations/:id` | `fleet.telematics.configure:update` | تعديل التكامل. |
| `POST /telematics/integrations/:id/test` | `fleet.telematics.configure:update` | اختبار اتصال (login). |
| `GET /telematics/live` | `fleet.telematics.live:list` | الخريطة المباشرة. |
| `GET /telematics/vehicles/:id/position` | `fleet.telematics.live:view` | آخر موقع لمركبة. |
| `GET /telematics/vehicles/:id/live` | `fleet.telematics.live:view` | حزمة Live View (موقع + حساسات + تنبيهات + قنوات). |
| `GET /telematics/vehicles/:id/events` | `fleet.telematics.ai_alerts:list` | أحداث المركبة. |
| `GET /telematics/vehicles/:id/sensors` | `fleet.telematics.sensors:list` | قراءات الحساسات. |
| `GET /telematics/vehicles/:id/ai-alerts` | `fleet.telematics.ai_alerts:list` | تنبيهات السلامة. |
| `GET /telematics/ai-alerts` | `fleet.telematics.ai_alerts:list` | كل التنبيهات (مع تصفية). |
| `POST /telematics/ai-alerts/:id/acknowledge` | `fleet.telematics.ai_alerts:update` | معاينة تنبيه. |
| `POST /telematics/ai-alerts/:id/resolve` | `fleet.telematics.ai_alerts:update` | إغلاق تنبيه. |
| `POST /telematics/sync/positions` | `fleet.telematics.sync:create` | مزامنة المواقع من CMSV6. |
| `POST /telematics/sync/events` | `fleet.telematics.sync:create` | مزامنة الأحداث + التنبيهات + الحساسات. |
| `POST /telematics/webhook/cmsv6` | `fleet.telematics.sync:create` | استقبال webhook من CMSV6. |
| `POST /telematics/video/session` | `fleet.telematics.video:create` | فتح جلسة بث على قناة. |
| `POST /telematics/video/session/:id/stop` | `fleet.telematics.video:delete` | إغلاق جلسة بث. |
| `GET /telematics/video/sessions` | `fleet.telematics.video:list` | سجل جلسات البث. |
| `GET /telematics/sync-logs` | `fleet.telematics.sync:list` | سجل عمليات المزامنة. |

### 4) كتالوج الأحداث

أُضيفت 14 حدثًا إلى `eventCatalog.ts`:

```
fleet.telematics.position.updated
fleet.telematics.device.online
fleet.telematics.device.offline
fleet.telematics.ai.dms_alert       ← critical
fleet.telematics.ai.adas_alert      ← critical
fleet.telematics.ai.bsd_alert
fleet.telematics.sensor.fuel_changed
fleet.telematics.sensor.weight_changed
fleet.telematics.sensor.pto_on
fleet.telematics.sensor.pto_off
fleet.telematics.sensor.dump_piston_up
fleet.telematics.sensor.dump_piston_down
fleet.telematics.video.session_started
fleet.telematics.video.session_stopped
```

كل حدث يحمل: `companyId/branchId/userId/entity/entityId/details/after`،
ويُكتب في `event_logs` تلقائيًا للأحداث الحرجة.

### 5) RBAC

أُضيفت إلى `featureCatalog.ts`:

```
fleet.telematics
fleet.telematics.devices
fleet.telematics.live
fleet.telematics.sync
fleet.telematics.configure   (sensitiveFields: account, password, apiKey)
fleet.telematics.video
fleet.telematics.sensors
fleet.telematics.ai_alerts
```

### 6) واجهات المستخدم — RTL Arabic

تحت `/fleet/telematics/*` مع `FleetTelematicsTabsNav`:

* `/fleet/telematics/live-map` — الخريطة المباشرة (الافتراضية).
* `/fleet/telematics/ai-alerts` — تنبيهات ADAS / DMS / BSD مع تصفية
  وزر معاينة/حل.
* `/fleet/telematics/sensors` — لوحة قراءات الحساسات لكل مركبة.
* `/fleet/telematics/devices` — ربط أجهزة MDVR بالمركبات.
* `/fleet/telematics/video-evidence` — جلسات البث المباشر + الأدلة.
* `/fleet/telematics/settings` — إعدادات CMSV6 (CRUD + Test).

## سياسة التشغيل (#1354 §7)

* **GPS / Events / Sensors**: مستمر، يُجَمَّع كل `pollIntervalSec` ثانية
  أو يُستقبل عبر webhook.
* **الفيديو**: عند الطلب فقط — `fleet_video_sessions` تسجِّل من فتح
  أي جلسة، ولماذا، ومتى انتهت. الأرشيف الكامل يبقى على SSD داخل
  المركبة (لا يُرفع تلقائيًا).
* **الأدلة (Media Evidence)**: تُرفع تلقائيًا فقط عند تنبيه AI يحمل
  `imageUrl` / `videoUrl`، أو بطلب يدوي.
* **انقطاع CMSV6**: لا يكسر الأسطول. آخر معروف يبقى قابلًا للقراءة من
  DB، والـ `last_sync_*` في جدول التكامل يُظهر آخر فشل.
* **انقطاع الإنترنت في المركبة**: الـ MDVR يحتفظ بكل شيء على SSD
  داخل العربة (سعة افتراضية 500GB → موصى به 1TB). عند العودة يتم
  buffering من جانب CMSV6 ثم يصلنا عبر webhook/poll.

## اختبارات Pilot

### حد الأدنى للقبول (Pilot)

- [ ] ربط جهاز MDVR واحد بمركبة من شاشة الأجهزة.
- [ ] استقبال GPS مباشر — تظهر الإحداثيات في `/fleet/telematics/live-map`.
- [ ] فتح بث مباشر لقناة واحدة (HLS) من شاشة الأدلة.
- [ ] استقبال تنبيه ADAS أو DMS مع `imageUrl` — يظهر في صفحة تنبيهات
      السلامة، والصورة قابلة للفتح.
- [ ] تسجيل حدث PTO أو Dump piston (state up/down).
- [ ] تسجيل قراءة Fuel أو Weight sensor.
- [ ] التأكد من أن `rawPayload` و`normalizedPayload` محفوظان في DB.
- [ ] التأكد من ظهور `audit_logs` و`event_logs` للأحداث الحرجة.
- [ ] التأكد من ظهور سطر في `fleet_device_sync_logs` لكل عملية.

### جاهزية الإنتاج (20 مركبة)

- [ ] حملة فحص: دفع 10 ألاف رسالة CMSV6 وقياس عدد ال idempotency hits
      (المتوقع أن تكون nonzero عند تكرار webhook).
- [ ] محاكاة سقوط CMSV6 ساعة كاملة → النظام الأساسي (`/fleet/*`)
      يستمر بدون أخطاء، التنبيهات تتأخر فقط.
- [ ] محاكاة قطع 3G لمدة ساعتين على مركبة واحدة → عند العودة، التاريخ
      يُستكمل بدون فجوات في `fleet_device_positions`.
- [ ] لاwhitelist user `viewer` يحاول `POST /telematics/video/session`
      ويُرفض بـ 403.
- [ ] كل عمليات `sync_positions` تُسجَّل في `fleet_device_sync_logs`.

## متطلبات الشراء (ملاحظة)

عرض Eastyle الأصلي يغطي 20 kit MDVR + كاميرات + شاشة + SSD 500GB
بـ USD 14,125 شامل الشحن والرسوم البنكية. **لا يشمل** الحساسات
التشغيلية. قبل اعتماد الطلبية يجب طلب Quotation محدث يتضمن كل عنصر
كبند مستقل:

* Fuel level sensor — متوافق مع خزان ديزل الشاحنة.
* Load / weight sensor — متوافق مع قلابات الإسفلت.
* PTO + Dump piston sensor kit.
* Air pressure sensor (إن أمكن).
* Door / dump bed open-close sensor.
* CANBUS / J1939 adapter (اختياري).
* High-gain 4G antenna.
* خيار **1TB SSD** بدل 500GB.
* خيار **شاشة 10 إنش** بدل 7 إنش.

## كيف يعمل (شرح للمشغل)

1. المشغل يفتح **/fleet/telematics/settings** ويُنشئ تكامل CMSV6
   (baseUrl + account + password + apiKey إن وجد). يستخدم زر **اختبار**
   للتحقق.
2. CMSV6 لديها قائمة الأجهزة (`devIdno`). من **/fleet/telematics/devices**
   يُربط كل جهاز بمركبة في غيث.
3. من خلال **/fleet/telematics/live-map** المشغل يرى كل المركبات
   المتصلة. زر *مزامنة CMSV6* يبدأ poll يدوي.
4. عند تنبيه AI، تظهر سطر في **/fleet/telematics/ai-alerts** مع صورة
   مرفقة. المشغل يضغط *معاينة* ثم *حل*.
5. لفتح كاميرا مركبة معينة: من تفاصيل المركبة → *فتح بث* → يُكتب صف
   في `fleet_video_sessions` ويُسجَّل في الـAudit.

## Hardening (Engineering review — مكتمل)

تمت معالجة جميع نقاط Critical / High التي رصدها الـ engineering review:

| القلق | الحالة | المرجع |
|---|---|---|
| Credentials في JSONB plain-text | ✅ مُغلق | migration 229 + `encryptSecret/decryptSecret` |
| Webhook بدون HMAC | ✅ مُغلق | `/api/webhooks/cmsv6/:id` + HMAC + replay window |
| Video `externalSessionId` غير محفوظ | ✅ مُغلق | migration 229 |
| rawPayload بدون حد حجم | ✅ مُغلق | migration 229 CHECK ≤ 64KB |
| لا retention policy | ✅ مُغلق | migration 230 + `fleet_telematics_retention` يومي 03:00 |
| لا passive offline heartbeat | ✅ مُغلق | `fleet_telematics_heartbeat` كل دقيقتين |
| fuel/weight events بدون delta | ✅ مُغلق | fuel ≥ 5L، weight ≥ 200kg |
| Position events غير throttled | ✅ مُغلق | حد 1 حدث/جهاز/دقيقة |
| لا cron poller | ✅ مُغلق | `fleet_telematics_poll` كل دقيقة |
| لا retry/backoff + circuit breaker | ✅ مُغلق | `executeWithRetry` + `CircuitBreaker` |

### Webhook Signing — تعليمات للموفِّر

العنوان: `POST https://erp.example.com/api/webhooks/cmsv6/{integrationId}`

الرؤوس المطلوبة:

```
x-cmsv6-timestamp: <unix ms>
x-cmsv6-signature: sha256=<hex digest>
```

كيف يُحسب التوقيع:

```
digest = HMAC_SHA256(secret, timestamp + "." + raw_body)
signature = "sha256=" + hex(digest)
```

* النافذة الزمنية: ±5 دقائق.
* المقارنة timing-safe.
* الطلبات بدون توقيع، أو بتوقيع خاطئ، أو بـ timestamp قديم تُرفض بـ 401.

## Known Limitations (المتبقية بعد Hardening)

1. **Stream URLs unsigned passthrough**: عنوان البث من CMSV6 يصل للـ
   client كما هو. يفترض أن CMSV6 تعطي URLs تنتهي صلاحيتها.
2. **CircuitBreaker per-process**: في multi-replica، كل replica
   تحتفظ بـ state خاص. مقبول لـ ≤ 20 تكامل.
3. **رفع الأدلة auto-only من URL alert**: لا يوجد آلية pull للملفات
   من MDVR SSD مباشرة (يفترض CMSV6 ترفعها).

## ملفات المرجع

* `artifacts/api-server/src/migrations/228_fleet_telematics.sql`
* `artifacts/api-server/src/migrations/229_fleet_telematics_security.sql`
* `artifacts/api-server/src/migrations/230_fleet_telematics_retention.sql`
* `artifacts/api-server/src/lib/integrations/cmsv6Adapter.ts`
* `artifacts/api-server/src/lib/fleet/telematicsCron.ts`
* `artifacts/api-server/src/lib/fleet/telematicsReliability.ts`
* `artifacts/api-server/src/routes/fleet-telematics.ts`
* `artifacts/api-server/src/routes/fleet-telematics-webhook.ts`
* `artifacts/api-server/src/lib/eventCatalog.ts` (الإضافات)
* `artifacts/api-server/src/lib/rbac/featureCatalog.ts` (الإضافات)
* `artifacts/api-server/tests/unit/cmsv6AdapterSmoke.test.ts`
* `artifacts/api-server/tests/unit/cmsv6WebhookHmacSmoke.test.ts`
* `artifacts/api-server/tests/unit/telematicsHardeningSmoke.test.ts`
* `artifacts/api-server/tests/unit/telematicsReliabilitySmoke.test.ts`
* `artifacts/ghayth-erp/src/pages/fleet/telematics/`
* `artifacts/ghayth-erp/src/components/shared/fleet-telematics-tabs-nav.tsx`
* `artifacts/ghayth-erp/src/routes/fleetRoutes.tsx` (الإضافات)
