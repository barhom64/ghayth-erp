# جرد المسار — الدعم (Support)

جرد ثابت (Static Inventory) لمسار الدعم الفني في نظام Ghayth ERP، يغطي صفحات الواجهة، نقاط النهاية الخلفية (`artifacts/api-server/src/routes/support.ts`)، مخطط قاعدة البيانات (`db/schema_pre.sql`)، والهجرات ذات الصلة (`171_support_tickets_branchId.sql`). جميع المسارات والجداول والدوال مذكورة بالإنجليزية كما في الكود. الأدلة مرفقة بصيغة `file:line`.

---

## جدول 1 — الصفحات (Pages)

| المعرّف | route | الملف | الحالة | APIs المستدعاة | عيب رئيسي |
|---|---|---|---|---|---|
| P1 | `/support` | `artifacts/ghayth-erp/src/pages/support.tsx` | شغّال | `GET /support/stats`، `GET /support/tickets`، `GET /support/kb`، `GET /support/csat`، `POST /support/kb`، `PATCH /support/tickets/:id`، `DELETE /support/tickets/:id`، `PATCH /support/kb/:id`، `DELETE /support/kb/:id` | تبويب CSAT يقرأ حقولاً (`agentStats[].agentName/avg/count`، `avgScore`، `fiveStars`) لا يُصدّرها الـ API — SUP-001 |
| P2 | `/support/create` | `artifacts/ghayth-erp/src/pages/create/support-create.tsx` | شغّال | `POST /support/tickets` | الواجهة ترسل حقل `status` غير الموجود في `createTicketSchema` فيُهمل صامتاً — SUP-002 |
| P3 | `/support/replies` | `artifacts/ghayth-erp/src/pages/support/replies.tsx` | شغّال | `GET /support/replies` | لا عيب رئيسي؛ شاشة قراءة فقط |
| P4 | `/support/kb` | `artifacts/ghayth-erp/src/pages/support/kb.tsx` | شغّال | `GET /support/kb` | صفحة قراءة فقط مكرّرة وظيفياً لتبويب KB داخل `/support` — SUP-003 |
| P5 | `/support/:id` | `artifacts/ghayth-erp/src/pages/details/ticket-detail.tsx` | مكسور جزئياً | `GET /support/tickets/:id`، `POST /support/tickets/:id/replies`، `PATCH /support/tickets/:id`، `DELETE /support/tickets/:id`، `PATCH /support/tickets/:id/approve` | مكوّن `ApprovalActions` يستهدف `/support/tickets/:id/approve` وهو endpoint غير موجود — SUP-004 |

---

## جدول 2 — الأزرار والإجراءات (Actions)

| الصفحة الأم | اسم الزر | الإجراء المتوقّع | API المستهدف | الحالة | نوع العيب |
|---|---|---|---|---|---|
| P1 (تذاكر) | "تذكرة جديدة" | الانتقال إلى `/support/create` | — (تنقّل) | شغّال | — |
| P1 (تذاكر) | "معاينة" (Eye) | فتح `QuickPreviewDialog` | — (محلي) | شغّال | — |
| P1 (تذاكر) | تعديل سطري (RowActions) | `PATCH /support/tickets/:id` بحقول status/priority/title | `PATCH /support/tickets/:id` | مكسور جزئياً | mismatch (SUP-005) |
| P1 (تذاكر) | حذف سطري (RowActions) | `DELETE /support/tickets/:id` | `DELETE /support/tickets/:id` | شغّال | — |
| P1 (تذاكر) | BulkActionsBar `close` | إغلاق جماعي للتذاكر | غير محدد (مكوّن مشترك) | يحتاج Runtime Verification | — |
| P1 (KB) | "مقالة جديدة" | `POST /support/kb` | `POST /support/kb` | شغّال | — |
| P1 (KB) | تعديل سطري | `PATCH /support/kb/:id` | `PATCH /support/kb/:id` | شغّال | — |
| P1 (KB) | حذف سطري | `DELETE /support/kb/:id` | `DELETE /support/kb/:id` | شغّال | — |
| P2 (إنشاء) | "إنشاء" | `POST /support/tickets` | `POST /support/tickets` | شغّال | — |
| P2 (إنشاء) | "إلغاء" / "مسح المسودة" | تنقّل/حذف مسودة محلية | — | شغّال | — |
| P5 (تفاصيل) | "إرسال الرد" | `POST /support/tickets/:id/replies` | `POST /support/tickets/:id/replies` | شغّال | — |
| P5 (تفاصيل) | محدد "الحالة" (Select) | `PATCH /support/tickets/:id` بحقل status | `PATCH /support/tickets/:id` | مكسور جزئياً | conflict (SUP-006) |
| P5 (تفاصيل) | "حذف" / "تأكيد الحذف" | `DELETE /support/tickets/:id` | `DELETE /support/tickets/:id` | شغّال | — |
| P5 (تفاصيل) | `ApprovalActions` (موافقة/رفض/إرجاع) | `PATCH /support/tickets/:id/approve` | `/support/tickets/:id/approve` | مكسور | dead (SUP-004) |

---

## جدول 3 — APIs

| Endpoint | Method | الـ handler | الـ schema | UI المستهلكة | الجدول الأساسي | الحالة | عيب |
|---|---|---|---|---|---|---|---|
| `/support/tickets` | GET | `support.ts:180` | — (query: status/priority) | P1 | `support_tickets` | شغّال | يقرأ `LIMIT 500` بلا ترحيل حقيقي رغم أن الواجهة ترسل `page/limit` — SUP-007 (scaling) |
| `/support/tickets` | POST | `support.ts:202` | `createTicketSchema:109` | P2 | `support_tickets` | شغّال | — |
| `/support/tickets/check-sla` | POST | `support.ts:355` | — | لا أحد | `support_tickets` | شغّال (بلا واجهة) | dead — لا تستدعيه أي صفحة، وهناك cron مكافئ — SUP-008 |
| `/support/tickets/:id` | GET | `support.ts:403` | — | P5 | `support_tickets`+`ticket_replies` | شغّال | — |
| `/support/tickets/:id/replies` | POST | `support.ts:425` | `createReplySchema:120` | P5 | `ticket_replies` | شغّال | — |
| `/support/tickets/:id/field-visit` | POST | `support.ts:481` | `createFieldVisitSchema:153` | لا أحد | `support_tickets` | شغّال (بلا واجهة) | dead — لا زر في أي صفحة دعم يستدعيه — SUP-009 |
| `/support/tickets/:id` | PATCH | `support.ts:555` | `updateTicketSchema:138` | P1, P5 | `support_tickets` | شغّال | يقبل `billableAmount` لكن لا واجهة ترسله — SUP-010 |
| `/support/tickets/:id` | DELETE | `support.ts:691` | — | P1, P5 | `support_tickets` | شغّال | — |
| `/support/replies` | GET | `support.ts:720` | — | P3 | `ticket_replies`+`support_tickets` | شغّال | `disableBranchScope:true` يكسر عزل الفروع بعكس `GET /tickets` — SUP-011 (conflict) |
| `/support/stats` | GET | `support.ts:751` | — | P1 | `support_tickets`+`ticket_csat_ratings` | شغّال | — |
| `/support/tickets/:id/csat` | POST | `support.ts:772` | `createCSATSchema:126` | لا أحد | `ticket_csat_ratings` | شغّال (بلا واجهة) | dead — لا واجهة لإرسال CSAT رغم وجود استبيان البريد — SUP-012 |
| `/support/csat` | GET | `support.ts:802` | — | P1 (تبويب CSAT) | `ticket_csat_ratings` | مكسور جزئياً | الواجهة تقرأ أسماء حقول مختلفة — SUP-001 (mismatch) |
| `/support/kb` | GET | `support.ts:825` | — (query: q/category) | P1, P4 | `kb_articles` | شغّال | — |
| `/support/kb/:id` | GET | `support.ts:838` | — | لا أحد | `kb_articles` | شغّال (بلا واجهة) | dead — لا صفحة تفاصيل مقال KB — SUP-013 |
| `/support/kb` | POST | `support.ts:849` | `createKbSchema:131` | P1 | `kb_articles` | شغّال | — |
| `/support/kb/:id` | PATCH | `support.ts:870` | `updateKbSchema:145` | P1 | `kb_articles` | شغّال | — |
| `/support/kb/:id` | DELETE | `support.ts:896` | — | P1 | `kb_articles` | شغّال | — |
| `/support/kb/:id/feedback` | POST | `support.ts:920` | `kbFeedbackSchema:161` | لا أحد | `kb_articles` | شغّال (بلا واجهة) | dead — لا أزرار 👍/👎 في صفحات KB (عرض فقط) — SUP-014 |

إجمالي نقاط النهاية المغطّاة: **18**.

---

## جدول 4 — عدم التطابق UI ↔ API (Mismatches)

| الموقع | ما تُرسله الواجهة | ما يتوقّعه الـ schema | تشخيص ثابت | الإصلاح المقترح |
|---|---|---|---|---|
| `support.tsx:387-396` (تبويب CSAT) | تقرأ `s.agentName`، `s.avg`، `s.count`، و`csatResp.avgScore`، `csatResp.fiveStars` | `GET /support/csat` يُرجع `agentStats[]` بحقول `assigneeId`، `assigneeName`، `avg`، `total`؛ والجذر يحوي `avg` و`total` فقط (`support.ts:805-821`) | الأسماء غير متطابقة: `agentName≠assigneeName`، `count≠total`، `avgScore` و`fiveStars` غير موجودين أصلاً — التبويب يعرض `—` و`0` و`وكيل #undefined` دائماً | إمّا تعديل الواجهة لاستخدام `assigneeName/total/avg`، أو إضافة `avgScore`/`fiveStars`/`agentName`/`count` للاستجابة في `support.ts:821` |
| `support-create.tsx:15,110-117` | حقل `status` ضمن `INITIAL` ومحدد "الحالة" (open/in_progress) — لكن `handleSubmit:36-44` لا يرسله | `createTicketSchema` (`support.ts:109-118`) لا يحوي `status` إطلاقاً؛ والـ handler يثبّت `'open'` دائماً (`support.ts:292`) | محدد "الحالة" في شاشة الإنشاء بلا أثر — أيّ اختيار يُهمَل والتذكرة تُنشأ `open` حتماً | حذف محدد "الحالة" من شاشة الإنشاء، أو دعمه فعلياً في الـ schema والـ INSERT |
| `support.tsx:68-72`، `ticket-detail.tsx:136-144` | محدد التعديل يعرض `urgent` كقيمة أولوية؛ والتعديل السطري يرسل status مباشرة | `updateTicketSchema` يقبل `priority` ضمن `["low","medium","high","urgent","critical"]` — `urgent` صالح. لكن `TICKET_TRANSITIONS` (`support.ts:546`) لا يسمح بانتقالات معينة | محدد الحالة في الواجهة يعرض open/in_progress/resolved/closed فقط، فلا يمكن للمستخدم الوصول إلى `pending_customer` أو `field_visit` رغم أنهما حالتان مشروعتان في الـ backend | توحيد قائمة الحالات بين الواجهة و`TICKET_TRANSITIONS` |
| `support.tsx:98`، `ticket-detail.tsx:151` | تعرض `t.slaBreached` و`ticket.isSlaBreached` | `GET /tickets` (`support.ts:194-198`) يُرجع `t.*` فيتضمّن عمود `slaBreached` الحقيقي؛ أما `GET /tickets/:id` فيُرجع `isSlaBreached` محسوباً لحظياً (`support.ts:416-421`) | حقلان مختلفان لنفس المفهوم: `slaBreached` (مخزَّن، يحدّثه cron) مقابل `isSlaBreached` (محسوب) — قد يتعارضان | توحيد التسمية والمصدر؛ الاعتماد على العمود المخزَّن `slaBreached` في كلا المسارين |

---

## جدول 5 — التكرار والتعارض (Duplication/Conflict)

| الوظيفة | الموقع 1 | الموقع 2 | نوع التداخل | اقتراح الحل |
|---|---|---|---|---|
| تعريف مخطط انتقالات حالة التذكرة | `TICKET_TRANSITIONS` المضمّن في `support.ts:546-553` | `STATE_MACHINES` في `lifecycleEngine.ts:565-573` (entity `support_tickets`) | duplicate + conflict | الموقعان غير متطابقين: الـ inline يسمح `open→resolved` مباشرة ويعرف `pending_customer`/`field_visit`؛ بينما الـ engine يسمح `open→in_progress/closed` فقط ويعرف `escalated`. يجب اعتماد مصدر واحد فقط (يُفضّل الـ engine) |
| فحص خرق SLA وتصعيد الأولوية | `POST /support/tickets/check-sla` (`support.ts:355`) — يصعّد إلى `critical` ويعيّن `slaBreached=true` | `hourlySlaEscalation` في `cronScheduler.ts:826` + `dailySlaGeneral:1311` | duplicate + conflict | منطق متعارض: الـ endpoint يضبط `priority='critical'`، أما الـ cron يكتفي بـ `slaBreached=true`+`escalationLevel++` دون تغيير الأولوية. توحيد قاعدة التصعيد في مكان واحد |
| عرض قائمة مقالات قاعدة المعرفة | تبويب `KBManagement` داخل `support.tsx:232` (قراءة + كتابة) | صفحة مستقلة `support/kb.tsx` (قراءة فقط) عبر `/support/kb` | duplicate | الصفحتان تستهلكان نفس `GET /support/kb` بنفس مفتاح الاستعلام `["support-kb"]`؛ صفحة `kb.tsx` زائدة وظيفياً وتعرض أعمدة لا تُحرَّر — دمجها أو إزالة المسار المستقل |
| تصعيد أولوية التذكرة عند خرق SLA أثناء الرد | `POST /tickets/:id/replies` (`support.ts:444-468`) يصعّد إلى `critical` عند تجاوز `slaDeadline` | `check-sla` + `hourlySlaEscalation` | conflict | ثلاث مسارات منفصلة تكتب `priority`/`slaBreached` على نفس الصف بقواعد مختلفة (الرد + الـ endpoint + الـ cron) — قد ينتج سباق وكتابات متضاربة |
| تعريف عمود `branchId` لـ `support_tickets` | هجرة `171_support_tickets_branchId.sql` تضيف العمود | `db/schema_pre.sql` لا يتضمّنه في `CREATE TABLE public.support_tickets` | conflict (انجراف مخطط) | المخطط المرجعي `schema_pre.sql` لا يعكس الهجرة 171؛ كود `support.ts:189,291` يعتمد على `branchId` — يجب تحديث المخطط المرجعي ليطابق الهجرات |

---

## يحتاج Runtime Verification

- سلوك `BulkActionsBar` action `close` في `support.tsx:192` — لا يمكن تحديد الـ endpoint المستهدف للإغلاق الجماعي ثابتاً (مكوّن مشترك)؛ يلزم التحقق هل يستخدم `PATCH /support/tickets/:id` وهل يحترم `TICKET_TRANSITIONS`.
- هل تُسجَّل أحداث `support.ticket.field_visit` بصورة صحيحة عبر `applyTransition` رغم أن `field_visit` ليست في `STATE_MACHINES` (`lifecycleEngine.ts`) — السلوك يعتمد على فرع "الكيان بلا state machine" مقابل وجوده فعلاً.
- هل ينجح `applyTransition` في `PATCH /tickets/:id` عندما يكون الانتقال مسموحاً في `TICKET_TRANSITIONS` لكن مرفوضاً في `STATE_MACHINES` للـ engine (مثل `open→resolved`، أو `pending_customer`) — تعارض المصدرين يتطلّب اختباراً فعلياً.
- نتيجة `loadBalanceAssign` (`support.ts:282`) عند عدم وجود وكلاء — هل تُسند التذكرة بلا `assigneeId` بسلاسة.
- سلوك استبيان CSAT المُجدوَل في `email_queue` (`support.ts:658`) — هل يصل رابط استبيان فعّال للعميل ومن أين يُملأ `score` (لا واجهة CSAT للعميل ثابتاً — انظر SUP-012).
- ترحيل `GET /support/tickets`: السقف `LIMIT 500` ثابت؛ يلزم التحقق من سلوك الواجهة عند تجاوز 500 تذكرة (انظر SUP-007).

---

## العيوب المُرقّمة (Defect Register)

- **SUP-001** · mismatch · impairing · narrow · تبويب CSAT في `support.tsx` يقرأ `agentName/avg/count/avgScore/fiveStars` بينما `GET /support/csat` يُصدّر `assigneeName/total/avg` فقط، فيعرض التبويب أصفاراً وأسماء `undefined`. الدليل: `support.tsx:387-426` مقابل `support.ts:805-821` · التبعية: لا.
- **SUP-002** · mismatch · cosmetic · شاشة إنشاء التذكرة تحوي محدد "الحالة" (open/in_progress) لكنه لا يُرسَل ولا يقبله `createTicketSchema`، فالتذكرة تُنشأ `open` دائماً. الدليل: `support-create.tsx:109-117` و`support.ts:292` · التبعية: لا.
- **SUP-003** · duplicate · cosmetic · صفحة `support/kb.tsx` (عرض فقط) مكرّرة وظيفياً لتبويب `KBManagement` داخل `/support`، بنفس الـ endpoint ونفس مفتاح الاستعلام. الدليل: `support/kb.tsx:31` و`support.tsx:232-233` · التبعية: لا.
- **SUP-004** · dead · impairing · مكوّن `ApprovalActions` في صفحة تفاصيل التذكرة يستهدف `PATCH /support/tickets/:id/approve` وهو endpoint غير موجود في `support.ts` إطلاقاً — أزرار الموافقة/الرفض/الإرجاع تفشل بـ 404. الدليل: `ticket-detail.tsx:165-184` مقابل غياب أي مسار `approve` في `support.ts` · التبعية: لا.
- **SUP-005** · mismatch · cosmetic · التعديل السطري في `support.tsx:69-70` يعرض أولوية `urgent` وحالات محدودة، بينما الـ backend يدعم `critical` و`pending_customer`/`field_visit` غير المتاحة في الواجهة — تباين في مجموعة القيم. الدليل: `support.tsx:68-72` مقابل `support.ts:141,546-553` · التبعية: SUP-006.
- **SUP-006** · conflict · impairing · محدد الحالة في صفحة التفاصيل يسمح بأي انتقال (مثل `closed→open`) دون احترام `TICKET_TRANSITIONS`؛ والـ backend يطبّق قائمتين متعارضتين (`TICKET_TRANSITIONS` و`STATE_MACHINES`) فيصبح قبول/رفض الانتقال غير محسوم. الدليل: `ticket-detail.tsx:136-144`، `support.ts:546-553`، `lifecycleEngine.ts:565-573` · التبعية: SUP-016.
- **SUP-007** · scaling · impairing · `GET /support/tickets` يُطبّق `LIMIT 500` ثابتاً ويُرجع `page:1, pageSize:rows.length` بينما الواجهة ترسل `?page=&limit=` وتعرض ترحيلاً وهمياً — عند تجاوز 500 تذكرة لشركة/فرع تختفي التذاكر الأقدم. الدليل: `support.ts:195-198` مقابل `support.tsx:48-53` · التبعية: لا.
- **SUP-008** · dead · cosmetic · `POST /support/tickets/check-sla` لا تستدعيه أي صفحة دعم؛ وظيفته يغطّيها `hourlySlaEscalation` في الـ cron. الدليل: `support.ts:355`؛ لا استدعاء في صفحات `support` · التبعية: SUP-015.
- **SUP-009** · dead · impairing · `POST /support/tickets/:id/field-visit` (نقل التذكرة إلى `field_visit` + حساب المسافة) بلا أي زر في الواجهة يستدعيه؛ ميزة خلفية كاملة بلا واجهة. الدليل: `support.ts:481`؛ لا استدعاء في `ticket-detail.tsx`/`support.tsx` · التبعية: لا.
- **SUP-010** · dead · cosmetic · `updateTicketSchema` يقبل `billableAmount` ويُشغّل ترحيلاً محاسبياً (`supportEngine.postBillingGL`) عند الحلّ، لكن لا واجهة ترسل `billableAmount` — مسار الفوترة عند الحل غير قابل للتفعيل من الواجهة. الدليل: `support.ts:143,637-648` مقابل غياب الحقل في `support.tsx`/`ticket-detail.tsx` · التبعية: لا.
- **SUP-011** · conflict · impairing · `GET /support/replies` يستخدم `disableBranchScope:true` (`support.ts:724`) بينما `GET /support/tickets` أُزيل منه التعطيل بعد الهجرة 171؛ فصفحة الردود تعرض ردود كل الفروع بعكس قائمة التذاكر — عزل فروع غير متّسق. الدليل: `support.ts:724` مقابل `support.ts:189` · التبعية: لا.
- **SUP-012** · dead · impairing · `POST /support/tickets/:id/csat` بلا واجهة لتقديم التقييم؛ استبيان البريد المُجدوَل (`support.ts:658-671`) لا يحوي رابطاً عاملاً لصفحة CSAT — حلقة CSAT مفتوحة الطرف. الدليل: `support.ts:772`، `support.ts:666` (نص الرسالة يذكر "الرابط المرفق" بلا رابط) · التبعية: SUP-001.
- **SUP-013** · dead · cosmetic · `GET /support/kb/:id` (مع زيادة `views`) بلا صفحة تفاصيل مقال — صفحتا KB تعرضان قوائم فقط ولا تنقلان لمقال مفرد. الدليل: `support.ts:838`؛ لا route `/support/kb/:id` في `miscRoutes.tsx` · التبعية: لا.
- **SUP-014** · dead · cosmetic · `POST /support/kb/:id/feedback` (👍/👎) بلا أزرار في أي صفحة KB — كلتا الصفحتين تعرضان `helpful/notHelpful` للقراءة فقط. الدليل: `support.ts:920`؛ `support.tsx:258-267` و`support/kb.tsx:25-26` (عرض فقط) · التبعية: SUP-013.
- **SUP-015** · conflict · impairing · ثلاثة مسارات تكتب `slaBreached`/`priority` على `support_tickets` بقواعد مختلفة: `check-sla` يصعّد إلى `critical`، الرد عند التأخّر يصعّد إلى `critical`، أما `hourlySlaEscalation`/`dailySlaGeneral` يكتبان `slaBreached=true` فقط — تعارض قواعد التصعيد ومخاطر سباق كتابة. الدليل: `support.ts:366`، `support.ts:446`، `cronScheduler.ts:840`، `cronScheduler.ts:1316` · التبعية: SUP-016.
- **SUP-016** · duplicate · structural · مخطط انتقالات حالة التذكرة معرّف مرتين وبشكلين مختلفين: `TICKET_TRANSITIONS` المضمّن في `support.ts:546` و`STATE_MACHINES` للكيان `support_tickets` في `lifecycleEngine.ts:565`؛ القائمتان غير متطابقتين (الأولى تعرف `pending_customer`/`field_visit`، الثانية تعرف `escalated`). الدليل: `support.ts:546-553` مقابل `lifecycleEngine.ts:565-573` · التبعية: لا.
- **SUP-017** · conflict · cosmetic · انجراف مخطط: `db/schema_pre.sql` لا يتضمّن عمود `branchId` في `CREATE TABLE public.support_tickets` رغم أن الهجرة `171_support_tickets_branchId.sql` تضيفه ويعتمده الكود (`support.ts:189,291`) — المخطط المرجعي غير محدّث. الدليل: `schema_pre.sql` تعريف `support_tickets` مقابل `migrations/171_support_tickets_branchId.sql` · التبعية: لا.

---

## خلاف مع تقارير سابقة

1. **مع `audit/system-review/modules/support/_module.md`** — التقرير يسجّل **«مشاكل إجمالية: 0»** لكل صفحات الدعم الخمس. هذا الجرد يثبت **17 عيباً** موثّقاً بأدلة `file:line`، منها عيوب `impairing` (SUP-004 نقطة موافقة غير موجودة تُرجع 404، SUP-001 تبويب CSAT يعرض أصفاراً، SUP-009/SUP-012 ميزات خلفية بلا واجهة). الادعاء «0 مشاكل» غير صحيح.

2. **مع `audit/system-review/modules/support/support-byid.md`** — التقرير يدرج في جدول الحركات الصفّ «تغيير الحالة | PATCH `/support/tickets/:id/status` | ✅». لا وجود لمسار `/status` في `support.ts` إطلاقاً؛ تغيير الحالة يتم عبر `PATCH /support/tickets/:id` (دون لاحقة `/status`). كما يدرج التقرير جداول `support_replies`/`support_kb_articles`/`support_csat` بينما الأسماء الفعلية في المخطط هي `ticket_replies`/`kb_articles`/`ticket_csat_ratings` (`schema_pre.sql`). التقرير يصف بنية لا تطابق الكود.

3. **مع `support-byid.md` بند 2** — التقرير يذكر «لا توجد طلبات كتابة من هذه الصفحة» لصفحة `/support/:id`، بينما الصفحة فعلياً تنفّذ `POST /replies` و`PATCH` (تغيير الحالة) و`DELETE` و`PATCH /approve` — أربع عمليات كتابة. الوصف ناقص.

4. **مع تعليمات الجرد نفسها** — التعليمات تذكر أن «أعمدة SLA موجودة عبر الهجرة `003_sla_deadline_column`». بالفحص: الهجرة 003 تضيف `slaDeadline` إلى **`maintenance_requests`** لا `support_tickets` (`migrations/003_sla_deadline_column.sql:1`). عمود `support_tickets."slaDeadline"` موجود أصلاً ضمن تعريف الجدول في `schema_pre.sql` ولا علاقة له بالهجرة 003. الإسناد في التعليمات خاطئ.

5. **مع `docs/audit/UNVERIFIED_PATHS_ARCHITECTURE_MAP.md`** — التقرير يحصي لـ `support.ts` عدد **18** نقطة نهاية تحت `/support`. هذا الجرد يؤكد العدد 18، لكنه يضيف أن **6 منها فعلياً بلا واجهة مستهلكة** (check-sla, field-visit, csat POST, kb/:id GET, kb/:id/feedback)؛ الخريطة المعمارية لا تُميّز نقاط النهاية الميتة، فالعدد وحده يموّه نسبة الكود الميت في المسار.
