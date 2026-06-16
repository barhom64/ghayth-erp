# 20 — جرد محرّك تخطيط النقل (Transport Planning Engine Audit)

> ملحق إلزامي ضمن الموجة ج لـ#2079 — يسبق أي بناء جديد للـOptimizer أو تعديل على `assignmentSuggestionEngine.ts`. الاعتماد قرار مالك. لا كود قبل اعتماد الخطة المكتوبة.

- **HEAD المجرود:** `20c19020` (main بعد دمج #2108/#2110/#2112 — الموجة أ كاملة).
- **النطاق:** المحرّك المركزي للإسناد + سطح ops-weekly + قوالب الجدولة + حدود التداخل مع العمرة والصيانة والإجازات والملف الفني.
- **المنهج:** فحص حيّ للملفات المرجعية (`assignmentSuggestionEngine.ts`، `transport-planning.ts`، `transport-bookings.ts`، `vehicleCapacity.ts`، `driverRest.ts`، `cronScheduler.ts`، migrations 262/271/284/295/305/310). كل ادعاء أدناه له ملف:سطر مرئيّ.

---

## §0 — جرد المحاور الفعلية في محرّك الإسناد

`assignmentSuggestionEngine.ts:558-566` يجمع 7 محاور بأوزان ثابتة:

| المحور | الوزن | الحارس الصلب | الحارس الناعم |
|---|---|---|---|
| capacity | 0.20 | `< cargoKg`/`< pax` → 0 وblocker | غياب الحقل → 50 |
| availability | 0.10 | — | `status != 'available'` → 60 |
| conflict | 0.25 | تداخل `tstzrange` على dispatch → 0 | — |
| driver_rest | 0.15 | `hoursSince < restRequired` → 0 | داخل 2 ساعة من الحد → 80 |
| license | 0.10 | — (الصلب في `assertDriverEligibility` عند الـcommit) | mismatch ثقيل → 30 |
| distance | 0.10 | — | منحنى تنازلي 0–200 كم |
| agreement | 0.10 | مطابقة فئة العميل/سياسة الاستبدال | upgrade مسموح → 70 |

**الناتج النهائي:** ترتيب «اقتراحي». الحراس الصلبة الفعلية في الإسناد (`assertDriverEligibility`/`asserCapacity`/conflict overlap) تُعاد عند الـ`POST /dispatch-orders`. **المحرّك مستشار لا سلطة** — هذا التصميم صحيح ولا ينبغي قلبه.

**ما ليس في المحرّك إطلاقًا:**
- لا قراءة لـ`validForPassengers/validForCargo` (مهاجر منذ 295).
- لا قراءة لـ`operationalPayloadKg` — المقارنة دائمًا مقابل `payloadKg` (السقف الإسمي).
- لا قراءة لـ`fleet_maintenance` المجدولة في نافذة الحجز.
- لا قراءة لإجازات/غياب السائق سوى `status='on_leave'` (لا تقاطع زمني مع `driver_leave_requests` المعتمدة).
- لا تكامل مع `transport_route_patterns` / `transport_itineraries` (الـlegs المجاورة لا تُؤخذ في الحسبان عند ترتيب اللحظة التالية).
- لا قياس استخدام مركبة سابق («predictedUtilisation» مُعلَن في الـinterface سطر 81 ولا يُحسب أبدًا).

---

## §1 — استغلال الأسطول (Fleet Utilization)

**ما يوجد فعلًا:**
- `transport-planning.ts:355-389` — سطح `ops-weekly` يحسب `bookedMinutes / (7×24×3600)` لكل مركبة على نافذة 7 أيام، يرتّب تنازليًا.
- التغطية: سطح تشغيلي للمشغّل فقط؛ **لا يدخل المحرّك** كمحور ترجيح.
- `SuggestionResult.predictedUtilisation` معلن في `assignmentSuggestionEngine.ts:79-82` ولا يُحسب.

**الفجوات:**
1. **UTIL-01 — المحرّك أعمى عن الاستخدام السابق:** يُرشّح مركبة مكتملة الاستخدام (>90% أسبوعيًا) بنفس درجة مركبة ساكنة (<10%). يقود إلى استنزاف غير متوازن، إجهاد، صيانة مبكّرة، وراحة سائق ضائعة.
2. **UTIL-02 — مقام «7×24×3600» تجاري مُضلِّل:** يحتسب 24/7 وكأن الأسطول يعمل ليلًا/جمعة. الأنسب: نوافذ تشغيل لكل branch (متى يفتح/يغلق) + عطلات معروفة.
3. **UTIL-03 — لا أثر للوحدة المختلطة:** مركبة `validForPassengers AND validForCargo` تُحتسب كمستهلَكة بكامل دقائقها بصرف النظر عن نوع الرحلة.

**التوصية:**
- **محور جديد `utilization` (وزن 0.05 خصم من distance → 0.05):** قراءة دقائق محجوزة آخر 7 أيام من نفس استعلام ops-weekly، خصم نقاط للمتجاوزين 80%، إضافة نقاط للمتأخرين عن 30%. لا حارس صلب. **نمط نسخ-وألصق من ops-weekly، لا engine جديد.**
- **استبدال `predictedUtilisation` بحساب فعلي** = (وقت الحجز الحالي + بقية الأسبوع المحجوز) / نافذة تشغيل الفرع. تُحفظ على `SuggestionResult` ليعرضها المشغّل.
- **مقام `bookedMinutes` يحترم branch operating hours:** قراءة من `branches.workSchedule` إن وُجد، وإلا fallback لـ12×6 (10:00–22:00 سبت–خميس). يُدخَل كـsettings خادمية لا hard-coded.

**ليس Optimizer:** هذا ضبط محور ثامن في المحرّك القائم. الـbackhaul/multi-pickup batch optimizer يبقى P1 منفصلًا.

---

## §2 — النقل متعدد المقاطع (Multi-leg)

**ما يوجد فعلًا:**
- `transport_itineraries` + `transport_itinerary_legs` (migration 271:213-287) — نموذج كامل: leg sequence، نوافذ، فئة مطلوبة لكل leg، dispatchOrderId، أنواع legs (transit/pickup/dropoff/rest/fuel/inspection/custom).
- `suggestForLeg` في `assignmentSuggestionEngine.ts:250-306` يقترح لكل leg مستقلًّا، **لكنه يتعامل مع كل leg كأنه booking مستقل**.
- لا توجد آلية لإسناد itinerary كاملة لـ(vehicle، driver) واحد ما لم يضغط المشغّل «اقترح» لكل leg ويختار يدويًا نفس الثنائي.

**الفجوات:**
1. **MULTI-01 — اقتراحات legs غير متّسقة:** الـleg 2 تفترض المركبة في موقع origin النصّي للـleg، بينما هي فعلًا في موقع نهاية الـleg 1 (إن أُسند نفس الثنائي). نتيجة: درجة distance خاطئة، وأحيانًا يُرشَّح ثنائي يكسر السلسلة لأنه «أقرب جغرافيًا» للـleg مستقلًّا.
2. **MULTI-02 — لا حارس تسلسل زمني:** المحرّك لا يكتشف إذا كان `legs[i].scheduledEnd > legs[i+1].scheduledStart` (تداخل ذاتي داخل الـitinerary نفسها) — يفلت إلى الـdispatch ثم يُكتشف هناك متأخّرًا.
3. **MULTI-03 — لا اقتراح «itinerary كاملة»:** المشغّل يكرّر العملية N مرة لـN legs؛ لا يوجد `POST /transport/itineraries/:id/suggest` يرجع مصفوفة `[{legId, candidates}]` بترتيب يحترم السلسلة.
4. **MULTI-04 — `assignedVehicleId/DriverId` على الـleg لا يبني dispatchOrder تلقائيًا:** الـmigration 271:262-263 يُسجّل الإسناد ولكن إنشاء الدفعة (legs → bookings → dispatch) ليس مكشوفًا. حالة meta: «مُسنَد قبل وجود dispatch» قد تخلق سوء فهم في ops-dashboard.

**التوصية:**
- **`POST /transport/itineraries/:id/suggest` جديد:** يدور على legs بالترتيب، يمرّر `lastKnownLocation` بين legs (= destination الـleg السابق)، يرجّح بقاء الثنائي نفسه على كامل السلسلة بـ`continuity` bonus (نقاط +10 إذا اقتُرح نفس (vehicleId, driverId) في الـleg السابق). **محسوب طبقة فوق `suggestForCriteria` لا داخله.**
- **حارس تسلسل ذاتي في `transport-planning.ts` قبل قبول legs:** إذا تداخلت legs زمنيًا، رفض الحفظ. خطأ Arabic واضح: «المرحلة (n+1) تبدأ قبل انتهاء المرحلة n».
- **مادlisation قياسي للـitinerary:** زر «جسِّد الجدولة» يُنشئ N bookings (واحد لكل leg غير-rest/fuel/inspection) + dispatch orders بآلية idempotent على (itineraryId, legNumber). لا يحلّ محل الـmaterialise القائم للقوالب — منفصل.

**ليس Optimizer:** هذا إكمال نموذج موجود. الـRoute Optimization (TSP, VRP, time-windows) يبقى P1 منفصلًا — يحتاج OR-Tools أو مزوّد خارجي.

---

## §3 — تكامل العمرة (Umrah)

**ما يوجد فعلًا:**
- `transport_bookings.umrahGroupId` (FK لـ`umrah_groups`)، مع source = `umrah_group` (`transport-bookings.ts:60, 167, 553`).
- `transport_itineraries.umrahGroupId` (migration 271:219).
- `CapacitySource = 'umrah_transport'` (`vehicleCapacity.ts:33`) و`EligibilitySource` المماثل (`driverEligibility.ts:40`) — البنية موجودة.
- `transport-bookings.ts:440-450` — `extractRelatedEntity` يقرأ الـgroup ويعيده للسطر.

**الفجوات:**
1. **UMR-01 — لا تخصيص للسائق المُجرَّب لمجموعة:** المحرّك لا يميّز السائق الذي أكمل ≥N رحلات لنفس الـ`umrahGroupId` (أو لـcustomer العمرة) في آخر 90 يومًا. كل عمليات «المرشد المتمرس على فوج الأردن» لا تظهر للمشغّل.
2. **UMR-02 — لا حارس fixed مع مواعيد الطيران/الحجز:** `flightNumber` و`supervisorPhone` يُسجَّلان (`transport-bookings.ts:553-557`) ولا يُربطان بأي محرّك. التأخّر على رحلة طيران لا يُعيد ترتيب الـitinerary تلقائيًا.
3. **UMR-03 — `umrah_groups.programStartsAt/EndsAt` (إن وُجدا) لا يُقصيان مركبات/سائقين خارج النافذة:** إسناد مركبة في يوم لا يتقاطع مع برنامج الفوج ممكن (يُرفض لاحقًا في القبول البشري لا في المحرّك).
4. **UMR-04 — لا lineage في النتائج:** الـ`SuggestionResult` لا يُفرّق رحلة-عمرة عن رحلة عامّة في الـreasons؛ المشغّل لا يرى «هذا الثنائي خدم نفس الفوج 4 مرات».

**التوصية:**
- **محور `umrahFamiliarity` (وزن 0.05 جديد، مأخوذ من distance 0.10→0.05):** يُفعَّل فقط إذا `transportServiceType = 'passenger_umrah'`. يقرأ COUNT من `transport_dispatch_orders` (Status completed، آخر 90 يومًا، نفس `umrahGroupId` أو نفس `b.customerId` العمرة). ≥3 رحلات → +15؛ ≥1 → +8.
- **حارس «داخل برنامج الفوج»:** عند إنشاء الـbooking مع `umrahGroupId`، رفض إذا `pickupWindowStart` خارج `[group.programStartsAt - 1d, group.programEndsAt + 1d]`. يكفي حارس زمني، لا يلمس المحرّك.
- **lineage في الـreasons:** عند `umrahFamiliarity ≥ 8`، إضافة سطر «هذا السائق خدم الفوج N مرات سابقًا» — يفيد المشغّل.

**شرط:** هذه التغييرات تفترض أن `umrah_groups` فعلًا تحمل `programStartsAt/EndsAt` — يحتاج تأكيدًا من ملف 09 أو فحص schema. **CHECK-PE-01.**

---

## §4 — الملف الفني للمركبة (Vehicle Technical Profile)

**ما يوجد فعلًا (migration 262 + 295):**

19 حقلًا فنيًا على `fleet_vehicles`:
- شحن: `payloadKg`, `operationalPayloadKg` (آمن تشغيليًا), `boxLengthCm/WidthCm/HeightCm`, `axleCount`, `tireCount`, `tireSize`.
- محرّك: `engineDisplacementCc`, `transmissionType`.
- ركاب: `seatCount`, `hasAc`, `screenCount`, `doorCount`, `upholsteryType`, `safetyFeatures` (jsonb).
- معدّات: `operatingHours`, `equipmentAttachments` (jsonb).
- صلاحيّة: `validForPassengers`, `validForCargo` (migration 295).

**ما يقرأه المحرّك فعلًا:** `payloadKg`, `seatCount`, `vehicleType` فقط (`assignmentSuggestionEngine.ts:331-347, 412-444, 482-498`).

**الفجوات الحادّة:**
1. **PROF-01 — `operationalPayloadKg` مُخزَّن ومُهمَل:** المقارنة في `assignmentSuggestionEngine.ts:415-430` تستخدم `payloadKg` فقط. السقف الإسمي للمركبة يقبل حمولة قانونية على الأوراق لكنها غير آمنة على الطريق. **خطر تشغيلي مباشر.**
2. **PROF-02 — `validForPassengers/validForCargo` معطّلتان في المحرّك:** يمكن اقتراح ترَيلر cargo-only لـ`passenger_umrah` (حتى الـ100 درجة) — يفلت إلى guard الأهلية فقط إن جرى الـcommit. الأصحّ: إقصاء فوريّ.
3. **PROF-03 — أبعاد الصندوق لا تشارك في الترشيح:** حجز يطلب «حمولة 3×1.2×1.5م» لا يوجد طريق له ليُقارَن مع `boxLengthCm/WidthCm/HeightCm`. (حقول الحجم على `transport_bookings` تحتاج تأكيدًا — **CHECK-PE-02**.)
4. **PROF-04 — `safetyFeatures` و`hasAc` للركاب لا أثر لها في المحرّك:** عميل يطلب «حافلة بمكيّف فعّال» لا فلتر له. حقل العميل المعادل لا يبدو موجودًا — **CHECK-PE-03**.

**التوصية:**
- **عاجل (حارس صلب):** قبل دخول حلقة الـscoring في `assignmentSuggestionEngine.ts:398`، رفض المركبة إذا `tripFamily='cargo' AND validForCargo=false` أو `tripFamily='passenger' AND validForPassengers=false`. صفر سطر إضافي على نتائج. لا «درجة 30» — إقصاء.
- **عاجل (تفضيل آمن):** في `capacityScore`، استخدم `operationalPayloadKg ?? payloadKg`. إذا الـحمولة المطلوبة > `operationalPayloadKg` لكنها ≤ `payloadKg`، خصم درجة (60) + reason: «الحمولة ضمن السقف القانوني لكنها تتجاوز الحمولة التشغيلية الآمنة». لا blocker (يمرّ بـoverride موثق إن لزم).
- **CHECK-PE-02/03:** يتطلب توثيق ما يصل من الحجز حول الأبعاد/مزايا الراحة قبل توسيع المحرّك. **لا تنفّذ بنفس PR التوصيتين الأوليين.**

**فائدة جانبية:** هذه أكبر دفعة قيمة بأقل سطور — حارسان قبل الحلقة كافيان لإغلاق فجوة آمان شاهقة.

---

## §5 — راحة السائق (Driver Rest)

**ما يوجد فعلًا:**
- `restHoursRequired`, `lastDutyEndedAt` على `fleet_drivers` (migration 271:103-106).
- محور driver_rest في `assignmentSuggestionEngine.ts:463-479` — حارس صلب إن لم تُستوفَ ساعات الراحة منذ آخر إنهاء.
- ختم `lastDutyEndedAt`:
  - من إنهاء جلسة الملاحة (`transport-planning.ts:943-952`).
  - من تكميل dispatch direct (`transport-bookings.ts:1010-1024`).
  - **بعد TA-T18-03**: المختبر يُغطّي مسارَي «navigation/complete» و«direct complete».

**الفجوات:**
1. **REST-01 — لا حدّ يومي ولا أسبوعي:** `restHoursRequired` نقطة-بنقطة (هذه الرحلة بعد تلك). لا حارس على «أكثر من 13 ساعة قيادة في يوم» أو «أكثر من 60 ساعة قيادة في الأسبوع» (السقوف العادية في صناعة النقل).
2. **REST-02 — `driver_leave_requests` ليست تقاطعًا زمنيًا:** المحرّك يفحص `status='on_leave'` فقط (سطر 464). إجازة معتمدة في الأسبوع القادم بـ`startsAt/endsAt` لا تقصي السائق من رحلة في تلك النافذة. **CHECK-PE-04** (وجود الجدول وحقوله).
3. **REST-03 — لا أمن رحلة طويلة:** رحلة 14 ساعة (الرياض-جدة بدون توقف) تُسند لسائق وحيد بدون رفع علم؛ المحرّك لا يحسب مدة الرحلة من scheduledStartAt/EndAt مقابل سقف القيادة المتواصلة (مثلًا 4.5 ساعة بحسب لائحة هيئة النقل).
4. **REST-04 — `lastDutyEndedAt` يُختم في النهاية فقط:** أثناء الرحلة، رحلات أخرى تُقترَح للسائق بناءً على آخر إنهاء قديم (لأن الحالي لم ينتهِ بعد). الأنسب: حارس conflict overlap (موجود ✅) + سقف «لا تبدأ رحلة جديدة قبل إنهاء الحالية» (موجود ضمنيًّا في conflict أيضًا ✅) — هذه ليست فجوة، فقط تأكيد.

**التوصية:**
- **حارس يومي/أسبوعي بسيط:** قبل اعتماد المرشح، استعلام واحد لـSUM دقائق آخر 24h و7d. تجاوز السقف → blocker. السقوف من `transport_planning_settings` (افتراض 13h يوميًا، 60h أسبوعيًا، قابل للتعديل). تشريع المالك حصرًا — **CHECK-PE-05**.
- **حارس تقاطع الإجازات (إذا تحقّق CHECK-PE-04):** قراءة `driver_leave_requests` المعتمَدة وتقاطع `tstzrange` مع نافذة الحجز. blocker.
- **علم رحلة-طويلة:** إذا `scheduledEndAt - scheduledStartAt > 6h`، إضافة reason صفراء «الرحلة تتجاوز 6 ساعات — تأكَّد من توفر سائق احتياطي أو توقف راحة مجدول». لا blocker، تنبيه عاطفي.

**ليس Optimizer:** كلها استعلامات بسيطة و3 سطور إضافية في الحلقة.

---

## §6 — الترقية التلقائية للمركبة (Auto-upgrade)

**ما يوجد فعلًا:**
- `UPGRADE_LADDER` ثابت في `assignmentSuggestionEngine.ts:170-175` — 13 درجة من `compact` صعودًا إلى `trailer`.
- `isUpgrade(from, to)` (سطر 181) — منطقي ولكنه يخلط ركاب وحمولة على نفس السلّم (van قبل bus_22، truck فوق bus_50). الـladder غير متجانس عائليًّا.
- سياسة الاستبدال على الحجز: `vehicleSubstitutionPolicy ∈ {exact_only, same_class_only, equivalent_allowed, upgrade_allowed}` + `allowUpgrade` boolean (`transport-bookings.ts:186`).
- منطق agreement (سطر 530-555): إذا الترقية مسموحة → 70 نقطة، وإلا 20 + blocker.

**الفجوات:**
1. **UPG-01 — ladder مختلط cargo+passenger:** «ترقية» van→bus_22 لا معنى لها لرحلة شحن. الـladder يحتاج فرعين: `PAX_LADDER = ['compact','sedan','suv','van','minivan','bus_22','bus_29','bus_45','bus_50']` و`CARGO_LADDER = ['pickup','truck_3.5t','truck_8t','truck_18t','trailer']`. تختار العائلة بحسب `tripFamily`.
2. **UPG-02 — لا سقف تكلفة:** ترقية sedan→suv مقبولة مجانًا في المحرّك. واقعيًا، الترقية تُسجَّل كـ«تنازُل» بسعر العميل القديم لكن المركبة الأعلى. لا حساب لتأثير الترقية على الاستهلاك (وقود/بلى) في الترجيح.
3. **UPG-03 — لا تذكير «الفئة المطلوبة كافية لكنها أوفر»:** إذا فئة المطلوب متاحة بنفس الدرجة والترقية ليست ضرورية، لا تنبيه يدفع المشغّل للتمسّك بالأصل. حاليًّا: ترقية تُختار بـ70 وأصلية تُختار بـ100 → لا مشكلة فعليًّا، فقط لا قيمة مضافة من سرد «هذه ترقية مفيدة لأن…».
4. **UPG-04 — `same_class_only` لا تستفيد من CLASS_EQUIVALENCES:** سياسة «نفس الفئة فقط» تمنع `sedan↔compact` بينما هما مكافئتان (`assignmentSuggestionEngine.ts:157-167` و539-540). تحتاج تأكيد القرار: هل `same_class_only` تعني «تطابق حرفي» أم «مكافئ»؟ القرار الحالي **حرفي + مكافئ**، السطر 535 يدمج `same_class_only` ضمن مكافئ. **CHECK-PE-06.**

**التوصية:**
- **عاجل (UPG-01):** فصل الـladder إلى ladder-per-family واختيار الـladder بناءً على `tripFamily`. تأمين عدم اقتراح ترقية تتجاوز العائلة. اختبار unit بسيط.
- **CHECK-PE-06:** ✅ **محسوم** بقرار مالك «اعتمد واسحب» 2026-06-15 — **تطابق حرفي صارم**. شُحن في PR #2355 (`agreementScore` لم يعد يقبل المكافئ تحت `same_class_only`، blocker «سياسة الاستبدال تمنع تغيير الفئة»).
- **مؤجَّل:** سقف التكلفة (UPG-02) — يحتاج ربط بقاعدة أسعار الترقيات (لا يوجد).

---

## §7 — منع التعارضات التشغيلية (Conflict Prevention)

**ما يوجد فعلًا:**
- conflict overlap على dispatch — `assignmentSuggestionEngine.ts:376-384` — قوي، يستخدم `tstzrange && tstzrange`. ✅
- bulk planning في `transport-planning.ts` يدمج dedupe داخل الدفعة (الملف 07 §4).
- reschedule يعيد فحص التعارض.

**الفجوات:**
1. **CONF-01 — لا تقاطع مع `fleet_maintenance` المجدولة:** صيانة محجوزة لمركبة (موجودة كجدول، migration 269) لا يُفحَص تقاطعها مع نافذة الحجز. المحرّك يُسند مركبة ستكون في الورشة.
2. **CONF-02 — لا تقاطع مع `driver_leave_requests` (مكرّر REST-02).**
3. **CONF-03 — لا حماية من تجاوز نطاق الـbranch:** booking لـbranch X يمكن أن يستخدم مركبة `branchId=Y` بلا فلتر. التصميم الحالي معتمد على `companyId` فقط في الـSELECT (سطر 344). إذا كان المالك يريد عزل الموارد بين الفروع تشغيليًّا — **CHECK-PE-07** (هل الفروع تشارك الأسطول؟).
4. **CONF-04 — لا تقاطع مع رحلات itinerary غير-dispatch:** legs مُسنَدة لكنها لم تُجسَّد بعد كـdispatch (`assignedVehicleId` على الـleg، migration 271:262) لا يلتقطها conflict probe. الـleg المسنَدة لـsuvA يوم الإثنين 8-12 لا تمنع اقتراح suvA لـbooking في نفس النافذة.
5. **CONF-05 — لا فلترة `insuranceExpiry/registrationExpiry`:** مركبة منتهية الترخيص تُقترح. حقول الانتهاء موجودة (migration 083) ولا تُقرأ في المحرّك.
6. **CONF-06 — `vehicle_capacity_overrides` لا تُذكَر:** سجلّ الإسناد-فوق-السقف موجود (migration 262:92-108) ولا يُعرَض على المشغّل عند اقتراح نفس المركبة مرة أخرى لحمل قريب من نفس السقف.

**التوصية:**
- **عاجل (CONF-01):** استعلام `fleet_maintenance` المجدولة (status `scheduled`/`in_progress`) في نفس الـtstzrange. blocker على المركبة. سطر واحد إضافي في conflict probe.
- **عاجل (CONF-05):** قبل دخول الحلقة، إقصاء مركبة لها `registrationExpiry < scheduledEndAt::date` أو `insuranceExpiry < scheduledEndAt::date`. blocker واضح.
- **CONF-04:** توسيع conflict probe ليشمل `transport_itinerary_legs` ذات `assignedVehicleId IS NOT NULL AND scheduledStart/End NOT NULL AND dispatchOrderId IS NULL`. blocker متطابق مع dispatch overlap.
- **CONF-02:** كما §5.
- **CONF-03/07:** قرار مالك. التوصية الافتراضية: **لا فلتر `branchId`** (شركة واحدة، أسطول مشترك)، مع `branchId` كـtie-breaker (تفضيل مركبة الـbranch).
- **CONF-06:** عرض سجل آخر override للمركبة في الـreasons («تم تجاوز سعة هذه المركبة قبل 3 أيام بتفويض موثق»). لا blocker.

---

## §8 — خرائط القرار قبل أي كود (محسومة 2026-06-14)

| الرمز | السؤال | الافتراضي المقترَح | الحسم النهائي |
|---|---|---|---|
| CHECK-PE-01 | `umrah_groups.programStartsAt/EndsAt` موجودان؟ | فحص schema قبل تنفيذ UMR | **❌ غير موجودَين.** `umrah_groups` يحمل `programDuration` فقط (integer أيام). البديل المتاح: `umrah_pilgrims.arrivalDate/departureDate` (موجودان) — يمكن اشتقاق نافذة الفوج كـ`MIN(arrivalDate)..MAX(departureDate)`. UMR-03 إن نُفِّذ يستخدم هذا الاشتقاق بدلًا من حقول مباشرة. |
| CHECK-PE-02 | حقول حجم الحمولة على `transport_bookings`؟ | لا يوجد — تأجَّل PROF-03 | **❌ غير موجودة كحقول مخصَّصة.** `transport_bookings` يحمل `cargoWeight + cargoQuantity + cargoUnit + cargoDescription` (نص حرّ) + `cargoOperationalMetadata jsonb` (مهرب). PROF-03 (مطابقة أبعاد الحمولة بالـbox الفعلي) مؤجَّل بشكل رسمي — يحتاج إضافة `cargoLengthCm/WidthCm/HeightCm` أو الاتفاق على schema `cargoOperationalMetadata`. |
| CHECK-PE-03 | حقول تفضيل العميل (AC, safety)؟ | لا يوجد — تأجَّل PROF-04 | **❌ غير موجودة.** `transport_bookings` يحمل `requestedVehicleClass` (نص) و `vehicleSubstitutionPolicy` فقط. لا حقل عميلي لـ«مكيّف» أو «ميزات سلامة». PROF-04 (مطابقة `hasAc / safetyFeatures` للمتطلَب) مؤجَّل — جانب الطلب لا يحمل المتطلَب أصلًا. |
| CHECK-PE-04 | `driver_leave_requests` موجود؟ | تأكيد + فحص | **✅ موجود ومستخدَم.** الجدول الفعلي اسمه `hr_leave_requests` (employeeId/startDate/endDate/status مع `chk_status` enum). **المحرّك يقرأه فعلًا** عبر `assignmentSuggestionEngine.ts:652-664 + 876` (`leaveByEmployeeId Map + checkDriverLeave`). REST-02 مغلق. |
| CHECK-PE-05 | سقوف القيادة اليومية/الأسبوعية؟ | 13h/60h من `transport_planning_settings` | **✅ موجودان كأعمدة + المحرّك يقرؤهما.** `transport_planning_settings.defaultMaxDailyDrivingMinutes` (default 780 = 13h) و `defaultMaxWeeklyDrivingMinutes` (default 3600 = 60h) + CHECK constraint سَنوي. المحرّك يستهلكهما عبر `drivingCaps + checkDriverDrivingCaps` (الأسطر 778, 878-881). REST-01 مغلق. |
| CHECK-PE-06 | `same_class_only` تعني حرفي أم مكافئ؟ | حرفي صارم | **✅ محسوم (قرار مالك 2026-06-14):** حرفي صارم. شُحن في PR #2355 — `agreementScore` لم يعد يُكافئ الـclass للسياسة الصارمة، وأصبحت ترسل blocker «سياسة الاستبدال تمنع تغيير الفئة». UPG-04 مغلق. |
| CHECK-PE-07 | الفروع تتشارك الأسطول؟ | نعم — branch tie-breaker فقط | **✅ محسوم (قرار مالك 2026-06-14):** نعم تتشارك. لا فلتر `branchId` في الـSELECT، الفرع tie-breaker فقط عند التساوي. السلوك الحالي للمحرّك مطابق — لا تعديل مطلوب. CONF-03 مغلق. |

**خلاصة الحسم 2026-06-14 (محدَّثة 2026-06-15):**
- ✅ **7/7 محسومة:** CHECK-PE-01..07 جميعها. الثلاثة (01/02/03) المتعلِّقة بحقول schema مفقودة تؤجِّل توسعات «UMR-03 / PROF-03 / PROF-04» إلى ما بعد قرار مالك بإضافة الحقول. الأربعة الباقية (04/05/06/07) محسومة إيجابًا — المحرّك ينفّذها فعلًا.
- ✅ **CHECK-PE-06 (2026-06-15)** أُغلِق بقرار مالك «اعتمد واسحب» — حرفي صارم (PR #2355).
- ✅ **CHECK-PE-07** محسومة بقرار مالك 2026-06-14: الأسطول مشترك بين الفروع، `branchId` tie-breaker فقط.

**خلاصة موجة الخرائط (2026-06-15):**
- ✅ **Maps Provider Adapter** شُحن في PR #2361 — مسار النقل (الحجز + التخطيط + التوزيع + شاشة السائق) لا ينكسر عند غياب مفتاح Google Maps. قيمة `auto` الجديدة + `resolveEffectiveProvider` + `MapsService.toClientSettings` + قناع API key + شريط تنبيه عربي + زرّ «ابدأ الملاحة» keyless على شاشة السائق. هذا يحلّ جزءًا تشغيليًا من TA-GAP-09 (مراقبة حصة الخرائط لا تزال خارج الموجة — تنتظر قرار المالك على المفتاح التجاري).

---

## §9 — المهام المقترحة (بصيغة #2079 §9 — تُضاف إلى الملف 18)

### TA-T18-PE-01 — حارسا الصلاحية وحدّ الحمولة الآمنة (PROF-01 + PROF-02)
**الوصف:** المحرّك يقترح مركبات ركاب لحمل cargo والعكس، ويتجاهل `operationalPayloadKg`. **الموقع:** `assignmentSuggestionEngine.ts:398` (قبل حلقة المركبات) + `assignmentSuggestionEngine.ts:415-430` (capacityScore). **المطلوب:** (أ) إقصاء `tripFamily='cargo' AND validForCargo=false` أو passenger مع `validForPassengers=false`. (ب) المقارنة في capacity تستخدم `operationalPayloadKg ?? payloadKg`؛ تجاوز الـoperational ضمن الـnominal → درجة 60 + reason، تجاوز الـnominal → 0 + blocker. **الممنوع:** أي تعديل على الـguards الصلبة عند الـcommit (`assertCapacity`)، أي تعديل على الحقول. **معيار القبول:** اختبارات: (1) ترَيلر `validForCargo=true, validForPassengers=false` لا يظهر لحجز `passenger_umrah`. (2) شاحنة `payloadKg=5000, operationalPayloadKg=4000` تحصل على درجة 60 لحمل 4500 ولا تحصل على blocker. **الأولوية:** عاجل جدًا. **الخطورة:** عالية (سلامة). **الارتباط:** الملف 05 + 04.

### TA-T18-PE-02 — حارس صيانة + حارس انتهاء التراخيص (CONF-01 + CONF-05)
**الوصف:** المحرّك يُسند مركبات في الورشة أو منتهية التأمين/الترخيص. **الموقع:** `assignmentSuggestionEngine.ts:376-386` + ما قبل حلقة المركبات. **المطلوب:** (أ) توسيع conflict probe ليشمل `fleet_maintenance` (status `scheduled`/`in_progress` بنافذة `scheduledStartAt/EndAt`) → blocker. (ب) قبل الحلقة، إقصاء مركبة لها `registrationExpiry < scheduledEndAt::date` أو `insuranceExpiry < scheduledEndAt::date`. **معيار القبول:** اختباران: (1) مركبة بصيانة مجدولة مساء الإثنين لا تُقترح لرحلة الاثنين 18:00. (2) مركبة `insuranceExpiry='2026-06-10'` لا تُقترح لرحلة 2026-06-12. **الأولوية:** عاجل. **الخطورة:** عالية. **الارتباط:** صيانة + ملف المركبة.

### TA-T18-PE-03 — تقاطع الإجازات + سقوف القيادة (REST-01 + REST-02)
**الوصف:** السائق في إجازة معتمدة الأسبوع القادم يُقترح، ولا حارس على «13 ساعة في اليوم». **المطلوب:** (أ) قراءة `driver_leave_requests` المعتمَدة (مشروط بـCHECK-PE-04) وإقصاء بـoverlap → blocker. (ب) قراءة سقوف من `transport_planning_settings` (افتراضات 13h/60h)، استعلام SUM لدقائق آخر 24h/7d، تجاوز → blocker بلون مختلف عن conflict. **الممنوع:** بناء الحقول إن لم تكن موجودة — يفتح ticket migration منفصلًا أولًا. **معيار القبول:** اختبار يضع سائقًا على 12 ساعة سابقة في يوم ويقترحه لرحلة 2 ساعات → blocker «تجاوز السقف اليومي». **الأولوية:** عاجل. **الخطورة:** عالية. **الارتباط:** السائقون + الإجازات (HR).

### TA-T18-PE-04 — محور utilization + branch operating hours (UTIL-01 + UTIL-02)
**الوصف:** المحرّك أعمى عن استخدام المركبة السابق. **الموقع:** `assignmentSuggestionEngine.ts:557-566` + استعلام جديد قبل الحلقة. **المطلوب:** إضافة محور `utilization` بوزن 0.05 (نُقَل من `distance` لتبقى الأوزان مجموعها 1.0). قراءة `bookedMinutes` آخر 7 أيام لكل مركبة، نقطة 100 إذا 30–60%، 70 إذا 60–80% أو 10–30%، 40 إذا >80%، 50 إذا <10%. حساب `predictedUtilisation` فعلًا (يحلّ مكان السطر 81-82 الفارغ). **معيار القبول:** اختبار: مركبتان بنفس درجة في كل المحاور، الأقل استخدامًا تظهر أولًا. `predictedUtilisation` يرجع رقمًا، لا undefined. **الأولوية:** مهم. **الخطورة:** متوسطة. **الارتباط:** ops-weekly.

### TA-T18-PE-05 — اقتراح itinerary كاملة + حارس تسلسل ذاتي (MULTI-01 + MULTI-02 + MULTI-03)
**الوصف:** `suggestForLeg` يعامل كل leg كحجز مستقل ويفقد سياق السلسلة. **الموقع:** `assignmentSuggestionEngine.ts:250-306` + `transport-planning.ts` (نقطة legs CRUD). **المطلوب:** (أ) `POST /transport/itineraries/:id/suggest` جديد يدور legs بالترتيب ويمرّر آخر موقع، مع `continuity` bonus +10 إذا الثنائي تم اقتراحه للـleg السابق. (ب) حارس تسلسل قبل قبول leg جديد/تحديثها: رفض overlap داخلي بخطأ Arabic. **الممنوع:** كسر `suggestForLeg` (يبقى للاستخدام المستقل). **معيار القبول:** اختباران: (1) itinerary بـ3 legs تعطي ترتيبًا حيث نفس (vehicleId,driverId) في أعلى 1 لكل leg إن كان متاحًا. (2) leg2 يبدأ قبل نهاية leg1 → 422 + رسالة عربية. **الأولوية:** مهم. **الخطورة:** متوسطة. **الارتباط:** التخطيط متعدد المقاطع.

### TA-T18-PE-06 — تكامل العمرة في الإسناد (UMR-01 + UMR-03 + UMR-04)
**الوصف:** السائق المتمرّس على فوج بعينه لا يُكافأ في المحرّك. **الموقع:** `assignmentSuggestionEngine.ts` + booking guard. **المطلوب:** محور `umrahFamiliarity` بوزن 0.05 (مأخوذ من distance بعد PE-04: distance 0.05 → 0.025، utilization 0.05، umrah 0.025)؛ يُفعَّل فقط لـ`passenger_umrah`. حارس «داخل برنامج الفوج» (مشروط بـCHECK-PE-01). lineage في الـreasons. **الممنوع:** أي تأثير على رحلات غير-عمرة. **معيار القبول:** سائق أكمل 4 رحلات لفوج X يظهر فوق سائق أكمل 0 لنفس الفوج، بفارق ≥ 1 نقطة في الـscore النهائي. **الأولوية:** مهم. **الخطورة:** متوسطة. **الارتباط:** العمرة + السائقون.

### TA-T18-PE-07 — فصل ladder الترقية (UPG-01)
**الوصف:** ladder مختلط passenger+cargo يُتيح ترقيات بلا معنى. **الموقع:** `assignmentSuggestionEngine.ts:170-185`. **المطلوب:** ladder per-family، اختيار بناءً على `tripFamily` (يُمرَّر من `suggestForCriteria`). cleanup CLASS_EQUIVALENCES تماشيًا. **معيار القبول:** اختبار: ترقية «van → bus_22» مرفوضة لـ`tripFamily='cargo'`. **الأولوية:** متوسط. **الخطورة:** منخفضة. **الارتباط:** سياسة الاستبدال.

### TA-T18-PE-CHECKS — حسم نقاط CHECK-PE-01..07
لا PR كود — قرار مالك على 7 نقاط (الجدول §8). مخرج: ملاحظة قرار في #2079 §11 + تحديث هذا الملف.

---

## §10 — ما **ليس** ضمن هذا الجرد (ولماذا)

- **Fleet Optimizer batch-mode (VRP/TSP، route optimization، backhaul):** يبقى P1 خارج الموجة ج. هذا الجرد يضبط المحرّك الاقتراحي **الحالي** نقطة-بنقطة. الـbatch optimizer يحتاج OR-Tools أو مزوّد + قرار مالك على التكلفة + تجربة pilot. **لا نخلط الاثنين.**
- **Driver Reputation Scoring (0.4·onTime + 0.4·completion + 0.2·startRate + specialty multipliers):** سعادة طلبه سابقًا. يبقى مهمة منفصلة (TA-T18-DR) بعد إكمال PE-01..07 — كلاهما يلامس نفس المحرّك ودمجهما في PR واحد سيكون كبيرًا جدًا.
- **التقويم الموحَّد التفاعلي (TR-022):** P1 — سطح UI، لا محرّك.
- **مراقبة حصة الخرائط (TA-GAP-09):** بعد مفتاح Google التجاري (قرار مالك). ملاحظة 2026-06-15: قاعدة التشغيل الآمنة بدون مفتاح اكتملت عبر **Maps Provider Adapter** (PR #2361) — المتبقّي فقط عدّاد حصة الاستهلاك بعد ربط المفتاح التجاري.

---

## §12 — Vehicle Capability Matrix (VCM) — نمذجة canon لا توسعة محرّك

> **قرار مالك (سعادة، 2026-06-11):** الملف الفني للمركبة ليس «حقول إضافية اختيارية» — هو **مصفوفة قدرة موحَّدة** يمرّ عليها المحرّك قبل أي ترشيح. لا تُقترح مركبة لم تُعرَّف قدرتها.

**ما يوجد الآن (مبعثَر، غير معاهد):**

19 حقلًا مهاجَرًا (262 + 295) لكن **بلا مفهوم «مصفوفة قدرة»**:
- صحّة الأنواع: `validForPassengers`, `validForCargo` (boolean nullable — `null` = «غير محدَّد» = يفلت).
- السعة الكمّية: `payloadKg`, `operationalPayloadKg`, `seatCount`.
- الفيزياء: `boxLengthCm`, `boxWidthCm`, `boxHeightCm`, `axleCount`, `tireCount`, `tireSize`.
- المحرّك: `engineDisplacementCc`, `transmissionType`.
- الراحة: `hasAc`, `screenCount`, `doorCount`, `upholsteryType`, `safetyFeatures` (jsonb).
- المعدّات: `operatingHours`, `equipmentAttachments` (jsonb).
- **مفقود تمامًا:** `fuelType`, `operationalPassengerCapacity` (السعة التشغيلية للركاب — مختلفة عن `seatCount` السقف الإسمي), `vehicleServiceTypes` (مصفوفة الخدمات المعتمدة)، `compatibleTripFamilies`.

**المسلَّمات المطلوبة بعد اعتماد VCM:**
1. **`vehicle_capability_matrix` view (أو computed columns)** يجمّع الحقول في عقد موحَّد:
   ```
   {
     family: {
       passengers: { eligible, seatCount, operationalSeats },
       cargo:      { eligible, payloadKg, operationalPayloadKg,
                     boxLxWxH, axleCount, tireCount, tireSize },
       equipment:  { eligible, operatingHours, attachments }
     },
     powertrain: { fuelType, engineDisplacementCc, transmissionType },
     amenities:  { hasAc, screenCount, doorCount, upholsteryType, safetyFeatures },
     serviceTypes: ['passenger_umrah','passenger_general','cargo_load','equipment_rental',…],
     completeness: 0..100  // كم حقلًا في الـVCM مُعبَّأ
   }
   ```
2. **حارس صلب في المحرّك (مبكّر، قبل الحلقة):** مركبة `completeness < 70%` أو `validFor*` غير معبَّأ للعائلة المطلوبة → **إقصاء مع reason صريح**: «الملف الفني للمركبة غير مكتمل — لا يمكن الترشيح بدون تعريف القدرة».
3. **حقول جديدة (migration واحدة):** `operationalPassengerCapacity NUMERIC`، `fuelType TEXT` (CHECK ANY ARRAY)، `vehicleServiceTypes TEXT[]` (افتراضي مشتق من `validFor*` للترحيل).
4. **شاشة VCM موحَّدة** (إكمال TA-T18-05): بدلًا من «تبويب تحرير الحقول الـ19»، تبويب «مصفوفة القدرة» يعرض الـcompleteness ويميّز الحقول الحمراء التي تفلت المحرّك.
5. **بوّابة استيراد:** أي مركبة جديدة لا تُحفَظ بـ`status='available'` ما لم تجتز VCM minimum (`validFor*`+سعة عددية مطابقة).

**المثال الذي ساقه سعادتك حرفيًا:**
- *«طلب عمرة 45 راكب → قد يقترح النظام مركبة لا تستوعب العدد.»*
  حاليًا: `seatCount=null` → capacity score 50، تظهر في الترتيب. **بعد VCM:** إقصاء بـcompleteness<70 (لأن `seatCount` غير معبَّأ) أو بـ`validForPassengers!=true`.
- *«حمولة 38 طن وحمولة تشغيلية 30 طن.»*
  حاليًا: المقارنة بـ`payloadKg=40000` → 100 درجة (يفلت). **بعد VCM:** المقارنة بـ`operationalPayloadKg=30000` ← blocker «الطلب يتجاوز السعة التشغيلية الآمنة» **حتى لو** كان دون السقف القانوني.

**هذا يحلّ:** PROF-01، PROF-02، PROF-04 (تفضيلات الراحة)، CONF-05 (التراخيص — تُضاف إلى الـcompleteness)، **و يُلغي حاجة PE-01 كتعديل منفصل** (يصبح جزءًا من VCM gate).

---

## §13 — Route Leg كـCanon (لا Feature) — نمذجة لا توسعة

> **قرار مالك (سعادة، 2026-06-11):** *«لا تجعل multi-leg مجرد ميزة — هذا تشغيل يومي. مطار جدة → فندق مكة → الحرم → مزار → فندق → مطار جدة. ورأس الخير → النعيرية → حفر الباطن → ضباء».* الـleg هو **العمود الفقري للنقل**، لا الـbooking.

**النمذجة الحالية (legs كملحق للعمرة فقط):**
- `transport_bookings` هو الـcanon المالي/التسويقي (FK من الفاتورة، رقم الحجز، العميل).
- `transport_itineraries + transport_itinerary_legs` (migration 271:213-287) موجودة لكنها تُستخدم فقط للعمرة (UMR) — في `transport-planning.ts:417, 459-466` يُكتفى بربط الـ`umrahGroupId` و`customerId`.
- الـ**حجوزات غير-العمرة تُنشَأ بمقطع واحد ضمني** (`fromLocationText` → `toLocationText` على الـbooking نفسه)، بلا أي leg.
- النتيجة: رحلة الرياض→جدة→الدمام تُسجَّل كحجزين منفصلين، يفقدان السلسلة، والمحرّك يفقد سياق «المركبة في جدة الآن».

**النمذجة المقترَحة (Leg = canon):**

1. **كل booking ينتج ≥1 leg حتميًّا.** الرحلة الأحادية = leg واحدة (مولَّدة آليًّا من `fromLocation*` + `toLocation*` عند الإنشاء). لا booking بلا legs.
2. **الـlegs تخرج من `transport_itinerary_legs` إلى جدول أوّلي مستقل أو يُدمَج الجدولان** — هذا قرار نمذجة، توصيتي **إبقاء `transport_itinerary_legs` لكن:**
   - جعل `itineraryId` nullable على الـleg (الـleg يمكن أن ينتمي مباشرة لـbooking بدون itinerary وسيط)، أو
   - بناء `transport_booking_legs` جديد بنفس البنية، يكون السرعة canon، و`transport_itineraries` يبقى للـmega-trip (العمرة الكاملة)؛ الأقل تكلفة.
   - **التوصية الأبسط:** خيار (ب) — `transport_booking_legs` جدول جديد، الـitineraries يستمرّ كملاءمة العمرة (مجموعة legs من bookings متعدّدة).
3. **`fromLocation*` و`toLocation*` على الـbooking تصبح حقول مشتقة** (= leg[0].origin، leg[N].destination). الـvalidation: لا يُسمح بـbooking بدون legs، ولا بـleg دون tying مع location معروف.
4. **الجدولة الزمنية تتحوّل لـper-leg:** `scheduledStartAt/EndAt` على الـbooking تبقى لاحتساب التقاويم الإجمالية، لكن **conflict + driver_rest + maintenance** تُفحَص على **windows per-leg**، لا booking كاملة.
5. **dispatch_orders تتحوّل لـper-leg (أو tighter):** اليوم dispatch واحد لكل booking. الانتقال يجعل dispatch واحدة لكل leg (الـvehicle/driver يمكن أن يتغيّر بين legs لرحلة طويلة). الـbackward-compat: legs=1 ⇒ dispatch واحدة ⇒ سلوك مطابق للحالي.
6. **اقتراح المركبة يصبح per-leg:** PE-05 يصبح الـdefault path لا path استثنائي.

**الأمثلة (حرفيًا من سعادتك):**

```
Booking: العمرة-2026-OCT-12 (45 راكب، فوج الأردن)
 ├── Leg 1  JED Airport → فندق مكة     | حافلة 50 مقعدًا | سائق متمرس
 ├── Leg 2  فندق → الحرم               | شاتل 30 مقعدًا  | سائق فوج
 ├── Leg 3  فندق → مزار التنعيم        | شاتل 30 مقعدًا  | سائق فوج
 ├── Leg 4  فندق → الحرم (يومي)        | شاتل 30 مقعدًا  | سائق فوج
 └── Leg 5  فندق مكة → JED Airport      | حافلة 50 مقعدًا | سائق متمرس
```

```
Booking: حمولة-2026-OCT-19 (طاقم رأس الخير → ضباء)
 ├── Leg 1  رأس الخير → النعيرية       | شاحنة | سائق ثقيل
 ├── Leg 2  النعيرية → حفر الباطن      | شاحنة | سائق ثقيل
 └── Leg 3  حفر الباطن → ضباء          | شاحنة | سائق ثقيل
```

**الأثر الإيجابي على باقي الجرد:**
- MULTI-01..04 تُحلّ هيكليًّا (الـlegs canon → السلسلة موجودة دومًا → suggest يعرف الموقع التالي).
- UTIL-03 يُحلّ (الـlegs تُمكّن قياس استخدام تشغيلي حقيقي per-segment، لا per-booking).
- UMR-04 يُحلّ (الـlineage على الـleg، أعمق من الـbooking).
- TA-T18-04 (SPA Route Patterns) يستفيد: قالب أسبوعي يبني legs لا bookings مستقلة.

**التكلفة الواقعية:**
- migration واحدة كبيرة + backfill (كل booking قائم يحصل على leg واحدة مشتقّة).
- تحديث transport-bookings.ts للـPOST/PATCH ليأخذ `legs[]` (وقبول `from/to*` تقليديًّا كـsyntactic sugar لرحلة أحادية).
- تحديث suggest وdispatch وops-* للقراءة per-leg مع backward-compat (legs=1 ⇒ نفس السلوك القديم).
- اختبار شامل: legs=1 لا يكسر شيئًا، legs=N يفعّل السلسلة.

**هذه ليست «ميزة» — هي إعادة نمذجة Foundation.** إن لم تُنفَّذ، كل عمل planning أو optimizer لاحق سيُبنى على نموذج خاطئ.

---

## §14 — ترتيب التنفيذ المُحدَّث (بعد قرارات المالك 2026-06-11)

```text
بوّابة-ج (Gate-PE) — إلزامية قبل أي PE-01..07:
   Gate-1: VCM (مصفوفة قدرة المركبة)        — يُدمج PE-01 ضمنه
   Gate-2: Leg-as-Canon (الـleg جدول أساسي) — يحلّ MULTI-* هيكليًّا

ثم الموجة ج كما سبق، معدَّلة:
   PE-02 (صيانة + التراخيص)        — مستقل عن Gate
   PE-03 (إجازات + سقوف القيادة)    — مستقل عن Gate
   PE-04 (utilization محور)         — تستفيد من Leg-as-Canon لكنها لا تشترطه
   PE-05 (suggest per-leg)          — تبسَّط بشدّة بعد Gate-2 (تصبح default path)
   PE-06 (umrahFamiliarity)         — تستفيد من Leg lineage
   PE-07 (ladder per-family)        — مستقل
   + T18-04..08 كما هي

الموجة د/هـ بعد ذلك بدون تغيير.
```

**التسلسل العملي الصارم:**
1. PR1: VCM migration + view + completeness + guard في المحرّك (يُدمج PE-01).
2. PR2: PE-02 (صيانة + تراخيص — مستقل، يُنفَّذ بالتوازي إن أمكن).
3. PR3: PE-03 (إجازات + سقوف — مشروط بـCHECK-PE-04 و-05).
4. PR4: Leg-as-Canon migration (الأكبر، prep) — جدول `transport_booking_legs` + backfill + قبول بـbackward-compat.
5. PR5: suggest + dispatch + ops-* per-leg (PE-05 يستهلكه).
6. PR6..PR8: PE-04 (utilization)، PE-06 (umrah)، PE-07 (ladder).

---

## §15 — المهام المُضافة (تحديث §9)

### TA-T18-PE-00-VCM — مصفوفة قدرة المركبة canon (Gate-1)
**الوصف:** الملف الفني للمركبة ليس حقولًا حرّة — مصفوفة قدرة موحَّدة (VCM) يمرّ عليها المحرّك قبل أي ترشيح. **الموقع:** migration جديدة + `lib/fleet/vehicleCapabilityMatrix.ts` (جديد) + `assignmentSuggestionEngine.ts:398` (حارس مبكّر) + شاشة VCM (إكمال TA-T18-05). **المطلوب:** (أ) migration تضيف `operationalPassengerCapacity`, `fuelType`, `vehicleServiceTypes[]`. (ب) view أو helper يحسب `completeness 0..100` ويعيد العقد الموصوف §12. (ج) حارس في المحرّك: `completeness<70 OR validFor[family]!=true` → إقصاء مع reason صريح. (د) شاشة VCM تُظهر الـcompleteness ميدانيًّا (Red/Amber/Green) + بوّابة حفظ `status='available'`. **الممنوع:** ترقيع حقول مفردة من الملف الفني بلا VCM؛ تحميل المحرّك بالحقول مباشرة بدلًا من الـmatrix. **معيار القبول:** 3 اختبارات: (1) مركبة `validForCargo=null` لا تظهر لـcargo. (2) مركبة `seatCount=null` لا تظهر لـpassenger. (3) شاحنة `operationalPayloadKg=30000, payloadKg=40000` ترفض حمولة 35000 ولو كانت دون السقف القانوني. **الأولوية:** عاجل جدًا، **بوّابة قبل PE-01..07**. **الخطورة:** عالية (سلامة + نمذجة). **الارتباط:** ملف المركبة + RM-جديد.

### TA-T18-PE-00-LEG — الـRoute Leg كيان أساسي (Gate-2)
**الوصف:** Multi-leg ليس استثناء — هو الحالة العادية للعمرة والشحن الطويل. كل booking ينتج ≥1 leg. **الموقع:** migration جديدة (`transport_booking_legs` أو توسيع 271) + `transport-bookings.ts` (POST/PATCH يقبل `legs[]`) + suggest/dispatch/ops-* (قراءة per-leg مع backward-compat). **المطلوب:** (أ) جدول جديد أو نَمذجة عبر `transport_itinerary_legs` بـ`itineraryId` nullable. (ب) backfill كل booking قائمة → 1 leg مشتقّة من `fromLocation*/toLocation*`. (ج) POST/PATCH /transport/bookings يقبل `legs[]` (افتراضي: legs.length=1 إذا أُرسل `from/to*` تقليديًّا). (د) suggest وdispatch وconflict probe يفحصون per-leg. (هـ) backward-compat: legs=1 ⇒ سلوك مطابق للحالي. **الممنوع:** فقدان أي حجز قائم في الـbackfill؛ تغيير عقد ops-dashboard للحقول الإجمالية. **معيار القبول:** (1) booking أحادية تبقى تعمل كما كانت بصفر فروق. (2) booking بـ3 legs ينشئ 3 صفوف، dispatch منفصل لكل leg، suggest يقترح بـcontinuity. (3) backfill يحوّل 100% من الـbookings القائمة. **الأولوية:** عاجل، **بوّابة لـPE-05 وفائدة هيكلية لباقي PE**. **الخطورة:** عالية (نَمذجة جذرية مع backward-compat). **الارتباط:** RM-جديد + الجدولة + التخطيط متعدد المقاطع.

> **ملاحظة على PE-01:** يُدمَج رسميًّا داخل **PE-00-VCM** ولا يُنفَّذ كـPR منفصل. الـVCM gate يحلّ PROF-01 + PROF-02 + PROF-04 معًا.

---

## §11 — التزام الإغلاق

هذا الملف **ليس Refactor** ولا يفتح أي PR كود من نفسه. الترتيب الإلزامي بعد قرارات المالك 2026-06-11:
1. **اعتماد المالك** لهذا الملف (نسخة v2) و7 نقاط CHECK-PE-01..07 + قرارَي VCM canon و Leg canon.
2. **تحديث #2079 §12 جديدة** بإضافة Gate-PE (VCM + Leg) كبوّابة قبل PE-01..07.
3. **تحديث الملف 18** بإضافة TA-T18-PE-00-VCM و TA-T18-PE-00-LEG في رأس قائمة PE.
4. **تنفيذ Gate-1 (VCM) أولًا** — يدمج PE-01 ويفتح PE-02/03 بالتوازي.
5. **تنفيذ Gate-2 (Leg) ثانيًا** — يبسّط PE-05 جذريًّا.
6. **بقية PE تأتي بالتسلسل** — PR صغير لكل مهمة، فرع مستقل من main المحدَّث، guard أخضر.
7. **لا يُغلَق #2079** حتى تكتمل Gate-1 + Gate-2 + PE-02..07 + الموجة ب الحيّة + بقية الموجة ج.
