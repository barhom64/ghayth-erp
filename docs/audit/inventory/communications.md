# جرد المسار — الاتصالات الإدارية (Communications)

جرد ثابت مستقل لمسار الاتصالات الإدارية في نظام غيث ERP: يغطي قنوات الاتصال (WhatsApp / SMS / Email / PBX / Push)، المراسلات الرسمية الصادرة/الواردة (correspondence)، ومحرك الإشعارات (notification-engine) ومركز الإشعارات (notifications). الفحص اعتمد على القراءة الثابتة للكود فقط — لم يُشغَّل النظام. الجداول والـ endpoints والدوال بالإنجليزية كما في الكود. مصادر الفحص: `artifacts/api-server/src/routes/{communications,correspondence,notification-engine,notifications}.ts` + `lib/{notificationEngine,notificationService}.ts` + صفحات الواجهة + `db/schema_pre.sql` + المهاجرات 069/072/090/132/151.

ملاحظة تركيبية: المسارات الأربعة مُركّبة في `routes/index.ts` كالآتي — `/communications` و`/correspondence` تحت `requireModule("comms")` (السطور 326، 371)، بينما `/notification-engine` تحت `requireModule("notifications")` (السطر 363)، و`/notifications` بـ **auth فقط بلا requireModule** (السطر 312). أي أن المسار يقع فعليًا على وحدتي صلاحيات منفصلتين (`comms` و`notifications`) وليس وحدة واحدة.

---

## جدول 1 — الصفحات (Pages)

| المعرّف | route | الملف | الحالة | APIs المستدعاة | عيب رئيسي |
|---|---|---|---|---|---|
| P1 | `/communications` | `pages/communications.tsx` | ناقص | `GET /communications/stats`، `GET /communications/queue-stats`، `GET /communications/log`، `GET /communications/whatsapp`، `GET /communications/sms`، `GET /communications/pbx`، (+ push عبر hook) | صفحة عرض فقط؛ لا واجهة لإرسال رسالة رغم وجود `POST /communications/send`، ولا تعديل/حذف سجل رغم وجود `PATCH/DELETE /log/:id` (COM-001) |
| P2 | `/communications/notification-engine` | `pages/notification-engine.tsx` | ناقص | `GET/PUT routing-rules`، `GET/POST/PUT/DELETE templates`، `GET/POST/DELETE fallback-chains`، `GET/POST/PUT/DELETE webhooks`، `GET delivery-stats`، `GET delivery-log`، `GET/PUT preferences` | تبويب «التوجيه» لا يوفّر إنشاء/حذف قاعدة توجيه رغم وجود `POST/DELETE /routing-rules` (COM-002) |
| P3 | `/communications/letters/create` | `pages/create/communications/letters-create.tsx` | مكسور | `GET /clients`، `GET /employees`، `GET /projects`، `POST /communications/send` | يرسل `channel:"letter"` المرفوض من المُخطّط الخلفي؛ يتجاهل query params (relatedType/relatedId/subject) القادمة من صفحات أخرى؛ `backPath="/letters"` مسار ميت (COM-003، COM-004) |
| P4 | `/correspondence` | `pages/comms/correspondence.tsx` | شغّال | `GET /correspondence`، `GET /correspondence/stats/summary`، `POST /correspondence/:id/send`، `POST /correspondence/:id/respond` | زر «رد» يُنشئ ردًّا فارغًا بلا نموذج إدخال — يعتمد على القيم الافتراضية الخلفية فقط (COM-005) |
| P5 | `/correspondence/create` | `pages/create/comms/correspondence-create.tsx` | شغّال | `POST /correspondence` | الواجهة تُلزِم `senderName`/`recipientName`/`content` بينما الـ schema يجعلها اختيارية — تشدّد لا تطابق فعلي (انظر جدول 4) |
| P6 | `/correspondence/:id` | `pages/details/correspondence-detail.tsx` | ناقص | `GET /correspondence/:id` | زر «تعديل» يوجّه إلى `/correspondence/:id/edit` غير المُسجَّل في الراوتر، وصلاحيته `comms:update` لا تطابق مفتاح الميزة `communications` (COM-006، COM-007) |
| P7 | `/notifications` | `pages/notifications.tsx` | شغّال | `GET /notifications`، `PATCH /notifications/:id/read` | لا يستعمل تصفّح cursor/page المتاح خلفيًا؛ لا زر «تعليم الكل كمقروء» رغم وجود `PATCH /mark-all-read` (COM-008) |

---

## جدول 2 — الأزرار والإجراءات (Actions)

| الصفحة الأم | اسم الزر | الإجراء المتوقّع | API المستهدف | الحالة | نوع العيب |
|---|---|---|---|---|---|
| P1 communications | تحديث (MonitorTab) | إعادة جلب `queue-stats` | `GET /communications/queue-stats` | شغّال | — |
| P1 communications | تفعيل الإشعارات | اشتراك Push | `POST /communications/push/subscribe` | شغّال | — |
| P1 communications | إرسال تجريبي | إشعار Push تجريبي | `POST /communications/push/test` | شغّال | — |
| P1 communications | إلغاء الاشتراك | حذف اشتراك Push | `DELETE /communications/push/unsubscribe` | شغّال | — |
| P1 communications | تحويل (ConvertCommButton) | تحويل سجل اتصال إلى مهمة/تذكرة/طلب | `POST /communications/log/:id/convert` | شغّال | — |
| P1 communications | — (مفقود) | إرسال رسالة جديدة | `POST /communications/send` | مكسور | dead |
| P1 communications | — (مفقود) | تعديل/حذف سجل اتصال | `PATCH /DELETE /communications/log/:id` | مكسور | dead |
| P2 notif-engine | تعديل (RoutingRulesTab) | تحديث قواعد التوجيه | `PUT /notification-engine/routing-rules/:id` | شغّال | — |
| P2 notif-engine | — (مفقود) | إنشاء/حذف قاعدة توجيه | `POST /DELETE /routing-rules` | مكسور | dead |
| P2 notif-engine | قالب جديد / تعديل / حذف | إدارة القوالب | `POST/PUT/DELETE /templates` | شغّال | — |
| P2 notif-engine | سلسلة جديدة / حذف | إدارة سلاسل التصعيد | `POST/DELETE /fallback-chains` | ناقص | dead |
| P2 notif-engine | — (مفقود) | تعديل سلسلة تصعيد | `PUT /fallback-chains/:id` | مكسور | dead |
| P2 notif-engine | خطاف جديد / حذف / تبديل | إدارة الويب-هوكس | `POST/DELETE/PUT /webhooks` | شغّال | — |
| P2 notif-engine | حفظ التفضيلات | حفظ تفضيلات القنوات | `PUT /notification-engine/preferences` | شغّال | — |
| P3 letters-create | إنشاء | إرسال خطاب | `POST /communications/send` | مكسور | mismatch |
| P3 letters-create | إلغاء | العودة | `/communications` (التنقّل) | شغّال | — |
| P4 correspondence | مراسلة جديدة | فتح نموذج إنشاء | `/correspondence/create` | شغّال | — |
| P4 correspondence | إرسال | إرسال المراسلة | `POST /correspondence/:id/send` | شغّال | — |
| P4 correspondence | رد | إنشاء مراسلة رد | `POST /correspondence/:id/respond` | ناقص | dead |
| P4 correspondence | عرض التفاصيل | الانتقال للتفاصيل | `/correspondence/:id` | شغّال | — |
| P5 correspondence-create | إنشاء | إنشاء مراسلة | `POST /correspondence` | شغّال | — |
| P6 correspondence-detail | تعديل | فتح صفحة التعديل | `/correspondence/:id/edit` (مسار ميت) | مكسور | dead |
| P6 correspondence-detail | طباعة (EntityPrintButton) | توليد PDF | `entityType: official_letter` | غير قابل للتحقق | mismatch |
| P7 notifications | تحديد كمقروء | تعليم إشعار مقروءًا | `PATCH /notifications/:id/read` | شغّال | — |
| P7 notifications | — (مفقود) | تعليم الكل كمقروء | `PATCH /notifications/mark-all-read` | مكسور | dead |

---

## جدول 3 — APIs

| Endpoint | Method | الـ handler | الـ schema | UI المستهلكة | الجدول الأساسي | الحالة | عيب |
|---|---|---|---|---|---|---|---|
| `/communications/whatsapp/webhook` | GET | communications.ts:143 | query hub.* | لا (Meta) | — | شغّال | — |
| `/communications/whatsapp/webhook` | POST | communications.ts:157 | بنية Meta حرّة | لا (Meta) | communications_log، support_tickets، crm_opportunities، whatsapp_queue | شغّال | يعتمد توكن تحقق ثابت افتراضي `ghayth_erp_verify` (COM-009) |
| `/communications/pbx/incoming` | POST | communications.ts:266 | pbxIncomingSchema | لا (PBX) | pbx_calls، communications_log | شغّال | — |
| `/communications/pbx/completed` | POST | communications.ts:346 | pbxCompletedSchema | لا (PBX) | pbx_calls، tasks | شغّال | — |
| `/communications/pbx/status` | POST | communications.ts:399 | pbxStatusSchema | لا (PBX) | pbx_calls | شغّال | `answeredBy` يُستقبل كنص ويُكتب في عمود `integer` (COM-010) |
| `/communications/log` | GET | communications.ts:425 | query | P1 CommLogTab | communications_log | شغّال | الواجهة ترسل `page` والـ handler يقرأ `offset` فقط — تصفّح معطّل (COM-011) |
| `/communications/send` | POST | communications.ts:443 | sendCommunicationSchema | P3 letters-create | communications_log | شغّال | يقبل قنوات whatsapp/sms/email/call/push فقط؛ لا يرسل فعليًا — مجرد إدراج بحالة `queued` |
| `/communications/whatsapp` | GET | communications.ts:482 | query | P1 WhatsAppTab | whatsapp_queue | شغّال | الواجهة ترسل `page` بلا تأثير (نفس COM-011) |
| `/communications/sms` | GET | communications.ts:499 | query | P1 SMSTab | sms_queue | شغّال | نفس COM-011 |
| `/communications/pbx` | GET | communications.ts:516 | query | P1 PBXTab | pbx_calls | شغّال | نفس COM-011 |
| `/communications/log/:id` | PATCH | communications.ts:528 | updateLogSchema | لا | communications_log | دالة سليمة بلا واجهة | dead (COM-001) |
| `/communications/log/:id/convert` | POST | communications.ts:561 | convertLogSchema | P1 ConvertCommButton | tasks/support_tickets/requests | شغّال | — |
| `/communications/log/:id` | DELETE | communications.ts:636 | — | لا | communications_log | دالة سليمة بلا واجهة | dead (COM-001) |
| `/communications/stats` | GET | communications.ts:658 | — | P1 StatsCards | communications_log، whatsapp_queue، sms_queue | شغّال | — |
| `/communications/queue-stats` | GET | communications.ts:679 | query date | P1 MonitorTab | sms/whatsapp/email_queue، push_subscriptions | شغّال | — |
| `/communications/push/vapid-key` | GET | communications.ts:748 | — | hook use-push | — | شغّال | — |
| `/communications/push/subscribe` | POST | communications.ts:758 | pushSubscribeSchema | P1 PushCard | push_subscriptions | شغّال | — |
| `/communications/push/unsubscribe` | DELETE | communications.ts:793 | pushUnsubscribeSchema | P1 PushCard | push_subscriptions | شغّال | — |
| `/communications/push/test` | POST | communications.ts:817 | `z.object({})` | P1 PushCard | push_subscriptions | شغّال | — |
| `/correspondence` | GET | correspondence.ts:108 | query | P4 | correspondence | شغّال | سقف ثابت 200 صف بلا تصفّح (COM-012) |
| `/correspondence/:id` | GET | correspondence.ts:153 | — | P6 | correspondence | شغّال | — |
| `/correspondence` | POST | correspondence.ts:173 | createSchema | P5 | correspondence | شغّال | يستخدم `.parse` بدل `zodParse` (تفاوت معالجة أخطاء) |
| `/correspondence/:id` | PATCH | correspondence.ts:209 | patchCorrespondenceSchema | لا | correspondence | دالة سليمة بلا واجهة | dead (COM-006) |
| `/correspondence/:id/send` | POST | correspondence.ts:254 | — | P4 | correspondence | شغّال | لا إرسال فعلي عبر القناة — تحديث حالة فقط |
| `/correspondence/:id/respond` | POST | correspondence.ts:285 | respondSchema | P4 | correspondence | شغّال | الواجهة لا ترسل body — يعتمد افتراضات الخلفية |
| `/correspondence/stats/summary` | GET | correspondence.ts:341 | — | P4 | correspondence | شغّال | — |
| `/notification-engine/preferences` | GET | notification-engine.ts:100 | — | P2 PreferencesTab | notification_preferences، notification_routing_rules | شغّال | — |
| `/notification-engine/preferences` | PUT | notification-engine.ts:129 | updatePreferencesSchema | P2 PreferencesTab | notification_preferences | شغّال | صلاحية `admin:update` بينما القراءة `notifications:list` — تفاوت صلاحيات (COM-013) |
| `/notification-engine/routing-rules` | GET | notification-engine.ts:185 | — | P2 RoutingRulesTab | notification_routing_rules | شغّال | — |
| `/notification-engine/routing-rules` | POST | notification-engine.ts:202 | createRoutingRuleSchema | لا | notification_routing_rules | دالة سليمة بلا واجهة | dead (COM-002) |
| `/notification-engine/routing-rules/:id` | PUT | notification-engine.ts:246 | updateRoutingRuleSchema | P2 RoutingRulesTab | notification_routing_rules | شغّال | — |
| `/notification-engine/routing-rules/:id` | DELETE | notification-engine.ts:287 | — | لا | notification_routing_rules | دالة سليمة بلا واجهة | dead (COM-002) |
| `/notification-engine/templates` | GET | notification-engine.ts:322 | — | P2 TemplatesTab | notification_templates | شغّال | — |
| `/notification-engine/templates` | POST | notification-engine.ts:339 | createTemplateSchema | P2 TemplatesTab | notification_templates | شغّال | — |
| `/notification-engine/templates/:id` | PUT | notification-engine.ts:383 | updateTemplateSchema | P2 TemplatesTab | notification_templates | شغّال | — |
| `/notification-engine/templates/:id` | DELETE | notification-engine.ts:423 | — | P2 TemplatesTab | notification_templates | شغّال | — |
| `/notification-engine/fallback-chains` | GET | notification-engine.ts:458 | — | P2 FallbackChainsTab | notification_fallback_chains | شغّال | — |
| `/notification-engine/fallback-chains` | POST | notification-engine.ts:474 | createFallbackChainSchema | P2 FallbackChainsTab | notification_fallback_chains | شغّال | — |
| `/notification-engine/fallback-chains/:id` | PUT | notification-engine.ts:508 | updateFallbackChainSchema | لا | notification_fallback_chains | دالة سليمة بلا واجهة | dead (COM-014) |
| `/notification-engine/fallback-chains/:id` | DELETE | notification-engine.ts:548 | — | P2 FallbackChainsTab | notification_fallback_chains | شغّال | — |
| `/notification-engine/webhooks` | GET | notification-engine.ts:583 | — | P2 WebhooksTab | notification_webhooks | شغّال | — |
| `/notification-engine/webhooks` | POST | notification-engine.ts:601 | createWebhookSchema | P2 WebhooksTab | notification_webhooks | شغّال | — |
| `/notification-engine/webhooks/:id` | PUT | notification-engine.ts:649 | updateWebhookSchema | P2 WebhooksTab | notification_webhooks | شغّال | — |
| `/notification-engine/webhooks/:id` | DELETE | notification-engine.ts:712 | — | P2 WebhooksTab | notification_webhooks | شغّال | — |
| `/notification-engine/delivery-stats` | GET | notification-engine.ts:747 | query days | P2 DeliveryStatsTab | notification_delivery_log | شغّال | — |
| `/notification-engine/delivery-log` | GET | notification-engine.ts:758 | query | P2 DeliveryStatsTab | notification_delivery_log | شغّال | — |
| `/notifications` | GET | notifications.ts:67 | query cursor/page | P7 | notifications | شغّال | الواجهة لا تستعمل cursor ولا pageSize (COM-008) |
| `/notifications/:id/read` | PATCH | notifications.ts:163 | — | P7 | notifications | شغّال | — |
| `/notifications/unread-count` | GET | notifications.ts:191 | — | لا (شارة الواجهة محلية) | notifications | دالة سليمة بلا استهلاك مباشر | dead (COM-015) |
| `/notifications/preferences` | GET | notifications.ts:213 | — | لا | notification_preferences | دالة سليمة بلا واجهة | duplicate (COM-016) |
| `/notifications/preferences` | POST | notifications.ts:235 | preferencesSchema | لا | notification_preferences | دالة سليمة بلا واجهة + خلل ON CONFLICT | duplicate/conflict (COM-016) |
| `/notifications/mark-all-read` | PATCH | notifications.ts:263 | — | لا | notifications | دالة سليمة بلا واجهة | dead (COM-008) |

---

## جدول 4 — عدم التطابق UI ↔ API (Mismatches)

| الموقع | ما تُرسله الواجهة | ما يتوقّعه الـ schema | تشخيص ثابت | الإصلاح المقترح |
|---|---|---|---|---|
| `letters-create.tsx:81` ↔ `communications.ts:448` | `channel: "letter"` (خيار «خطاب رسمي») | `["whatsapp","sms","email","call","push"]` فقط | إرسال خطاب بقناة «letter» يفشل بـ ValidationError «قناة غير مدعومة» | إمّا إزالة خيار «خطاب رسمي» من القائمة، أو إضافة `letter` للقنوات المقبولة وتعريف معالجة لها (الأرجح: توجيه قناة letter إلى مسار correspondence/official_letters) |
| `letters-create.tsx` (كامل) ↔ روابط `discipline-memo-detail.tsx:404`، `tenant-detail.tsx:308`، `project-detail.tsx:682` | روابط خارجية تمرّر `?relatedType=&relatedId=&subject=` | الصفحة لا تقرأ `useSearch`/query إطلاقًا | المعاملات تُهمل بصمت؛ الخطاب يُنشأ بلا ربط ولا موضوع مُعبّأ | قراءة query params عبر `useSearch`، تعبئة `subject` مبدئيًا وتمرير `relatedType/relatedId` في جسم `POST /send` |
| `correspondence-create.tsx:50-55` ↔ `correspondence.ts:82-96` (createSchema) | تُلزِم `senderName` و`recipientName` و`content` كحقول إلزامية | `createSchema` يجعل الثلاثة `.optional()` | تشدّد واجهة لا تطابق فعلي — الواجهة أصرم من الخلفية؛ لا يكسر شيئًا لكن قد يسمح API بإنشاء مراسلة ناقصة من مستهلك آخر | توحيد المصدر: إمّا جعل الحقول `.min(1)` في الـ schema، أو إبقاء التساهل وتوثيقه |
| `correspondence-detail.tsx:362` ↔ catalog RBAC | `perm="comms:update"` | مفتاح الميزة الفعلي `communications` (يُمنح كـ `communications:*`) | `comms` هو moduleKey لا featureKey؛ `can("comms:update")` يفشل لكل مستخدم غير owner — زر التعديل محجوب دائمًا | تغيير الصلاحية إلى `communications:update` لتطابق بقية صفحات المسار |
| `communications.tsx` CommLog/WhatsApp/SMS/PBX tabs ↔ `communications.ts` GET handlers | `?page=N&limit=20` | الـ handlers تقرأ `offset` و`limit` فقط، تتجاهل `page` | كل النقر على «التالي» يعيد نفس الصفحة الأولى (offset يبقى 0) | إمّا أن يحتسب الـ handler `offset = (page-1)*limit`، أو تُرسل الواجهة `offset` |
| `pbxStatusSchema:75` ↔ `pbx_calls.answeredBy` | `answeredBy: z.string().nullable()` | عمود `answeredBy integer` في `schema_pre.sql:10155` | كتابة قيمة نصّية في عمود integer؛ ينجح فقط إن كانت رقمية بحتة، وإلا خطأ نوع وقت التشغيل | تحويل `answeredBy` إلى `z.coerce.number().nullable()` أو تغيير العمود إلى نصّي إن كان يحمل اسم وكيل |

---

## جدول 5 — التكرار والتعارض (Duplication/Conflict)

| الوظيفة | الموقع 1 | الموقع 2 | نوع التداخل | اقتراح الحل |
|---|---|---|---|---|
| إدارة تفضيلات الإشعارات | `notifications.ts` GET/POST `/preferences` (نموذج صف-لكل-قناة: أعمدة `channel,category,enabled`) | `notification-engine.ts` GET/PUT `/preferences` (نموذج صف-لكل-فئة: أعمدة `inApp,email,sms,whatsapp,push,webhook`) | duplicate + conflict: مسارَان يكتبان نفس جدول `notification_preferences` بنموذجَي بيانات مختلفين على نفس قيد التفرّد `(userId,channel,category)` | اعتماد نموذج واحد (الأرجح نموذج notification-engine المُستعمَل فعليًا من المحرّك في `notificationEngine.ts:132`) وإلغاء/إعادة توجيه مسار notifications |
| ON CONFLICT لتفضيلات الإشعارات | `notifications.ts:243` يستخدم `ON CONFLICT ("userId","companyId",channel,category)` | القيد الفعلي في `schema_pre.sql:1155` اسمه `notification_preferences_userId_channel_category_key` (3 أعمدة فقط) | conflict: هدف ON CONFLICT بأربعة أعمدة لا يطابق أي قيد تفرّد قائم | تصحيح هدف ON CONFLICT إلى `("userId",channel,category)` كما في notification-engine.ts:143 |
| منطق dispatchNotification / resolveInAppRecipients | `lib/notificationEngine.ts:231` (resolveInAppRecipients) | `lib/notificationService.ts:156` (resolveInAppRecipients) | duplicate: دالة بنفس الاسم ونفس المنطق مكرّرة في ملفّين؛ والمسار الكامل (engine + legacy fallback) يُنفّذ نفس الإدراجات بطريقتين | استخراج الدالة إلى وحدة مشتركة وحصر منطق legacy في حالات الفشل فقط |
| سجلّ الإشعارات | جدول `notification_log` (يكتب فيه notificationService + notificationEngine) | جدول `notification_delivery_log` (يكتب فيه المحرّك الجديد) | duplicate: جدولا تسجيل متوازيان لنفس الحدث؛ `notification_log` بلا واجهة عرض ولا قراءة | توحيد على `notification_delivery_log` وإيقاف الكتابة المزدوجة لـ `notification_log` |
| أرقام/قنوات المراسلات الرسمية | مسار `correspondence` (جدول `correspondence`، تسلسلات OUT/IN) | جدول `official_letters` (مهاجرات 069/072/090، يُدار من `hr.ts`/`actionCenter.ts`/`umrah-entities.ts`/`mySpace.ts`) | conflict: «الخطاب الرسمي» يُنشأ ويُرقّم من مسارَي عمل منفصلين (HR والمراسلات) بقواعد ترقيم مختلفة، وصفحة letters-create تحت مسار comms تُرسله أصلًا لجدول ثالث `communications_log` | توحيد دورة حياة الخطاب الرسمي: مصدر ترقيم واحد، وربط `correspondence.entityType='official_letter'` بدل تكرار البيانات |

---

## يحتاج Runtime Verification

- التوصيل الفعلي عبر القنوات (SMS / WhatsApp / Email / Push) — كل ما يفعله المسار ثابتًا هو الإدراج في `*_queue` بحالة `pending/queued`؛ الإرسال الحقيقي يتم عبر عمّال cron خارج نطاق هذا الجرد.
- استجابة Meta لـ `sendWhatsAppMessage` (`communications.ts:113`) — تعتمد على توفّر `WHATSAPP_ACCESS_TOKEN`/`WHATSAPP_PHONE_ID`؛ بدونها تُرجع `false` صامتةً (stub).
- إرسال webhook الفعلي في `dispatchWebhooks` (`notificationEngine.ts:247`) ونجاح/فشل HTTP وتحديث `failCount` — سلوك شبكي وقت تشغيل.
- معالجة سلاسل التصعيد `processFallbackChains` — تعتمد على cron وتوقيت `waitMinutes`؛ لا يمكن التحقق ثابتًا من تنفيذ الخطوة التالية.
- زرّ الطباعة في `correspondence-detail.tsx` بـ `entityType:"official_letter"` بينما الكيان الفعلي `correspondence` — صحّة مطابقة قالب الطباعة تحتاج تحقق وقت تشغيل (مُسجَّل كـ COM-017 الأدنى خطورة).
- تصنيف الرسائل بالذكاء الاصطناعي `aiEngine.receptionCategorize` في webhook واتساب — سلوك يعتمد خدمة خارجية.

---

## العيوب المُرقّمة (Defect Register)

- **COM-001** · dead · impairing · structural — `PATCH` و`DELETE /communications/log/:id` معالِجان سليمان بلا أي واجهة تستدعيهما؛ لا يمكن تعديل أو حذف سجل اتصال من الـ UI. الدليل: `communications.ts:528,636` مقابل غياب الاستدعاء في `pages/communications.tsx`. التبعية: مستقل.
- **COM-002** · dead · impairing · structural — `POST` و`DELETE /notification-engine/routing-rules` بلا واجهة؛ تبويب «التوجيه» يسمح بالتعديل فقط، فلا يمكن إنشاء قاعدة توجيه جديدة لحدث غير مُهيّأ أو حذف قاعدة. الدليل: `notification-engine.ts:202,287` مقابل `RoutingRulesTab` في `notification-engine.tsx:45-165`. التبعية: مستقل.
- **COM-003** · mismatch · blocking · narrow — `letters-create.tsx` يقدّم خيار قناة «خطاب رسمي» بقيمة `letter` يرفضها `sendCommunicationSchema` (القنوات المقبولة whatsapp/sms/email/call/push فقط) — إرسال الخطاب بهذه القناة يفشل دائمًا. الدليل: `letters-create.tsx:81` مقابل `communications.ts:448-454`. التبعية: مستقل.
- **COM-004** · dead · impairing · narrow — صفحة `letters-create.tsx` لا تقرأ query params؛ روابط `discipline-memo-detail.tsx:404`، `tenant-detail.tsx:308`، `project-detail.tsx:682` تمرّر `relatedType/relatedId/subject` التي تُهمل بصمت، إضافةً إلى `backPath="/letters"` المؤدّي لمسار غير مُسجَّل. الدليل: `letters-create.tsx:14-25,61`. التبعية: مرتبط بـ COM-003 (نفس الصفحة).
- **COM-005** · dead · impairing · narrow — زر «رد» في `correspondence.tsx:117` يستدعي `POST /:id/respond` بجسم `{ id }` فقط بلا `subject/content/notes`؛ المعالج يولّد ردًّا بعنوان افتراضي `رد: ...` ومحتوى `null` — لا توجد واجهة إدخال لمحتوى الرد. الدليل: `correspondence.tsx:99-122` مقابل `correspondence.ts:285-338`. التبعية: مستقل.
- **COM-006** · dead · impairing · narrow — زر «تعديل» في `correspondence-detail.tsx:167` يوجّه إلى `/correspondence/:id/edit` غير المُسجَّل في `commsRoutes.tsx`؛ المعالج `PATCH /correspondence/:id` (correspondence.ts:209) سليم لكن بلا صفحة تستدعيه. الدليل: `correspondence-detail.tsx:166-168` مقابل `commsRoutes.tsx:10-17`. التبعية: مستقل.
- **COM-007** · mismatch · impairing · narrow — زر التعديل في `correspondence-detail.tsx:362` يستخدم `perm="comms:update"` و`comms` moduleKey وليس featureKey؛ مفتاح الميزة الصحيح `communications`، فدالة `can()` (`app-context.tsx:422-430`) تتحقق من `comms:*`/`comms:update` غير الممنوحة، والزر محجوب لكل مستخدم غير owner. الدليل: `correspondence-detail.tsx:362` مقابل `featureCatalog.ts:328`. التبعية: يضاعف أثر COM-006.
- **COM-008** · dead · impairing · narrow — `PATCH /notifications/mark-all-read` (notifications.ts:263) معالج سليم بلا زر في `notifications.tsx`؛ كما أن الصفحة لا تستعمل تصفّح cursor/page المتاح، فتُحمَّل أول صفحة فقط دون وصول لبقية الإشعارات. الدليل: `notifications.tsx:11-13` مقابل `notifications.ts:67-118,263`. التبعية: مستقل.
- **COM-009** · dead · impairing · narrow — توكن تحقّق واتساب يسقط على قيمة ثابتة منشورة في الكود `ghayth_erp_verify` عند غياب `WHATSAPP_VERIFY_TOKEN`؛ يجعل التحقّق قابلًا للتخمين ولا يحقّق غرضه الأمني. الدليل: `communications.ts:84`. التبعية: مستقل. (نوع dead: التحقّق «لا يفعل شيئًا حقيقيًا» أمنيًا).
- **COM-010** · mismatch · impairing · narrow — `pbxStatusSchema.answeredBy` يُعرَّف كنص (`z.string().nullable()`) بينما العمود `pbx_calls.answeredBy` من نوع `integer`؛ كتابة قيمة غير رقمية تُسبّب خطأ نوع وقت التشغيل. الدليل: `communications.ts:75` مقابل `schema_pre.sql:10155`. التبعية: مستقل.
- **COM-011** · mismatch · impairing · structural — تبويبات سجل الاتصالات/واتساب/SMS/PBX ترسل `?page=N` بينما معالِجات `GET /communications/{log,whatsapp,sms,pbx}` تقرأ `offset` فقط ولا تحوّل `page` — التصفّح معطّل ويُعاد دومًا أول صفحة. الدليل: `communications.tsx:439,490,551,609` مقابل `communications.ts:428-430,485,502,519`. التبعية: مستقل.
- **COM-012** · scaling · impairing · structural — `GET /correspondence` يُرجع `LIMIT 200` ثابتًا بلا offset/cursor؛ مع تراكم المراسلات عبر سنوات/فروع متعددة تختفي السجلات الأقدم من الواجهة نهائيًا. الدليل: `correspondence.ts:136-145`. التبعية: مستقل.
- **COM-013** · conflict · cosmetic · narrow — `GET /notification-engine/preferences` محمي بـ `notifications:list` بينما `PUT` لنفس المسار محمي بـ `admin:update`؛ مستخدم يرى تفضيلاته الشخصية لكنه لا يستطيع حفظها إلا بصلاحية admin، رغم أن التفضيلات شخصية (`userId`). الدليل: `notification-engine.ts:100,129`. التبعية: مستقل.
- **COM-014** · dead · cosmetic · narrow — `PUT /notification-engine/fallback-chains/:id` (notification-engine.ts:508) معالج سليم بلا واجهة؛ تبويب «التصعيد» يتيح الإنشاء والحذف فقط لا التعديل. الدليل: `notification-engine.tsx:355-505`. التبعية: مستقل.
- **COM-015** · dead · cosmetic · narrow — `GET /notifications/unread-count` (notifications.ts:191) معالج سليم لكن `notifications.tsx` يحتسب عدد غير المقروء محليًا من القائمة (`notifications.tsx:44`) فلا يستهلك المسار. الدليل: `notifications.ts:191` مقابل `notifications.tsx:43-46`. التبعية: مستقل.
- **COM-016** · duplicate · impairing · structural — مساران منفصلان (`notifications.ts` و`notification-engine.ts`) يديران `/preferences` على نفس جدول `notification_preferences` بنموذجَي بيانات متعارضين؛ ومسار `notifications.ts:243` يستخدم هدف `ON CONFLICT` بأربعة أعمدة لا يطابق القيد الفعلي ثلاثي الأعمدة `notification_preferences_userId_channel_category_key` — أي إدراج عبره يفشل بـ «no unique constraint matching». الدليل: `notifications.ts:235-261`، `notification-engine.ts:129-183`، `schema_pre.sql:1155`. التبعية: مستقل.
- **COM-017** · mismatch · cosmetic · narrow — زر الطباعة في `correspondence-detail.tsx:357` يمرّر `entityType="official_letter"` بينما الكيان الفعلي للصفحة `correspondence`؛ قد يطبّق قالب طباعة خاطئ. الدليل: `correspondence-detail.tsx:357`. التبعية: مرتبط بتعارض جدول 5 (correspondence ↔ official_letters). يحتاج تأكيد وقت تشغيل لقالب الطباعة.

ملخّص العدّ: 17 عيبًا — حسب النوع: dead ×9 (COM-001،002،004،005،006،008،009،014،015)، mismatch ×5 (COM-003،007،010،011،017)، duplicate ×1 (COM-016)، conflict ×1 (COM-013)، scaling ×1 (COM-012). حسب الخطورة: blocking ×1، impairing ×11، cosmetic ×5.

---

## خلاف مع تقارير سابقة

1. **خلاف مع `audit/system-review/modules/communications/_module.md`** — التقرير يسجّل «مشاكل إجمالية: 0» لكل صفحات المسار الست (communications، notification-engine، letters-create، correspondence، correspondence-create، correspondence-byid). هذا الجرد يوثّق 17 عيبًا بأدلّة `file:line` صريحة، منها عيب blocking (COM-003: قناة `letter` مرفوضة) وعيب structural (COM-016: تعارض ON CONFLICT يُفشل كل إدراج عبر `notifications.ts /preferences`). على وجه التحديد ورقة `communications-letters-create.md` تذكر «لا توجد مشاكل» رغم أن الصفحة تُرسل قناة غير مقبولة وتُهمل query params الواردة من ثلاث صفحات مرتبطة.

2. **تنقيح/توسعة لبند F5 في `UNVERIFIED_PATHS_ARCHITECTURE_MAP.md`** — التقرير يقول إن `auditMiddleware.ENTITY_MAP` يُغفل legal/store/governance/automation/bi/marketing فقط. التحقّق المباشر يؤكّد أن `/communications` و`/correspondence` **مُدرَجان فعلًا** في ENTITY_MAP (`auditMiddleware.ts:47-48`) — أي F5 لا يمسّ صفحتَي المراسلات. لكن المسارَين `/notifications` و`/notification-engine` **غير مُدرَجَين** في ENTITY_MAP، وهما لا يردان في قائمة F5؛ فقائمة F5 ناقصة بشأن مسارَي الإشعارات (يعوّضهما جزئيًا استدعاء `createAuditLog` الصريح داخل المعالِجات، فالأثر منخفض). هذا تصحيح لنطاق F5 وليس نفيًا له.

3. **خلاف ضمني مع وصف F8** — F8 يصف فقدان الأحداث غير الحرجة عند `PERSIST_ALL_EVENTS=false`. في مسار الاتصالات كل استدعاءات `emitEvent` مُحاطة بـ `.catch(...)` وتُعامَل كمهام خلفية، لكن جدول `notification_log` يُكتب فيه ضمن بلوك `catch (_) {}` صامت تمامًا (`notificationService.ts:96`، `notificationEngine.ts:503`) — أي أن فقدان سجل الإشعارات هنا ليس مشروطًا بـ `PERSIST_ALL_EVENTS` بل بابتلاع استثناء غير مشروط، وهو مسار فقدان بيانات إضافي لم يلتقطه F8.
